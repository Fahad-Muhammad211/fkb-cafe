import { json } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { readCatalog } from "@/lib/server/catalog";
import { readPosMenu } from "@/lib/server/pos";

// GET /api/owner/menu: the menu for the POS, with each item's option groups and prices.
export const GET = ownerRoute(async () => {
  const { categories } = await readCatalog(); // Also seeds the menu on a fresh database.
  return json({ categories: categories.map((c) => ({ id: c.id, label: c.label })), items: await readPosMenu() });
});
