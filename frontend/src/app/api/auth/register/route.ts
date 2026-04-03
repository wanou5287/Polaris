import { NextRequest, NextResponse } from "next/server";

import {
  POLARIS_SESSION_COOKIE,
  POLARIS_SESSION_MAX_AGE,
  POLARIS_USERNAME_COOKIE,
  postRegisterToPolaris,
  sanitizeNextPath,
} from "@/lib/polaris-server";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    email?: string;
    display_name?: string;
    password?: string;
    remember?: boolean;
    next?: string;
  };

  const email = String(payload.email ?? "").trim().toLowerCase();
  const displayName = String(payload.display_name ?? "").trim();
  const password = String(payload.password ?? "");
  const remember = Boolean(payload.remember);
  const nextPath = sanitizeNextPath(payload.next);

  if (!email || !password) {
    return NextResponse.json(
      { message: "请输入邮箱和密码" },
      { status: 400 },
    );
  }

  const result = await postRegisterToPolaris({
    email,
    display_name: displayName,
    password,
    remember,
    next: nextPath,
  });

  if (!result.ok || !result.session) {
    return NextResponse.json(
      { message: result.message || "注册失败" },
      { status: result.status },
    );
  }

  const username =
    typeof result.data?.username === "string"
      ? result.data.username
      : email;

  const response = NextResponse.json({
    ok: true,
    username,
    redirect_to:
      typeof result.data?.redirect_to === "string"
        ? result.data.redirect_to
        : nextPath,
    current_user: result.data?.current_user ?? null,
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
