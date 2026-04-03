import { OverviewPage } from "@/components/polaris/overview-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function WorkspacePage() {
  await requireWorkspacePageAccess("/workspace");
  return <OverviewPage />;
}
