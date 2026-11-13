"use client";

import { useState, type FormEvent } from "react";
import { MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card, EmptyState, ErrorNote, LoadingBlock, Notice, PageHeader, dangerButton, inputStyles, primaryButton, secondaryButton } from "@/components/customer/ui";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { FormField, describedBy } from "@/components/ui/FormField";
import { MAX_ADDRESSES, type SavedAddress } from "@/types/customer";

type Errors = Record<string, string>;
type Mode = { kind: "closed" } | { kind: "new" } | { kind: "edit"; id: string };

export function CustomerAddresses() {
  const { data, error, loading, reload } = useCustomerData<{ addresses: SavedAddress[] }>("/api/customer/addresses");
  const [mode, setMode] = useState<Mode>({ kind: "closed" });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const addresses = data?.addresses ?? [];
  const full = addresses.length >= MAX_ADDRESSES;

  const handleDelete = async (address: SavedAddress) => {
    if (!window.confirm(`Delete "${address.label}"?`)) return;
    setDeletingId(address.id);
    setNotice(null);
    const result = await customerRequest(`/api/customer/addresses/${encodeURIComponent(address.id)}`, "DELETE");
    setDeletingId(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setNotice({ tone: "success", text: `"${address.label}" was deleted.` });
    if (mode.kind === "edit" && mode.id === address.id) setMode({ kind: "closed" });
    reload();
  };

  const handleSaved = (text: string) => {
    setMode({ kind: "closed" });
    setNotice({ tone: "success", text });
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Delivery"
        title="My addresses"
        description={`Save up to ${MAX_ADDRESSES} delivery addresses. ${addresses.length} of ${MAX_ADDRESSES} saved.`}
        action={
          mode.kind === "new" ? null : (
            <button type="button" onClick={() => setMode({ kind: "new" })} disabled={full} className={primaryButton}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add address
            </button>
          )
        }
      />

      {notice && <Notice tone={notice.tone === "error" ? "error" : "success"}>{notice.text}</Notice>}

      {mode.kind === "new" && (
        <AddressForm
          key="new"
          title="New address"
          submitLabel="Save address"
          onCancel={() => setMode({ kind: "closed" })}
          onSaved={() => handleSaved("Address saved.")}
          endpoint="/api/customer/addresses"
          method="POST"
        />
      )}

      {loading && <LoadingBlock label="Loading your addresses…" />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {data && addresses.length === 0 && mode.kind !== "new" && (
        <EmptyState
          icon={MapPin}
          title="No saved addresses"
          description="Add your home or office so you can pick it quickly when you order."
          action={
            <button type="button" onClick={() => setMode({ kind: "new" })} className={primaryButton}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add your first address
            </button>
          }
        />
      )}

      {addresses.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) =>
            mode.kind === "edit" && mode.id === address.id ? (
              <li key={address.id} className="md:col-span-2">
                <AddressForm
                  key={`edit-${address.id}-${address.updatedAt}`}
                  title="Edit address"
                  submitLabel="Save changes"
                  onCancel={() => setMode({ kind: "closed" })}
                  onSaved={() => handleSaved("Address updated.")}
                  endpoint={`/api/customer/addresses/${encodeURIComponent(address.id)}`}
                  method="PATCH"
                  initial={address}
                />
              </li>
            ) : (
              <li key={address.id}>
                <Card className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30">
                      <MapPin className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold">{address.label}</p>
                      <p className="text-sm text-zinc-300">{address.address}</p>
                      {address.area && <p className="text-xs text-zinc-500">{address.area}</p>}
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                    <button type="button" onClick={() => setMode({ kind: "edit", id: address.id })} className={secondaryButton}>
                      <Pencil className="h-4 w-4 text-orange-500" aria-hidden="true" />
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(address)} disabled={deletingId === address.id} className={dangerButton}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      {deletingId === address.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </Card>
              </li>
            ),
          )}
        </ul>
      )}

      {full && <p className="text-xs text-zinc-500">You have reached the limit of {MAX_ADDRESSES} addresses. Delete one to add another.</p>}
    </div>
  );
}

function AddressForm({
  title,
  submitLabel,
  onCancel,
  onSaved,
  endpoint,
  method,
  initial,
}: {
  title: string;
  submitLabel: string;
  onCancel: () => void;
  onSaved: () => void;
  endpoint: string;
  method: "POST" | "PATCH";
  initial?: SavedAddress;
}) {
  const [values, setValues] = useState({ label: initial?.label ?? "", address: initial?.address ?? "", area: initial?.area ?? "" });
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Errors = {};
    if (!values.label.trim()) found.label = "Give this address a name, such as Home or Office.";
    if (values.address.trim().length < 5) found.address = "Enter the full delivery address.";
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`address-${first}`)?.focus();
      return;
    }

    setPending(true);
    const result = await customerRequest(endpoint, method, values);
    setPending(false);
    if (result.ok) onSaved();
    else setErrors(result.errors ?? { form: result.error });
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {errors.form && <Notice tone="error">{errors.form}</Notice>}

        <div className="grid gap-5 md:grid-cols-2">
          <FormField id="address-label" label="Name" error={errors.label} hint="For example: Home, Office">
            <input
              id="address-label"
              type="text"
              value={values.label}
              onChange={(e) => setValues((v) => ({ ...v, label: e.target.value }))}
              aria-invalid={Boolean(errors.label)}
              aria-describedby={describedBy("address-label", errors.label, "For example: Home, Office")}
              className={inputStyles}
            />
          </FormField>
          <FormField id="address-area" label="Area (optional)" error={errors.area}>
            <input
              id="address-area"
              type="text"
              value={values.area}
              onChange={(e) => setValues((v) => ({ ...v, area: e.target.value }))}
              aria-invalid={Boolean(errors.area)}
              aria-describedby={describedBy("address-area", errors.area)}
              className={inputStyles}
            />
          </FormField>
        </div>
        <FormField id="address-address" label="Full address" error={errors.address}>
          <textarea
            id="address-address"
            rows={3}
            value={values.address}
            onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
            aria-invalid={Boolean(errors.address)}
            aria-describedby={describedBy("address-address", errors.address)}
            className={inputStyles}
          />
        </FormField>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Saving…" : submitLabel}
          </button>
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
