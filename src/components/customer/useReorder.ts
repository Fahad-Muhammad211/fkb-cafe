"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { fetchCatalog } from "@/lib/catalogApi";
import type { Order } from "@/types";

export type ReorderNotice = { tone: "success" | "error" | "info"; text: string } | null;

// Copies an earlier order's items into the cart. Items that are off the menu or sold out are skipped
// and named in the notice. Prices come from the saved order; checkout re-checks them against the menu.
export function useReorder() {
  const { addLine, openCart } = useCart();
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReorderNotice>(null);

  const reorder = async (order: Order) => {
    setPendingOrderId(order.id);
    setNotice(null);
    const catalog = await fetchCatalog();
    if (!catalog) {
      setNotice({ tone: "error", text: "We could not check the menu right now. Please try again." });
      setPendingOrderId(null);
      return;
    }

    const products = new Map(catalog.products.map((p) => [p.id, p]));
    const skipped: string[] = [];
    let added = 0;
    for (const line of order.lines) {
      const product = products.get(line.itemId);
      if (!product || product.available === false || product.stock === "out") {
        skipped.push(line.name);
        continue;
      }
      addLine({
        itemId: line.itemId,
        name: product.name,
        unitPrice: line.unitPrice,
        qty: line.qty,
        options: line.options,
        instructions: line.instructions,
      });
      added += 1;
    }

    if (added === 0) {
      setNotice({ tone: "error", text: "None of these items are available right now." });
    } else {
      const note = skipped.length > 0 ? ` ${skipped.length} item${skipped.length === 1 ? " is" : "s are"} unavailable and ${skipped.length === 1 ? "was" : "were"} not added.` : "";
      setNotice({ tone: skipped.length > 0 ? "info" : "success", text: `Added ${added} item${added === 1 ? "" : "s"} to your cart.${note}` });
      openCart();
    }
    setPendingOrderId(null);
  };

  return { reorder, pendingOrderId, notice, clearNotice: () => setNotice(null) };
}
