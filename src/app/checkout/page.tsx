import type { Metadata } from "next";
import { PageFrame } from "@/components/layout/PageFrame";
import { CheckoutView } from "@/components/checkout/CheckoutView";

export const metadata: Metadata = {
  title: "Checkout | Restaurant Management System",
};

export default function CheckoutPage() {
  return (
    <PageFrame>
      <CheckoutView />
    </PageFrame>
  );
}
