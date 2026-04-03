"use client";

import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PolarisBrandMark } from "@/components/polaris/brand-mark";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/polaris-types";

export function PendingAccessState({
  currentUser,
}: {
  currentUser: CurrentUser;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleLogout() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("退出失败，请稍后重试。");
      }

      const payload = (await response.json()) as { redirect_to?: string };
      toast.success("已退出当前账号");
      window.location.replace(payload.redirect_to || "/login");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "退出失败，请稍后重试。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid-faint relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(186,230,253,0.34),transparent_34%),radial-gradient(circle_at_84%_16%,rgba(226,232,240,0.45),transparent_28%),radial-gradient(circle_at_78%_84%,rgba(191,219,254,0.22),transparent_26%)]" />
      <div className="surface-panel relative w-full max-w-2xl overflow-hidden p-8 sm:p-10">
        <div className="absolute inset-x-10 top-0 h-32 rounded-b-[48px] bg-[radial-gradient(circle_at_top,rgba(219,234,254,0.95),transparent_74%)]" />
        <div className="relative">
          <div className="inline-flex items-center gap-3 rounded-full border border-border/80 bg-white/92 px-4 py-2 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
            <PolarisBrandMark className="size-9 rounded-full" />
            <span>账号已创建</span>
          </div>

          <div className="mt-8 flex size-14 items-center justify-center rounded-3xl border border-amber-200 bg-amber-50 text-amber-700">
            <ShieldAlert className="size-6" />
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Permission Pending
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              请联系管理员添加权限
            </h1>
            <p className="text-sm leading-7 text-muted-foreground">
              你的账号已经创建成功，但当前还没有被分配任何页面权限。
              在管理员完成授权前，这个账号不会显示任何业务信息。
            </p>
          </div>

          <div className="mt-8 rounded-[24px] border border-border/80 bg-white/90 p-5 shadow-[var(--shadow-card)]">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">显示名称：</span>
                {currentUser.display_name || currentUser.username}
              </p>
              <p>
                <span className="font-medium text-foreground">登录邮箱：</span>
                {currentUser.email || "未填写"}
              </p>
              <p>
                <span className="font-medium text-foreground">账号状态：</span>
                待授权
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={handleLogout}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  正在退出...
                </>
              ) : (
                <>
                  <LogOut className="size-4" />
                  退出并切换账号
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
