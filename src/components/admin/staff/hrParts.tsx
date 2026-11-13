"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/staffTypes";
import { ATTENDANCE_LABEL } from "@/lib/staffTypes";

// Small shared pieces for the Employees page (directory, attendance, payroll, profile).

const pad = (n: number) => String(n).padStart(2, "0");
// Dates and times on the restaurant's own clock (the browser), not UTC.
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const thisMonth = () => todayLocal().slice(0, 7);
export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatHours = (minutes: number) => (minutes ? `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m` : "—");
export const formatDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
export const formatMonth = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString([], { month: "long", year: "numeric" });
export const formatTime12 = (t: string | null) => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};

export const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#ffd400] aria-[invalid=true]:border-red-500";

const STATUS_TONE: Record<AttendanceStatus | "none", string> = {
  present: "bg-emerald-500/15 text-emerald-300",
  late: "bg-amber-500/15 text-amber-300",
  absent: "bg-red-500/15 text-red-300",
  leave: "bg-sky-500/15 text-sky-300",
  off: "bg-zinc-800 text-zinc-400",
  none: "bg-zinc-800/60 text-zinc-500",
};

export function StatusBadge({ status }: { status: AttendanceStatus | null }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold", STATUS_TONE[status ?? "none"])}>{status ? ATTENDANCE_LABEL[status] : "Not marked"}</span>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      {children}
      {hint && !error && <span className="text-xs font-normal text-zinc-500">{hint}</span>}
      {error && <span className="text-xs font-normal text-red-300">{error}</span>}
    </label>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 truncate text-xl font-black tabular-nums">{value}</p>
      {note && <p className="mt-1 truncate text-xs text-zinc-500">{note}</p>}
    </div>
  );
}

export function Notice({ notice }: { notice: { tone: "ok" | "error"; text: string } | null }) {
  if (!notice) return null;
  return (
    <p role="status" className={cn("rounded-xl border px-4 py-3 text-sm", notice.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300")}>
      {notice.text}
    </p>
  );
}
