import type { Metadata } from "next";
import { CustomerProfile } from "@/components/customer/CustomerProfile";

export const metadata: Metadata = {
  title: "My profile | MEG Pakistan",
};

export default function AccountProfilePage() {
  return <CustomerProfile />;
}
