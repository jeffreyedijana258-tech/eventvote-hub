import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(1000)
  .refine((u) => /^https?:\/\//i.test(u), "Link must start with http(s)://");

const newAdSchema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  videoUrl: httpsUrl,
  thumbnailUrl: httpsUrl.optional().or(z.literal("")),
  destinationUrl: httpsUrl.optional().or(z.literal("")),
  eventId: z.string().uuid().optional().or(z.literal("")),
});

/** Creates (or renews) an advert and starts a Paystack payment for the chosen plan. */
export const startAdPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        origin: z.string().url(),
        adId: z.string().uuid().optional(),
        ad: newAdSchema.optional(),
      })
      .refine((v) => v.adId || v.ad, "Advert details are required.")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const origin = new URL(data.origin).origin;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: plan } = await supabaseAdmin
      .from("ad_plans")
      .select("id, name, price, duration_days, is_active")
      .eq("id", data.planId)
      .maybeSingle();
    if (!plan || !plan.is_active) throw new Error("This advertising plan is not available.");

    let adId = data.adId;
    if (adId) {
      const { data: ad } = await supabase
        .from("advertisements")
        .select("id, advertiser_id, status")
        .eq("id", adId)
        .maybeSingle();
      if (!ad || ad.advertiser_id !== userId) throw new Error("Advert not found.");
      if (ad.status === "rejected" || ad.status === "archived")
        throw new Error("This advert can't be renewed. Please create a new one.");
    } else {
      const a = data.ad!;
      if (a.eventId) {
        const { data: ev } = await supabaseAdmin
          .from("events")
          .select("id, status")
          .eq("id", a.eventId)
          .maybeSingle();
        if (!ev || ev.status !== "approved") throw new Error("Pick a live VOTIX event.");
      }
      const { data: created, error } = await supabase
        .from("advertisements")
        .insert({
          advertiser_id: userId,
          plan_id: plan.id,
          title: a.title,
          description: a.description || null,
          video_url: a.videoUrl,
          thumbnail_url: a.thumbnailUrl || null,
          destination_url: a.destinationUrl || null,
          event_id: a.eventId || null,
          status: "pending_payment",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      adId = created.id;
    }

    // Admins advertise for free: activate immediately, no payment.
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin) {
      const { data: cur } = await supabaseAdmin
        .from("advertisements")
        .select("paid_until, starts_at")
        .eq("id", adId!)
        .single();
      const now = Date.now();
      const base = cur?.paid_until && new Date(cur.paid_until).getTime() > now ? new Date(cur.paid_until).getTime() : now;
      const paidUntil = new Date(base + plan.duration_days * 86400000).toISOString();
      await supabaseAdmin
        .from("advertisements")
        .update({
          paid_until: paidUntil,
          ends_at: paidUntil,
          starts_at: cur?.starts_at ?? new Date().toISOString(),
          status: "approved",
          plan_id: plan.id,
          rejection_reason: null,
        })
        .eq("id", adId!);
      return { authorizationUrl: null as string | null, reference: null as string | null, free: true as const };
    }

    const reference = `VTXAD-${randomCode(6)}-${randomCode(12)}`;
    const amount = Number(plan.price);
    const { error: payErr } = await supabaseAdmin.from("ad_payments").insert({
      ad_id: adId!,
      user_id: userId,
      plan_id: plan.id,
      reference,
      amount,
      duration_days: plan.duration_days,
      status: "pending",
    });
    if (payErr) throw new Error(payErr.message);

    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured yet. Please contact support.");
    const email = (claims as { email?: string }).email || `${userId}@votix.app`;
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100),
        reference,
        callback_url: `${origin}/ads/confirm`,
        metadata: { kind: "advert", ad_id: adId, plan: plan.name },
      }),
    });
    const payload = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string };
    };
    if (!res.ok || !payload.status || !payload.data?.authorization_url) {
      await supabaseAdmin.from("ad_payments").update({ status: "failed" }).eq("reference", reference);
      console.error("Paystack init failed", payload.message);
      throw new Error("Could not start the payment. Please try again.");
    }
    return { authorizationUrl: payload.data.authorization_url as string | null, reference: reference as string | null, free: false as const };
  });

