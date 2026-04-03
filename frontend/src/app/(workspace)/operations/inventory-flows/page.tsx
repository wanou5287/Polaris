import { InventoryFlowsPage } from "@/components/polaris/inventory-flows-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function OperationsInventoryFlowsPage() {
  await requireWorkspacePageAccess("/operations/inventory-flows");
  return <InventoryFlowsPage />;
}
