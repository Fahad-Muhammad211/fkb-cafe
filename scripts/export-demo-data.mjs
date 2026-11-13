// Writes src/lib/server/demoData.json: the sample data the app serves from memory when no database
// is connected (see src/lib/server/memoryStore.ts). Run after `npm run seed:staff`:
//
//   npm run demo:export
//
// It copies the menu, sample team (attendance, pay, payroll), cafe tables and orders, stock and
// recipes, and the sample Managers' logins. Customer accounts, online orders, sessions and the
// Owner's own login are never copied. Staff without an employee number (quick test entries) are left out.
import { MongoClient } from "mongodb";
import { writeFileSync } from "node:fs";

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB || "restaurant_system");
const all = (name, filter = {}) => db.collection(name).find(filter).toArray();

const staff = await all("cafe_staff", { code: { $regex: /^EMP-/ } });
const staffIds = staff.map((s) => s._id);
const accountIds = staff.map((s) => s.accountId).filter(Boolean);

const data = {
  products: await all("products"),
  categories: await all("categories"),
  cafe_staff: staff,
  staff_attendance: await all("staff_attendance", { staffId: { $in: staffIds } }),
  staff_pay: await all("staff_pay", { staffId: { $in: staffIds } }),
  staff_payroll: await all("staff_payroll", { staffId: { $in: staffIds } }),
  admins: await all("admins", { _id: { $in: accountIds }, role: "cafe_manager" }),
  cafe_settings: await all("cafe_settings"),
  cafe_tables: (await all("cafe_tables")).map((t) => (staffIds.includes(t.waiterId) ? t : { ...t, waiterId: null })),
  cafe_orders: await all("cafe_orders"),
  stock_items: await all("stock_items"),
  stock_movements: await all("stock_movements"),
  recipes: await all("recipes"),
};

// Dates become { "$date": "…" } so the memory store can turn them back into Dates.
const encode = (v) =>
  v instanceof Date ? { $date: v.toISOString() } : Array.isArray(v) ? v.map(encode) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) : v;
writeFileSync(new URL("../src/lib/server/demoData.json", import.meta.url), JSON.stringify(encode(data)) + "\n");
console.log(Object.entries(data).map(([k, v]) => `${k}: ${v.length}`).join("\n"));
await client.close();
