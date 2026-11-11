// What GET /api/admin/dashboard returns (built in lib/server/dashboard.ts).

export interface DashboardData {
  today: {
    // Paid cafe bills + delivered storefront orders.
    sales: number;
    cafeSales: number;
    onlineSales: number;
    orders: number;
    // Cafe orders not paid yet.
    openOrders: number;
    // Cost of stock consumed today (recipes, usage, waste, count shortfalls).
    stockCost: number;
    // Money spent on stock purchases today.
    purchases: number;
    // sales − stockCost.
    profit: number;
  };
  orderValueByDay: { date: string; value: number; orders: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
  recentOrders: { id: string; label: string; channel: "Dine-in" | "Takeaway" | "Online"; total: number; status: string; createdAt: string }[];
  stock: { id: string; name: string; unit: string; quantity: number; avgCost: number; value: number; low: boolean; usedToday: number }[];
  stockValue: number;
  lowStock: number;
  consumption: { itemId: string; name: string; unit: string; qty: number; cost: number; fromOrders: number }[];
}
