import type { Metadata } from "next";
import { CustomerPayments } from "@/components/customer/CustomerPayments";

export const metadata: Metadata = {
  title: "My payments | Restaurant Management System",
};

export default function AccountPaymentsPage() {
  return <CustomerPayments />;
}
