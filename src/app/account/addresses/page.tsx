import type { Metadata } from "next";
import { CustomerAddresses } from "@/components/customer/CustomerAddresses";

export const metadata: Metadata = {
  title: "My addresses | MEG Pakistan",
};

export default function AccountAddressesPage() {
  return <CustomerAddresses />;
}
