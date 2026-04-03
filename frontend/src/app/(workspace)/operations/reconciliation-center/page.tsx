import { ReconciliationCenterPage } from "@/components/polaris/reconciliation-center-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function OperationsReconciliationCenterPage() {
  await requireWorkspacePageAccess("/operations/reconciliation-center");
  return <ReconciliationCenterPage />;
}
