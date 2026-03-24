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

  response.cookies.delete(POLARIS_SESSION_COOKIE);
  response.cookies.delete(POLARIS_USERNAME_COOKIE);

  return response;
}
