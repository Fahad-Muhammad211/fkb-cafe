import "server-only";
import { getCollection } from "@/lib/server/collections";
import { randomHex } from "@/lib/server/random";
import { staffCol, toStaff } from "@/lib/server/cafeStaff";
import type { CafeStaff } from "@/lib/cafeTypes";
import {
  PAYROLL_RULES,
  type AttendanceRecord,
  type AttendanceStatus,
  type PayEntry,
  type PayType,
  type PayrollMonth,
  type PayrollRow,
  type StaffProfileData,
} from "@/lib/staffTypes";

// Staff attendance (check-in / check-out), pay entries (tips, bonuses, incentives, advances,
// deductions) and the monthly payroll worked out from them.
// - "staff_attendance": one document per person per day, _id "<staffId>:<YYYY-MM-DD>".
// - "staff_pay": one document per pay entry.
// - "staff_payroll": one document per person per month once that month's pay is marked paid.
// Times are the restaurant's local clock ("HH:MM") sent by the page, so the server's time zone does
// not matter.

type AttendanceDoc = Omit<AttendanceRecord, "id" | "workedMinutes" | "overtimeMinutes" | "lateMinutes"> & { _id: string };
type PayDoc = Omit<PayEntry, "id"> & { _id: string };
type PayrollDoc = { _id: string; staffId: string; month: string; paidAt: string; net: number };

const attendanceCol = () =>
  getCollection<AttendanceDoc>("staff_attendance", [
    { key: { date: 1 }, name: "date" },
    { key: { staffId: 1, date: 1 }, name: "staff_date" },
  ]);
const payCol = () => getCollection<PayDoc>("staff_pay", [{ key: { staffId: 1, date: 1 }, name: "staff_date" }, { key: { date: 1 }, name: "date" }]);
const payrollCol = () => getCollection<PayrollDoc>("staff_payroll", [{ key: { month: 1 }, name: "month" }]);

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string; errors?: Record<string, string> };
const fail = (status: number, error: string, errors?: Record<string, string>) => ({ ok: false as const, status, error, errors });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "leave", "off"];
const PAY_TYPES: PayType[] = ["tip", "bonus", "incentive", "advance", "deduction"];

const validDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v));
const validTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const cleanNote = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 120);

function shiftMinutes(staff: Pick<CafeStaff, "shiftStart" | "shiftEnd">): number {
  const len = toMinutes(staff.shiftEnd) - toMinutes(staff.shiftStart);
  return len > 0 ? len : len + 1440; // a shift that ends after midnight
}

// Minutes after shift start, allowing for a check-in just before an early-morning shift.
function minutesLate(staff: Pick<CafeStaff, "shiftStart">, checkIn: string): number {
  let diff = toMinutes(checkIn) - toMinutes(staff.shiftStart);
  if (diff < -720) diff += 1440;
  return diff > PAYROLL_RULES.lateGraceMinutes ? diff : 0;
}

const withoutId = ({ _id, ...rest }: AttendanceDoc) => {
  void _id;
  return rest;
};

function toRecord(doc: AttendanceDoc, staff: CafeStaff | undefined): AttendanceRecord {
  let worked = 0;
  if (doc.checkIn && doc.checkOut) {
    worked = toMinutes(doc.checkOut) - toMinutes(doc.checkIn);
    if (worked < 0) worked += 1440;
  }
  const late = staff && doc.checkIn && doc.status === "late" ? minutesLate(staff, doc.checkIn) : 0;
  const overtime = staff && worked ? Math.max(0, worked - shiftMinutes(staff)) : 0;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest, workedMinutes: worked, overtimeMinutes: overtime, lateMinutes: late };
}

async function findStaff(id: string): Promise<CafeStaff | null> {
  const doc = await (await staffCol()).findOne({ _id: id });
  return doc ? toStaff(doc) : null;
}

async function staffById(): Promise<Map<string, CafeStaff>> {
  const docs = await (await staffCol()).find({}).toArray();
  return new Map(docs.map((d) => [d._id, toStaff(d)]));
}

// ----- Attendance -----

export async function readAttendanceDay(date: unknown): Promise<Result<AttendanceRecord[]>> {
  if (!validDate(date)) return fail(400, "Choose a valid date.");
  const [docs, staff] = await Promise.all([(await attendanceCol()).find({ date }).toArray(), staffById()]);
  return { ok: true, value: docs.map((d) => toRecord(d, staff.get(d.staffId))) };
}

