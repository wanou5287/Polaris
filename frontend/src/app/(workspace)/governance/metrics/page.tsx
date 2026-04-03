import { BiDashboardPage } from "@/components/polaris/bi-dashboard-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function GovernanceMetricsPage() {
  await requireWorkspacePageAccess("/governance/metrics");
  return <BiDashboardPage />;
}
