"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Dialog, ErrorNote } from "@/components/admin/cafe/CafeParts";
import { hrApi } from "@/lib/cafeApi";
import type { CafeStaff } from "@/lib/cafeTypes";
import { formatPKR } from "@/lib/format";
import { PAY_ADDS, PAY_LABEL, type AttendanceRecord, type StaffProfileData } from "@/lib/staffTypes";
import { cn } from "@/lib/utils";
import { AttendanceDialog } from "@/components/admin/staff/AttendanceTab";
import { PayDialog } from "@/components/admin/staff/PayrollTab";
import { Notice, StatusBadge, formatDay, formatHours, formatMonth, formatTime12, inputClass, thisMonth } from "@/components/admin/staff/hrParts";

// One staff member: profile, this month's pay breakdown, attendance and pay entries.
export function StaffProfileDialog({ member, onClose, onEdit }: { member: CafeStaff; onClose: () => void; onEdit: () => void }) {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<StaffProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingDay, setEditingDay] = useState<AttendanceRecord | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const profile = data?.month === month ? data : null;

  const load = useCallback(async (m: string) => {
    const res = await hrApi.profile(member.id, m);
    if (res.ok) {
      setData(res.data);
      setError(null);
    } else setError(res.error);
  }, [member.id]);
  useEffect(() => {
    let alive = true;
    void hrApi.profile(member.id, month).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [member.id, month]);

  const p = profile?.payroll;
  const info: [string, string][] = [
    ["Employee no.", member.code || "—"],
    ["Department", member.department],
    ["Job title", member.title],
    ["Shift", `${formatTime12(member.shiftStart)} – ${formatTime12(member.shiftEnd)}`],
    ["Weekly day off", member.offDay || "None"],
    ["Joined", member.joinedOn ? new Date(`${member.joinedOn}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "—"],
    ["Phone", member.phone || "—"],
    ["CNIC", member.cnic || "—"],
    ["Emergency contact", member.emergencyContact || "—"],
    ["Monthly salary", formatPKR(member.salary)],
    ["Monthly allowance", member.allowance ? formatPKR(member.allowance) : "—"],
    ["Dashboard login", member.email ?? "No login"],
  ];

  const removePay = async (id: string) => {
    if (!window.confirm("Delete this pay entry?")) return;
    const res = await hrApi.removePay(id);
    setNotice(res.ok ? { tone: "ok", text: "Pay entry deleted." } : { tone: "error", text: res.error });
    await load(month);
  };

  return (
    <Dialog
      wide
      onClose={onClose}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {member.name}
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-300">{member.code}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", member.active ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400")}>{member.active ? "Active" : "Switched off"}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-zinc-800 p-4 text-sm sm:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">{k}</dt>
              <dd className="truncate font-semibold">{v}</dd>
            </div>
          ))}
          {member.duty && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Duties</dt>
              <dd className="text-zinc-300">{member.duty}</dd>
            </div>
          )}
        </dl>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Month
            <input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className={cn(inputClass, "w-auto")} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button tone="ghost" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit details
            </Button>
            <Button onClick={() => setAdding(true)} disabled={!member.active}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Tip / bonus / advance
            </Button>
          </div>
        </div>
        <Notice notice={notice} />
        <ErrorNote message={error} />
        {!profile && !error && <p className="text-sm text-zinc-400">Loading {formatMonth(month)}…</p>}

        {profile && p && (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 p-4">
                <h3 className="text-sm font-bold">Attendance · {formatMonth(month)}</h3>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <Mini label="Present" value={p.daysPresent} tone="text-emerald-300" />
                  <Mini label="Late" value={p.daysLate} tone="text-amber-300" />
                  <Mini label="Absent" value={p.daysAbsent} tone="text-red-300" />
                  <Mini label="Leave" value={p.daysLeave} tone="text-sky-300" />
                  <Mini label="Hours" value={p.workedHours} />
                  <Mini label="Overtime h" value={p.overtimeHours} tone="text-[#ffd400]" />
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 p-4">
                <h3 className="flex items-center justify-between text-sm font-bold">
                  Pay · {formatMonth(month)}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", p.paid ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400")}>{p.paid ? "Paid" : "Not paid yet"}</span>
                </h3>
                <dl className="mt-3 space-y-1 text-sm tabular-nums">
                  <Line label="Salary" value={p.salary} />
                  <Line label="Allowance" value={p.allowance} />
                  <Line label={`Overtime (${p.overtimeHours} h)`} value={p.overtimePay} />
                  <Line label="Tips" value={p.tips} />
                  <Line label="Bonus & incentives" value={p.bonuses} />
                  <Line label={`Absences (${p.daysAbsent})`} value={-p.absenceCut} />
                  <Line label={`Late arrivals (${p.daysLate})`} value={-p.lateCut} />
                  <Line label="Advances" value={-p.advances} />
                  <Line label="Other deductions" value={-p.deductions} />
                  <div className="flex justify-between border-t border-zinc-700 pt-2 font-black">
                    <dt>Net pay</dt>
                    <dd className="text-[#ffd400]">{formatPKR(p.net)}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-bold">Tips, bonuses and advances</h3>
              {profile.pay.length === 0 ? (
                <p className="text-sm text-zinc-500">None this month.</p>
              ) : (
                <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
                  {profile.pay.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <span className="font-semibold">{PAY_LABEL[e.type]}</span>
                        <span className="ml-2 text-xs text-zinc-500">{formatDay(e.date)}</span>
                        {e.note && <span className="block truncate text-xs text-zinc-400">{e.note}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-bold tabular-nums", PAY_ADDS[e.type] ? "text-emerald-300" : "text-red-300")}>
                          {PAY_ADDS[e.type] ? "+" : "−"} {formatPKR(e.amount)}
                        </span>
                        <Button tone="danger" className="px-2 py-1" ariaLabel="Delete pay entry" onClick={() => removePay(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-bold">Attendance log</h3>
              {profile.attendance.length === 0 ? (
                <p className="text-sm text-zinc-500">No attendance recorded this month.</p>
              ) : (
                <div className="-mx-5 overflow-x-auto px-5">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="py-2 pr-3 font-semibold">Day</th>
                        <th className="py-2 pr-3 font-semibold">Status</th>
                        <th className="py-2 pr-3 font-semibold">In</th>
                        <th className="py-2 pr-3 font-semibold">Out</th>
                        <th className="py-2 pr-3 font-semibold">Worked</th>
                        <th className="py-2 text-right font-semibold" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {[...profile.attendance].reverse().map((a) => (
                        <tr key={a.id}>
                          <td className="py-2 pr-3">{formatDay(a.date)}</td>
                          <td className="py-2 pr-3">
                            <StatusBadge status={a.status} />
                            {a.lateMinutes > 0 && <span className="ml-2 text-xs text-amber-300">{a.lateMinutes} min</span>}
                            {a.note && <span className="block text-xs text-zinc-500">{a.note}</span>}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{formatTime12(a.checkIn)}</td>
                          <td className="py-2 pr-3 tabular-nums">{formatTime12(a.checkOut)}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatHours(a.workedMinutes)}
                            {a.overtimeMinutes > 0 && <span className="ml-1 text-xs text-[#ffd400]">+{formatHours(a.overtimeMinutes)}</span>}
                          </td>
                          <td className="py-2 text-right">
                            <Button tone="ghost" className="px-2 py-1 text-xs" onClick={() => setEditingDay(a)}>
                              Edit
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      {adding && (
        <PayDialog
          staff={[member]}
          fixed={member}
          onClose={() => setAdding(false)}
          onSaved={async (text) => {
            setAdding(false);
            setNotice({ tone: "ok", text });
            await load(month);
          }}
        />
      )}
      {editingDay && (
        <AttendanceDialog
          member={member}
          date={editingDay.date}
          record={editingDay}
          onClose={() => setEditingDay(null)}
          onSaved={async (text) => {
            setEditingDay(null);
            setNotice({ tone: "ok", text });
            await load(month);
          }}
        />
      )}
    </Dialog>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-zinc-950 p-2">
      <p className={cn("text-lg font-black tabular-nums", tone)}>{value}</p>
      <p className="text-zinc-500">{label}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-zinc-400">{label}</dt>
      <dd className={cn(value < 0 ? "text-red-300" : value > 0 ? "" : "text-zinc-600")}>{value === 0 ? "—" : `${value < 0 ? "− " : ""}${formatPKR(Math.abs(value))}`}</dd>
    </div>
  );
}