/** Verifies an advert payment with Paystack (server-side) and activates the paid period. */
export const verifyAdPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ reference: z.string().trim().min(8).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pay } = await supabaseAdmin
      .from("ad_payments")
      .select("*")
      .eq("reference", data.reference)
      .maybeSingle();
    if (!pay || pay.user_id !== context.userId) throw new Error("Payment not found.");
    if (pay.status === "success") return { status: "success" as const, adId: pay.ad_id };

    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured.");
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(pay.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const payload = (await res.json()) as {
      status?: boolean;
      data?: { status?: string; amount?: number; currency?: string };
    };
    const paid =
      res.ok &&
      payload.status &&
      payload.data?.status === "success" &&
      Number(payload.data.amount) >= Math.round(Number(pay.amount) * 100) &&
      (payload.data.currency ?? "NGN") === "NGN";

    if (!paid) {
      const stillPending = payload.data?.status === "ongoing" || payload.data?.status === "pending" || payload.data?.status === "abandoned";
      if (!stillPending) {
        await supabaseAdmin
          .from("ad_payments")
          .update({ status: "failed", raw_response: payload as never })
          .eq("id", pay.id)
          .eq("status", "pending");
      }
      return { status: stillPending ? ("pending" as const) : ("failed" as const), adId: pay.ad_id };
    }

    // Claim the payment atomically so it's only applied once.
    const { data: claimed } = await supabaseAdmin
      .from("ad_payments")
      .update({ status: "success", raw_response: payload as never, verified_at: new Date().toISOString() })
      .eq("id", pay.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) return { status: "success" as const, adId: pay.ad_id };

    const { data: ad } = await supabaseAdmin
      .from("advertisements")
      .select("id, status, paid_until, starts_at")
      .eq("id", pay.ad_id)
      .single();
    const now = Date.now();
    const base = ad?.paid_until && new Date(ad.paid_until).getTime() > now ? new Date(ad.paid_until).getTime() : now;
    const paidUntil = new Date(base + pay.duration_days * 86400000).toISOString();
    const nextStatus =
      ad?.status === "approved" || ad?.status === "paused" ? ad.status : "pending_approval";
    await supabaseAdmin
      .from("advertisements")
      .update({
        paid_until: paidUntil,
        ends_at: paidUntil,
        starts_at: ad?.starts_at ?? new Date().toISOString(),
        status: nextStatus,
        plan_id: pay.plan_id,
      })
      .eq("id", pay.ad_id);

    await supabaseAdmin.from("notifications").insert({
      user_id: context.userId,
      title: nextStatus === "pending_approval" ? "Advert payment received" : "Advert renewed",
      body:
        nextStatus === "pending_approval"
          ? "Your advert is waiting for VOTIX approval."
          : "Your advert has been extended.",
      link: "/ads",
    });
    return { status: "success" as const, adId: pay.ad_id };
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Super admin only.");
}

export const adminAdAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        adId: z.string().uuid(),
        action: z.enum(["approve", "reject", "pause", "resume", "archive", "edit"]),
        reason: z.string().trim().max(300).optional(),
        fields: z
          .object({
            title: z.string().trim().min(3).max(80),
            description: z.string().trim().max(300).optional().or(z.literal("")),
            destinationUrl: httpsUrl.optional().or(z.literal("")),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: ad } = await supabase
      .from("advertisements")
      .select("id, status, paid_until, advertiser_id, title")
      .eq("id", data.adId)
      .maybeSingle();
    if (!ad) throw new Error("Advert not found.");

    let patch: Record<string, unknown> = {};
    switch (data.action) {
      case "approve":
        if (!ad.paid_until) throw new Error("This advert hasn't been paid for yet.");
        patch = { status: "approved", rejection_reason: null };
        break;
      case "reject":
        patch = { status: "rejected", rejection_reason: data.reason || null };
        break;
      case "pause":
        if (ad.status !== "approved") throw new Error("Only live adverts can be paused.");
        patch = { status: "paused" };
        break;
      case "resume":
        if (ad.status !== "paused") throw new Error("Only paused adverts can be resumed.");
        patch = { status: "approved" };
        break;
      case "archive":
        patch = { status: "archived" };
        break;
      case "edit":
        if (!data.fields) throw new Error("Nothing to update.");
        patch = {
          title: data.fields.title,
          description: data.fields.description || null,
          destination_url: data.fields.destinationUrl || null,
        };
        break;
    }
    const { error } = await supabase.from("advertisements").update(patch as never).eq("id", ad.id);
    if (error) throw new Error(error.message);

    if (["approve", "reject"].includes(data.action)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notifications").insert({
        user_id: ad.advertiser_id,
        title: data.action === "approve" ? "Your advert is live" : "Your advert was not approved",
        body: data.action === "approve" ? ad.title : data.reason || ad.title,
        link: "/ads",
      });
    }
    return { ok: true };
  });

export const adminSavePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(200).optional().or(z.literal("")),
        price: z.number().min(0).max(100_000_000),
        durationDays: z.number().int().min(1).max(365),
        isActive: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const row = {
      name: data.name,
      description: data.description || null,
      price: data.price,
      duration_days: data.durationDays,
      is_active: data.isActive,
    };
    const q = data.id
      ? context.supabase.from("ad_plans").update(row).eq("id", data.id)
      : context.supabase.from("ad_plans").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
