import type { Metadata } from "next";
import { CustomerProfile } from "@/components/customer/CustomerProfile";

export const metadata: Metadata = {
  title: "My profile | Restaurant Management System",
};

export default function AccountProfilePage() {
  return <CustomerProfile />;
}
