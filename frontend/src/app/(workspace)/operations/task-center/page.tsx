import { TaskCenterPage } from "@/components/polaris/task-center-page";
import { requireWorkspacePageAccess } from "@/lib/polaris-server";

export default async function OperationsTaskCenterPage() {
  await requireWorkspacePageAccess("/operations/task-center");
  return <TaskCenterPage />;
}
