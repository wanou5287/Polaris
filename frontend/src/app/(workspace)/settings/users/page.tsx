import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { UserManagementPage } from "@/components/polaris/user-management-page";
import {
  POLARIS_SESSION_COOKIE,
  getCurrentUserProfile,
} from "@/lib/polaris-server";

function AccessDeniedState() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center">
      <div className="w-full rounded-[32px] border border-border/80 bg-white/92 p-8 shadow-[var(--shadow-panel)] sm:p-10">
        <div className="flex size-14 items-center justify-center rounded-3xl border border-amber-200 bg-amber-50 text-amber-700">
          <ShieldAlert className="size-6" />
        </div>
        <div className="mt-6 space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Access Control
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            仅管理员可访问用户管理
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            右上角入口只会对管理员显示。普通角色即使直接访问该地址，也无法查看账号列表或执行任何管理操作。
          </p>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/workspace"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border/80 bg-white px-5 text-sm font-medium text-foreground transition hover:border-slate-300 hover:bg-slate-50"
          >
            返回工作台
          </Link>
          <div className="inline-flex h-11 items-center justify-center rounded-full bg-sky-50 px-5 text-sm font-medium text-sky-700">
            账号与角色仍由管理员统一维护
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function SettingsUsersPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(POLARIS_SESSION_COOKIE)?.value;

  if (!session) {
    redirect("/login");
  }

  const currentUser = await getCurrentUserProfile(session);

  if (!currentUser?.is_admin) {
    return <AccessDeniedState />;
  }

  return <UserManagementPage initialCurrentUser={currentUser} />;
}
