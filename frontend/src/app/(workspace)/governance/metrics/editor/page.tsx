import { BiDashboardEditorPage } from "@/components/polaris/bi-dashboard-editor-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function GovernanceMetricsEditorPage() {
  await requireWorkspacePageAccess("/governance/metrics/editor");
  return <BiDashboardEditorPage />;
}
