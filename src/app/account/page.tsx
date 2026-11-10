import type { Metadata } from "next";
import { CustomerOverview } from "@/components/customer/CustomerOverview";

export const metadata: Metadata = {
  title: "My account | Restaurant Management System",
};

export default function AccountOverviewPage() {
  return <CustomerOverview />;
}
