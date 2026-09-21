import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const COMMISSION_RATE = 0.05;

function makeReference(prefix: string) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Creates a pending order and (for paid tickets) a Paystack transaction.
 * Nothing is ever marked paid here.
 */
export const startTicketPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ticketTypeId: z.string().uuid(),
        quantity: z.number().int().min(1).max(10),
        callbackUrl: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ticketType, error: ttError } = await supabaseAdmin
      .from("ticket_types")
      .select("id, name, price, quantity_total, quantity_sold, is_active, event_id")
      .eq("id", data.ticketTypeId)
      .maybeSingle();
    if (ttError) throw new Error(ttError.message);
    if (!ticketType || !ticketType.is_active) throw new Error("This ticket is not available.");

    const { data: event, error: evError } = await supabaseAdmin
      .from("events")
      .select("id, title, status, organizer_id")
      .eq("id", ticketType.event_id)
      .maybeSingle();
    if (evError) throw new Error(evError.message);
    if (!event || event.status !== "approved") throw new Error("This event is not on sale.");

    const remaining = ticketType.quantity_total - ticketType.quantity_sold;
    if (remaining < data.quantity) throw new Error(`Only ${Math.max(remaining, 0)} tickets left.`);

    const unitPrice = Number(ticketType.price);
    const gross = money(unitPrice * data.quantity);
    const commission = money(gross * COMMISSION_RATE);
    const organizerAmount = money(gross - commission);
    const reference = makeReference("VOTIX");

    const { data: order, error: orderError } = await supabaseAdmin
      .from("ticket_orders")
      .insert({
        reference,
        user_id: context.userId,
        event_id: event.id,
        ticket_type_id: ticketType.id,
        quantity: data.quantity,
        unit_price: unitPrice,
        gross_amount: gross,
        commission_amount: commission,
        organizer_amount: organizerAmount,
        status: "pending",
      })
      .select("id, reference")
      .single();
    if (orderError) throw new Error(orderError.message);

    // Free tickets: issue immediately, no payment provider involved.
    if (gross <= 0) {
      await finalizeOrder(supabaseAdmin, order.id, null);
      return { free: true as const, reference: order.reference, authorizationUrl: null };
    }

    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured yet. Please contact support.");

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: authUser?.user?.email ?? `${context.userId}@votix.app`,
        amount: Math.round(gross * 100),
        reference: order.reference,
        callback_url: data.callbackUrl,
        metadata: { order_id: order.id, event_id: event.id, event_title: event.title },
      }),
    });
    const payload = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string };
    };
    if (!res.ok || !payload.status || !payload.data?.authorization_url) {
      await supabaseAdmin.from("ticket_orders").update({ status: "failed" }).eq("id", order.id);
      throw new Error(payload.message ?? "Could not start the payment.");
    }

    await supabaseAdmin.from("payments").insert({
      order_id: order.id,
      user_id: context.userId,
      reference: order.reference,
      amount: gross,
      commission_amount: commission,
      status: "pending",
    });

    return {
      free: false as const,
      reference: order.reference,
      authorizationUrl: payload.data.authorization_url,
    };
  });

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

async function finalizeOrder(
  supabaseAdmin: AdminClient,
  orderId: string,
  raw: unknown,
) {
  const { data: order } = await supabaseAdmin
    .from("ticket_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (order.status === "success") return order;

  const codes = Array.from({ length: order.quantity }, () => ({
    order_id: order.id,
    event_id: order.event_id,
    ticket_type_id: order.ticket_type_id,
    user_id: order.user_id,
    ticket_code: makeReference("TKT"),
  }));

  await supabaseAdmin.from("tickets").insert(codes);
  await supabaseAdmin.from("ticket_orders").update({ status: "success" }).eq("id", order.id);

  const { data: tt } = await supabaseAdmin
    .from("ticket_types")
    .select("quantity_sold")
    .eq("id", order.ticket_type_id)
    .maybeSingle();
  if (tt) {
    await supabaseAdmin
      .from("ticket_types")
      .update({ quantity_sold: tt.quantity_sold + order.quantity })
      .eq("id", order.ticket_type_id);
  }

  const { data: existingPayment } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("reference", order.reference)
    .maybeSingle();
  if (existingPayment) {
    await supabaseAdmin
      .from("payments")
      .update({ status: "success", raw_response: raw as never })
      .eq("id", existingPayment.id);
  } else {
    await supabaseAdmin.from("payments").insert({
      order_id: order.id,
      user_id: order.user_id,
      reference: order.reference,
      amount: order.gross_amount,
      commission_amount: order.commission_amount,
      status: "success",
      raw_response: raw as never,
    });
  }

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("title, organizer_id")
    .eq("id", order.event_id)
    .maybeSingle();

  await supabaseAdmin.from("notifications").insert([
    {
      user_id: order.user_id,
      title: "Ticket confirmed",
      body: `Your ${order.quantity} ticket(s) for ${event?.title ?? "the event"} are ready.`,
      link: "/dashboard",
    },
    ...(event?.organizer_id
      ? [
          {
            user_id: event.organizer_id,
            title: "New ticket sale",
            body: `${order.quantity} ticket(s) sold for ${event.title}.`,
            link: "/organizer",
          },
        ]
      : []),
  ]);

  return { ...order, status: "success" as const };
}

/** Server-side Paystack verification. A ticket only exists after this succeeds. */
export const verifyTicketPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reference: z.string().min(4) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("ticket_orders")
      .select("*")
      .eq("reference", data.reference)
      .maybeSingle();
    if (!order) throw new Error("Order not found.");
    if (order.user_id !== context.userId) throw new Error("This order is not yours.");
    if (order.status === "success") {
      return { status: "success" as const, reference: order.reference };
    }

    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured yet.");

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const payload = (await res.json()) as {
      status?: boolean;
      data?: { status?: string; amount?: number };
    };

    const paidKobo = payload.data?.amount ?? 0;
    const expectedKobo = Math.round(Number(order.gross_amount) * 100);
    const verified =
      res.ok && payload.status === true && payload.data?.status === "success" && paidKobo >= expectedKobo;

    if (!verified) {
      await supabaseAdmin.from("ticket_orders").update({ status: "failed" }).eq("id", order.id);
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed", raw_response: payload as never })
        .eq("reference", order.reference);
      return { status: "failed" as const, reference: order.reference };
    }

    await finalizeOrder(supabaseAdmin, order.id, payload);
    return { status: "success" as const, reference: order.reference };
  });

/** Organizer / admin scan: mark a ticket code as used. */
export const checkInTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(4) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ticket, error } = await context.supabase
      .from("tickets")
      .select("id, is_used, event_id, events!inner(organizer_id, title)")
      .eq("ticket_code", data.code.trim().toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket code not found.");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const organizerId = (ticket.events as unknown as { organizer_id: string }).organizer_id;
    if (organizerId !== context.userId && !isAdmin) throw new Error("Not your event.");
    if (ticket.is_used) return { alreadyUsed: true as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("tickets")
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq("id", ticket.id);
    return { alreadyUsed: false as const };
  });
