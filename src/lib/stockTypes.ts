// Shapes shared by the stock server module (lib/server/stock.ts), the Stock page and the Dashboard.

export const STOCK_UNITS = ["kg", "g", "L", "ml", "pcs", "pack", "bottle", "dozen"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export interface StockItem {
  id: string;
  name: string;
  unit: StockUnit;
  // On hand, in `unit`. Can be negative when more was used than was recorded as bought.
  quantity: number;
  // Weighted average purchase cost per unit (PKR).
  avgCost: number;
  // At or below this quantity the item is shown as low.
  lowLevel: number;
  createdAt: string;
}

// purchase: stock in. usage / waste: manual stock out. adjustment: physical count correction.
// order: deducted automatically from a completed order's recipes.
export type StockMovementType = "purchase" | "usage" | "waste" | "adjustment" | "order";

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  unit: StockUnit;
  type: StockMovementType;
  // Positive for stock in, negative for stock out.
  qty: number;
  unitCost: number;
  totalCost: number;
  note: string;
  orderId: string | null;
  at: string;
}

// What one unit of a menu product uses.
export interface Recipe {
  productId: string;
  lines: { itemId: string; qty: number }[];
}

export interface StockSnapshot {
  items: StockItem[];
  movements: StockMovement[];
  recipes: Recipe[];
}
