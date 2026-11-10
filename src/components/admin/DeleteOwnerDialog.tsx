"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";

// Confirmation for permanently deleting an owner account, used on the Employees list and on the owner's
// details page. It reads the owner's current team size, because an owner with staff cannot be deleted
// until the staff are moved. The data handler makes the same checks; this dialog only explains them.

export interface DeletableOwner {
  id: string;
  name: string;
  email: string;
  restaurantName: string | null;
}

// Same look as ghostClass in EmployeesView (not imported, because EmployeesView imports this file).
const cancelClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:border-orange-500/60 hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50";

export const dangerClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-300 transition-all duration-200 hover:bg-red-500/15 active:scale-[0.98] disabled:opacity-50";

export function DeleteOwnerDialog({
  owner,
  onCancel,
  onDeleted,
}: {
  owner: DeletableOwner;
  onCancel: () => void;
  onDeleted: (deleted: { name: string; vacatedRestaurants: string[] }) => void;
}) {
  const details = useCustomerData<{ staff: unknown[] }>(`/api/admin/owners/${encodeURIComponent(owner.id)}`);
  const staffCount = details.data ? details.data.staff.length : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await customerRequest<{ vacatedRestaurants: string[] }>(`/api/admin/employees/${encodeURIComponent(owner.id)}`, "DELETE");
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    onDeleted({ name: owner.name, vacatedRestaurants: result.data.vacatedRestaurants ?? [] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-owner-title"
        aria-describedby="delete-owner-description"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-red-500/40 bg-zinc-950 p-6 shadow-2xl shadow-black"
      >
        <h2 id="delete-owner-title" className="text-lg font-bold">
          Delete {owner.name} permanently?
        </h2>
        <div id="delete-owner-description" className="flex flex-col gap-2 text-sm text-zinc-300">
          <p>This cannot be undone.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>The account, its login for {owner.email} and its activity history are removed. They are signed out and cannot log in again.</li>
            {owner.restaurantName && <li>{owner.restaurantName} is kept. If this owner runs it, you can add a new owner for it.</li>}
            <li>Restaurants, orders, bills, payments and other business records are not deleted.</li>
          </ul>
          {staffCount === null && !details.error && <p className="text-zinc-500">Checking this owner&apos;s team…</p>}
          {staffCount !== null && staffCount > 0 && (
            <p className="text-amber-300">
              {staffCount} staff {staffCount === 1 ? "member works" : "members work"} under this owner. Move them to another owner first.
            </p>
          )}
        </div>
        {(error ?? details.error) && (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error ?? details.error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={cancelClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || staffCount === null || staffCount > 0}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:bg-red-500 active:scale-[0.98] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
