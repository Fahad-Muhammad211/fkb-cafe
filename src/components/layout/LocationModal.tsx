"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Bike, Check, Landmark, MapPin, Search, Store, X } from "lucide-react";
import { CITY_IMAGES } from "@/data/assets";
import { AREA_SUGGESTIONS, CITIES, locationModal, locationStore, parseLocation, saveLocation, searchAreas, type OrderType } from "@/lib/location";
import { cn } from "@/lib/utils";

// Order type and location picker. Opens automatically on a first visit to the homepage
// (as on the reference site) and from the header's Delivery button.
export function LocationModal() {
  const pathname = usePathname();
  const raw = useSyncExternalStore(locationStore.subscribe, locationStore.getSnapshot, locationStore.getServerSnapshot);
  const manualOpen = useSyncExternalStore(locationModal.subscribe, locationModal.getSnapshot, locationModal.getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);

  const firstVisit = pathname === "/" && raw === null && !dismissed;
  const open = manualOpen || firstVisit;
  if (!open || raw === undefined) return null;

  const close = () => {
    setDismissed(true);
    locationModal.close();
  };

  return <LocationDialog key={raw ?? "new"} saved={parseLocation(raw)} onClose={close} />;
}

function LocationDialog({ saved, onClose }: { saved: ReturnType<typeof parseLocation>; onClose: () => void }) {
  const titleId = useId();
  const listId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [orderType, setOrderType] = useState<OrderType>(saved?.orderType ?? "delivery");
  const [city, setCity] = useState<string>(saved?.city ?? "");
  const [area, setArea] = useState(saved?.area ?? "");
  const [query, setQuery] = useState(saved?.area ?? "");
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const blurTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  // Latest close handler in a ref, so the effect below runs once per open (re-running it
  // on every render would move focus away from the field being typed in).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape closes, the page behind stops scrolling, and focus starts on the close button.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onCloseRef.current();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const matches = useMemo(() => searchAreas(query, city || null), [query, city]);
  const typed = query.trim();
  // Offer the typed text itself when it is not an exact listed area, so unlisted areas still work.
  const showCustom = typed.length >= 2 && !matches.some((m) => m.area.toLowerCase() === typed.toLowerCase());
  const optionCount = matches.length + (showCustom ? 1 : 0);

  const choose = (choice: { area: string; city: string }) => {
    setArea(choice.area);
    setQuery(choice.area);
    if (choice.city) setCity(choice.city);
    setListOpen(false);
    setError(null);
  };

  const chooseActive = () => {
    if (activeIndex < matches.length) choose(matches[activeIndex]);
    else if (showCustom && city) choose({ area: typed, city });
    else if (showCustom) setError("Please select your city first.");
  };

  const onComboKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setListOpen(true);
      setActiveIndex((i) => Math.min(optionCount - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && listOpen && optionCount > 0) {
      e.preventDefault();
      chooseActive();
    } else if (e.key === "Escape" && listOpen) {
      // Close just the list, not the whole dialog. React's listener and the dialog's Escape
      // listener share the document node, so mark the event as handled instead of stopping it.
      e.preventDefault();
      setListOpen(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!city) {
      setError("Please select your city.");
      return;
    }
    const finalArea = area.trim() || typed;
    if (finalArea.length < 2) {
      setError(orderType === "delivery" ? "Please choose your delivery area." : "Please choose the area you will pick up from.");
      document.getElementById("location-area")?.focus();
      return;
    }
    saveLocation({ orderType, city, area: finalArea });
    onClose();
  };

  const canSubmit = Boolean(city) && (area.trim() || typed).length >= 2;
  const activeOptionId = listOpen && optionCount > 0 ? `${listId}-opt-${activeIndex}` : undefined;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-modal-in relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-900 text-white shadow-2xl sm:rounded-3xl"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 transition-transform hover:scale-105 active:scale-95"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex justify-center border-b border-zinc-800 px-6 py-5">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-black font-serif text-xl font-black ring-1 ring-zinc-700">MEG</span>
        </div>

        <div className="flex flex-col items-center gap-5 px-6 py-6 text-center">
          <h2 id={titleId} className="text-lg font-bold">
            Select Your Order Type
          </h2>

          <div role="radiogroup" aria-label="Order type" className="inline-flex rounded-2xl border border-zinc-700 bg-zinc-800 p-1">
            {(
              [
                { id: "delivery", label: "Delivery", icon: Bike },
                { id: "pickup", label: "Pick-Up", icon: Store },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const on = orderType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setOrderType(t.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200",
                    on ? "bg-black text-white shadow" : "text-zinc-400 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="w-full">
            <p className="mb-3 text-sm font-semibold">Please Select City</p>
            <div role="radiogroup" aria-label="City" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CITIES.map((c) => {
                const on = city === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      if (city !== c) {
                        setArea("");
                        setQuery("");
                      }
                      setCity(c);
                      setError(null);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-xs font-semibold transition-all duration-200 active:scale-95 sm:text-sm",
                      on ? "border-red-500 bg-red-500/10 text-red-400" : "border-dashed border-zinc-700 text-zinc-300 hover:border-zinc-500",
                    )}
                  >
                    {CITY_IMAGES[c] ? (
                      <span className="relative block h-12 w-12">
                        <Image src={CITY_IMAGES[c]} alt="" fill sizes="48px" unoptimized className="object-contain" />
                      </span>
                    ) : (
                      <Landmark className="h-7 w-7" aria-hidden="true" />
                    )}
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative w-full text-left">
            <label htmlFor="location-area" className="mb-2 block text-sm font-semibold">
              {orderType === "delivery" ? "Please select your location" : "Nearest area for pick-up"}
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-3 transition-colors focus-within:border-[#ffd400]">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
              <input
                id="location-area"
                role="combobox"
                aria-expanded={listOpen}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeOptionId}
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  window.clearTimeout(blurTimer.current);
                  setQuery(e.target.value);
                  setArea("");
                  setListOpen(true);
                  setActiveIndex(0);
                  setError(null);
                }}
                onFocus={() => {
                  // Cancel a pending close from an earlier blur, or it would shut the list mid-typing.
                  window.clearTimeout(blurTimer.current);
                  setListOpen(true);
                }}
                onBlur={() => {
                  blurTimer.current = window.setTimeout(() => setListOpen(false), 150);
                }}
                onKeyDown={onComboKey}
                placeholder={city ? `Search ${AREA_SUGGESTIONS[city]?.length ?? 0} areas in ${city}` : "Search your area in any city"}
                className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
            </div>

            {listOpen && optionCount > 0 && (
              <ul
                id={listId}
                role="listbox"
                aria-label="Areas"
                // In the page flow (not floating) so it never covers the Select button below.
                className="animate-fade-in mt-2 max-h-56 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-1"
              >
                {matches.map((m, i) => (
                  <li
                    key={`${m.city}-${m.area}`}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(m)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                      i === activeIndex ? "bg-zinc-800 text-white" : "text-zinc-300",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                      <span className="truncate">{m.area}</span>
                    </span>
                    {!city && <span className="shrink-0 text-xs text-zinc-500">{m.city}</span>}
                    {area === m.area && <Check className="h-4 w-4 shrink-0 text-[#ffd400]" aria-hidden="true" />}
                  </li>
                ))}
                {showCustom && (
                  <li
                    id={`${listId}-opt-${matches.length}`}
                    role="option"
                    aria-selected={activeIndex === matches.length}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (city ? choose({ area: typed, city }) : setError("Please select your city first."))}
                    onMouseEnter={() => setActiveIndex(matches.length)}
                    className={cn(
                      "cursor-pointer rounded-lg px-3 py-2 text-sm",
                      activeIndex === matches.length ? "bg-zinc-800 text-white" : "text-zinc-400",
                    )}
                  >
                    Use “{typed}”{city ? ` in ${city}` : ""}
                  </li>
                )}
              </ul>
            )}
          </div>

          {error && (
            <p role="alert" className="w-full rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-left text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-zinc-800 p-4">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-black py-3.5 text-sm font-bold text-white ring-1 ring-zinc-700 transition-all duration-200 hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:text-zinc-500"
          >
            Select
          </button>
        </div>
      </form>
    </div>
  );
}
