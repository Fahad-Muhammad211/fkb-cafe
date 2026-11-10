import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AdminGuard } from "@/components/auth/SessionGates";

export const metadata: Metadata = {
  title: "Admin | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Every admin page asks the server for the signed-in session (an httpOnly cookie), so none of them can
// render a static shell on the server. Opting the layout out of instant-navigation validation (which
// otherwise reports each admin page as a "dropped segment" in development) is the documented way to
// mark that. It applies to every page below this layout.
export const instant = false;

// Guard: signed-out visitors never reach the dashboard pages.
export default function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
