# Votix: Event Discovery & Voting

Build VOTIX from scratch as a modern event discovery, ticketing and online voting platform.

IMPORTANT: VOTIX is NOT a marketplace. No products, sellers, shopping carts or e-commerce.

CORE FEATURES

- Modern dark/black + orange VOTIX design
- Responsive mobile, tablet and desktop
- Supabase authentication and database
- User signup/login/profile
- Explore/search/filter events
- Event details with organizers, nominees and voting
- Favorites, notifications and voting history

EVENT ORGANIZERS

Users can create events with:

- Event name, description and images
- Date, time and location
- Categories
- Ticket types and ticket prices
- Voting dates/rules
- Event status

Organizer dashboard:

- My Events
- Create/Edit Events
- Manage nominees/candidates
- Manage tickets
- View ticket sales
- View votes
- View results
- Analytics

Organizers can ONLY manage their own events.

TICKETING + PAYSTACK

Integrate Paystack for all ticket purchases.

When a buyer purchases a ticket:

- Redirect/use Paystack checkout
- Verify payment securely
- Generate a unique ticket/order reference
- Show purchased ticket in the user's account
- Allow ticket confirmation/QR or unique ticket code
- Record payment and ticket status

VOTIX platform commission is 5% of every ticket sale.

Example:
₦10,000 ticket → ₦500 VOTIX commission → ₦9,500 organizer amount.

Track:

- Gross ticket sales
- 5% VOTIX commission
- Organizer earnings
- Successful/failed/pending payments
- Ticket quantity sold

Never mark a ticket as paid until the Paystack transaction has been verified server-side.

VOTING

Each event can have nominees/candidates.

Users can:

- View candidates
- Vote securely
- See voting status
- View results when permitted

Prevent duplicate voting according to the event's voting rules.

ROLES

Create:

USER

- Browse events
- Buy tickets
- Vote
- Manage profile
- View tickets and voting history

EVENT ORGANIZER

- Create/manage own events
- Manage candidates
- Manage tickets
- View ticket sales
- View votes/results
- View earnings

SUPER ADMIN

- Manage all users
- Approve/reject events
- Manage organizers
- Manage all events
- Manage candidates
- View all votes
- View ticket transactions
- View the 5% platform commission
- Manage reports and settings

SECURITY

Use Supabase RLS and server-side authorization.

Organizers cannot access other organizers' data or Super Admin functions.

Users cannot change their own role.

Protect all Paystack/payment operations server-side.

DATABASE

Create the necessary tables for:

- profiles
- events
- candidates
- votes
- tickets
- ticket_orders
- payments
- notifications
- favorites
- reports

Use proper relationships, UUIDs, timestamps and RLS.

ADMIN ROUTES

/user dashboard:
/dashboard

Organizer:
/organizer

Super Admin:
/admin

Keep all dashboards separate and protected.

Build everything as a real working application, not a visual prototype. Connect authentication, database, voting, ticketing and Paystack payment verification end-to-end.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c5ddbb69-5730-44ee-b006-56f2053d68ee).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
