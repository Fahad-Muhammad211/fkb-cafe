// Shared types for the Employees page: departments, attendance, pay entries and the monthly payroll.

export const DEPARTMENTS = ["Management", "Kitchen", "Service", "Cash & Front desk", "Cleaning", "Delivery", "Security"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

// Payroll rules, shown on the page so the numbers can be checked by hand.
export const PAYROLL_RULES = {
  workingDays: 26, // a day's pay = monthly salary / 26
  lateGraceMinutes: 10, // checking in later than shift start + 10 minutes counts as late
  latesPerDayCut: 3, // every 3 late arrivals cost one day's pay
  overtimeRate: 1.5, // overtime hours are paid at 1.5 x the hourly rate
} as const;

export type AttendanceStatus = "present" | "late" | "absent" | "leave" | "off";
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  leave: "On leave",
  off: "Day off",
};

// One person's attendance on one day. Times are the restaurant's local clock, "HH:MM".
export interface AttendanceRecord {
  id: string;
  staffId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  // Worked and overtime minutes, worked out from the times and the shift.
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  note: string;
}

export type PayType = "tip" | "bonus" | "incentive" | "advance" | "deduction";
export const PAY_LABEL: Record<PayType, string> = {
  tip: "Tip",
  bonus: "Bonus",
  incentive: "Incentive",
  advance: "Advance",
  deduction: "Deduction",
};
// Tips, bonuses and incentives are added to pay; advances and deductions are taken off.
export const PAY_ADDS: Record<PayType, boolean> = { tip: true, bonus: true, incentive: true, advance: false, deduction: false };

export interface PayEntry {
  id: string;
  staffId: string;
  date: string;
  type: PayType;
  amount: number;
  note: string;
  createdAt: string;
}

// One employee's pay for a month.
export interface PayrollRow {
  staffId: string;
  name: string;
  code: string;
  title: string;
  department: string;
  salary: number;
  allowance: number;
  daysPresent: number; // present + late
  daysLate: number;
  daysAbsent: number;
  daysLeave: number;
  daysOff: number;
  workedHours: number;
  overtimeHours: number;
  overtimePay: number;
  tips: number;
  bonuses: number; // bonus + incentive entries
  absenceCut: number;
  lateCut: number;
  advances: number;
  deductions: number;
  gross: number;
  net: number;
  paid: boolean;
  paidAt: string | null;
}

export interface PayrollMonth {
  month: string; // YYYY-MM
  rows: PayrollRow[];
}

// What the Employees page needs for one staff member's profile.
export interface StaffProfileData {
  month: string;
  attendance: AttendanceRecord[];
  pay: PayEntry[];
  payroll: PayrollRow | null;
}
