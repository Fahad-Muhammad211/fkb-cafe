import type { Metadata } from "next";
import { PageFrame } from "@/components/layout/PageFrame";
import { CONTACT_EMAIL, SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy | MEG Pakistan",
};

const SECTIONS = [
  {
    title: "What this website stores in your browser",
    body: [
      "Your cart, the delivery location you choose, and the orders you place are saved in your browser's local storage so they are still there when you come back.",
      "If you create a customer account, your name, email and phone number are saved in your browser, together with a salted hash of your password. The password itself is never stored.",
    ],
  },
  {
    title: "Admin accounts",
    body: [
      "Staff accounts for the admin dashboard are stored on our server. Passwords are hashed before they are saved and are never shown or sent back. Admin sessions use a secure, httpOnly cookie that page scripts cannot read.",
    ],
  },
  {
    title: "Payments",
    body: ["Orders are paid by Cash on Delivery. We do not collect or store card or bank details."],
  },
  {
    title: "Tracking and third parties",
    body: ["This website does not use advertising trackers or sell your information."],
  },
  {
    title: "Removing your data",
    body: [
      "You can remove everything stored in your browser at any time by clearing this site's data in your browser settings. This signs you out and empties your cart and saved orders on that device.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <PageFrame>
      <article className="mx-auto flex w-full max-w-3xl animate-card-in flex-col gap-8">
        <header>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{SITE.name}</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Privacy Policy</h1>
          <p className="mt-2 text-sm text-zinc-400">How this website handles your information.</p>
        </header>
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
            <h2 className="text-lg font-bold">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-sm leading-relaxed text-zinc-300">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <p className="text-sm text-zinc-400">
          Questions about your data? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-white underline-offset-4 hover:underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </article>
    </PageFrame>
  );
}
