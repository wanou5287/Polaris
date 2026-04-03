import { NextRequest, NextResponse } from "next/server";

import { canAccessAppPath, resolveHomePath } from "@/lib/polaris-access";
import type { CurrentUserResponse } from "@/lib/polaris-types";

const POLARIS_SESSION_COOKIE = "polaris_session";
const POLARIS_API_BASE_URL =
  process.env.POLARIS_API_BASE_URL ?? "http://127.0.0.1:8888";

async function fetchCurrentUser(session: string) {
  try {
    const response = await fetch(
      new URL("/financial/bi-dashboard/api/session/me", POLARIS_API_BASE_URL),
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Cookie: `${POLARIS_SESSION_COOKIE}=${session}`,
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as CurrentUserResponse;
    return payload.current_user ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const session = request.cookies.get(POLARIS_SESSION_COOKIE)?.value ?? null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/workspace") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  const currentUser = await fetchCurrentUser(session);
  if (!currentUser) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/workspace") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (!currentUser.access_granted) {
    return NextResponse.next();
  }

  if (canAccessAppPath(currentUser, pathname)) {
    return NextResponse.next();
  }

  const targetPath = resolveHomePath(currentUser);
  if (!targetPath || targetPath === pathname) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(targetPath, request.url));
}

export const config = {
  matcher: [
    "/workspace",
    "/analysis/:path*",
    "/governance/:path*",
    "/operations/:path*",
    "/settings/:path*",
  ],
};
