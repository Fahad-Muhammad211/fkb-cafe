"use client";

import { installLocalApi } from "@/lib/local/fetchShim";

// Makes sure the in-browser data handlers are installed before the app's own requests run.
export function LocalBackend() {
  installLocalApi();
  return null;
}
