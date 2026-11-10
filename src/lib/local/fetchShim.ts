import { handleLocalApi } from "@/lib/local/api";
import { migrateManagerAccounts } from "@/lib/local/adminAccounts";

// Sends the app's own /api/... requests to the in-browser handlers (api.ts). Every other request
// goes to the browser's fetch unchanged. Installed once, when the app loads in the browser.
let installed = false;

export function installLocalApi(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // One-time data update: accounts saved with the old "manager" role are stored as owners.
  // They are already read as owners, so the app does not wait for this.
  migrateManagerAccounts().catch((err) => console.error("[migrate] could not update manager accounts:", err));
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return nativeFetch(input, init);
    const request = input instanceof Request ? new Request(input, init) : new Request(url, init);
    return handleLocalApi(request);
  };
}

installLocalApi();
