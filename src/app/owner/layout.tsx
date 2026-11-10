import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Owner | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Every Owner page asks the server for the signed-in session, so none of them has a static shell
// (the same setting as the admin area).
export const instant = false;

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return children;
}