import { NextRequest, NextResponse } from "next/server";

import {
  POLARIS_SESSION_COOKIE,
  POLARIS_USERNAME_COOKIE,
  postLogoutToPolaris,
} from "@/lib/polaris-server";

export async function POST(request: NextRequest) {
  const session = request.cookies.get(POLARIS_SESSION_COOKIE)?.value ?? null;
  await postLogoutToPolaris(session);

  const response = NextResponse.json({
    ok: true,
    redirect_to: "/login",
  });

  response.headers.set("Cache-Control", "no-store, max-age=0");

  response.cookies.set({
    name: POLARIS_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });

  response.cookies.set({
    name: POLARIS_USERNAME_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}
