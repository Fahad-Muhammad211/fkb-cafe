// Loads a complete sample restaurant team into the running app, through its own API, so every
// number on the Employees page (attendance, overtime, tips, bonuses, payroll) is real data.
//
//   npm run seed:staff                       -> http://localhost:3000
//   npm run seed:staff -- http://host:port   -> another running copy
//   npm run seed:staff -- --reset            -> remove the current staff directory first
//
// It signs in with the demo login (a name only), adds 23 staff across every department, fills in
// attendance from the start of last month up to today, adds tips, bonuses, an advance and a
// deduction, and marks last month's payroll as paid. Two managers also get a dashboard login:
//   gm.restaurant.demo@gmail.com / Manager123
//   floor.restaurant.demo@gmail.com / Manager123

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("http")) ?? "http://localhost:3000").replace(/\/$/, "");
const RESET = args.includes("--reset");

let cookie = "";
async function api(path, method = "GET", body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

// [kind, name, title, department, shiftStart, shiftEnd, offDay, salary, allowance, duty, joinedOn, login?]
const TEAM = [
  ["manager", "Imran Qureshi", "General Manager", "Management", "11:00", "20:00", "Monday", 180000, 20000, "Runs the restaurant: staff rota, suppliers, cash-up, guest complaints and daily sales targets.", "2021-03-01", "gm.restaurant.demo@gmail.com"],
  ["manager", "Sana Malik", "Floor Manager", "Management", "14:00", "23:00", "Tuesday", 95000, 10000, "Leads the dining floor in the evening, seats VIP guests and checks service standards.", "2022-06-15", "floor.restaurant.demo@gmail.com"],
  ["employee", "Bilal Ahmed", "Shift Supervisor", "Management", "11:00", "20:00", "Wednesday", 65000, 5000, "Opens the restaurant, runs the lunch shift, checks the opening checklist.", "2023-01-10"],
  ["employee", "Rashid Mehmood", "Head Chef", "Kitchen", "10:00", "19:00", "Monday", 150000, 15000, "Menu, recipes, kitchen team, food cost and hygiene standards.", "2020-11-01"],
  ["employee", "Faisal Iqbal", "Sous Chef", "Kitchen", "14:00", "23:00", "Thursday", 95000, 8000, "Runs the evening kitchen and the pass, trains cooks.", "2022-02-20"],
  ["employee", "Asif Ali", "Grill Cook", "Kitchen", "15:00", "23:00", "Tuesday", 60000, 0, "BBQ and grill station: tikka, kebabs, steaks.", "2023-04-05"],
  ["employee", "Naveed Akhtar", "Tandoor Cook", "Kitchen", "12:00", "21:00", "Friday", 50000, 0, "Naan, roti and tandoori items.", "2023-08-12"],
  ["employee", "Kamran Shah", "Line Cook", "Kitchen", "11:00", "20:00", "Saturday", 45000, 0, "Karahi and curry station, prep for lunch service.", "2024-01-08"],
  ["employee", "Zahid Hussain", "Kitchen Helper", "Kitchen", "10:00", "19:00", "Sunday", 32000, 0, "Vegetable prep, marination, receiving deliveries.", "2024-05-20"],
  ["employee", "Shahid Masih", "Dishwasher", "Kitchen", "14:00", "23:00", "Wednesday", 30000, 0, "Dishwashing, pot wash, kitchen floor at close.", "2024-07-01"],
  ["waiter", "Usman Tariq", "Head Waiter", "Service", "13:00", "22:00", "Monday", 55000, 5000, "Section lead, trains new waiters, handles large bookings.", "2021-09-01"],
  ["waiter", "Ali Raza", "Waiter", "Service", "12:00", "21:00", "Tuesday", 38000, 0, "Tables 1–4, lunch and early dinner.", "2023-03-15"],
  ["waiter", "Hamza Khan", "Waiter", "Service", "14:00", "23:00", "Wednesday", 38000, 0, "Tables 5–8, evening service.", "2023-10-01"],
  ["waiter", "Ayesha Siddiqui", "Waiter", "Service", "12:00", "21:00", "Thursday", 38000, 0, "Family hall tables, lunch and early dinner.", "2024-02-12"],
  ["waiter", "Danish Javed", "Waiter", "Service", "15:00", "23:00", "Friday", 38000, 0, "Terrace tables, evening service.", "2024-06-03"],
  ["employee", "Mehwish Anwar", "Hostess", "Service", "12:00", "21:00", "Saturday", 42000, 3000, "Greets and seats guests, manages the bookings book and waiting list.", "2023-12-01"],
  ["employee", "Junaid Akram", "Busser", "Service", "14:00", "23:00", "Sunday", 30000, 0, "Clears and resets tables, refills water and condiments.", "2024-08-19"],
  ["employee", "Saad Farooq", "Cashier", "Cash & Front desk", "12:00", "21:00", "Monday", 45000, 3000, "Bills, card and cash payments, end-of-shift cash count.", "2022-10-10"],
  ["employee", "Hira Nadeem", "Cashier", "Cash & Front desk", "15:00", "23:00", "Thursday", 45000, 3000, "Evening billing, takeaway counter and phone orders.", "2024-03-01"],
  ["employee", "Pervaiz Gill", "Cleaner", "Cleaning", "09:00", "18:00", "Sunday", 30000, 0, "Dining hall, washrooms and entrance; deep clean on Mondays.", "2022-05-05"],
  ["employee", "Adnan Butt", "Delivery Rider", "Delivery", "13:00", "22:00", "Tuesday", 35000, 8000, "Home deliveries within 5 km. Allowance covers fuel.", "2023-07-07"],
  ["employee", "Waqas Ahmed", "Delivery Rider", "Delivery", "16:00", "23:00", "Friday", 35000, 8000, "Evening home deliveries. Allowance covers fuel.", "2024-09-09"],
  ["employee", "Gul Khan", "Security Guard", "Security", "18:00", "06:00", "Saturday", 35000, 0, "Night security, parking and locking up after close.", "2022-01-15"],
];

// Repeatable pseudo-random numbers, so a re-run gives the same month.
let seed = 20261113;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const between = (a, b) => Math.round(a + rand() * (b - a));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const toTime = (m) => `${pad(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad((((m % 1440) + 1440) % 1440) % 60)}`;
const phone = (i) => `03${pad(between(0, 49))}-${String(1000000 + i * 37717 + between(0, 9999)).slice(0, 7)}`;
const cnic = () => `${between(35201, 42301)}-${between(1000000, 9999999)}-${between(1, 9)}`;
const RELATIONS = ["Father", "Brother", "Wife", "Mother", "Husband", "Uncle"];
const FIRST = ["Akbar", "Tahir", "Nasreen", "Rubina", "Khalid", "Shazia", "Arif", "Samina"];

async function main() {
  const login = await api("/api/admin/session", "POST", { name: "Demo Owner" });
  if (!login.ok) throw new Error(`Demo login failed (${login.status}): ${JSON.stringify(login.data)}`);

  if (RESET) {
    const current = await api("/api/admin/cafe-staff");
    for (const s of current.data ?? []) await api(`/api/admin/cafe-staff/${encodeURIComponent(s.id)}`, "DELETE");
    console.log(`Removed ${(current.data ?? []).length} existing staff.`);
  }

  const existing = new Map(((await api("/api/admin/cafe-staff")).data ?? []).map((s) => [s.name, s]));
  const people = [];
  const fresh = new Set(); // only people added by this run get sample attendance and pay
  for (const [i, [kind, name, title, department, shiftStart, shiftEnd, offDay, salary, allowance, duty, joinedOn, email]] of TEAM.entries()) {
    if (existing.has(name)) {
      people.push({ ...existing.get(name) });
      continue;
    }
    const body = {
      kind,
      name,
      title,
      department,
      shiftStart,
      shiftEnd,
      offDay,
      salary,
      allowance,
      duty,
      joinedOn,
      phone: phone(i),
      cnic: cnic(),
      emergencyContact: `${FIRST[i % FIRST.length]} (${RELATIONS[i % RELATIONS.length]}) ${phone(i + 40)}`,
      ...(email ? { email, password: "Manager123" } : {}),
    };
    const res = await api("/api/admin/cafe-staff", "POST", body);
    if (!res.ok) throw new Error(`Could not add ${name}: ${JSON.stringify(res.data)}`);
    people.push(res.data.value);
    fresh.add(name);
  }
  console.log(`Staff ready: ${people.length}.`);

  // Attendance from the 1st of last month up to today.
  const now = new Date();
  const today = iso(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let days = 0;
  for (const p of people.filter((x) => fresh.has(x.name))) {
    for (let d = new Date(start); iso(d) <= today; d.setDate(d.getDate() + 1)) {
      const date = iso(d);
      if (date < p.joinedOn) continue;
      const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
      const isToday = date === today;
      let body;
      if (weekday === p.offDay) body = { status: "off" };
      else {
        const r = rand();
        if (r < 0.04) body = { status: "absent", note: ["Sick", "No call, no show", "Family emergency"][between(0, 2)] };
        else if (r < 0.07) body = { status: "leave", note: ["Annual leave", "Sick leave", "Wedding in family"][between(0, 2)] };
        else {
          const late = rand() < 0.12;
          const inMin = toMin(p.shiftStart) + (late ? between(12, 45) : between(-15, 8));
          if (isToday && inMin > nowMin) continue; // shift has not started yet
          const shiftLen = (toMin(p.shiftEnd) - toMin(p.shiftStart) + 1440) % 1440 || 1440;
          const overtime = rand() < 0.15 ? between(45, 120) : between(-5, 20);
          const outMin = toMin(p.shiftStart) + shiftLen + overtime;
          const stillOnDuty = isToday && (inMin + (outMin - inMin) > nowMin || outMin > 1440);
          body = { status: "present", checkIn: toTime(inMin), checkOut: stillOnDuty ? null : toTime(outMin), note: late ? ["Traffic", "Bike trouble", ""][between(0, 2)] : "" };
        }
      }
      if (isToday && body.status !== "present") continue; // leave today unmarked unless they came in
      const res = await api(`/api/admin/hr/attendance/${encodeURIComponent(p.id)}`, "POST", { action: "set", date, ...body });
      if (!res.ok) throw new Error(`Attendance failed for ${p.name} on ${date}: ${JSON.stringify(res.data)}`);
      days++;
    }
  }
  console.log(`Attendance days recorded: ${days}.`);

  // Tips: weekly tip pool for the floor team; bonuses, incentives, an advance and a deduction.
  const byName = new Map(people.map((p) => [p.name, p]));
  const pay = [];
  const tipTeam = { "Usman Tariq": [3500, 6000], "Ali Raza": [2500, 4500], "Hamza Khan": [2500, 5000], "Ayesha Siddiqui": [2500, 4800], "Danish Javed": [2000, 4200], "Mehwish Anwar": [1000, 2000], "Junaid Akram": [800, 1500], "Adnan Butt": [1200, 2500], "Waqas Ahmed": [1000, 2200] };
  for (let d = new Date(start); iso(d) <= today; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) continue; // tip pool shared out every Sunday night
    for (const [name, [lo, hi]] of Object.entries(tipTeam)) pay.push({ name, date: iso(d), type: "tip", amount: between(lo, hi), note: "Weekly tip pool" });
  }
  const lastMonth = iso(start).slice(0, 7);
  const thisMonth = today.slice(0, 7);
  pay.push(
    { name: "Usman Tariq", date: `${lastMonth}-28`, type: "bonus", amount: 5000, note: "Best waiter of the month" },
    { name: "Rashid Mehmood", date: `${lastMonth}-30`, type: "incentive", amount: 10000, note: "Food cost kept under 32%" },
    { name: "Saad Farooq", date: `${lastMonth}-30`, type: "incentive", amount: 2000, note: "Cash count matched every day" },
    { name: "Imran Qureshi", date: `${lastMonth}-30`, type: "incentive", amount: 15000, note: "Monthly sales target achieved" },
    { name: "Zahid Hussain", date: `${thisMonth}-05`, type: "advance", amount: 10000, note: "Salary advance (family need)" },
    { name: "Hamza Khan", date: `${thisMonth}-08`, type: "deduction", amount: 1500, note: "Broken glassware" },
    { name: "Ayesha Siddiqui", date: `${thisMonth}-09`, type: "bonus", amount: 3000, note: "5-star guest review mention" },
    { name: "Gul Khan", date: `${lastMonth}-15`, type: "advance", amount: 5000, note: "Salary advance" },
  );
  for (const e of pay) {
    if (e.date > today || !fresh.has(e.name)) continue;
    const res = await api("/api/admin/hr/pay", "POST", { staffId: byName.get(e.name).id, date: e.date, type: e.type, amount: e.amount, note: e.note });
    if (!res.ok) throw new Error(`Pay entry failed for ${e.name}: ${JSON.stringify(res.data)}`);
  }
  console.log(`Pay entries recorded: ${pay.filter((e) => e.date <= today && fresh.has(e.name)).length}.`);

  // Last month has been paid out.
  for (const p of people.filter((x) => fresh.has(x.name))) await api(`/api/admin/hr/payroll/${encodeURIComponent(p.id)}`, "PUT", { month: lastMonth, paid: true });
  console.log(`Payroll for ${lastMonth} marked paid.`);

  await seedStock();

  const payroll = await api(`/api/admin/hr/payroll?month=${thisMonth}`);
  const net = (payroll.data?.rows ?? []).reduce((t, r) => t + r.net, 0);
  console.log(`Payroll ${thisMonth} so far: ${payroll.data?.rows?.length} staff, net Rs. ${net.toLocaleString()}.`);
  await api("/api/admin/session", "DELETE");
}

// Kitchen stock with purchases, some usage and waste, and recipes for popular menu items, so the
// Stock page and the dashboard's stock and profit figures have real numbers. Existing items are kept.
// [name, unit, lowLevel, opening quantity, opening cost (total)]
const STOCK = [
  ["Chicken fillet", "kg", 8, 30, 33000],
  ["Beef mince", "kg", 6, 20, 32000],
  ["Fish fillet", "kg", 4, 12, 21600],
  ["Burger buns", "pcs", 60, 240, 9600],
  ["Tortilla wraps", "pcs", 40, 150, 6000],
  ["Potatoes", "kg", 15, 60, 6600],
  ["Cooking oil", "L", 10, 40, 22000],
  ["Cheddar cheese slices", "pcs", 50, 300, 13500],
  ["Mozzarella", "kg", 3, 10, 18000],
  ["Lettuce", "kg", 2, 6, 1800],
  ["Tomatoes", "kg", 4, 12, 2400],
  ["Ketchup", "kg", 3, 10, 4500],
  ["Mayonnaise", "kg", 3, 10, 6500],
  ["Fettuccine pasta", "kg", 2, 8, 6400],
  ["Cooking cream", "L", 2, 8, 7200],
  ["Milk", "L", 10, 30, 6600],
  ["Coffee beans", "kg", 1, 4, 22000],
  ["Vanilla ice cream", "L", 4, 12, 9600],
  ["Sugar", "kg", 5, 20, 3000],
  ["Soft drink cans", "pcs", 48, 144, 14400],
  ["Mineral water bottles", "pcs", 48, 120, 6000],
  ["Takeaway boxes", "pcs", 100, 500, 10000],
];

// productId -> [[stock item name, quantity per portion]]
const RECIPES = {
  "meg-classic": [["Beef mince", 0.18], ["Burger buns", 1], ["Cheddar cheese slices", 1], ["Lettuce", 0.02], ["Tomatoes", 0.03], ["Mayonnaise", 0.02]],
  smokehouse: [["Beef mince", 0.2], ["Burger buns", 1], ["Cheddar cheese slices", 2], ["Mayonnaise", 0.02]],
  "chicken-fillet": [["Chicken fillet", 0.16], ["Burger buns", 1], ["Lettuce", 0.02], ["Mayonnaise", 0.02], ["Cooking oil", 0.05]],
  "peri-peri": [["Chicken fillet", 0.16], ["Burger buns", 1], ["Lettuce", 0.02], ["Cooking oil", 0.05]],
  "flaming-hot": [["Chicken fillet", 0.17], ["Burger buns", 1], ["Cheddar cheese slices", 1], ["Cooking oil", 0.05]],
  "chipotle-wrap": [["Chicken fillet", 0.14], ["Tortilla wraps", 1], ["Lettuce", 0.03], ["Mayonnaise", 0.02]],
  "garlic-mayo-wrap": [["Chicken fillet", 0.14], ["Tortilla wraps", 1], ["Mayonnaise", 0.03]],
  "chicken-tenders": [["Chicken fillet", 0.15], ["Cooking oil", 0.06]],
  "peri-peri-strips": [["Chicken fillet", 0.15], ["Cooking oil", 0.06]],
  "mozzarella-sticks": [["Mozzarella", 0.12], ["Cooking oil", 0.05]],
  "salted-fries": [["Potatoes", 0.25], ["Cooking oil", 0.06], ["Ketchup", 0.02]],
  "curly-fries": [["Potatoes", 0.25], ["Cooking oil", 0.06]],
  "chicken-loaded-fries": [["Potatoes", 0.25], ["Chicken fillet", 0.08], ["Cheddar cheese slices", 2], ["Cooking oil", 0.06]],
  "fettuccine-alfredo": [["Fettuccine pasta", 0.15], ["Cooking cream", 0.12], ["Chicken fillet", 0.08], ["Mozzarella", 0.03]],
  "vanilla-shake": [["Milk", 0.25], ["Vanilla ice cream", 0.15], ["Sugar", 0.02]],
  "oreo-shake": [["Milk", 0.25], ["Vanilla ice cream", 0.15], ["Sugar", 0.02]],
  cappuccino: [["Coffee beans", 0.018], ["Milk", 0.18], ["Sugar", 0.01]],
  americano: [["Coffee beans", 0.018]],
  "soft-drink": [["Soft drink cans", 1]],
  "mineral-water": [["Mineral water bottles", 1]],
};

async function seedStock() {
  const snapshot = (await api("/api/admin/stock")).data;
  const byName = new Map((snapshot?.items ?? []).map((i) => [i.name.toLowerCase(), i]));
  let added = 0;
  for (const [name, unit, lowLevel, quantity, totalCost] of STOCK) {
    if (byName.has(name.toLowerCase())) continue;
    const res = await api("/api/admin/stock/items", "POST", { name, unit, lowLevel, quantity, totalCost });
    if (!res.ok) throw new Error(`Stock item ${name} failed: ${JSON.stringify(res.data)}`);
    byName.set(name.toLowerCase(), res.data.value);
    added++;
    const id = res.data.value.id;
    // A second delivery at a slightly different price, then some kitchen use and a little waste.
    await api(`/api/admin/stock/items/${id}/purchases`, "POST", { quantity: Math.round(quantity / 2), totalCost: Math.round((totalCost / 2) * 1.05), note: "Weekly supplier delivery" });
    await api(`/api/admin/stock/items/${id}/usage`, "POST", { type: "usage", quantity: Math.round(quantity * 0.3 * 100) / 100, note: "Kitchen prep" });
    if (["Lettuce", "Tomatoes", "Milk"].includes(name)) await api(`/api/admin/stock/items/${id}/usage`, "POST", { type: "waste", quantity: 1, note: "Spoiled" });
  }
  let recipes = 0;
  for (const [productId, lines] of Object.entries(RECIPES)) {
    const body = lines.map(([item, qty]) => ({ itemId: byName.get(item.toLowerCase())?.id, qty })).filter((l) => l.itemId);
    const res = await api(`/api/admin/stock/recipes/${productId}`, "PUT", { lines: body });
    if (res.ok) recipes++;
  }
  console.log(`Stock items added: ${added}. Recipes saved: ${recipes}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