// One action on one person's attendance for a day:
// - "in": check in at `time` (Present, or Late after the grace period)
// - "out": check out at `time` (needs a check-in first)
// - "set": save the day by hand (status, check-in, check-out, note), e.g. Absent, On leave, Day off
// - "clear": remove the day's record
export async function changeAttendance(staffId: string, body: Record<string, unknown>): Promise<Result<AttendanceRecord | null>> {
  const staff = await findStaff(staffId);
  if (!staff) return fail(404, "Staff member not found.");
  const date = body.date;
  if (!validDate(date)) return fail(400, "Choose a valid date.");
  const col = await attendanceCol();
  const _id = `${staffId}:${date}`;
  const current = await col.findOne({ _id });

  switch (body.action) {
    case "in": {
      if (!staff.active) return fail(400, `${staff.name} is switched off.`);
      if (!validTime(body.time)) return fail(400, "Invalid time.");
      if (current?.checkIn) return fail(409, `${staff.name} already checked in at ${current.checkIn}.`);
      const doc: AttendanceDoc = { _id, staffId, date, status: minutesLate(staff, body.time) ? "late" : "present", checkIn: body.time, checkOut: null, note: current?.note ?? "" };
      await col.updateOne({ _id }, { $set: withoutId(doc) }, { upsert: true });
      return { ok: true, value: toRecord(doc, staff) };
    }
    case "out": {
      if (!validTime(body.time)) return fail(400, "Invalid time.");
      if (!current?.checkIn) return fail(409, `${staff.name} has not checked in yet.`);
      if (current.checkOut) return fail(409, `${staff.name} already checked out at ${current.checkOut}.`);
      const updated = await col.findOneAndUpdate({ _id, checkOut: null }, { $set: { checkOut: body.time } }, { returnDocument: "after" });
      if (!updated) return fail(409, "Attendance changed on another screen. Refresh and try again.");
      return { ok: true, value: toRecord(updated, staff) };
    }
    case "set": {
      const status = body.status as AttendanceStatus;
      if (!STATUSES.includes(status)) return fail(400, "Choose a status.");
      const working = status === "present" || status === "late";
      const errors: Record<string, string> = {};
      const checkIn = working ? (body.checkIn ? String(body.checkIn) : null) : null;
      const checkOut = working ? (body.checkOut ? String(body.checkOut) : null) : null;
      if (working && !validTime(checkIn)) errors.checkIn = "Enter the check-in time.";
      if (checkOut !== null && !validTime(checkOut)) errors.checkOut = "Use a time like 17:30.";
      if (Object.keys(errors).length) return fail(400, Object.values(errors)[0], errors);
      // For a working day the status follows the check-in time.
      const finalStatus: AttendanceStatus = working ? (minutesLate(staff, checkIn!) ? "late" : "present") : status;
      const doc: AttendanceDoc = { _id, staffId, date, status: finalStatus, checkIn, checkOut, note: cleanNote(body.note) };
      await col.updateOne({ _id }, { $set: withoutId(doc) }, { upsert: true });
      return { ok: true, value: toRecord(doc, staff) };
    }
    case "clear":
      await col.deleteOne({ _id });
      return { ok: true, value: null };
    default:
      return fail(400, "Unknown attendance action.");
  }
}

// ----- Pay entries -----

export async function addPayEntry(body: Record<string, unknown>): Promise<Result<PayEntry>> {
  const staffId = String(body.staffId ?? "");
  const staff = staffId ? await findStaff(staffId) : null;
  const errors: Record<string, string> = {};
  if (!staff) errors.staffId = "Choose a staff member.";
  const type = body.type as PayType;
  if (!PAY_TYPES.includes(type)) errors.type = "Choose the type.";
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) errors.amount = "Enter an amount above 0.";
  if (!validDate(body.date)) errors.date = "Choose a date.";
  if (Object.keys(errors).length) return fail(400, "Please correct the highlighted fields.", errors);
  const doc: PayDoc = {
    _id: `pay-${Date.now().toString(36)}-${randomHex(4)}`,
    staffId,
    date: body.date as string,
    type,
    amount: Math.round(amount),
    note: cleanNote(body.note),
    createdAt: new Date().toISOString(),
  };
  await (await payCol()).insertOne(doc);
  const { _id, ...rest } = doc;
  return { ok: true, value: { id: _id, ...rest } };
}

export async function removePayEntry(id: string): Promise<Result<true>> {
  const res = await (await payCol()).deleteOne({ _id: id });
  return res.deletedCount ? { ok: true, value: true } : fail(404, "Pay entry not found.");
}

// ----- Payroll -----

const monthRange = (month: string) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

