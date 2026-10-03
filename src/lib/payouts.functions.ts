import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MIN_PAYOUT = 1000;

async function paystack(path: string) {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("Payments are not configured.");
  const res = await fetch(`https://api.paystack.co${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = (await res.json().catch(() => null)) as
    | { status: boolean; message?: string; data?: unknown }
    | null;
  return { ok: res.ok && !!json?.status, json };
}

async function assertOrganizer(context: { supabase: any; userId: string }) {
  const [{ data: org }, { data: admin }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "organizer" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
  ]);
  if (!org && !admin) throw new Error("Only organizers can manage payouts.");
}

async function computeBalance(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: events } = await supabaseAdmin.from("events").select("id").eq("organizer_id", userId);
  const ids = (events ?? []).map((e) => e.id);
  let earned = 0;
  if (ids.length) {
    const { data: orders } = await supabaseAdmin
      .from("ticket_orders")
      .select("organizer_amount")
      .eq("status", "success")
      .in("event_id", ids);
    earned = (orders ?? []).reduce((s, o) => s + Number(o.organizer_amount), 0);
  }
  const { data: payouts } = await supabaseAdmin
    .from("payout_requests")
    .select("amount, status")
    .eq("organizer_id", userId);
  let paid = 0;
  let pending = 0;
  for (const p of payouts ?? []) {
    if (p.status === "paid") paid += Number(p.amount);
    else if (p.status === "pending" || p.status === "approved") pending += Number(p.amount);
  }
  return { earned, paid, pending, available: Math.max(0, earned - paid - pending) };
}

export const listBanks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { ok, json } = await paystack("/bank?country=nigeria&perPage=100");
    if (!ok) return [] as { name: string; code: string }[];
    const banks = (json?.data as { name: string; code: string; active?: boolean }[]) ?? [];
    const seen = new Set<string>();
    return banks
      .filter((b) => b.active !== false && !seen.has(b.code) && seen.add(b.code))
      .map((b) => ({ name: b.name, code: b.code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

export const resolveBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ accountNumber: z.string().regex(/^\d{10}$/), bankCode: z.string().min(2).max(10) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOrganizer(context);
    const { ok, json } = await paystack(
      `/bank/resolve?account_number=${data.accountNumber}&bank_code=${encodeURIComponent(data.bankCode)}`,
    );
    if (!ok) throw new Error("We couldn't verify that account. Check the number and bank.");
    const d = json?.data as { account_name: string };
    return { accountName: d.account_name };
  });

export const saveBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        accountNumber: z.string().regex(/^\d{10}$/),
        bankCode: z.string().min(2).max(10),
        bankName: z.string().min(2).max(120),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOrganizer(context);
    // Re-resolve server-side so the stored name is always the bank's official one.
    const { ok, json } = await paystack(
      `/bank/resolve?account_number=${data.accountNumber}&bank_code=${encodeURIComponent(data.bankCode)}`,
    );
    if (!ok) throw new Error("We couldn't verify that account. Check the number and bank.");
    const accountName = (json?.data as { account_name: string }).account_name;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("organizer_bank_accounts").upsert({
      user_id: context.userId,
      bank_name: data.bankName,
      bank_code: data.bankCode,
      account_number: data.accountNumber,
      account_name: accountName,
    });
    if (error) throw new Error("Could not save bank details.");
    return { accountName };
  });

export const getPayoutSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOrganizer(context);
    const balance = await computeBalance(context.userId);
    const [{ data: bank }, { data: requests }] = await Promise.all([
      context.supabase.from("organizer_bank_accounts").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase
        .from("payout_requests")
        .select("*")
        .eq("organizer_id", context.userId)
        .order("created_at", { ascending: false }),
    ]);
    return { balance, bank: bank ?? null, requests: requests ?? [], minPayout: MIN_PAYOUT };
  });

export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ amount: z.number().positive().max(100_000_000) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrganizer(context);
    const amount = Math.round(data.amount * 100) / 100;
    if (amount < MIN_PAYOUT) throw new Error(`Minimum withdrawal is ₦${MIN_PAYOUT.toLocaleString()}.`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bank } = await supabaseAdmin
      .from("organizer_bank_accounts")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!bank) throw new Error("Add your bank account before requesting a payout.");
    const balance = await computeBalance(context.userId);
    if (amount > balance.available) throw new Error("Amount is more than your available balance.");
    const { error } = await supabaseAdmin.from("payout_requests").insert({
      organizer_id: context.userId,
      amount,
      bank_name: bank.bank_name,
      account_number: bank.account_number,
      account_name: bank.account_name,
    });
    if (error) throw new Error("Could not submit payout request.");

    const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    if (admins?.length) {
      await supabaseAdmin.from("notifications").insert(
        admins.map((a) => ({
          user_id: a.user_id,
          title: "New payout request",
          body: `₦${amount.toLocaleString()} to ${bank.account_name} (${bank.bank_name}).`,
          link: "/admin",
        })),
      );
    }
    return { ok: true as const };
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const adminListPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: requests } = await supabaseAdmin
      .from("payout_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = [...new Set((requests ?? []).map((r) => r.organizer_id))];
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    return (requests ?? []).map((r) => ({ ...r, organizer_name: names.get(r.organizer_id) ?? null }));
  });

export const adminUpdatePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "paid", "rejected"]),
        notes: z.string().max(500).optional(),
        transferReference: z.string().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin.from("payout_requests").select("*").eq("id", data.id).maybeSingle();
    if (!req) throw new Error("Payout not found.");
    if (req.status === "paid" || req.status === "rejected") throw new Error("This payout is already closed.");
    if (data.status === "paid" && !data.transferReference?.trim())
      throw new Error("Enter the bank transfer reference.");
    const { error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        status: data.status,
        admin_notes: data.notes?.trim() || req.admin_notes,
        transfer_reference: data.transferReference?.trim() || req.transfer_reference,
        processed_by: context.userId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error("Could not update payout.");
    const label = { approved: "approved", paid: "paid", rejected: "rejected" }[data.status];
    await supabaseAdmin.from("notifications").insert({
      user_id: req.organizer_id,
      title: `Payout ${label}`,
      body: `Your ₦${Number(req.amount).toLocaleString()} withdrawal was ${label}.${data.notes ? ` ${data.notes}` : ""}`,
      link: "/organizer",
    });
    return { ok: true as const };
  });
