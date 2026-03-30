import { NextRequest } from "next/server";

import {
  POLARIS_BI_ROOT,
  proxyBackendResponse,
} from "@/lib/polaris-server";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function handleRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const suffix = path?.length ? `/${path.join("/")}` : "";
  return proxyBackendResponse(request, `${POLARIS_BI_ROOT}${suffix}`);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context);
}
