import { NextRequest, NextResponse } from "next/server";

const AFTER_SALES_API_BASE_URL =
  process.env.POLARIS_AFTER_SALES_API_BASE_URL?.trim() ||
  "http://127.0.0.1:3210";

function buildTargetUrl(pathSegments: string[], search: string) {
  const pathname = pathSegments.join("/").replace(/^\/+/, "");
  const normalizedPath = pathname.startsWith("api/") ? pathname : `api/${pathname}`;
  const baseUrl = AFTER_SALES_API_BASE_URL.replace(/\/+$/, "");
  return `${baseUrl}/${normalizedPath}${search}`;
}

async function proxyAfterSalesApi(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const targetUrl = buildTargetUrl(path, request.nextUrl.search);
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: request.method,
      body,
      headers: {
        Accept: request.headers.get("accept") ?? "*/*",
        ...(request.headers.get("authorization")
          ? { Authorization: request.headers.get("authorization")! }
          : {}),
        ...(request.headers.get("content-type")
          ? { "Content-Type": request.headers.get("content-type")! }
          : {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "售后服务暂未启动，请先拉起本地售后 API 后再重试。",
        targetUrl,
        error:
          error instanceof Error ? error.message : "Unknown after-sales proxy error",
      },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAfterSalesApi(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAfterSalesApi(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAfterSalesApi(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAfterSalesApi(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAfterSalesApi(request, context);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyAfterSalesApi(request, context);
}
