import { OwnerGate } from "@/components/owner/OwnerShell";
import { KitchenScreen } from "@/components/owner/KitchenScreen";

// Kitchen Display Screen: open it on the kitchen's device, signed in with the restaurant owner's account.
export default function KitchenPage() {
  return (
    <OwnerGate bare>
      <KitchenScreen />
    </OwnerGate>
  );
}