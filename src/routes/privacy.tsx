import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — VOTIX Nigeria" },
      { name: "description", content: "How VOTIX Nigeria collects, uses and protects your personal information." },
      { property: "og:title", content: "Privacy Policy — VOTIX Nigeria" },
      { property: "og:description", content: "How VOTIX Nigeria collects, uses and protects your personal information." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const sections: [string, string[]][] = [
  ["Who we are", ["VOTIX Nigeria (\"VOTIX\", \"we\") operates votixnigeria.com, a platform for discovering events, buying tickets, voting for nominees and promoting events."]],
  ["Information we collect", [
    "Account details: name, email address, phone number and profile information you provide.",
    "Ticket purchases: buyer name, email, phone, ticket details and payment references. Card details are handled by Paystack and are never stored by VOTIX.",
    "Votes, favourites, notifications and event content you create, including images and videos you upload.",
    "Connected social accounts: when you connect TikTok, Facebook or Instagram, we receive your account ID, username, display name, avatar and access tokens granted through the platform's official sign-in.",
    "Usage data such as advert views and clicks, device and browser information.",
  ]],
  ["How we use information", [
    "To provide accounts, ticketing, QR check-in, voting and advertising services.",
    "To verify payments with Paystack and send tickets and notifications.",
    "To publish content to your connected social accounts only when you choose to post or schedule a post.",
    "To keep the platform secure, prevent fraud and meet legal obligations.",
  ]],
  ["Social media data (including TikTok)", [
    "Access tokens are stored securely on our servers and are never shown in your browser or to other users, including administrators.",
    "We use TikTok data only to display your connected account and to publish videos you explicitly submit. We do not sell it or use it for any other purpose.",
    "You can disconnect your account at any time from the Social promotion page, which deletes the stored tokens. You can also revoke access in your TikTok settings.",
  ]],
  ["Sharing", ["We share data only with service providers needed to run VOTIX (such as Paystack, hosting and email providers), with event organizers for tickets bought for their events, and with social platforms when you publish to them, or when required by law."]],
  ["Retention and security", ["We keep data for as long as your account is active or as needed for legal and accounting purposes. We use encryption in transit, access controls and server-side checks to protect your data."]],
  ["Your rights", ["You can access, correct or delete your personal data, or withdraw consent, by contacting us. Deleting your account removes your profile and connected social accounts."]],
  ["Children", ["VOTIX is not intended for children under 13, and we do not knowingly collect their data."]],
  ["Changes", ["We may update this policy and will post the new version on this page with an updated date."]],
  ["Contact", ["Email support@votixnigeria.com with any privacy questions."]],
];

function PrivacyPage() {
  return <LegalPage title="Privacy Policy" sections={sections} />;
}

export function LegalPage({ title, sections }: { title: string; sections: [string, string[]][] }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: 1 October 2026</p>
      <div className="mt-8 space-y-8">
        {sections.map(([h, ps]) => (
          <section key={h} className="space-y-2">
            <h2 className="font-display text-xl font-bold text-primary">{h}</h2>
            {ps.map((p) => (
              <p key={p} className="text-sm leading-relaxed text-muted-foreground">{p}</p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
