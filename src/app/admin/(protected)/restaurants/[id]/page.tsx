import { Suspense } from "react";
import { RestaurantDetailGate } from "@/components/admin/RestaurantDetailView";

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

// Route params are only known at request time, so they are read inside Suspense (as on the owner page).
async function RestaurantContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RestaurantDetailGate restaurantId={id} />;
}

export default function AdminRestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading restaurant…</p>}>
      <RestaurantContent params={params} />
    </Suspense>
  );
}
