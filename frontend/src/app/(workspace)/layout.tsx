import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/polaris/app-shell";
import { ForcePasswordResetGate } from "@/components/polaris/force-password-reset-gate";
import { PendingAccessState } from "@/components/polaris/pending-access-state";
import {
  POLARIS_SESSION_COOKIE,
  POLARIS_USERNAME_COOKIE,
  getCurrentUserProfile,
} from "@/lib/polaris-server";
import type { CurrentUser } from "@/lib/polaris-types";
import { WorkspaceAccessGuard } from "@/components/polaris/workspace-access-guard";

function buildFallbackCurrentUser(username: string): CurrentUser {
  const normalizedUsername = username.trim() || "BI 用户";
  return {
    id: 0,
    username: normalizedUsername,
    email: "",
    display_name: normalizedUsername,
    role_name: "运维",
    is_admin: false,
    is_enabled: true,
    access_granted: true,
    module_permissions: [],
    default_home_path: "/workspace",
    must_change_password: false,
    note: "",
    source_type: "session",
    last_login_at: null,
    password_updated_at: null,
    registered_at: null,
    created_by: "",
    updated_by: "",
    created_at: null,
    updated_at: null,
  };
}

export default async function WorkspaceLayout({
  children,
}: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const session = cookieStore.get(POLARIS_SESSION_COOKIE)?.value;
  const username = cookieStore.get(POLARIS_USERNAME_COOKIE)?.value ?? "BI 用户";

  if (!session) {
    redirect("/login");
  }

  const currentUser =
    (await getCurrentUserProfile(session)) ?? buildFallbackCurrentUser(username);

  if (!currentUser.access_granted) {
    return <PendingAccessState currentUser={currentUser} />;
  }

  return (
    <AppShell currentUser={currentUser}>
      <WorkspaceAccessGuard currentUser={currentUser} />
      {currentUser.must_change_password ? (
        <ForcePasswordResetGate currentUser={currentUser} />
      ) : null}
      {children}
    </AppShell>
  );
}
