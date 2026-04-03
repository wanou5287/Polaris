import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

import {
  canAccessAppPath,
  canAccessBackendPath,
  resolveHomePath,
} from "@/lib/polaris-access";
import type { CurrentUser, CurrentUserResponse } from "@/lib/polaris-types";

export const POLARIS_SESSION_COOKIE = "polaris_session";
export const POLARIS_USERNAME_COOKIE = "polaris_username";
export const POLARIS_SESSION_MAX_AGE = 60 * 60 * 24 * 14;
export const POLARIS_API_BASE_URL =
  process.env.POLARIS_API_BASE_URL ?? "http://127.0.0.1:8888";
export const POLARIS_BI_ROOT = "/financial/bi-dashboard";
export const POLARIS_BI_API_ROOT = `${POLARIS_BI_ROOT}/api`;
export const POLARIS_BI_REGISTER_PATH = `${POLARIS_BI_ROOT}/register`;

function sanitizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

export function sanitizeNextPath(rawValue: string | null | undefined) {
  const value = String(rawValue ?? "").trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/workspace";
  }
  return value;
}

function buildBackendUrl(
  path: string,
  search?: string | URLSearchParams | null,
) {
  const url = new URL(sanitizePath(path), POLARIS_API_BASE_URL);
  if (search) {
    url.search = typeof search === "string" ? search : search.toString();
  }
  return url;
}

function extractMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const message =
      (payload as Record<string, unknown>).message ??
      (payload as Record<string, unknown>).detail;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "服务暂时不可用，请稍后重试";
}

async function getCurrentSessionValue(request?: NextRequest) {
  if (request) {
    return request.cookies.get(POLARIS_SESSION_COOKIE)?.value ?? null;
  }

  const cookieStore = await cookies();
  return cookieStore.get(POLARIS_SESSION_COOKIE)?.value ?? null;
}

function readProxyBody(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") {
    return Promise.resolve<BodyInit | undefined>(undefined);
  }
  return request.text();
}

export async function getCurrentUsername() {
  const cookieStore = await cookies();
  return cookieStore.get(POLARIS_USERNAME_COOKIE)?.value ?? "BI 用户";
}

export async function getCurrentUserProfile(sessionOverride?: string | null) {
  const session =
    typeof sessionOverride === "string"
      ? sessionOverride
      : await getCurrentSessionValue();

  if (!session) {
    return null;
  }

  try {
    const payload = await fetchPolarisJson<CurrentUserResponse>(
      "/financial/bi-dashboard/api/session/me",
      undefined,
      session,
    );
    return payload.current_user;
  } catch {
    return null;
  }
}

export async function requireWorkspacePageAccess(pathname: string) {
  const session = await getCurrentSessionValue();
  if (!session) {
    redirect("/login");
  }

  const currentUser = await getCurrentUserProfile(session);
  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.access_granted && !canAccessAppPath(currentUser, pathname)) {
    redirect(resolveHomePath(currentUser));
  }

  return currentUser;
}

export function hasWorkspaceAccess(profile: CurrentUser | null | undefined) {
  return Boolean(profile?.access_granted);
}

