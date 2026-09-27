# VOTIX upgrade: Video Advertising + Social Promotion

This upgrades the existing app. Nothing already in place is removed or replaced: pages, sign-in, events, tickets, the scanner, Paystack and the admin area all stay. The work is split into two phases so advertising can go live first.

## Phase 1: Video advertising (built now, fully working)

**For advertisers (any signed-in user, including organizers)**
- A new "My Advertisements" tab in the organizer area. Normal users get a matching "Advertise" link in the account menu.
- A "Create advert" form with: video upload (MP4/WebM, up to 50 MB), thumbnail image, title, description, link destination (a VOTIX event or an outside web address) and a plan choice. The only plan at first is ₦10,000 for 30 days.
- Payment uses the existing Paystack checkout, and Paystack confirms every payment on the server. The advert becomes **Pending approval** only after that confirmation.
- A campaign list showing status, start and end dates, views, plays and clicks, plus a **Renew** button that adds another 30 days after a new payment.

**For admins (a new "Advertising" tab in the existing Super admin page)**
- Adverts waiting for review, with a video preview. Admins can approve, reject (with a reason), pause, resume, edit the title, description and link, or archive an advert.
- A plans manager where admins can add or edit plans, such as ₦20,000 or ₦50,000, and turn plans on or off.
- A list of advert payments and statistics for every advert.

**Where adverts appear**
- A "Sponsored" video strip on the home page and on event pages, in the current dark and orange design.
- Videos start muted and play on their own only when on screen. Viewers can tap to play with sound. Clicking an advert opens its destination.
- Only approved, paid adverts within their 30 days are shown. The 5% ticket commission does not apply to adverts.

**Analytics:** views are counted when an advert is on screen, and plays and clicks when they happen. Repeat counts from the same visitor are limited.

## Phase 2: Social promotion (built now; publishing needs your developer apps)

- A new "Promote event" section on each event's manage page. Organizers can add a caption, hashtags, an image or video, and the event link (filled in automatically).
- Organizers pick Facebook, Instagram or TikTok, then choose **Post now** or **Schedule post**.
- Each post shows its real status: Draft, Scheduled, Publishing, Published or Failed. "Published" appears only after the platform confirms the post and returns its ID. Failed posts show the platform's error.
- "Connect account" buttons use each platform's official sign-in.
- **Required from you:** a Meta developer app for Facebook and Instagram (it needs Meta's review for publishing permissions and a Facebook Page linked to an Instagram Business account) and a TikTok developer app with the Content Posting API approved. Until these are added, the buttons show "Not configured" and posts can only be saved as drafts. Nothing will pretend to publish.
- A new "Social publishing" tab in the admin page lists every post and its status.

## Checks before finishing
In a test browser: sign in, sign up, organizer area, create an event, event page, guest ticket checkout, the QR ticket page and scanner, and admin access. Then the new features: create an advert, start the ₦10,000 Paystack checkout, verify payment (using a test order), approve it as admin, see it on the home page and check the view and click counts, and save and schedule a social post draft.

## Technical details
- New tables (with row-level security and grants): `ad_plans` (name, price, duration_days, is_active; seeded with ₦10,000/30 days), `advertisements` (advertiser_id, plan_id, event_id?, title, description, video_path, thumbnail_path, destination_url, status enum draft/pending_payment/pending_approval/approved/rejected/paused/archived/expired, starts_at, ends_at, rejection_reason), `ad_payments` (ad_id, reference, amount, status, raw_response). The existing `payments` table is tied to ticket orders, so advert payments get their own table. Also `ad_events` (ad_id, kind impression/play/click, viewer hash, created_at), `social_accounts` (user_id, platform, external_id, tokens stored only on the server, expires_at) and `social_posts` (event_id, author, platforms, caption, hashtags, media, scheduled_at, per-platform status/result jsonb).
- Public reads of adverts go through a security-definer view or function that returns only live, approved adverts. Stats are recorded through a rate-limited server function.
- Storage: a new private `ad-media` bucket with folders per user. Public playback uses long-lived signed URLs, as `event-graphics` already does. File type and size are checked in the browser and in storage rules.
- Server functions: `ads.functions.ts` (create, start payment, verify with PAYSTACK_SECRET_KEY, renew, admin actions) and `social.functions.ts`. OAuth callbacks go under `/api/public/social/*/callback`, and a scheduled job route `/api/public/cron/social-publish` is protected by LOVABLE_CRON_SECRET and run by pg_cron every 5 minutes.
- Paystack payments can return to a new `/ads/confirm` page for verification.
- Required secrets (added later): META_APP_ID, META_APP_SECRET, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET.
