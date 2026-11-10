"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { fetchCatalog } from "@/lib/catalogApi";
import { cacheCategories } from "@/lib/categories";
import { fetchOrders, markOrdersLoaded, saveAllOrders } from "@/lib/orders";
import { cacheProducts } from "@/lib/products";
import { getAdminSession } from "@/lib/sessionClient";
import { purgeLegacyBrowserData } from "@/lib/storage";

const ORDERS_REFRESH_MS = 15_000;
const CATALOG_REFRESH_MS = 60_000;

// Keeps the page's in-memory copy of the menu and orders in step with the server (MongoDB). The menu
// reloads on a timer and on each page change. Orders reload on each page change and every few
// seconds, so an admin's change shows on the customer's screen and a new order shows on the
// dashboard. A failed request leaves the current copy in place.
export function DataSync() {
  const { user } = useAuth();
  const pathname = usePathname();
  const userKey = user === undefined ? undefined : (user?.id ?? "guest");

  // Accounts, sessions and business records used to be kept in this browser's localStorage. They now
  // live on the server, so any copy left from before is removed (the cart and location are kept).
  useEffect(() => {
    const removed = purgeLegacyBrowserData();
    if (removed.length > 0) console.info(`[storage] removed ${removed.length} legacy browser data entries`);
  }, []);

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
    if (!scope) {
      // Guests have no order history on the server; orders they place on this visit stay in memory.
      markOrdersLoaded();
      return;
    }
    let active = true;
    let timer: number | undefined;
    const loadOrders = () =>
      fetchOrders(scope).then((orders) => {
        if (active && orders) saveAllOrders(orders);
      });
    const start = () => {
      void loadOrders();
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void loadOrders();
      }, ORDERS_REFRESH_MS);
    };
    if (scope === "admin") {
      // The admin order list is for the Admin only. Signed-out visitors (for example on /admin/login)
      // and Owners are refused by the server, so do not ask for it at all.
      void getAdminSession()
        .catch(() => null)
        .then((session) => {
          if (active && session?.role === "admin") start();
        });
    } else {
      start();
    }
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pathname, userKey]);

  return null;
}
