import type { ReactNode } from "react";
import type { Metadata } from "next";
import { CustomerGuard } from "@/components/auth/SessionGates";

export const metadata: Metadata = {
  title: "My account | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Guard for every /account page. Signed-out visitors are sent to the customer login.
export default function AccountLayout({ children }: { children: ReactNode }) {
  return <CustomerGuard>{children}</CustomerGuard>;
}
