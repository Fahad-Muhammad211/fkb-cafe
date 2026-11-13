import { formatPKR } from "@/lib/format";

// Lightweight CSS charts: no chart library, bars and rings animate with CSS transitions.

export function BarChart({ data }: { data: { label: string; value: number; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-56 items-end gap-2 sm:gap-4" role="img" aria-label="Revenue for the last seven days">
      {data.map((d) => {
        const pct = Math.max(3, (d.value / max) * 100);
        return (
          <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[10px] tabular-nums text-zinc-400 sm:text-xs">{d.value ? formatPKR(d.value) : "–"}</span>
            <div
              title={`${d.label}: ${formatPKR(d.value)} from ${d.count} orders`}
              className="w-full max-w-[48px] rounded-t-lg bg-gradient-to-t from-[#ffd400]/70 to-[#ffd400] transition-[height] duration-700 ease-out"
              style={{ height: `${pct}%` }}
            />
            <span className="text-xs text-zinc-500">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Donut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let angle = 0;
  const stops = segments.map((s) => {
    const start = angle;
    const span = total ? (s.value / total) * 360 : 0;
    angle += span;
    return `${s.color} ${start}deg ${angle}deg`;
  });
  const background = total ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#27272a 0deg 360deg)";

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative h-40 w-40 shrink-0 rounded-full" style={{ background }} role="img" aria-label={`${total} orders by status`}>
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-zinc-900">
          <span className="text-2xl font-black tabular-nums">{total}</span>
          <span className="text-xs text-zinc-500">orders</span>
        </div>
      </div>
      <ul className="grid w-full flex-1 grid-cols-1 gap-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-zinc-300">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </span>
            <span className="tabular-nums text-zinc-400">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalBars({ items, format }: { items: { label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-sm text-zinc-500">No sales yet.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold uppercase">{item.label}</span>
            <span className="shrink-0 tabular-nums text-zinc-400">{item.sub ?? format(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-[#ffd400] transition-[width] duration-700 ease-out" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
