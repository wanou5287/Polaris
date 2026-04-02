import { NextRequest, NextResponse } from "next/server";

import {
  resolvePostLoginPath,
  POLARIS_SESSION_COOKIE,
  POLARIS_SESSION_MAX_AGE,
  POLARIS_USERNAME_COOKIE,
  postLoginToPolaris,
  sanitizeNextPath,
} from "@/lib/polaris-server";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    remember?: boolean;
    next?: string;
  };

  const username = String(payload.username ?? "").trim();
  const password = String(payload.password ?? "");
  const remember = Boolean(payload.remember);
  const nextPath = sanitizeNextPath(payload.next);

  if (!username || !password) {
    return NextResponse.json(
      { message: "请输入账号和密码" },
      { status: 400 },
    );
  }

  const result = await postLoginToPolaris({
    username,
    password,
    remember,
    next: nextPath,
  });

  if (!result.ok || !result.session) {
    return NextResponse.json(
      { message: result.message || "登录失败" },
      { status: result.status },
    );
  }

  const response = NextResponse.json({
    ok: true,
    username,
    redirect_to: resolvePostLoginPath(
      username,
      typeof result.data?.redirect_to === "string"
        ? result.data.redirect_to
        : nextPath,
    ),
  });

  response.cookies.set({
    name: POLARIS_SESSION_COOKIE,
    value: result.session,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: POLARIS_SESSION_MAX_AGE } : {}),
  });

  response.cookies.set({
    name: POLARIS_USERNAME_COOKIE,
    value: username,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: POLARIS_SESSION_MAX_AGE } : {}),
  });

  return response;
}
