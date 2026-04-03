"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/polaris-client";

type LoginResponse = {
  ok: boolean;
  redirect_to: string;
  username: string;
};

type RegisterResponse = {
  ok: boolean;
  redirect_to: string;
  username: string;
  current_user?: {
    access_granted?: boolean;
  } | null;
};

const inputClassName =
  "h-11 rounded-2xl border border-white/80 bg-white/72 pl-11 text-slate-950 placeholder:text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-xl focus-visible:border-sky-300 focus-visible:ring-sky-100";
const secondaryButtonClassName =
  "h-11 w-full rounded-2xl border border-white/80 bg-white/58 text-sm font-medium text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl hover:bg-white/72";
const primaryButtonClassName =
  "h-11 w-full rounded-2xl border border-sky-200 bg-[linear-gradient(90deg,#d7e8ff,#bddbff,#9cc8ff)] text-sm font-semibold text-slate-950 shadow-[0_14px_34px_rgba(147,197,253,0.22)] hover:brightness-105";
const REMEMBERED_LOGIN_KEY = "polaris.rememberedLogin";

function clearDomInput(ref: React.RefObject<HTMLInputElement | null>) {
  if (ref.current) {
    ref.current.value = "";
  }
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginIdentity, setLoginIdentity] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loginIdentityRef = useRef<HTMLInputElement>(null);
  const loginPasswordRef = useRef<HTMLInputElement>(null);
  const registerNameRef = useRef<HTMLInputElement>(null);
  const registerEmailRef = useRef<HTMLInputElement>(null);
  const registerPasswordRef = useRef<HTMLInputElement>(null);
  const registerPasswordConfirmRef = useRef<HTMLInputElement>(null);

  function readRememberedLogin() {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(REMEMBERED_LOGIN_KEY);
      if (!raw) {
        return null;
      }

      const payload = JSON.parse(raw) as {
        identity?: string;
        password?: string;
      };

      if (
        typeof payload.identity === "string" &&
        typeof payload.password === "string"
      ) {
        return {
          identity: payload.identity,
          password: payload.password,
        };
      }
    } catch {
      // Ignore malformed remembered credentials.
    }

    return null;
  }

  function writeRememberedLogin(identity: string, password: string) {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      REMEMBERED_LOGIN_KEY,
      JSON.stringify({
        identity,
        password,
      }),
    );
  }

  function clearRememberedLogin() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(REMEMBERED_LOGIN_KEY);
  }

  function clearError() {
    if (errorMessage) {
      setErrorMessage("");
    }
  }

  function resetLoginFields() {
    setLoginIdentity("");
    setLoginPassword("");
    clearDomInput(loginIdentityRef);
    clearDomInput(loginPasswordRef);
  }

  function resetRegisterFields() {
    setRegisterName("");
    setRegisterEmail("");
    setRegisterPassword("");
    setRegisterPasswordConfirm("");
    clearDomInput(registerNameRef);
    clearDomInput(registerEmailRef);
    clearDomInput(registerPasswordRef);
    clearDomInput(registerPasswordConfirmRef);
  }

  async function clearTransientSession() {
    try {
      await apiFetch<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Ignore logout cleanup failures on login page.
    }
  }

  function switchMode(nextMode: "login" | "register") {
    clearError();

    if (nextMode === "login") {
      resetRegisterFields();
      const rememberedLogin = readRememberedLogin();
      if (rememberedLogin) {
        setLoginIdentity(rememberedLogin.identity);
        setLoginPassword(rememberedLogin.password);
      }
    } else {
      resetLoginFields();
    }

    void clearTransientSession();
    setMode(nextMode);
  }

  useEffect(() => {
    const rememberedLogin = readRememberedLogin();
    if (rememberedLogin) {
      setRemember(true);
      setLoginIdentity(rememberedLogin.identity);
      setLoginPassword(rememberedLogin.password);
    }
  }, []);

  useEffect(() => {
    const syncInputs = () => {
      if (mode === "login") {
        if (!loginIdentity) {
          clearDomInput(loginIdentityRef);
        }
        if (!loginPassword) {
          clearDomInput(loginPasswordRef);
        }
      } else {
        if (!registerName) {
          clearDomInput(registerNameRef);
        }
        if (!registerEmail) {
          clearDomInput(registerEmailRef);
        }
        if (!registerPassword) {
          clearDomInput(registerPasswordRef);
        }
        if (!registerPasswordConfirm) {
          clearDomInput(registerPasswordConfirmRef);
        }
      }
    };

    const frame = window.requestAnimationFrame(syncInputs);
    const timer = window.setTimeout(syncInputs, 180);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [
    loginIdentity,
    loginPassword,
    mode,
    registerEmail,
    registerName,
    registerPassword,
    registerPasswordConfirm,
  ]);

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setSubmitting(true);

    try {
      const response = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: loginIdentity,
          password: loginPassword,
          remember,
          next: nextPath,
        }),
      });

      if (remember) {
        writeRememberedLogin(loginIdentity.trim(), loginPassword);
      } else {
        clearRememberedLogin();
      }

      toast.success(`欢迎回来，${response.username}`);
      startTransition(() => {
        router.push(response.redirect_to || "/workspace");
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 401
            ? "账号或密码错误，请重新输入。"
            : error.message
          : "登录失败，请稍后重试。";

      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    if (!registerEmail.trim()) {
      const message = "请输入邮箱地址。";
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    if (!registerPassword.trim()) {
      const message = "请输入登录密码。";
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    if (registerPassword !== registerPasswordConfirm) {
      const message = "两次输入的密码不一致。";
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: registerEmail,
          display_name: registerName,
          password: registerPassword,
          remember,
          next: nextPath,
        }),
      });

      toast.success(
        response.current_user?.access_granted
          ? "注册成功，正在进入工作台。"
          : "注册成功，请联系管理员分配权限。",
      );

      startTransition(() => {
        router.push(response.redirect_to || "/workspace");
      });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "注册失败，请稍后重试。";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return mode === "login" ? (
    <form className="space-y-4" autoComplete="off" onSubmit={handleLoginSubmit}>
      <input
        aria-hidden="true"
        className="hidden"
        tabIndex={-1}
        type="text"
        name="fake-username"
        autoComplete="username"
      />
      <input
        aria-hidden="true"
        className="hidden"
        tabIndex={-1}
        type="password"
        name="fake-password"
        autoComplete="current-password"
      />

      <div className="pb-1 pt-1 text-center">
        <h2 className="text-[2.2rem] font-semibold tracking-[-0.04em] text-slate-950">
          Log in
        </h2>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
          <Input
            ref={loginIdentityRef}
            id="login-identity"
            name="polaris-login-identity"
            value={loginIdentity}
            onChange={(event) => {
              setLoginIdentity(event.target.value);
              clearError();
            }}
            className={inputClassName}
            aria-label="请输入账号"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            placeholder="请输入账号"
          />
        </div>

        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
          <Input
            ref={loginPasswordRef}
            id="login-password"
            name="polaris-login-password"
            type="password"
            value={loginPassword}
            onChange={(event) => {
              setLoginPassword(event.target.value);
              clearError();
            }}
            className={inputClassName}
            aria-label="请输入密码"
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            placeholder="请输入密码"
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <label className="flex items-center gap-2.5">
          <Checkbox
            checked={remember}
            onCheckedChange={(checked) => {
              const nextRemember = Boolean(checked);
              setRemember(nextRemember);
              if (!nextRemember) {
                clearRememberedLogin();
              }
            }}
            className="border-slate-300 data-[state=checked]:border-sky-300 data-[state=checked]:bg-sky-300 data-[state=checked]:text-slate-950"
          />
          记住我
        </label>
        <span>忘记密码</span>
      </div>

      {errorMessage ? (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-600 backdrop-blur-xl"
          role="alert"
          aria-live="polite"
        >
          {errorMessage}
        </div>
      ) : null}

      <Button type="submit" className={primaryButtonClassName} disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            正在登录
          </>
        ) : (
          "登录"
        )}
      </Button>

      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-slate-200/80" />
        <span className="text-xs uppercase tracking-[0.22em] text-slate-400">
          或
        </span>
        <div className="h-px flex-1 bg-slate-200/80" />
      </div>

      <Button
        type="button"
        variant="outline"
        className={secondaryButtonClassName}
        onClick={() => switchMode("register")}
      >
        使用邮箱创建账号
        <ArrowRight className="size-4" />
      </Button>
    </form>
  ) : (
    <form
      className="space-y-4"
      autoComplete="off"
      onSubmit={handleRegisterSubmit}
    >
      <div className="pb-1 pt-1 text-center">
        <h2 className="text-[1.9rem] font-semibold tracking-[-0.04em] text-slate-950">
          Sign in
        </h2>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={registerNameRef}
            id="register-name"
            name="polaris-register-name"
            value={registerName}
            onChange={(event) => {
              setRegisterName(event.target.value);
              clearError();
            }}
            className={inputClassName}
            aria-label="请输入姓名"
            autoComplete="off"
            placeholder="请输入姓名"
          />
        </div>

        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={registerEmailRef}
            id="register-email"
            name="polaris-register-email"
            type="email"
            value={registerEmail}
            onChange={(event) => {
              setRegisterEmail(event.target.value);
              clearError();
            }}
            className={inputClassName}
            aria-label="请输入邮箱"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="请输入邮箱"
          />
        </div>

        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={registerPasswordRef}
            id="register-password"
            name="polaris-register-password"
            type="password"
            value={registerPassword}
            onChange={(event) => {
              setRegisterPassword(event.target.value);
              clearError();
            }}
            className={inputClassName}
            aria-label="请输入密码"
            autoComplete="new-password"
            placeholder="请输入密码"
          />
        </div>

        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={registerPasswordConfirmRef}
            id="register-password-confirm"
            name="polaris-register-password-confirm"
            type="password"
            value={registerPasswordConfirm}
            onChange={(event) => {
              setRegisterPasswordConfirm(event.target.value);
              clearError();
            }}
            className={inputClassName}
            aria-label="请再次输入密码"
            autoComplete="new-password"
            placeholder="请再次输入密码"
          />
        </div>
      </div>

      {errorMessage ? (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-600 backdrop-blur-xl"
          role="alert"
          aria-live="polite"
        >
          {errorMessage}
        </div>
      ) : null}

      <Button type="submit" className={primaryButtonClassName} disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            正在创建账号
          </>
        ) : (
          "创建账号"
        )}
      </Button>

      <Button
        type="button"
        variant="outline"
        className={secondaryButtonClassName}
        onClick={() => switchMode("login")}
      >
        返回登录
      </Button>
    </form>
  );
}
