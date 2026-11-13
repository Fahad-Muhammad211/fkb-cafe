import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

// Shared chrome for standalone pages (checkout, login, signup, account).
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="sticky top-0 z-50">
        <Header />
      </div>
      <main className="flex w-full flex-1 flex-col bg-zinc-950 text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10 md:px-6 md:py-14">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