function payrollRow(staff: CafeStaff, attendance: AttendanceRecord[], pay: PayEntry[], paid: PayrollDoc | undefined): PayrollRow {
  const count = (s: AttendanceStatus) => attendance.filter((a) => a.status === s).length;
  const daysLate = count("late");
  const daysAbsent = count("absent");
  const workedMinutes = attendance.reduce((t, a) => t + a.workedMinutes, 0);
  const overtimeMinutes = attendance.reduce((t, a) => t + a.overtimeMinutes, 0);
  const dayPay = staff.salary / PAYROLL_RULES.workingDays;
  const hourly = dayPay / (shiftMinutes(staff) / 60);
  const sum = (types: PayType[]) => pay.filter((p) => types.includes(p.type)).reduce((t, p) => t + p.amount, 0);

  const overtimePay = Math.round((overtimeMinutes / 60) * hourly * PAYROLL_RULES.overtimeRate);
  const tips = sum(["tip"]);
  const bonuses = sum(["bonus", "incentive"]);
  const absenceCut = Math.round(daysAbsent * dayPay);
  const lateCut = Math.round(Math.floor(daysLate / PAYROLL_RULES.latesPerDayCut) * dayPay);
  const advances = sum(["advance"]);
  const deductions = sum(["deduction"]);
  const gross = staff.salary + staff.allowance + overtimePay + tips + bonuses;
  return {
    staffId: staff.id,
    name: staff.name,
    code: staff.code,
    title: staff.title,
    department: staff.department,
    salary: staff.salary,
    allowance: staff.allowance,
    daysPresent: count("present") + daysLate,
    daysLate,
    daysAbsent,
    daysLeave: count("leave"),
    daysOff: count("off"),
    workedHours: Math.round((workedMinutes / 60) * 10) / 10,
    overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
    overtimePay,
    tips,
    bonuses,
    absenceCut,
    lateCut,
    advances,
    deductions,
    gross,
    net: Math.max(0, gross - absenceCut - lateCut - advances - deductions),
    paid: Boolean(paid),
    paidAt: paid?.paidAt ?? null,
  };
}

async function monthData(month: string, staffId?: string) {
  const filter = { date: monthRange(month), ...(staffId ? { staffId } : {}) };
  const [attDocs, payDocs, paidDocs, staff] = await Promise.all([
    (await attendanceCol()).find(filter).sort({ date: 1 }).toArray(),
    (await payCol()).find(filter).sort({ date: -1, createdAt: -1 }).toArray(),
    (await payrollCol()).find({ month, ...(staffId ? { staffId } : {}) }).toArray(),
    staffById(),
  ]);
  const attendance = attDocs.map((d) => toRecord(d, staff.get(d.staffId)));
  const pay = payDocs.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  return { attendance, pay, paid: new Map(paidDocs.map((p) => [p.staffId, p])), staff };
}

export async function readPayroll(month: unknown): Promise<Result<PayrollMonth>> {
  if (typeof month !== "string" || !MONTH.test(month)) return fail(400, "Choose a valid month.");
  const { attendance, pay, paid, staff } = await monthData(month);
  const rows: PayrollRow[] = [];
  for (const member of staff.values()) {
    const att = attendance.filter((a) => a.staffId === member.id);
    const entries = pay.filter((p) => p.staffId === member.id);
    // Switched-off staff appear only for a month in which they have records.
    if (!member.active && !att.length && !entries.length && !paid.has(member.id)) continue;
    if (member.joinedOn && member.joinedOn.slice(0, 7) > month) continue;
    rows.push(payrollRow(member, att, entries, paid.get(member.id)));
  }
  rows.sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
  return { ok: true, value: { month, rows } };
}

export async function setPayrollPaid(staffId: string, body: Record<string, unknown>): Promise<Result<PayrollRow>> {
  const month = body.month;
  if (typeof month !== "string" || !MONTH.test(month)) return fail(400, "Choose a valid month.");
  if (typeof body.paid !== "boolean") return fail(400, "Invalid request.");
  const staff = await findStaff(staffId);
  if (!staff) return fail(404, "Staff member not found.");
  const col = await payrollCol();
  const _id = `${staffId}:${month}`;
  if (body.paid) {
    const { attendance, pay } = await monthData(month, staffId);
    const row = payrollRow(staff, attendance, pay, undefined);
    await col.updateOne({ _id }, { $set: { staffId, month, paidAt: new Date().toISOString(), net: row.net } }, { upsert: true });
  } else {
    await col.deleteOne({ _id });
  }
  const { attendance, pay, paid } = await monthData(month, staffId);
  return { ok: true, value: payrollRow(staff, attendance, pay, paid.get(staffId)) };
}

export async function readStaffProfile(staffId: string, month: unknown): Promise<Result<StaffProfileData>> {
  if (typeof month !== "string" || !MONTH.test(month)) return fail(400, "Choose a valid month.");
  const staff = await findStaff(staffId);
  if (!staff) return fail(404, "Staff member not found.");
  const { attendance, pay, paid } = await monthData(month, staffId);
  return { ok: true, value: { month, attendance, pay, payroll: payrollRow(staff, attendance, pay, paid.get(staffId)) } };
}

// Called when a staff member is removed: their attendance, pay entries and payroll go with them.
export async function removeStaffHr(staffId: string): Promise<void> {
  await Promise.all([
    (await attendanceCol()).deleteMany({ staffId }),
    (await payCol()).deleteMany({ staffId }),
    (await payrollCol()).deleteMany({ staffId }),
  ]);
}
