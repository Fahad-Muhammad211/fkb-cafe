import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared pieces for the customer dashboard. Palette: black surfaces, white text, orange accents.

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500";

export const primaryButton = cn(
  "inline-flex items-center justify-center gap-2 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-black shadow-lg shadow-orange-500/20 transition-all duration-200 hover:bg-orange-400 hover:shadow-orange-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
  focusRing,
);

export const secondaryButton = cn(
  "inline-flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:border-orange-500/60 hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
  focusRing,
);

export const dangerButton = cn(
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-red-300 transition-colors duration-200 hover:bg-red-500/10 disabled:opacity-50",
  focusRing,
);

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "animate-card-in rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 shadow-xl shadow-black/40 md:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-card-in">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl font-black uppercase tracking-tight md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-zinc-400">{description}</p>}
      </div>
      {action}
    </header>
  );
}

type Tone = "orange" | "green" | "red" | "zinc" | "white";

const TONES: Record<Tone, string> = {
  orange: "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  green: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  red: "bg-red-500/15 text-red-400 ring-red-500/30",
  zinc: "bg-zinc-800 text-zinc-300 ring-zinc-700",
  white: "bg-white/10 text-white ring-white/20",
};

export function Pill({ tone = "zinc", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1", TONES[tone])}>{children}</span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex animate-card-in flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-700 px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/30">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-lg font-bold">{title}</p>
      <p className="max-w-sm text-sm text-zinc-400">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-zinc-900 ring-1 ring-zinc-800" />
      ))}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-300">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className={secondaryButton}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "success" | "error" | "info"; children: ReactNode }) {
  const styles = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    error: "border-red-500/40 bg-red-500/10 text-red-300",
    info: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  } as const;
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", styles[tone])}>
      {children}
    </p>
  );
}

export function StatCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="text-3xl font-black tracking-tight">{value}</p>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </Card>
  );
}

export const inputStyles =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-500 transition-colors focus:border-orange-500 focus:outline-none aria-[invalid=true]:border-red-500 disabled:opacity-60";