export async function fetchPolarisJson<T>(
  path: string,
  init?: RequestInit,
  sessionOverride?: string | null,
): Promise<T> {
  const session =
    typeof sessionOverride === "string"
      ? sessionOverride
      : await getCurrentSessionValue();

  const response = await fetch(buildBackendUrl(path), {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
      ...(session ? { Cookie: `${POLARIS_SESSION_COOKIE}=${session}` } : {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractMessage(payload));
  }

  return payload as T;
}

function readSetCookie(response: Response) {
  const headersWithCookies = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithCookies.getSetCookie === "function") {
    return headersWithCookies.getSetCookie();
  }

  const fallback = response.headers.get("set-cookie");
  return fallback ? [fallback] : [];
}

function extractSessionFromResponse(response: Response) {
  for (const setCookie of readSetCookie(response)) {
    const match = setCookie.match(/polaris_session=([^;]+)/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

function createProxyResponse(payload: unknown, status: number) {
  return NextResponse.json(payload, { status });
}

export async function proxyBackendJson(
  request: NextRequest,
  path: string,
) {
  const session = await getCurrentSessionValue(request);

  if (!session) {
    return createProxyResponse({ message: "登录已失效，请重新登录" }, 401);
  }

  const currentUser = await getCurrentUserProfile(session);
  if (!hasWorkspaceAccess(currentUser)) {
    return createProxyResponse(
      { message: "当前账号还没有任何访问权限，请联系管理员添加权限" },
      403,
    );
  }
  if (!canAccessBackendPath(currentUser, path)) {
    return createProxyResponse(
      { message: "当前账号无权访问该模块，请联系管理员调整模块权限" },
      403,
    );
  }

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  const response = await fetch(
    buildBackendUrl(path, request.nextUrl.searchParams),
    {
      method: request.method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body
          ? {
              "Content-Type":
                request.headers.get("content-type") ?? "application/json",
            }
          : {}),
        Cookie: `${POLARIS_SESSION_COOKIE}=${session}`,
      },
      body,
    },
  );

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({ message: "接口返回异常" }))
    : { message: await response.text() };

  return createProxyResponse(payload, response.status);
}

export async function proxyBackendResponse(
  request: NextRequest,
  path: string,
) {
  const session = await getCurrentSessionValue(request);
  const currentUser = session ? await getCurrentUserProfile(session) : null;

  if (session && !hasWorkspaceAccess(currentUser)) {
    return createProxyResponse(
      { message: "当前账号还没有任何访问权限，请联系管理员添加权限" },
      403,
    );
  }
  if (session && currentUser && !canAccessBackendPath(currentUser, path)) {
    return createProxyResponse(
      { message: "当前账号无权访问该模块，请联系管理员调整模块权限" },
      403,
    );
  }
  const body = await readProxyBody(request);

  const response = await fetch(
    buildBackendUrl(path, request.nextUrl.searchParams),
    {
      method: request.method,
      cache: "no-store",
      redirect: "manual",
      headers: {
        Accept: request.headers.get("accept") ?? "*/*",
        ...(body
          ? {
              "Content-Type":
                request.headers.get("content-type") ?? "application/json",
            }
          : {}),
        ...(session ? { Cookie: `${POLARIS_SESSION_COOKIE}=${session}` } : {}),
      },
      body,
    },
  );

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const contentDisposition = response.headers.get("content-disposition");
  const location = response.headers.get("location");

  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (contentDisposition) {
    headers.set("content-disposition", contentDisposition);
  }
  if (location) {
    headers.set("location", location);
  }

  for (const setCookie of readSetCookie(response)) {
    headers.append("set-cookie", setCookie);
  }

  if (request.method === "HEAD") {
    return new NextResponse(null, {
      status: response.status,
      headers,
    });
  }

  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    status: response.status,
    headers,
  });
}

export async function postLoginToPolaris(payload: {
  username: string;
  password: string;
  remember?: boolean;
  next?: string;
}) {
  const response = await fetch(buildBackendUrl(`${POLARIS_BI_ROOT}/login`), {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      message: extractMessage(data),
      session: null,
      data,
    };
  }

  return {
    ok: true as const,
    status: response.status,
    message: extractMessage(data),
    session: extractSessionFromResponse(response),
    data,
  };
}

export async function postRegisterToPolaris(payload: {
  email: string;
  display_name?: string;
  password: string;
  remember?: boolean;
  next?: string;
}) {
  const response = await fetch(buildBackendUrl(POLARIS_BI_REGISTER_PATH), {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      message: extractMessage(data),
      session: null,
      data,
    };
  }

  return {
    ok: true as const,
    status: response.status,
    message: extractMessage(data),
    session: extractSessionFromResponse(response),
    data,
  };
}

export async function postLogoutToPolaris(session: string | null) {
  if (!session) {
    return;
  }

  try {
    await fetch(buildBackendUrl(`${POLARIS_BI_ROOT}/logout`), {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Cookie: `${POLARIS_SESSION_COOKIE}=${session}`,
      },
    });
  } catch {
    // Ignore logout proxy failures and always clear local session.
  }
}
