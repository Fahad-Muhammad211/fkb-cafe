"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { ICON_NAMES, categoryIdFor, saveCategories } from "@/lib/categories";
import { saveProducts } from "@/lib/products";
import { cn } from "@/lib/utils";
import { FormField, describedBy, inputClass } from "@/components/ui/FormField";
import type { MenuItem, StoredCategory } from "@/types";

type Errors = Partial<Record<"label" | "tagline" | "move", string>>;

interface CategoryManagerProps {
  categories: StoredCategory[];
  products: MenuItem[];
}

// Add, rename, re-icon and delete product categories. Deleting a category that still has
// products requires moving those products to another category first.
export function CategoryManager({ categories, products }: CategoryManagerProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const countFor = (id: string) => products.filter((p) => p.categoryId === id).length;

  const handleCreate = (values: { label: string; tagline: string; iconName: string }) => {
    const label = values.label.trim();
    const id = categoryIdFor(label, categories);
    saveCategories([...categories, { id, label, tagline: values.tagline.trim() || undefined, iconName: values.iconName }]);
    setAdding(false);
    setMessage(`Added “${label}”.`);
  };

  const handleUpdate = (id: string, values: { label: string; tagline: string; iconName: string }) => {
    saveCategories(
      categories.map((c) =>
        c.id === id ? { ...c, label: values.label.trim(), tagline: values.tagline.trim() || undefined, iconName: values.iconName } : c,
      ),
    );
    setEditingId(null);
    setMessage("Category updated.");
  };

  const handleDelete = (id: string, moveTo: string | null) => {
    const label = categories.find((c) => c.id === id)?.label ?? "Category";
    if (countFor(id) > 0 && moveTo) {
      saveProducts(products.map((p) => (p.categoryId === id ? { ...p, categoryId: moveTo } : p)));
    }
    saveCategories(categories.filter((c) => c.id !== id));
    setDeletingId(null);
    setMessage(`Deleted “${label}”.`);
  };

  return (
    <section aria-labelledby="categories-heading" className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="categories-heading" className="text-lg font-bold">
            Categories
          </h2>
          <p className="text-xs text-zinc-500">{categories.length} categories · these appear as tabs on the storefront</p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold transition-all hover:bg-zinc-800 active:scale-95"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add category
          </button>
        )}
      </header>

      {message && (
        <p role="status" className="rounded-xl bg-zinc-800/60 px-4 py-2 text-sm text-zinc-300">
          {message}
        </p>
      )}

      {adding && (
        <CategoryFields
          title="New category"
          initial={{ label: "", tagline: "", iconName: ICON_NAMES[0] }}
          submitLabel="Add category"
          onCancel={() => setAdding(false)}
          onSubmit={handleCreate}
        />
      )}

      <ul className="flex flex-col divide-y divide-zinc-800">
        {categories.map((c) => {
          const count = countFor(c.id);
          if (editingId === c.id) {
            return (
              <li key={c.id} className="py-3">
                <CategoryFields
                  title="Edit category"
                  initial={{ label: c.label, tagline: c.tagline ?? "", iconName: c.iconName }}
                  submitLabel="Save changes"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(values) => handleUpdate(c.id, values)}
                />
              </li>
            );
          }
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold">{c.label}</p>
                <p className="text-xs text-zinc-500">
                  {count} {count === 1 ? "product" : "products"} · icon {c.iconName}
                  {c.tagline ? ` · “${c.tagline}”` : ""}
                </p>
              </div>
              {deletingId === c.id ? (
                <DeleteCategory
                  label={c.label}
                  count={count}
                  alternatives={categories.filter((o) => o.id !== c.id)}
                  onCancel={() => setDeletingId(null)}
                  onConfirm={(moveTo) => handleDelete(c.id, moveTo)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setAdding(false);
                    }}
                    aria-label={`Edit ${c.label}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 transition-transform hover:scale-105 active:scale-95"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(c.id)}
                    disabled={categories.length <= 1}
                    aria-label={`Delete ${c.label}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15 text-red-400 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CategoryFields({
  title,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: { label: string; tagline: string; iconName: string };
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: { label: string; tagline: string; iconName: string }) => void;
}) {
  const [label, setLabel] = useState(initial.label);
  const [tagline, setTagline] = useState(initial.tagline);
  const [iconName, setIconName] = useState(initial.iconName);
  const [errors, setErrors] = useState<Errors>({});

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Errors = {};
    const l = label.trim();
    if (l.length < 2 || l.length > 40) found.label = "Name must be between 2 and 40 characters.";
    if (tagline.length > 60) found.tagline = "Tagline must be 60 characters or fewer.";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById("category-label")?.focus();
      return;
    }
    onSubmit({ label, tagline, iconName });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="animate-card-in flex flex-col gap-4 rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{title}</p>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="category-label" label="Name" error={errors.label}>
          <input
            id="category-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-invalid={Boolean(errors.label)}
            aria-describedby={describedBy("category-label", errors.label)}
            className={inputClass}
          />
        </FormField>
        <FormField id="category-icon" label="Icon">
          <select id="category-icon" value={iconName} onChange={(e) => setIconName(e.target.value)} className={inputClass}>
            {ICON_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <FormField id="category-tagline" label="Tagline (optional)" error={errors.tagline}>
        <input
          id="category-tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          aria-invalid={Boolean(errors.tagline)}
          aria-describedby={describedBy("category-tagline", errors.tagline)}
          className={inputClass}
        />
      </FormField>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold transition-colors hover:bg-zinc-800">
          Cancel
        </button>
        <button type="submit" className="rounded-full bg-[#ffd400] px-5 py-2 text-sm font-bold text-black transition-all hover:brightness-95 active:scale-95">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function DeleteCategory({
  label,
  count,
  alternatives,
  onCancel,
  onConfirm,
}: {
  label: string;
  count: number;
  alternatives: StoredCategory[];
  onCancel: () => void;
  onConfirm: (moveTo: string | null) => void;
}) {
  const [moveTo, setMoveTo] = useState(alternatives[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    if (count > 0 && !moveTo) {
      setError("Choose a category to move these products to.");
      return;
    }
    onConfirm(count > 0 ? moveTo : null);
  };

  return (
    <div className={cn("flex w-full flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm md:w-auto md:max-w-sm")}>
      <p className="text-zinc-200">
        Delete <span className="font-semibold">{label}</span>?{" "}
        {count > 0 ? `${count} ${count === 1 ? "product" : "products"} will be moved to another category.` : "No products use it."}
      </p>
      {count > 0 && (
        <FormField id="move-to-category" label="Move products to" error={error ?? undefined}>
          <select
            id="move-to-category"
            value={moveTo}
            onChange={(e) => {
              setMoveTo(e.target.value);
              setError(null);
            }}
            className={inputClass}
          >
            {alternatives.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full border border-zinc-700 px-3 py-1.5 font-semibold transition-colors hover:bg-zinc-800">
          Cancel
        </button>
        <button type="button" onClick={confirm} className="rounded-full bg-red-500 px-3 py-1.5 font-semibold text-white transition-transform active:scale-95">
          Delete
        </button>
      </div>
    </div>
  );
}
