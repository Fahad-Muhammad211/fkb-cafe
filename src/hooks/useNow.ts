"use client";

import { useCallback, useSyncExternalStore } from "react";

// Current time, bucketed to `intervalMs` and refreshed on each bucket change. The server
// snapshot is fixed at 0 so the clock is only read in the browser, after hydration.
export function useNow(intervalMs = 5000): number {
  const subscribe = useCallback(
    (callback: () => void) => {
      const id = window.setInterval(callback, intervalMs);
      return () => window.clearInterval(id);
    },
    [intervalMs],
  );

  const getSnapshot = useCallback(() => Math.floor(Date.now() / intervalMs) * intervalMs, [intervalMs]);
  const getServerSnapshot = () => 0;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
