"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin, Plus, Store, UserRound } from "lucide-react";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { fieldClass, panelClass, primaryClass } from "@/components/admin/EmployeesView";
import { canAccess, type StaffRole } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { useSession } from "@/lib/local/useSession";
import { IMAGE_ACCEPT, imageFileToDataUrl } from "@/lib/imageUpload";

// Owner page. Shows every restaurant as a card; each card opens that restaurant's own detail page.

export interface RestaurantCard {
  id: string;
  name: string;
  area: string;
  logo: string;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
}

interface OwnerOption {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
}

export function RestaurantsGate() {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const allowed = status.state === "ready" && canAccess(status.value, "staff");

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
    else if (status.state === "ready" && !allowed) router.replace("/admin");
  }, [status.state, allowed, router]);

  if (status.state !== "ready") return <p className="text-sm text-zinc-400">Loading restaurants…</p>;
  if (!allowed) return null;
  return <RestaurantsView />;
}

export function RestaurantsView() {
  const restaurants = useCustomerData<{ restaurants: RestaurantCard[] }>("/api/admin/restaurants");
  const employees = useCustomerData<{ staff: OwnerOption[] }>("/api/admin/employees");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const list = restaurants.data?.restaurants ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Owners</p>
          <h1 className="mt-1 text-3xl font-black uppercase tracking-tight md:text-4xl">Restaurants</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Each restaurant keeps its own orders, staff, stock, purchases, attendance and riders.</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={primaryClass}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add restaurant
          </button>
        )}
      </header>

      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
          {notice.text}
        </p>
      )}

      {adding && (
        <CreateRestaurantForm
          owners={(employees.data?.staff ?? []).filter((m) => m.active)}
          takenOwnerIds={list.map((r) => r.ownerId).filter((v): v is string => Boolean(v))}
          onCancel={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setNotice({ tone: "success", text: `${name} was added.` });
            restaurants.reload();
          }}
        />
      )}

      {restaurants.loading && <p className="text-sm text-zinc-400">Loading restaurants…</p>}
      {restaurants.error && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {restaurants.error}
        </p>
      )}

      {restaurants.data && list.length === 0 && !adding && (
        <div className={`${panelClass} text-center`}>
          <Store className="mx-auto h-8 w-8 text-zinc-500" aria-hidden="true" />
          <p className="mt-3 font-bold">No restaurants yet</p>
          <p className="mt-1 text-sm text-zinc-400">Add a restaurant and assign an owner to run it.</p>
        </div>
      )}

      {list.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((restaurant) => (
            <li key={restaurant.id}>
              <Link
                href={`/admin/restaurants/${encodeURIComponent(restaurant.id)}`}
                className="group flex h-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black p-5 shadow-xl shadow-black/40 transition-colors hover:border-orange-500/60"
              >
                <RestaurantLogo name={restaurant.name} logo={restaurant.logo} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-black group-hover:text-orange-400">{restaurant.name}</p>
                  <p className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
                    <UserRound className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                    <span className="truncate">{restaurant.ownerName ?? "No owner assigned"}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
                    <MapPin className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                    <span className="truncate">{restaurant.area}</span>
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-orange-400">
                  Open restaurant
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RestaurantLogo({ name, logo, size = "md" }: { name: string; logo: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-20 w-20 text-3xl" : "h-14 w-14 text-xl";
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={`${name} logo`} className={`${box} shrink-0 rounded-xl bg-black object-cover ring-1 ring-zinc-700`} />;
  }
  return (
    <span className={`${box} flex shrink-0 items-center justify-center rounded-xl bg-black font-black text-orange-500 ring-1 ring-zinc-700`} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "R"}
    </span>
  );
}

function CreateRestaurantForm({
  owners,
  takenOwnerIds,
  onCancel,
  onCreated,
}: {
  owners: OwnerOption[];
  takenOwnerIds: string[];
  onCancel: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [logo, setLogo] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const available = owners.filter((m) => !takenOwnerIds.includes(m.id));

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setLogo(await imageFileToDataUrl(file));
      setErrors((e) => ({ ...e, logo: "" }));
    } catch (err) {
      setErrors((e) => ({ ...e, logo: err instanceof Error ? err.message : "That image could not be used." }));
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (name.trim().length < 2) found.name = "Enter the restaurant name.";
    if (!area.trim()) found.area = "Enter the restaurant's area or location.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    const result = await customerRequest<{ restaurant: RestaurantCard }>("/api/admin/restaurants", "POST", {
      name,
      area,
      logo,
      ownerId: ownerId || null,
    });
    setPending(false);
    if (result.ok) onCreated(result.data.restaurant.name);
    else setErrors(result.errors ?? { form: result.error });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={`${panelClass} flex flex-col gap-5`}>
      <h2 className="font-bold">New restaurant</h2>
      {errors.form && <p role="alert" className="text-sm text-red-300">{errors.form}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="restaurant-name" label="Restaurant name" value={name} onChange={setName} error={errors.name} />
        <Field id="restaurant-area" label="Area or location" value={area} onChange={setArea} error={errors.area} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="restaurant-owner" className="text-sm font-semibold text-zinc-200">
            Restaurant owner
          </label>
          <select id="restaurant-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-invalid={Boolean(errors.ownerId)} className={fieldClass}>
            <option value="">{available.length === 0 ? "No owners available" : "No owner yet"}</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {available.length === 0 && (
            <p className="text-xs text-zinc-500">Every owner already runs a restaurant. Add an owner on the Employees page first.</p>
          )}
          {errors.ownerId && <p className="text-xs text-red-300">{errors.ownerId}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="restaurant-logo" className="text-sm font-semibold text-zinc-200">
            Logo <span className="font-normal text-zinc-500">(optional: image file or https link)</span>
          </label>
          <input id="restaurant-logo" value={logo.startsWith("data:") ? "" : logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…" aria-invalid={Boolean(errors.logo)} className={fieldClass} />
          <input type="file" accept={IMAGE_ACCEPT} onChange={(e) => handleFile(e.target.files?.[0])} className="text-xs text-zinc-400 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-white" />
          {logo && <RestaurantLogo name={name || "Restaurant"} logo={logo} />}
          {errors.logo && <p className="text-xs text-red-300">{errors.logo}</p>}
        </div>
      </div>
      <div>
        <button type="submit" disabled={pending} className={primaryClass}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {pending ? "Adding…" : "Add restaurant"}
        </button>
        <button type="button" onClick={onCancel} className="ml-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-zinc-200">
        {label}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} className={fieldClass} />
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
