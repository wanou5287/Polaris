"use client";

import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/polaris-client";
import { resolveHomePath } from "@/lib/polaris-access";
import type { CurrentUser } from "@/lib/polaris-types";

export function ForcePasswordResetGate({
  currentUser,
}: {
  currentUser: CurrentUser;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!currentPassword || !nextPassword || !confirmPassword) {
      toast.error("请先填写完整的密码信息");
      return;
    }
    if (nextPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    if (currentPassword === nextPassword) {
      toast.error("新密码不能与当前密码相同");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/backend/session/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: nextPassword,
          confirm_password: confirmPassword,
        }),
      });
      toast.success("密码已更新，请使用新密码继续登录");
      window.location.replace(resolveHomePath(currentUser));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "密码更新失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/22 px-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-[32px] border border-white/70 bg-white/92 p-8 shadow-[0_32px_80px_rgba(15,23,42,0.16)]">
        <div className="flex size-14 items-center justify-center rounded-3xl border border-sky-200 bg-sky-50 text-sky-700">
          <ShieldCheck className="size-6" />
        </div>
        <div className="mt-6 space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Security Reset
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            首次登录请先修改密码
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            为了保证账号安全，当前账号需要先完成密码重置。修改完成后会继续留在当前工作台。
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">当前密码</p>
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="请输入当前密码"
              className="h-12 rounded-2xl border-border/80 bg-white"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">新密码</p>
            <Input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              placeholder="请输入新密码"
              className="h-12 rounded-2xl border-border/80 bg-white"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">确认新密码</p>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="请再次输入新密码"
              className="h-12 rounded-2xl border-border/80 bg-white"
            />
          </div>
        </div>

        <Button
          type="button"
          className="mt-8 h-12 w-full rounded-full bg-sky-500 text-white hover:bg-sky-600"
          onClick={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              正在更新密码
            </>
          ) : (
            <>
              <KeyRound className="size-4" />
              确认修改并继续
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
