"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

// False during server render and hydration, true afterwards. Use it in components that read
// client-only state through a context and may hydrate late (for example inside Suspense),
// so their first render matches the server HTML.
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
