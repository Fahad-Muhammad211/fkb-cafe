import type { Metadata } from "next";
import { CustomerOrders } from "@/components/customer/CustomerOrders";

export const metadata: Metadata = {
  title: "My orders | MEG Pakistan",
};

export default function AccountOrdersPage() {
  return <CustomerOrders />;
}
