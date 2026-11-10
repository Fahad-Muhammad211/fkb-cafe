import { Suspense } from "react";
import { TableOrderView } from "@/components/owner/OwnerViews";

async function TableContent({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return <TableOrderView tableId={decodeURIComponent(tableId)} />;
}

export default function OwnerTablePage({ params }: { params: Promise<{ tableId: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading table…</p>}>
      <TableContent params={params} />
    </Suspense>
  );
}