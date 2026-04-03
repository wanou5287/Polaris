import { RefurbCollaborationPage } from "@/components/polaris/refurb-collaboration-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function OperationsRefurbProductionPage() {
  await requireWorkspacePageAccess("/operations/refurb-production");
  return <RefurbCollaborationPage />;
}
