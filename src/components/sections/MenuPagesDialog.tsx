"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { MENU_PAGES } from "@/data/assets";

// Shows the printed menu pages in a scrollable window.
export function MenuPagesDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[120] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Full menu"
        className="animate-modal-in relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-zinc-900 sm:rounded-3xl"
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-lg font-bold">Full menu</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 transition-transform hover:scale-105 active:scale-95"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          {MENU_PAGES.map((page) => (
            <Image
              key={page.src}
              src={page.src}
              alt={page.alt}
              width={page.width}
              height={page.height}
              sizes="(min-width: 640px) 45vw, 100vw"
              className="h-auto w-full rounded-xl bg-white"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
