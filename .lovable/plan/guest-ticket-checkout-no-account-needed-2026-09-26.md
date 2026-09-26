# Guest ticket checkout (no account needed)

## What changes for buyers
- On an event page, anyone can pick a ticket tier and quantity, then fill a short form: **Full name, Email, Phone (optional)**.
- They pay with Paystack as today. No sign-up or sign-in needed.
- After Paystack confirms payment, a confirmation page shows their ticket codes and QR codes.
- The same tickets and QR codes are **emailed** to the address they entered.
- Signed-in users still work as before: the form fills in their name and email, and tickets also appear in their dashboard.

## What stays the same
- Paystack only, tickets are only created after Paystack confirms payment on the server.
- 5% VOTIX commission, ticket tiers, sales windows, scanner and check-in.
- Voting still needs an account (to stop duplicate votes).

## Email setup
- Emails are sent from your domain (e.g. tickets@notify.votixnigeria.com). This needs a one-time email domain setup. I'll open the setup box, and you'll add a few records at Hostinger, like you did for the website.
- Until that's verified, buyers still see their tickets on the confirmation page, and the email goes out once the domain is ready.

## Technical details
- Migration: `ticket_orders` and `tickets` get `buyer_name`, `buyer_email`, `buyer_phone`; `user_id` becomes nullable; add a random `access_token` on orders so guests can view their own order at `/tickets/$reference?t=token` (a public page). The scanner's `check_in_ticket` falls back to `buyer_name` for attendee name.
- `startTicketPurchase`: becomes a public server function (optional auth), validated with Zod (name, email, phone, tier, qty); uses the buyer's email for Paystack; callback goes to a public `/payment/verify` route.
- `verifyTicketPayment`: public, checks reference + access token, verifies with Paystack server-side, then finalizes and queues the ticket email (QR as image link via a server route that renders the code).
- Transactional email via Lovable Emails with a "ticket-confirmation" template listing each ticket code and QR.
- Event page ticket section: replace the "Sign in to buy" gate with the buyer form.
