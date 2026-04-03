import { MasterDataPage } from "@/components/polaris/master-data-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function GovernanceMasterDataPage() {
  await requireWorkspacePageAccess("/governance/master-data");
  return <MasterDataPage />;
}
