import type { Metadata } from "next";
import { CustomerOrders } from "@/components/customer/CustomerOrders";

export const metadata: Metadata = {
  title: "My orders | Restaurant Management System",
};

export default function AccountOrdersPage() {
  return <CustomerOrders />;
}
