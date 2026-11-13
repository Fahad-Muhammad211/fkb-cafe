import type { CSSProperties } from "react";
import { Bike, ChefHat, CircleCheck, PackageCheck, Receipt, type LucideIcon } from "lucide-react";
import { ORDER_STEPS, stepLabel, stepTimes } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";
import type { Order } from "@/types";

const ICONS: LucideIcon[] = [Receipt, CircleCheck, ChefHat, Bike, PackageCheck];

interface OrderTimelineProps {
  order: Order;
  currentIndex: number;
}

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

// Vertical on mobile, horizontal from md up. Completed steps fill yellow, the current step pulses.
export function OrderTimeline({ order, currentIndex }: OrderTimelineProps) {
  const progress = (currentIndex / (ORDER_STEPS.length - 1)) * 100;
  const times = stepTimes(order);

  return (
    <ol aria-label="Order progress" className="relative flex flex-col gap-6 md:flex-row md:justify-between md:gap-2">
      {/* Track: vertical line on mobile, horizontal on md+ */}
      <div aria-hidden="true" className="absolute left-[21px] top-5 h-[calc(100%-2.5rem)] w-0.5 bg-zinc-800 md:left-5 md:right-5 md:top-5 md:h-0.5 md:w-auto">
        <div
          className="h-[var(--progress)] w-full bg-[#ffd400] transition-[height] duration-700 ease-out md:h-full md:w-[var(--progress)] md:transition-[width]"
          style={{ "--progress": `${progress}%` } as CSSProperties}
        />
      </div>

      {ORDER_STEPS.map((_, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        const reached = index <= currentIndex;
        const Icon = ICONS[index];
        const reachedAt = times.get(index);
        return (
          <li
            key={index}
            aria-current={current ? "step" : undefined}
            className="relative flex items-center gap-4 md:flex-1 md:flex-col md:text-center"
          >
            <span
              className={cn(
                "relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-500",
                reached ? "border-[#ffd400] bg-[#ffd400] text-black" : "border-zinc-700 bg-zinc-900 text-zinc-500",
                current && "animate-status-pulse",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {done && <span className="sr-only">Completed</span>}
            </span>
            <span className="flex flex-col md:mt-3">
              <span className={cn("text-sm font-semibold", reached ? "text-white" : "text-zinc-500")}>
                {stepLabel(order, index)}
              </span>
              <span className="text-xs text-zinc-500">
                {reachedAt ? timeFormat.format(new Date(reachedAt)) : current ? "In progress" : " "}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
