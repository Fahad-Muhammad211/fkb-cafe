"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

type Status = { mode: "database" } | { mode: "demo"; message: string };

// Shown at the top of the admin pages when no database is connected. The app then runs on built-in
// sample data held in the server's memory, so every feature can still be tried, but changes are
// temporary.
export function DatabaseBanner({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Status | null) => alive && data && setStatus(data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (status?.mode !== "demo") return null;
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ${className}`}>
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
      <div>
        <p className="font-bold text-amber-300">Database is not working: demo mode</p>
        <p className="mt-0.5 text-amber-200/90">
          {status.message} Everything still works with sample data, but changes are temporary and reset when the server restarts.
        </p>
      </div>
    </div>
  );
}
