import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kitchen | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Session-dependent, like the Owner pages.
export const instant = false;

export default function KitchenLayout({ children }: { children: ReactNode }) {
  return children;
}