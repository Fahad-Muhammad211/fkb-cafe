"use client";

import { useEffect, useState } from "react";

export type SessionStatus<T> = { state: "loading" } | { state: "signedOut" } | { state: "ready"; value: T };

// Loads the signed-in account from this browser's storage. `load` must be a stable function (a
// module-level function), so the account is read once per page visit.
export function useSession<T>(load: () => Promise<T | null>): SessionStatus<T> {
  const [status, setStatus] = useState<SessionStatus<T>>({ state: "loading" });
  useEffect(() => {
    let active = true;
    load()
      .then((value) => {
        if (active) setStatus(value ? { state: "ready", value } : { state: "signedOut" });
      })
      .catch(() => {
        if (active) setStatus({ state: "signedOut" });
      });
    return () => {
      active = false;
    };
  }, [load]);
  return status;
}

export function Checking({ text }: { text: string }) {
  return <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-sm text-zinc-400">{text}</div>;
}
