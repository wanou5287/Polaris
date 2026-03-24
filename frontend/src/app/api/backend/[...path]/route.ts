import { NextRequest } from "next/server";

import { POLARIS_BI_API_ROOT, proxyBackendJson } from "@/lib/polaris-server";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handleRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyBackendJson(request, `${POLARIS_BI_API_ROOT}/${path.join("/")}`);
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
