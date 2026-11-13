"use client";

import { useCallback, useEffect, useState } from "react";
import { LogIn, LogOut, Pencil } from "lucide-react";
import { Button, Dialog, ErrorNote } from "@/components/admin/cafe/CafeParts";
import { hrApi } from "@/lib/cafeApi";
import type { CafeStaff } from "@/lib/cafeTypes";
import { ATTENDANCE_LABEL, PAYROLL_RULES, type AttendanceRecord, type AttendanceStatus } from "@/lib/staffTypes";
import { cn } from "@/lib/utils";
import { Field, Notice, StatusBadge, formatDay, formatHours, formatTime12, inputClass, nowTime, todayLocal } from "@/components/admin/staff/hrParts";

// Daily attendance: who is on duty, check-in and check-out times, late arrivals, absences and leave.
export function AttendanceTab({ staff, onOpenProfile }: { staff: CafeStaff[]; onOpenProfile: (s: CafeStaff) => void }) {
  const [date, setDate] = useState(todayLocal);
  const [loaded, setLoaded] = useState<{ date: string; records: AttendanceRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CafeStaff | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const records = loaded?.date === date ? loaded.records : null;
  const isToday = date === todayLocal();

  const load = useCallback(async (day: string) => {
    const res = await hrApi.attendance(day);
    if (res.ok) {
      setLoaded({ date: day, records: res.data });
      setError(null);
    } else setError(res.error);
  }, []);
  useEffect(() => {
    let alive = true;
    void hrApi.attendance(date).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setLoaded({ date, records: res.data });
        setError(null);
      } else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [date]);

  const byStaff = new Map((records ?? []).map((r) => [r.staffId, r]));
  const team = staff.filter((s) => s.active || byStaff.has(s.id));
  const weekday = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  const counts = (["present", "late", "absent", "leave", "off"] as AttendanceStatus[]).map((s) => ({ s, n: (records ?? []).filter((r) => r.status === s).length }));
  const unmarked = team.filter((s) => !byStaff.has(s.id)).length;
  const onDuty = (records ?? []).filter((r) => r.checkIn && !r.checkOut).length;

  const run = async (member: CafeStaff, action: () => ReturnType<typeof hrApi.checkIn>, done: string) => {
    setBusyId(member.id);
    const res = await action();
    await load(date);
    setBusyId(null);
    setNotice(res.ok ? { tone: "ok", text: done } : { tone: "error", text: res.error });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Date
          <input type="date" value={date} max={todayLocal()} onChange={(e) => e.target.value && setDate(e.target.value)} className={cn(inputClass, "w-auto")} />
        </label>
        <div className="flex flex-wrap gap-2 text-xs">
          {isToday && <span className="rounded-full bg-emerald-500 px-3 py-1 font-bold text-black">On duty now: {onDuty}</span>}
          {counts.map(({ s, n }) => (
            <span key={s} className="rounded-full bg-zinc-950 px-3 py-1 text-zinc-300">
              {ATTENDANCE_LABEL[s]}: <b className="tabular-nums text-white">{n}</b>
            </span>
          ))}
          <span className="rounded-full bg-zinc-950 px-3 py-1 text-zinc-300">
            Not marked: <b className="tabular-nums text-white">{unmarked}</b>
          </span>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        {formatDay(date)}. Checking in more than {PAYROLL_RULES.lateGraceMinutes} minutes after shift start counts as late. Hours past the shift length count as overtime.
      </p>
      <Notice notice={notice} />
      <ErrorNote message={error} />
      {!records && !error && <p className="text-sm text-zinc-400">Loading attendance…</p>}
      {records && (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">Employee</th>
                <th className="py-2 pr-3 font-semibold">Shift</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Check in</th>
                <th className="py-2 pr-3 font-semibold">Check out</th>
                <th className="py-2 pr-3 font-semibold">Worked</th>
                <th className="py-2 pr-3 font-semibold">Overtime</th>
                <th className="py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {team.map((s) => {
                const r = byStaff.get(s.id) ?? null;
                const offToday = !r && s.offDay === weekday;
                return (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3">
                      <button type="button" onClick={() => onOpenProfile(s)} className="text-left font-semibold hover:text-[#ffd400]">
                        {s.name}
                      </button>
                      <span className="block text-xs text-zinc-500">
                        {s.code} · {s.title}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-zinc-400">
                      {formatTime12(s.shiftStart)} – {formatTime12(s.shiftEnd)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {offToday ? <span className="text-xs text-zinc-500">Weekly day off</span> : <StatusBadge status={r?.status ?? null} />}
                      {r && r.lateMinutes > 0 && <span className="ml-2 text-xs text-amber-300">{r.lateMinutes} min late</span>}
                      {r?.note && <span className="block text-xs text-zinc-500">{r.note}</span>}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{formatTime12(r?.checkIn ?? null)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{r?.checkIn && !r.checkOut ? <span className="text-emerald-300">On duty</span> : formatTime12(r?.checkOut ?? null)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{formatHours(r?.workedMinutes ?? 0)}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-[#ffd400]">{r?.overtimeMinutes ? formatHours(r.overtimeMinutes) : "—"}</td>
                    <td className="py-2.5">
                      <div className="flex justify-end gap-1">
                        {isToday && !r && s.active && (
                          <Button tone="success" className="px-3 py-1.5 text-xs" disabled={busyId === s.id} onClick={() => run(s, () => hrApi.checkIn(s.id, date, nowTime()), `${s.name} checked in at ${formatTime12(nowTime())}.`)}>
                            <LogIn className="h-3.5 w-3.5" aria-hidden="true" /> Check in
                          </Button>
                        )}
                        {isToday && r?.checkIn && !r.checkOut && (
                          <Button tone="ghost" className="px-3 py-1.5 text-xs" disabled={busyId === s.id} onClick={() => run(s, () => hrApi.checkOut(s.id, date, nowTime()), `${s.name} checked out at ${formatTime12(nowTime())}.`)}>
                            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Check out
                          </Button>
                        )}
                        <Button tone="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => setEditing(s)} ariaLabel={`Edit attendance for ${s.name}`}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {r ? "Edit" : "Mark"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <AttendanceDialog
          member={editing}
          date={date}
          record={byStaff.get(editing.id) ?? null}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setNotice({ tone: "ok", text });
            await load(date);
          }}
        />
      )}
    </div>
  );
}

// Mark or correct one person's day: present/late with times, absent, on leave or day off.
export function AttendanceDialog({
  member,
  date,
  record,
  onClose,
  onSaved,
}: {
  member: CafeStaff;
  date: string;
  record: AttendanceRecord | null;
  onClose: () => void;
  onSaved: (text: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<"working" | "absent" | "leave" | "off">(record ? (record.status === "present" || record.status === "late" ? "working" : record.status) : "working");
  const [checkIn, setCheckIn] = useState(record?.checkIn ?? member.shiftStart);
  const [checkOut, setCheckOut] = useState(record?.checkOut ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await hrApi.setDay(member.id, { date, status: status === "working" ? "present" : status, checkIn: status === "working" ? checkIn : null, checkOut: status === "working" ? checkOut || null : null, note });
    setBusy(false);
    if (res.ok) await onSaved(`Attendance saved for ${member.name}: ${ATTENDANCE_LABEL[res.data.value.status]}.`);
    else setErrors(res.errors ?? { form: res.error });
  };
  const clear = async () => {
    setBusy(true);
    const res = await hrApi.clearDay(member.id, date);
    setBusy(false);
    if (res.ok) await onSaved(`Attendance cleared for ${member.name}.`);
    else setErrors({ form: res.error });
  };

  return (
    <Dialog title={`${member.name} · ${formatDay(date)}`} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={save} noValidate>
        <ErrorNote message={errors.form ?? null} />
        <div role="radiogroup" aria-label="Attendance" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["working", "Worked"],
              ["absent", "Absent"],
              ["leave", "On leave"],
              ["off", "Day off"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={status === value}
              onClick={() => setStatus(value)}
              className={cn("rounded-xl border px-3 py-2 text-sm font-bold", status === value ? "border-[#ffd400] bg-[#ffd400]/10 text-[#ffd400]" : "border-zinc-700 text-zinc-300 hover:border-zinc-500")}
            >
              {label}
            </button>
          ))}
        </div>
        {status === "working" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check in" error={errors.checkIn} hint={`Shift starts ${formatTime12(member.shiftStart)}`}>
              <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} aria-invalid={Boolean(errors.checkIn)} className={inputClass} />
            </Field>
            <Field label="Check out" error={errors.checkOut} hint={`Shift ends ${formatTime12(member.shiftEnd)}`}>
              <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} aria-invalid={Boolean(errors.checkOut)} className={inputClass} />
            </Field>
          </div>
        )}
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Sick leave, family event" className={inputClass} />
        </Field>
        <div className="flex flex-wrap justify-between gap-2">
          {record ? (
            <Button tone="danger" disabled={busy} onClick={clear}>
              Clear day
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
