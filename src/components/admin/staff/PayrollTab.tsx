"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { Button, Dialog, ErrorNote } from "@/components/admin/cafe/CafeParts";
import { hrApi } from "@/lib/cafeApi";
import type { CafeStaff } from "@/lib/cafeTypes";
import { formatPKR } from "@/lib/format";
import { PAYROLL_RULES, PAY_LABEL, type PayType, type PayrollMonth } from "@/lib/staffTypes";
import { cn } from "@/lib/utils";
import { Field, Notice, Stat, formatMonth, inputClass, thisMonth, todayLocal } from "@/components/admin/staff/hrParts";

// Monthly payroll: salary + allowance + overtime + tips + bonuses, less absences, late arrivals,
// advances and deductions. Each row can be marked paid.
export function PayrollTab({ staff, onOpenProfile }: { staff: CafeStaff[]; onOpenProfile: (s: CafeStaff) => void }) {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<PayrollMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const payroll = data?.month === month ? data : null;

  const load = useCallback(async (m: string) => {
    const res = await hrApi.payroll(m);
    if (res.ok) {
      setData(res.data);
      setError(null);
    } else setError(res.error);
  }, []);
  useEffect(() => {
    let alive = true;
    void hrApi.payroll(month).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [month]);

  const rows = payroll?.rows ?? [];
  const total = (k: "salary" | "allowance" | "overtimePay" | "tips" | "bonuses" | "net") => rows.reduce((t, r) => t + r[k], 0);
  const cuts = (r: (typeof rows)[number]) => r.absenceCut + r.lateCut + r.advances + r.deductions;
  const paidNet = rows.filter((r) => r.paid).reduce((t, r) => t + r.net, 0);
  const byId = new Map(staff.map((s) => [s.id, s]));

  const togglePaid = async (staffId: string, name: string, paid: boolean) => {
    setBusyId(staffId);
    const res = await hrApi.setPaid(staffId, month, paid);
    await load(month);
    setBusyId(null);
    setNotice(res.ok ? { tone: "ok", text: paid ? `${name}'s pay for ${formatMonth(month)} is marked paid.` : `${name}'s pay is marked unpaid again.` } : { tone: "error", text: res.error });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Month
          <input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className={cn(inputClass, "w-auto")} />
        </label>
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add tip / bonus / advance
        </Button>
      </div>
      <Notice notice={notice} />
      <ErrorNote message={error} />
      {!payroll && !error && <p className="text-sm text-zinc-400">Loading payroll…</p>}
      {payroll && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Net payroll" value={formatPKR(total("net"))} note={`${rows.length} staff · ${formatMonth(month)}`} />
            <Stat label="Tips" value={formatPKR(total("tips"))} />
            <Stat label="Bonuses & incentives" value={formatPKR(total("bonuses"))} note={`Overtime ${formatPKR(total("overtimePay"))}`} />
            <Stat label="Paid so far" value={formatPKR(paidNet)} note={`${rows.filter((r) => r.paid).length} of ${rows.length} paid`} />
          </div>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Employee</th>
                  <th className="py-2 pr-3 font-semibold">Attendance</th>
                  <th className="py-2 pr-3 text-right font-semibold">Salary</th>
                  <th className="py-2 pr-3 text-right font-semibold">Allowance</th>
                  <th className="py-2 pr-3 text-right font-semibold">Overtime</th>
                  <th className="py-2 pr-3 text-right font-semibold">Tips</th>
                  <th className="py-2 pr-3 text-right font-semibold">Bonus</th>
                  <th className="py-2 pr-3 text-right font-semibold">Deductions</th>
                  <th className="py-2 pr-3 text-right font-semibold">Net pay</th>
                  <th className="py-2 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((r) => (
                  <tr key={r.staffId}>
                    <td className="py-2.5 pr-3">
                      <button type="button" onClick={() => byId.get(r.staffId) && onOpenProfile(byId.get(r.staffId)!)} className="text-left font-semibold hover:text-[#ffd400]">
                        {r.name}
                      </button>
                      <span className="block text-xs text-zinc-500">
                        {r.code} · {r.title}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-zinc-400">
                      <span className="text-emerald-300">{r.daysPresent} present</span>
                      {r.daysLate > 0 && <span className="text-amber-300"> · {r.daysLate} late</span>}
                      {r.daysAbsent > 0 && <span className="text-red-300"> · {r.daysAbsent} absent</span>}
                      {r.daysLeave > 0 && <span className="text-sky-300"> · {r.daysLeave} leave</span>}
                      <span className="block">{r.workedHours} h worked</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatPKR(r.salary)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">{r.allowance ? formatPKR(r.allowance) : "—"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">
                      {r.overtimePay ? formatPKR(r.overtimePay) : "—"}
                      {r.overtimeHours > 0 && <span className="block text-xs text-zinc-500">{r.overtimeHours} h</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">{r.tips ? formatPKR(r.tips) : "—"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">{r.bonuses ? formatPKR(r.bonuses) : "—"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-red-300" title={`Absences ${r.absenceCut} · Late ${r.lateCut} · Advances ${r.advances} · Other ${r.deductions}`}>
                      {cuts(r) ? `− ${formatPKR(cuts(r))}` : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-black tabular-nums">{formatPKR(r.net)}</td>
                    <td className="py-2.5 text-right">
                      {r.paid ? (
                        <button
                          type="button"
                          disabled={busyId === r.staffId}
                          onClick={() => window.confirm(`Mark ${r.name}'s pay as unpaid again?`) && togglePaid(r.staffId, r.name, false)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Paid
                        </button>
                      ) : (
                        <Button tone="ghost" className="px-3 py-1.5 text-xs" disabled={busyId === r.staffId} onClick={() => togglePaid(r.staffId, r.name, true)}>
                          Mark paid
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="border-t-2 border-zinc-700 font-bold">
                  <tr>
                    <td className="py-3 pr-3" colSpan={2}>
                      Total
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatPKR(total("salary"))}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatPKR(total("allowance"))}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatPKR(total("overtimePay"))}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatPKR(total("tips"))}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatPKR(total("bonuses"))}</td>
                    <td className="py-3 pr-3 text-right tabular-nums text-red-300">− {formatPKR(rows.reduce((t, r) => t + cuts(r), 0))}</td>
                    <td className="py-3 pr-3 text-right tabular-nums text-[#ffd400]">{formatPKR(total("net"))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            How net pay is worked out: salary + allowance + overtime ({PAYROLL_RULES.overtimeRate}× hourly rate) + tips + bonuses − absences (one day&apos;s pay each, salary ÷ {PAYROLL_RULES.workingDays}) − one
            day&apos;s pay for every {PAYROLL_RULES.latesPerDayCut} late arrivals − advances − other deductions.
          </p>
        </>
      )}
      {adding && (
        <PayDialog
          staff={staff.filter((s) => s.active)}
          onClose={() => setAdding(false)}
          onSaved={async (text) => {
            setAdding(false);
            setNotice({ tone: "ok", text });
            await load(month);
          }}
        />
      )}
    </div>
  );
}

// Record a tip, bonus, incentive, salary advance or deduction for one staff member.
export function PayDialog({ staff, fixed, onClose, onSaved }: { staff: CafeStaff[]; fixed?: CafeStaff; onClose: () => void; onSaved: (text: string) => Promise<void> }) {
  const [staffId, setStaffId] = useState(fixed?.id ?? "");
  const [type, setType] = useState<PayType>("tip");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await hrApi.addPay({ staffId, type, amount, date, note });
    setBusy(false);
    const who = fixed ?? staff.find((s) => s.id === staffId);
    if (res.ok) await onSaved(`${PAY_LABEL[type]} of ${formatPKR(res.data.value.amount)} recorded for ${who?.name ?? "the staff member"}.`);
    else setErrors(res.errors ?? { form: res.error });
  };

  return (
    <Dialog title={fixed ? `Add pay entry · ${fixed.name}` : "Add tip, bonus or advance"} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={save} noValidate>
        <ErrorNote message={errors.form ?? null} />
        {!fixed && (
          <Field label="Staff member" error={errors.staffId}>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-invalid={Boolean(errors.staffId)} className={inputClass}>
              <option value="">Choose…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div role="radiogroup" aria-label="Type" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(Object.keys(PAY_LABEL) as PayType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn("rounded-xl border px-2 py-2 text-xs font-bold", type === t ? "border-[#ffd400] bg-[#ffd400]/10 text-[#ffd400]" : "border-zinc-700 text-zinc-300 hover:border-zinc-500")}
            >
              {PAY_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-xs text-zinc-500">{type === "advance" || type === "deduction" ? "Taken off this month's pay." : "Added to this month's pay."}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (Rs.)" error={errors.amount}>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(errors.amount)} className={inputClass} />
          </Field>
          <Field label="Date" error={errors.date}>
            <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(errors.date)} className={inputClass} />
          </Field>
        </div>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Table 4 tip, Eid bonus, best waiter of the week" className={inputClass} />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : `Save ${PAY_LABEL[type].toLowerCase()}`}
        </Button>
      </form>
    </Dialog>
  );
}
