import { AfterSalesRepairPage } from "@/components/polaris/after-sales-repair-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function OperationsAfterSalesRepairPage() {
  await requireWorkspacePageAccess("/operations/after-sales-repair");
  return <AfterSalesRepairPage />;
}
