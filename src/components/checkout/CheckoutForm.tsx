"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Bike, Check, Store } from "lucide-react";
import { DELIVERY_FEE } from "@/lib/constants";
import { LOCATION_KEY, parseLocation, saveLocation } from "@/lib/location";
import { formatPKR } from "@/lib/format";
import { createClientOrderId, placeOrder } from "@/lib/orders";
import { useCustomerData } from "@/components/customer/useCustomerData";
import { validateCheckout, type CheckoutErrors } from "@/lib/validation";
import { FormField, describedBy, inputClass } from "@/components/ui/FormField";
import { useCart } from "@/context/CartContext";
import type { AuthUser, CartLine, CheckoutValues, FulfilmentType, Order } from "@/types";
import { cn } from "@/lib/utils";

interface CheckoutFormProps {
  user: AuthUser | null;
  lines: CartLine[];
  onPlaced: (order: Order) => void;
}

const FIELD_ORDER: (keyof CheckoutValues)[] = ["name", "phone", "address", "notes"];

function readSavedLocation() {
  try {
    return parseLocation(window.localStorage.getItem(LOCATION_KEY));
  } catch {
    return null;
  }
}

export function CheckoutForm({ user, lines, onPlaced }: CheckoutFormProps) {
  const { clearCart } = useCart();
  // Start from the order type chosen in the location picker.
  const [savedLocation] = useState(readSavedLocation);
  const [values, setValues] = useState<CheckoutValues>({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    address: "",
    notes: "",
    fulfilment: savedLocation?.orderType ?? "delivery",
  });
  const addressHint = savedLocation
    ? `Street and house number in ${savedLocation.area}, ${savedLocation.city}`
    : "Street, house number, and area";
  const [submitted, setSubmitted] = useState(false);
  const [placing, setPlacing] = useState(false);
  // One reference per checkout attempt: a retry sends the same id, so the server never creates two orders.
  const [clientOrderId] = useState(createClientOrderId);
  const [formError, setFormError] = useState<string | null>(null);
  // The restaurant the customer orders from. Shown once any restaurant exists.
  const restaurantsState = useCustomerData<{ restaurants: { id: string; name: string; area: string }[] }>("/api/restaurants");
  const restaurants = restaurantsState.data?.restaurants ?? [];
  const [restaurantId, setRestaurantId] = useState("");

  // Errors only appear after the first submit attempt, then update live as the user types.
  const errors: CheckoutErrors = submitted ? validateCheckout(values) : {};

  const isDelivery = values.fulfilment === "delivery";
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const deliveryFee = isDelivery ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;

  const update = <K extends keyof CheckoutValues>(key: K, value: CheckoutValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitted(true);
    const found = validateCheckout(values);
    const firstError = FIELD_ORDER.find((key) => found[key]);
    if (firstError) {
      document.getElementById(`checkout-${firstError}`)?.focus();
      return;
    }

    if (restaurants.length > 0 && !restaurantId) {
      setFormError("Choose the restaurant you are ordering from.");
      document.getElementById("checkout-restaurant")?.focus();
      return;
    }

    setPlacing(true);
    // The server checks the cart against the menu, sets the totals and assigns the order number.
    placeOrder({
      clientOrderId,
      customer: {
        name: values.name.trim(),
        phone: values.phone.trim(),
        address: isDelivery ? values.address.trim() : "",
        notes: values.notes.trim(),
      },
      fulfilment: values.fulfilment,
      lines,
      restaurantId: restaurantId || undefined,
    }).then((result) => {
      if (!result.ok) {
        setPlacing(false);
        setFormError(result.error);
        return;
      }
      clearCart();
      onPlaced(result.order);
    });
  };

  const fulfilmentOptions: { value: FulfilmentType; label: string; hint: string; icon: typeof Bike }[] = [
    { value: "delivery", label: "Delivery", hint: "To your address", icon: Bike },
    { value: "pickup", label: "Pickup", hint: "Collect from the branch", icon: Store },
  ];

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Checkout</h1>
          <p className="mt-1 text-sm text-zinc-400">Enter your details to place your order.</p>
        </header>

        {/* Contact */}
        <section aria-labelledby="contact-heading" className="flex flex-col gap-4">
          <h2 id="contact-heading" className="text-lg font-bold">Contact details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="checkout-name" label="Full name" error={errors.name}>
              <input
                id="checkout-name"
                type="text"
                autoComplete="name"
                value={values.name}
                onChange={(e) => update("name", e.target.value)}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={describedBy("checkout-name", errors.name)}
                className={inputClass}
              />
            </FormField>
            <FormField id="checkout-phone" label="Phone number" error={errors.phone} hint="e.g. 0300 1234567">
              <input
                id="checkout-phone"
                type="tel"
                autoComplete="tel"
                value={values.phone}
                onChange={(e) => update("phone", e.target.value)}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={describedBy("checkout-phone", errors.phone, "e.g. 0300 1234567")}
                className={inputClass}
              />
            </FormField>
          </div>
        </section>

        {restaurants.length > 0 && (
          <section aria-labelledby="restaurant-heading" className="flex flex-col gap-4">
            <h2 id="restaurant-heading" className="text-lg font-bold">Restaurant</h2>
            <select id="checkout-restaurant" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} className={inputClass}>
              <option value="">Choose a restaurant</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.area}
                </option>
              ))}
            </select>
          </section>
        )}

        {/* Fulfilment */}
        <section aria-labelledby="fulfilment-heading" className="flex flex-col gap-4">
          <h2 id="fulfilment-heading" className="text-lg font-bold">Delivery or pickup</h2>
          <div role="radiogroup" aria-labelledby="fulfilment-heading" className="grid gap-3 sm:grid-cols-2">
            {fulfilmentOptions.map((option) => {
              const selected = values.fulfilment === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    update("fulfilment", option.value);
                    // Keep the saved location in step, so the cart shows the same fee.
                    if (savedLocation) saveLocation({ ...savedLocation, orderType: option.value });
                  }}
                  className={cn(
                    "flex items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.98]",
                    selected
                      ? "border-[#ffd400] bg-zinc-800"
                      : "border-zinc-700 bg-zinc-900 hover:border-zinc-500",
                  )}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{option.label}</span>
                    <span className="block text-xs text-zinc-400">{option.hint}</span>
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border",
                      selected ? "border-[#ffd400] bg-[#ffd400] text-black" : "border-zinc-600",
                    )}
                    aria-hidden="true"
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>

          {isDelivery && (
            <FormField id="checkout-address" label="Delivery address" error={errors.address} hint={addressHint}>
              <textarea
                id="checkout-address"
                rows={3}
                autoComplete="street-address"
                value={values.address}
                onChange={(e) => update("address", e.target.value)}
                aria-invalid={Boolean(errors.address)}
                aria-describedby={describedBy("checkout-address", errors.address, addressHint)}
                className={cn(inputClass, "resize-none")}
              />
            </FormField>
          )}

          <FormField id="checkout-notes" label="Order notes (optional)" error={errors.notes}>
            <textarea
              id="checkout-notes"
              rows={2}
              value={values.notes}
              onChange={(e) => update("notes", e.target.value.slice(0, 300))}
              placeholder="Allergies, extra napkins, or other requests"
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={describedBy("checkout-notes", errors.notes)}
              className={cn(inputClass, "resize-none")}
            />
          </FormField>
        </section>

        {/* Payment */}
        <section aria-labelledby="payment-heading" className="flex flex-col gap-4">
          <h2 id="payment-heading" className="text-lg font-bold">Payment</h2>
          <div className="flex items-center gap-4 rounded-2xl border border-[#ffd400] bg-zinc-800 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-700">
              <Banknote className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">Cash on Delivery</span>
              <span className="block text-xs text-zinc-400">
                {isDelivery ? "Pay the rider when your order arrives." : "Pay when you collect your order."}
              </span>
            </span>
            <Check className="h-5 w-5 text-[#ffd400]" aria-hidden="true" />
          </div>
        </section>

        {formError && (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {formError}
          </p>
        )}
      </div>

      {/* Order summary */}
      <aside aria-labelledby="summary-heading" className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900 p-5 lg:sticky lg:top-40">
        <h2 id="summary-heading" className="text-lg font-bold">Order summary</h2>
        <ul className="mt-4 flex flex-col gap-3 divide-y divide-zinc-800">
          {lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 pt-3 first:pt-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase">
                  {line.qty} × {line.name}
                </p>
                {line.options.length > 0 && <p className="text-xs text-zinc-400">{line.options.join(" · ")}</p>}
              </div>
              <p className="shrink-0 text-sm">{formatPKR(line.total)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-zinc-800 pt-4 text-sm">
          <div className="flex justify-between text-zinc-300">
            <dt>Subtotal</dt>
            <dd>{formatPKR(subtotal)}</dd>
          </div>
          <div className="flex justify-between text-zinc-300">
            <dt>{isDelivery ? "Delivery fee" : "Pickup"}</dt>
            <dd>{isDelivery ? formatPKR(deliveryFee) : "Free"}</dd>
          </div>
          <div className="flex justify-between border-t border-zinc-800 pt-3 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatPKR(total)}</dd>
          </div>
        </dl>
        <button
          type="submit"
          disabled={placing}
          className="mt-5 w-full rounded-full bg-[#ffd400] px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
        >
          {placing ? "Placing order…" : `Place order · ${formatPKR(total)}`}
        </button>
        <p className="mt-3 text-center text-xs text-zinc-500">Cash on delivery: no payment is taken online.</p>
      </aside>
    </form>
  );
}
