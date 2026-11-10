"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, MapPin, Plus } from "lucide-react";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { fieldClass, panelClass, Pill, primaryClass, type OfficeOption } from "@/components/admin/EmployeesView";
import { canAccess, type StaffRole } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { useSession } from "@/lib/local/useSession";

// Owner page. Offices are the list an owner is assigned to when added from the Employees page. Each office name is unique.

interface OwnerSummary {
  id: string;
  role: StaffRole;
  officeId: string | null;
}

export function OfficesGate() {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const allowed = status.state === "ready" && canAccess(status.value, "staff");

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
    else if (status.state === "ready" && !allowed) router.replace("/admin");
  }, [status.state, allowed, router]);

  if (status.state !== "ready") return <p className="text-sm text-zinc-400">Loading offices…</p>;
  if (!allowed) return null;
  return <OfficesView />;
}

function OfficesView() {
  const offices = useCustomerData<{ offices: OfficeOption[] }>("/api/admin/offices");
  const employees = useCustomerData<{ staff: OwnerSummary[] }>("/api/admin/employees");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const list = offices.data?.offices ?? [];
  const owners = employees.data?.staff ?? [];
  const ownerCount = (officeId: string) => owners.filter((member) => member.officeId === officeId).length;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/employees" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-orange-400">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Employees
      </Link>

      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Owners</p>
        <h1 className="mt-1 text-3xl font-black uppercase tracking-tight md:text-4xl">Offices</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Create each office here. When you add an owner, they are assigned to one of these offices.
        </p>
      </header>

      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
          {notice.text}
        </p>
      )}

      <CreateOfficeForm
        onCreated={(name) => {
          setNotice({ tone: "success", text: `${name} was added.` });
          offices.reload();
        }}
      />

      {offices.loading && <p className="text-sm text-zinc-400">Loading offices…</p>}
      {offices.error && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {offices.error}
        </p>
      )}

      {offices.data && list.length === 0 && (
        <div className={`${panelClass} text-center`}>
          <Building2 className="mx-auto h-8 w-8 text-zinc-500" aria-hidden="true" />
          <p className="mt-3 font-bold">No offices yet</p>
          <p className="mt-1 text-sm text-zinc-400">Add the first office above. Owners can be added once at least one office exists.</p>
        </div>
      )}

      {list.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((office) => (
            <li key={office.id} className={panelClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-black">{office.name}</p>
                  {office.address && (
                    <p className="mt-1 flex items-start gap-2 text-sm text-zinc-400">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                      <span className="break-words">{office.address}</span>
                    </p>
                  )}
                </div>
                <Pill tone="zinc">
                  {ownerCount(office.id)} {ownerCount(office.id) === 1 ? "owner" : "owners"}
                </Pill>
              </div>
              <p className="mt-3 text-xs text-zinc-500">Created {new Date(office.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateOfficeForm({ onCreated }: { onCreated: (name: string) => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Enter the office name.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    const result = await customerRequest<{ office: OfficeOption }>("/api/admin/offices", "POST", { name, address });
    setPending(false);
    if (result.ok) {
      const created = result.data.office.name;
      setName("");
      setAddress("");
      setErrors({});
      onCreated(created);
    } else {
      setErrors(result.errors ?? { form: result.error });
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={`${panelClass} flex flex-col gap-5`}>
      <h2 className="font-bold">New office</h2>
      {errors.form && <p role="alert" className="text-sm text-red-300">{errors.form}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="office-name" className="text-sm font-semibold text-zinc-200">
            Office name
          </label>
          <input id="office-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} className={fieldClass} />
          {errors.name && <p className="text-xs text-red-300">{errors.name}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="office-address" className="text-sm font-semibold text-zinc-200">
            Address <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input id="office-address" value={address} onChange={(e) => setAddress(e.target.value)} aria-invalid={Boolean(errors.address)} className={fieldClass} />
          {errors.address && <p className="text-xs text-red-300">{errors.address}</p>}
        </div>
      </div>
      <div>
        <button type="submit" disabled={pending} className={primaryClass}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {pending ? "Adding…" : "Add office"}
        </button>
      </div>
    </form>
  );
}
