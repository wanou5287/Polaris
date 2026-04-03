import { DataAgentPage } from "@/components/polaris/data-agent-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function AnalysisDataAgentPage() {
  await requireWorkspacePageAccess("/analysis/data-agent");
  return <DataAgentPage />;
}
