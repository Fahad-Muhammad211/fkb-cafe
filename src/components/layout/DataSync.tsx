"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { fetchCatalog } from "@/lib/catalogApi";
import { cacheCategories } from "@/lib/categories";
import { fetchOrders, saveAllOrders } from "@/lib/orders";
import { cacheProducts } from "@/lib/products";

const ORDERS_REFRESH_MS = 15_000;
const CATALOG_REFRESH_MS = 60_000;

// Keeps this browser's copy of the menu and orders in step with the server (MongoDB). The menu
// reloads on a timer and on each page change. Orders reload on each page change and every few
// seconds, so an admin's change shows on the customer's screen and a new order shows on the
// dashboard. A failed request leaves the saved copy in place.
export function DataSync() {
  const { user } = useAuth();
  const pathname = usePathname();
  const userKey = user === undefined ? undefined : (user?.id ?? "guest");

  useEffect(() => {
    let active = true;
    const loadCatalog = () =>
      fetchCatalog().then((catalog) => {
        if (!active || !catalog) return;
        cacheProducts(catalog.products);
        cacheCategories(catalog.categories);
      });
    void loadCatalog();
    const timer = window.setInterval(loadCatalog, CATALOG_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pathname]);

  useEffect(() => {
    if (userKey === undefined) return;
    const scope = pathname.startsWith("/admin") ? "admin" : userKey !== "guest" ? "customer" : null;
    if (!scope) return;
    let active = true;
    const loadOrders = () =>
      fetchOrders(scope).then((orders) => {
        if (active && orders) saveAllOrders(orders);
      });
    void loadOrders();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadOrders();
    }, ORDERS_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pathname, userKey]);

  return null;
}
