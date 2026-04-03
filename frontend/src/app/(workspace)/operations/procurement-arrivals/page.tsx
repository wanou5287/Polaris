import { ProcurementArrivalsPage } from "@/components/polaris/procurement-arrivals-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function OperationsProcurementArrivalsPage() {
  await requireWorkspacePageAccess("/operations/procurement-arrivals");
  return <ProcurementArrivalsPage />;
}
