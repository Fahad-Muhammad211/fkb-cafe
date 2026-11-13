import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PageFrame } from "@/components/layout/PageFrame";
import { CONTACT_EMAIL, CONTACT_PHONE, DELIVERY_FEE, DELIVERY_HOURS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "FAQs | MEG Pakistan",
};

const FAQS = [
  {
    q: "How much is delivery?",
    a: `Delivery is a flat Rs. ${DELIVERY_FEE} per order. Pick-up orders have no delivery fee.`,
  },
  {
    q: "How can I pay?",
    a: "All orders are Cash on Delivery. For pick-up orders, you pay when you collect.",
  },
  {
    q: "When do you deliver?",
    a: `Every day, ${DELIVERY_HOURS}.`,
  },
  {
    q: "How do I change my delivery location?",
    a: "Tap the Delivery button at the top of the page (the pin icon on mobile) and choose your order type, city and area.",
  },
  {
    q: "How do I track my order?",
    a: "After you place an order, use the Track order button on the confirmation screen. If you are signed in, all your orders are also listed under My orders.",
  },
  {
    q: "Do I need an account to order?",
    a: "No. You can check out as a guest. An account saves your details and keeps your order history in one place.",
  },
];

export default function FaqPage() {
  return (
    <PageFrame>
      <div className="mx-auto flex w-full max-w-3xl animate-card-in flex-col gap-8">
        <header>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Help</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">FAQs</h1>
          <p className="mt-2 text-sm text-zinc-400">Answers to the questions we hear most.</p>
        </header>

        <div className="flex flex-col gap-3">
          {FAQS.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-zinc-800 bg-zinc-900 transition-colors open:border-zinc-700">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-zinc-300">{item.a}</p>
            </details>
          ))}
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-300">
          <h2 className="text-lg font-bold text-white">Still need help?</h2>
          <p className="mt-2">
            Call us on{" "}
            <a href={CONTACT_PHONE.href} className="font-semibold text-white hover:underline">
              {CONTACT_PHONE.display}
            </a>{" "}
            or email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-white hover:underline">
              {CONTACT_EMAIL}
            </a>
            . You can also{" "}
            <Link href="/#menu" className="font-semibold text-[#ffd400] hover:underline">
              browse the menu
            </Link>
            .
          </p>
        </section>
      </div>
    </PageFrame>
  );
}
