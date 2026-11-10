import type { Metadata } from "next";
import { CustomerWishlist } from "@/components/customer/CustomerWishlist";

export const metadata: Metadata = {
  title: "My wishlist | Restaurant Management System",
};

export default function AccountWishlistPage() {
  return <CustomerWishlist />;
}
