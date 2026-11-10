import type { Metadata } from "next";
import { CustomerSupport } from "@/components/customer/CustomerSupport";

export const metadata: Metadata = {
  title: "Customer support | Restaurant Management System",
};

// "?order=MEG-123456" pre-selects that order in the complaint form (see the order detail page).
export default async function AccountSupportPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  const initialOrderId = typeof order === "string" && /^MEG-\d{6}$/.test(order) ? order : "";
  return <CustomerSupport initialOrderId={initialOrderId} />;
}
