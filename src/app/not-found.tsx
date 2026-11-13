import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageFrame } from "@/components/layout/PageFrame";

export default function NotFound() {
  return (
    <PageFrame>
      <div className="mx-auto flex max-w-md animate-card-in flex-col items-center gap-4 py-16 text-center">
        <p className="text-7xl font-black text-[#ffd400]">404</p>
        <h1 className="text-2xl font-black uppercase tracking-tight">Page not found</h1>
        <p className="text-sm text-zinc-400">The page you are looking for has moved or does not exist.</p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#ffd400] px-6 py-3 text-sm font-bold text-black transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          Back to the menu
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </PageFrame>
  );
}
