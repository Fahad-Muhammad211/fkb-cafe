"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { ImagePlus, Trash2, X } from "lucide-react";
import { imageFileToDataUrl, isAllowedImageUrl, IMAGE_ACCEPT } from "@/lib/imageUpload";
import { cn } from "@/lib/utils";
import { FormField, describedBy, inputClass } from "@/components/ui/FormField";
import type { MenuItem, StoredCategory } from "@/types";

type Errors = Partial<Record<"name" | "price" | "pieces" | "description" | "image" | "category", string>>;

interface ProductFormProps {
  initial: MenuItem | null;
  categories: StoredCategory[];
  defaultCategoryId: string;
  onCancel: () => void;
  onSave: (item: MenuItem) => void;
}

// Add or edit a product. Used by the admin products page.
export function ProductForm({ initial, categories, defaultCategoryId, onCancel, onSave }: ProductFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? defaultCategoryId);
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [pieces, setPieces] = useState(initial?.pieces ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [image, setImage] = useState(initial?.image ?? "");
  const [stock, setStock] = useState<"in" | "out">(initial?.stock ?? "in");
  const [available, setAvailable] = useState(initial?.available !== false);
  const [errors, setErrors] = useState<Errors>({});
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setImage(await imageFileToDataUrl(file));
      setErrors((prev) => ({ ...prev, image: undefined }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, image: err instanceof Error ? err.message : "Could not use that image." }));
    } finally {
      setUploading(false);
    }
  };

  const validate = (): Errors => {
    const found: Errors = {};
    const n = name.trim();
    if (n.length < 2 || n.length > 60) found.name = "Name must be between 2 and 60 characters.";
    if (!categories.some((c) => c.id === categoryId)) found.category = "Choose a category.";
    const p = Number(price);
    if (!price.trim() || !Number.isInteger(p) || p < 1 || p > 100000) {
      found.price = "Enter a whole-rupee price between 1 and 100,000.";
    }
    if (pieces.length > 20) found.pieces = "Keep this to 20 characters or fewer.";
    if (description.length > 160) found.description = "Description must be 160 characters or fewer.";
    if (!isAllowedImageUrl(image) || image.length > 350_000) {
      found.image = "Use an https:// image link or upload an image file.";
    }
    return found;
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const firstKey = Object.keys(found)[0];
      const target = { name: "product-name", category: "product-category", price: "product-price", pieces: "product-pieces", description: "product-description", image: "product-image-url" }[firstKey];
      document.getElementById(target ?? "product-name")?.focus();
      return;
    }
    onSave({
      id: initial?.id ?? "",
      categoryId,
      name: name.trim(),
      price: Number(price),
      pieces: pieces.trim() || undefined,
      description: description.trim() || undefined,
      image: image.trim() || undefined,
      stock,
      available,
      badge: initial?.badge,
      sizes: initial?.sizes,
      flavors: initial?.flavors,
    });
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="animate-modal-in flex max-h-[92dvh] w-full max-w-xl flex-col gap-5 overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-900 p-6 md:rounded-2xl"
      >
        <header className="flex items-center justify-between">
          <h2 id="product-form-title" className="text-xl font-bold">
            {initial ? "Edit product" : "Add product"}
          </h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Image */}
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold">Product image</span>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800">
              {image ? (
                <Image src={image} alt="" fill unoptimized sizes="112px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-500">
                  <ImagePlus className="h-6 w-6" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-3">
              <FormField id="product-image-url" label="Image link (https)" error={errors.image} hint="Or upload a file below">
                <input
                  id="product-image-url"
                  type="url"
                  placeholder="https://example.com/photo.jpg"
                  value={image.startsWith("data:") ? "" : image}
                  onChange={(e) => {
                    setImage(e.target.value);
                    setErrors((prev) => ({ ...prev, image: undefined }));
                  }}
                  aria-invalid={Boolean(errors.image)}
                  aria-describedby={describedBy("product-image-url", errors.image, "Or upload a file below")}
                  className={inputClass}
                />
              </FormField>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold transition-colors hover:bg-zinc-800">
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  {uploading ? "Processing…" : "Upload image"}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    disabled={uploading}
                    onChange={(e) => {
                      void handleFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                    className="sr-only"
                  />
                </label>
                {image && (
                  <button
                    type="button"
                    onClick={() => setImage("")}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <FormField id="product-name" label="Name" error={errors.name}>
          <input
            id="product-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("product-name", errors.name)}
            className={inputClass}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="product-category" label="Category" error={errors.category}>
            <select
              id="product-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-invalid={Boolean(errors.category)}
              className={inputClass}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="product-price" label="Price (PKR)" error={errors.price}>
            <input
              id="product-price"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-invalid={Boolean(errors.price)}
              aria-describedby={describedBy("product-price", errors.price)}
              className={inputClass}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="product-pieces" label="Pieces or size (optional)" error={errors.pieces}>
            <input
              id="product-pieces"
              value={pieces}
              onChange={(e) => setPieces(e.target.value)}
              placeholder="e.g. 3 Pcs"
              aria-invalid={Boolean(errors.pieces)}
              aria-describedby={describedBy("product-pieces", errors.pieces)}
              className={inputClass}
            />
          </FormField>
          <FormField id="product-stock" label="Stock status">
            <select id="product-stock" value={stock} onChange={(e) => setStock(e.target.value as "in" | "out")} className={inputClass}>
              <option value="in">In stock</option>
              <option value="out">Sold out</option>
            </select>
          </FormField>
        </div>

        <FormField id="product-description" label="Description (optional)" error={errors.description}>
          <textarea
            id="product-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={describedBy("product-description", errors.description)}
            className={cn(inputClass, "resize-none")}
          />
        </FormField>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm">
          <span className="font-semibold">Show on storefront</span>
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="h-5 w-5 accent-[#ffd400]" />
        </label>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-zinc-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={uploading}
            className="rounded-full bg-[#ffd400] px-6 py-2.5 text-sm font-bold text-black transition-all hover:brightness-95 active:scale-95 disabled:opacity-60"
          >
            Save product
          </button>
        </div>
      </form>
    </div>
  );
}
