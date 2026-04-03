import { MetricDictionaryPage } from "@/components/polaris/metric-dictionary-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function GovernanceMetricDictionaryPage() {
  await requireWorkspacePageAccess("/governance/metric-dictionary");
  return <MetricDictionaryPage />;
}
