# VOTIX QR Ticket Scanner

A new **Votix Scanner** page in the organizer hub that reads attendee ticket QR codes with the phone camera, checks them against the ticket records, and marks them checked in — once only.

## What organizers get

- A "Votix Scanner" button on the organizer hub and on each event's manage page, opening `/organizer/scan`.
- Event picker: choose which of your events you are checking people into, so a ticket for another event is refused.
- Live camera view with permission handling: a clear "Allow camera" prompt, a friendly message if permission is blocked or no camera exists, and a way to switch to the back camera on phones.
- Manual ticket-code entry as a fallback when the camera can't be used.
- Big, unmistakable result cards:
  - VALID TICKET (green) — checked in just now
  - ALREADY USED (amber) — shows when and by whom it was scanned before
  - INVALID TICKET (red) — unknown code, or a ticket for a different event
- On a valid scan: attendee name, event name, ticket tier (Regular/VIP/VVIP/Table/…), unique ticket code, event date and venue, and the check-in time.
- Scan history list for the session plus a persisted attendance log for the event (latest scans, who scanned, when, and the outcome), with a running "checked in / sold" count.

## Security

- Only the event's own organizer or an admin can scan; everyone else is refused.
- The check-in decision and the status change happen on the server in one atomic step, so two phones scanning the same code at the same moment can never both succeed.
- Attendees cannot change ticket status themselves; the ticket table stays write-protected from the app.
- Every scan attempt — valid, invalid or duplicate — is recorded with the scanning user, ticket, event and timestamp.

Nothing changes for payments, ticket tiers, or the 5% VOTIX fee.

## Technical notes

**Database migration**

- New table `public.ticket_scans`: `id`, `ticket_id` (nullable for unknown codes), `event_id`, `scanned_by` (auth user), `scanned_code`, `result` (new enum `scan_result`: `valid` | `invalid` | `already_used` | `wrong_event`), `created_at`. GRANT SELECT to `authenticated`, ALL to `service_role`; RLS: select allowed when `owns_event(event_id)` or admin; insert only via server (service role).
- New SECURITY DEFINER function `public.check_in_ticket(_code text, _event_id uuid)` returning a single row with the outcome and the joined ticket details (attendee name from `profiles`, event title/date/venue, tier name, ticket code, `used_at`, previous scanner). It:
  - authorizes `auth.uid()` as the event organizer or admin, else raises;
  - looks up the ticket by code with `FOR UPDATE` inside the function so the read-modify-write is atomic;
  - returns `wrong_event` when the ticket's `event_id` differs, `already_used` when `is_used`, otherwise flips `is_used`/`used_at` and returns `valid`;
  - writes the `ticket_scans` row in every branch.
  - EXECUTE granted to `authenticated` only.

**Server function**

- `scanTicket` in `src/lib/scanner.functions.ts` — `createServerFn` + `requireSupabaseAuth`, Zod-validated `{ code, eventId }`, calls the RPC through `context.supabase` (so `auth.uid()` is the real caller) and returns a typed result DTO. The existing `checkInTicket` on the manage page is re-pointed at the same RPC so both paths share one code path.

**Route + UI**

- `src/routes/_authenticated/organizer/scan.tsx` — mobile-first layout, event `Select`, camera preview via `getUserMedia` with `facingMode: "environment"`, decoding with the native `BarcodeDetector` when available and a lazily imported `@zxing/browser` reader as fallback (browser-only, loaded inside `<ClientOnly>`-safe effect). Debounced so the same code isn't posted repeatedly; sonner toast + result card; history from a `ticket-scans` query.
- Links added in `organizer/index.tsx` and `organizer/$eventId.tsx`.
- New dependency: `@zxing/browser`.
