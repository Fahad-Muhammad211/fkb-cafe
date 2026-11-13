import type { Metadata } from "next";
import { CustomerNotifications } from "@/components/customer/CustomerNotifications";

export const metadata: Metadata = {
  title: "Notifications | MEG Pakistan",
};

export default function AccountNotificationsPage() {
  return <CustomerNotifications />;
}
