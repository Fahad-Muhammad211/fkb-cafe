"use client";

import { useState } from "react";
import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  src?: string;
  alt: string;
  sizes: string;
  className?: string;
  iconClassName?: string;
  priority?: boolean;
}

// Product photo with a built-in placeholder. Local files under /public are optimised by
// Next.js; data URLs (admin uploads) and outside links are shown as they are. If an image
// fails to load, the placeholder is shown instead of a broken image.
export function ProductImage({ src, alt, sizes, className, iconClassName, priority }: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_20%,#3f3f46,#18181b_70%)] text-zinc-500">
        <UtensilsCrossed className={cn("h-10 w-10", iconClassName)} aria-hidden="true" />
        <span className="font-serif text-[10px] font-black tracking-[0.3em] text-zinc-600" aria-hidden="true">
          MEG
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={!src.startsWith("/")}
      onError={() => setFailedSrc(src)}
      className={cn("object-cover", className)}
    />
  );
}
