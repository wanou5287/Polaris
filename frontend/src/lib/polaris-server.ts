import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const POLARIS_SESSION_COOKIE = "polaris_session";
export const POLARIS_USERNAME_COOKIE = "polaris_username";
export const POLARIS_SESSION_MAX_AGE = 60 * 60 * 24 * 14;
export const POLARIS_API_BASE_URL =
  process.env.POLARIS_API_BASE_URL ?? "http://127.0.0.1:8888";
export const POLARIS_BI_ROOT = "/financial/bi-dashboard";
export const POLARIS_BI_API_ROOT = `${POLARIS_BI_ROOT}/api`;

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

export async function getCurrentUsername() {
  const cookieStore = await cookies();
  return cookieStore.get(POLARIS_USERNAME_COOKIE)?.value ?? "BI 用户";
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
