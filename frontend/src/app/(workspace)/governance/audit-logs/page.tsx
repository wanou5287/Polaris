import { AuditLogsPage } from "@/components/polaris/audit-logs-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function GovernanceAuditLogsPage() {
  await requireWorkspacePageAccess("/governance/audit-logs");
  return <AuditLogsPage />;
}
