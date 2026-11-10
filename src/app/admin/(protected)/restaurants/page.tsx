import { RestaurantsGate } from "@/components/admin/RestaurantsView";

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

// Owner only. Lists every restaurant as a card.
export default function AdminRestaurantsPage() {
  return <RestaurantsGate />;
}
