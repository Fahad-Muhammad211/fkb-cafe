import type { Metadata } from "next";
import { CustomerOverview } from "@/components/customer/CustomerOverview";

export const metadata: Metadata = {
  title: "My account | MEG Pakistan",
};

export default function AccountOverviewPage() {
  return <CustomerOverview />;
}
