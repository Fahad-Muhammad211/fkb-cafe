import { Suspense } from "react";
import { OwnerDetailsGate } from "@/components/admin/OwnerDetailsView";

// Route params are only known at request time, so they are read inside Suspense (as in /account/orders/[id]).
// The owner's data is fetched from the API, which only returns it to a signed-in owner.
async function OwnerContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OwnerDetailsGate ownerId={id} />;
}

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminOwnerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading owner…</p>}>
      <OwnerContent params={params} />
    </Suspense>
  );
}
