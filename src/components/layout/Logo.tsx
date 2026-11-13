import Image from "next/image";
import Link from "next/link";
import { SITE_ASSETS } from "@/data/assets";
import { SITE } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

// Placeholder wordmark. Swap the text for the official logo file in /public/images
// once it is supplied, keeping the same circular black badge.
export function Logo({ className }: LogoProps) {
  return (
    <Link
      href="/"
      aria-label={SITE.name}
      className={cn(
        "relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-black shadow-lg transition-transform duration-300 hover:scale-105 sm:h-12 sm:w-12 md:h-[72px] md:w-[72px] lg:h-[84px] lg:w-[84px]",
        className,
      )}
    >
      {SITE_ASSETS.logo ? (
        <Image src={SITE_ASSETS.logo} alt="" fill sizes="96px" className="rounded-full object-cover" priority />
      ) : (
        <span className="font-serif text-sm font-black tracking-tight text-white sm:text-base md:text-2xl lg:text-3xl">
          MEG
        </span>
      )}
    </Link>
  );
}
