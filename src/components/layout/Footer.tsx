import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { BRANCH_ADDRESS, CONTACT_EMAIL, CONTACT_PHONE, DELIVERY_DAYS, DELIVERY_HOURS, SITE } from "@/lib/constants";

const LINKS = [
  { href: "/#menu", label: "Menu" },
  { href: "/account/orders", label: "My orders" },
  { href: "/account", label: "My account" },
  { href: "/faq", label: "FAQs" },
  { href: "/privacy", label: "Privacy Policy" },
];

// Dark footer modelled on the reference site: contact details, delivery timings and links.
export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-300">
      <Reveal className="mx-auto grid max-w-[1260px] gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-0">
        <div className="flex flex-col gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black font-serif text-xl font-black text-white ring-1 ring-zinc-800">
            MEG
          </span>
          <div>
            <p className="font-bold text-white">{SITE.name}</p>
            <p className="text-sm text-zinc-500">Authentic Flavors</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 text-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">Get in touch</h2>
          <p className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ffd400]" aria-hidden="true" />
            <span>
              <span className="block font-semibold text-white">Branch Address</span>
              {BRANCH_ADDRESS}
            </span>
          </p>
          <p className="flex gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#ffd400]" aria-hidden="true" />
            <span>
              <span className="block font-semibold text-white">Email</span>
              <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-white">
                {CONTACT_EMAIL}
              </a>
            </span>
          </p>
          <p className="flex gap-3">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#ffd400]" aria-hidden="true" />
            <span>
              <span className="block font-semibold text-white">Call Us</span>
              <a href={CONTACT_PHONE.href} className="transition-colors hover:text-white">
                {CONTACT_PHONE.display}
              </a>
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-4 text-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-white">
            <Clock className="h-4 w-4 text-[#ffd400]" aria-hidden="true" />
            Our Delivery Timings
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {DELIVERY_DAYS.map((day) => (
              <div key={day} className="contents">
                <dt className="text-zinc-500">{day}</dt>
                <dd className="text-right tabular-nums">{DELIVERY_HOURS}</dd>
              </div>
            ))}
          </dl>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-4 text-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">Quick links</h2>
          <ul className="flex flex-col gap-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition-colors hover:text-[#ffd400]">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Reveal>
      <div className="border-t border-zinc-900">
        <p className="mx-auto max-w-[1260px] px-4 py-5 text-center text-xs text-zinc-500 lg:px-0">
          © {SITE.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
