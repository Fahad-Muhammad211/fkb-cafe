import type { Metadata } from "next";
import { CustomerOffers } from "@/components/customer/CustomerOffers";

export const metadata: Metadata = {
  title: "Offers & coupons | MEG Pakistan",
};

export default function AccountOffersPage() {
  return <CustomerOffers />;
}
