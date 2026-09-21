import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** A signed-in user may upgrade themselves to organizer. Admin is never self-assignable. */
export const becomeOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "organizer" }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["user", "organizer", "admin"]),
        grant: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && data.role === "admin" && !data.grant)
      throw new Error("You cannot remove your own admin access.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const adminModerateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        status: z.enum(["approved", "rejected", "pending", "cancelled", "completed"]),
        reason: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: event, error } = await supabaseAdmin
      .from("events")
      .update({ status: data.status, rejection_reason: data.reason ?? null })
      .eq("id", data.eventId)
      .select("id, title, organizer_id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: event.organizer_id,
      title: `Event ${data.status}`,
      body: `${event.title} is now ${data.status}.${data.reason ? ` Note: ${data.reason}` : ""}`,
      link: "/organizer",
    });
    return { ok: true as const };
  });

export const adminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: orders }, { data: users }, { data: events }, { data: votes }] =
      await Promise.all([
        supabaseAdmin
          .from("ticket_orders")
          .select("id, reference, status, gross_amount, commission_amount, organizer_amount, quantity, created_at, event_id, user_id")
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin.from("profiles").select("id, full_name, username, created_at").order("created_at", { ascending: false }).limit(200),
        supabaseAdmin
          .from("events")
          .select("id, title, status, category, starts_at, organizer_id, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin.from("votes").select("id"),
      ]);

    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");

    const successful = (orders ?? []).filter((o) => o.status === "success");
    const totals = successful.reduce(
      (acc, o) => ({
        gross: acc.gross + Number(o.gross_amount),
        commission: acc.commission + Number(o.commission_amount),
        organizer: acc.organizer + Number(o.organizer_amount),
        tickets: acc.tickets + o.quantity,
      }),
      { gross: 0, commission: 0, organizer: 0, tickets: 0 },
    );

    return {
      totals,
      counts: {
        users: users?.length ?? 0,
        events: events?.length ?? 0,
        votes: votes?.length ?? 0,
        pending: (events ?? []).filter((e) => e.status === "pending").length,
        failed: (orders ?? []).filter((o) => o.status === "failed").length,
        pendingPayments: (orders ?? []).filter((o) => o.status === "pending").length,
      },
      orders: orders ?? [],
      users: users ?? [],
      events: events ?? [],
      roles: roles ?? [],
    };
  });

export const adminListReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
