import type { Metadata } from "next";
import { CustomerAddresses } from "@/components/customer/CustomerAddresses";

export const metadata: Metadata = {
  title: "My addresses | Restaurant Management System",
};

export default function AccountAddressesPage() {
  return <CustomerAddresses />;
}
