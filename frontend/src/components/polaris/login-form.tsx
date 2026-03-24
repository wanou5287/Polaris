"use client";

import { Loader2, LockKeyhole, UserRound } from "lucide-react";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/polaris-client";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("bi_admin");
  const [password, setPassword] = useState("FinvisBI@2026!");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await apiFetch<{
        ok: boolean;
        redirect_to: string;
        username: string;
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          remember,
          next: nextPath,
        }),
      });

      toast.success(`欢迎回来，${response.username}`);
      startTransition(() => {
        router.push(response.redirect_to || "/workspace");
      });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "登录失败，请检查账号和密码";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="username" className="text-sm font-medium text-foreground">
          登录账号
        </Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-12 rounded-2xl border-border/80 bg-white pl-11 shadow-none"
            autoComplete="username"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-foreground">
          登录密码
        </Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 rounded-2xl border-border/80 bg-white pl-11 shadow-none"
            autoComplete="current-password"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-white/70 px-4 py-3">
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          <Checkbox
            checked={remember}
            onCheckedChange={(checked) => setRemember(Boolean(checked))}
          />
          保持登录状态
        </label>
        <span className="text-xs text-muted-foreground">会话将自动安全保存</span>
      </div>

      <Button
        type="submit"
        className="cta-button h-12 w-full rounded-2xl text-sm font-semibold"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            正在进入工作台...
          </>
        ) : (
          "进入北极星工作台"
        )}
      </Button>
    </form>
  );
}
