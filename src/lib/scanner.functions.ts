import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ScanOutcome = "valid" | "invalid" | "already_used" | "wrong_event";

export type ScanResult = {
  result: ScanOutcome;
  ticketId: string | null;
  ticketCode: string;
  attendeeName: string | null;
  eventTitle: string | null;
  eventStartsAt: string | null;
  eventLocation: string | null;
  tierName: string | null;
  tierKind: string | null;
  checkedInAt: string | null;
};

/**
 * Atomic, authorized check-in. The database function locks the ticket row,
 * verifies the caller owns the event (or is an admin), refuses tickets for
 * other events or already-used tickets, and logs every attempt.
 */
export const scanTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().trim().min(6).max(64),
        eventId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ScanResult> => {
    const code = data.code.trim().toUpperCase();

    const { data: rows, error } = await context.supabase.rpc("check_in_ticket", {
      _code: code,
      _event_id: data.eventId,
    });
    if (error) throw new Error(error.message);

    const row = (Array.isArray(rows) ? rows[0] : rows) as
      | {
          result: ScanOutcome;
          ticket_id: string | null;
          ticket_code: string | null;
          attendee_name: string | null;
          event_title: string | null;
          event_starts_at: string | null;
          event_location: string | null;
          tier_name: string | null;
          tier_kind: string | null;
          checked_in_at: string | null;
        }
      | undefined;

    if (!row) {
      return {
        result: "invalid",
        ticketId: null,
        ticketCode: code,
        attendeeName: null,
        eventTitle: null,
        eventStartsAt: null,
        eventLocation: null,
        tierName: null,
        tierKind: null,
        checkedInAt: null,
      };
    }

    return {
      result: row.result,
      ticketId: row.ticket_id,
      ticketCode: row.ticket_code ?? code,
      attendeeName: row.attendee_name,
      eventTitle: row.event_title,
      eventStartsAt: row.event_starts_at,
      eventLocation: row.event_location,
      tierName: row.tier_name,
      tierKind: row.tier_kind,
      checkedInAt: row.checked_in_at,
    };
  });
