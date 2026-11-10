import { Suspense } from "react";
import { ManagerDetailsGate } from "@/components/admin/ManagerDetailsView";

// Route params are only known at request time, so they are read inside Suspense (as in /account/orders/[id]).
// The manager's data is fetched from the API, which only returns it to the owner.
async function ManagerContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ManagerDetailsGate managerId={id} />;
}

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminManagerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading manager…</p>}>
      <ManagerContent params={params} />
    </Suspense>
  );
}
