import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "./privacy";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — VOTIX Nigeria" },
      { name: "description", content: "The terms that govern your use of VOTIX Nigeria events, tickets, voting and promotion tools." },
      { property: "og:title", content: "Terms of Service — VOTIX Nigeria" },
      { property: "og:description", content: "The terms that govern your use of VOTIX Nigeria events, tickets, voting and promotion tools." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage title="Terms of Service" sections={sections} />,
});

const sections: [string, string[]][] = [
  ["Acceptance", ["By using votixnigeria.com you agree to these terms. If you do not agree, please do not use VOTIX."]],
  ["The service", ["VOTIX lets you discover events, buy tickets, vote for nominees, advertise and promote events on social media. VOTIX is not a marketplace and does not sell physical products."]],
  ["Accounts", ["You are responsible for your account and for keeping your login details safe. Information you provide must be accurate."]],
  ["Tickets and payments", [
    "Payments are processed by Paystack. A ticket is issued only after payment is verified.",
    "VOTIX keeps a 5% commission on each ticket sale; the rest goes to the event organizer.",
    "Each ticket QR code can be used once. Refunds and event changes are the organizer's responsibility unless required by law.",
  ]],
  ["Organizers", ["Organizers must provide accurate event information, honour tickets sold and run voting fairly. VOTIX may review, reject or remove events."]],
  ["Voting", ["Votes must be cast genuinely. Manipulating votes, using automated tools or multiple accounts is prohibited and may lead to removal."]],
  ["Advertising", ["Adverts are shown only after payment and approval. VOTIX may reject, pause or remove adverts that are misleading, unlawful or inappropriate."]],
  ["Social media publishing", [
    "When you connect TikTok, Facebook or Instagram, you authorise VOTIX to publish only the content you choose to post or schedule.",
    "You are responsible for content you publish and must follow each platform's own terms and community guidelines, including TikTok's Terms of Service.",
    "You can disconnect your accounts at any time.",
  ]],
  ["Your content", ["You keep ownership of content you upload and give VOTIX permission to display it on the platform to provide the service. You must have the rights to anything you upload."]],
  ["Prohibited use", ["Do not use VOTIX for fraud, illegal activity, harassment, spam, or to interfere with the platform's security."]],
  ["Liability", ["VOTIX is provided as is. To the extent allowed by law, VOTIX is not liable for indirect losses or for events run by organizers."]],
  ["Changes and termination", ["We may update these terms or suspend accounts that break them. Continued use means you accept the updated terms."]],
  ["Governing law", ["These terms are governed by the laws of the Federal Republic of Nigeria."]],
  ["Contact", ["Email support@votixnigeria.com with any questions."]],
];
