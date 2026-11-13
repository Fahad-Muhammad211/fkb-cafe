"use client";

import { useState, useSyncExternalStore } from "react";
import { locationModal, locationStore, parseLocation } from "@/lib/location";
import { MapPin, Moon, Phone, ShoppingCart, Sun, ChevronRight } from "lucide-react";
import { CONTACT_PHONE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { Logo } from "./Logo";

const iconButton =
  "flex h-[30px] w-[30px] items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-gray-100 transition-all duration-200 hover:scale-105 hover:bg-zinc-700 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd400] sm:h-9 sm:w-9 lg:h-[45px] lg:w-[45px]";

export function Header() {
  const [isDark, setIsDark] = useState(true);
  const { count, openCart } = useCart();
  const { user } = useAuth();
  const location = parseLocation(useSyncExternalStore(locationStore.subscribe, locationStore.getSnapshot, locationStore.getServerSnapshot));

  return (
    <header className="animate-header-in relative w-full border-b border-white/5 bg-zinc-900 px-3 py-2 sm:px-4 sm:py-2.5 md:px-6 md:py-3 lg:px-10">
      <div className="relative mx-auto flex max-w-[1800px] items-center justify-between gap-2 sm:gap-3 lg:gap-6">
        {/* Left: delivery + phone pills (desktop) */}
        <div className="hidden flex-1 items-center gap-2 md:flex lg:gap-3">
          <button
            type="button"
            onClick={locationModal.open}
            aria-label={location ? `${location.orderType === "pickup" ? "Pick-up" : "Delivery"} in ${location.area}, change location` : "Choose delivery location"}
            className="group flex items-center gap-1.5 rounded-3xl border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-gray-100 transition-all duration-200 hover:scale-[1.03] hover:bg-zinc-700 active:scale-95 lg:gap-2 lg:px-4 lg:py-2.5"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-600/60 lg:h-7 lg:w-7">
              <MapPin className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden="true" />
            </span>
            {location ? (
              <span className="flex flex-col items-start leading-none">
                <span className="text-[8px] font-bold uppercase tracking-wide lg:text-[9px]">
                  {location.orderType === "pickup" ? "Pick-Up" : "Delivery"}
                </span>
                <span className="mt-0.5 max-w-[90px] truncate text-[11px] font-bold lg:max-w-[130px] lg:text-sm">{location.area}</span>
              </span>
            ) : (
              <span className="text-[11px] font-bold uppercase leading-none tracking-wide lg:text-sm">
                Delivery
              </span>
            )}
            <ChevronRight
              className="h-3.5 w-3.5 text-gray-100/60 transition-transform duration-200 group-hover:translate-x-0.5 lg:h-4 lg:w-4"
              aria-hidden="true"
            />
          </button>

          <a
            href={CONTACT_PHONE.href}
            className="flex items-center gap-2 rounded-3xl border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-gray-100 transition-all duration-200 hover:scale-[1.03] hover:bg-zinc-700 active:scale-95 lg:px-4 lg:py-2.5"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-600/60 lg:h-7 lg:w-7">
              <Phone className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold lg:text-base">{CONTACT_PHONE.display}</span>
          </a>
        </div>

        {/* Mobile spacer keeps the logo's left slot clear */}
        <div className="w-11 shrink-0 sm:w-12 md:hidden" aria-hidden="true" />

        {/* Centre: logo badge, overlapping the bottom edge (desktop) */}
        <div className="absolute left-0 top-1/2 z-[60] -translate-y-1/2 md:left-1/2 md:top-auto md:bottom-0 md:-translate-x-1/2 md:translate-y-6">
          <Logo />
        </div>

        {/* Right: actions */}
        <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2 lg:gap-3">
          {/* Mobile-only pill icons */}
          <a href={CONTACT_PHONE.href} aria-label="Call us" className={cn(iconButton, "md:hidden")}>
            <Phone className="h-4 w-4" aria-hidden="true" />
          </a>
          <button type="button" onClick={locationModal.open} aria-label="Choose delivery location" className={cn(iconButton, "md:hidden")}>
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </button>

          <Link
            href={user ? "/account" : "/login"}
            aria-label={user ? `Account, ${user.name}` : "Log in"}
            className={iconButton}
          >
            <User className="h-4 w-4 lg:h-5 lg:w-5" aria-hidden="true" />
          </Link>

          <button type="button" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`} onClick={openCart} className={cn(iconButton, "relative")}>
            <ShoppingCart className="h-4 w-4 lg:h-5 lg:w-5" aria-hidden="true" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ffd400] px-1 text-[10px] font-bold leading-none text-black">
                {count}
              </span>
            )}
          </button>

          <button
            type="button"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={isDark}
            onClick={() => setIsDark((v) => !v)}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-zinc-800 text-yellow-400 transition-all duration-200 hover:scale-105 hover:bg-zinc-700 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd400] sm:h-9 sm:w-9 lg:h-[45px] lg:w-[45px]"
          >
            {isDark ? (
              <Sun className="h-4 w-4 lg:h-5 lg:w-5" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4 lg:h-5 lg:w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
