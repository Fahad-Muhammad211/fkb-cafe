import type { Metadata } from "next";
import { CustomerNotifications } from "@/components/customer/CustomerNotifications";

export const metadata: Metadata = {
  title: "Notifications | Restaurant Management System",
};

export default function AccountNotificationsPage() {
  return <CustomerNotifications />;
}
