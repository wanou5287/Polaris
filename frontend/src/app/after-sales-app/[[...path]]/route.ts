import { promises as fs } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_AFTER_SALES_DIST = "D:/Polaris__after_sales_branch/apps/web/dist";
const AFTER_SALES_INDEX = "index.html";
const AFTER_SALES_PROXY_PREFIX = "/after-sales-api";
const AFTER_SALES_FETCH_PATCH = String.raw`
<script>
(function () {
  var originalFetch = window.fetch;
  if (typeof originalFetch !== "function") return;

  function toProxyUrl(value) {
    try {
      var url = value instanceof URL ? value : new URL(String(value), window.location.origin);
      var sameHost =
        url.hostname === window.location.hostname ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "localhost";

      if (!sameHost || url.port !== "3210") {
        return null;
      }

      return "${AFTER_SALES_PROXY_PREFIX}" + url.pathname + url.search;
    } catch {
      return null;
    }
  }

  window.fetch = function (input, init) {
    if (typeof input === "string" || input instanceof URL) {
      var rewritten = toProxyUrl(input);
      return originalFetch.call(this, rewritten || input, init);
    }

    if (input instanceof Request) {
      var rewrittenRequestUrl = toProxyUrl(input.url);
      if (!rewrittenRequestUrl) {
        return originalFetch.call(this, input, init);
      }

      var rewrittenRequest = new Request(rewrittenRequestUrl, input);
      return originalFetch.call(this, rewrittenRequest, init);
    }

    return originalFetch.call(this, input, init);
  };
})();
</script>
`;

function getAfterSalesDistRoot() {
  return (
    process.env.POLARIS_AFTER_SALES_WEB_DIST?.trim() ||
    DEFAULT_AFTER_SALES_DIST
  );
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    case ".csv":
      return "text/csv; charset=utf-8";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

function injectAfterSalesFetchPatch(html: string) {
  if (html.includes(AFTER_SALES_FETCH_PATCH)) {
    return html;
  }

  if (html.includes("</head>")) {
    return html.replace("</head>", `${AFTER_SALES_FETCH_PATCH}</head>`);
  }

  if (html.includes("<body")) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${AFTER_SALES_FETCH_PATCH}`);
  }

  return `${AFTER_SALES_FETCH_PATCH}${html}`;
}

async function resolveFilePath(request: NextRequest) {
  const distRoot = getAfterSalesDistRoot();
  const pathname = request.nextUrl.pathname.replace(/^\/after-sales-app\/?/, "");
  const safeSegments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/\\/g, ""));

  const requestedPath = path.join(distRoot, ...safeSegments);

  try {
    const stats = await fs.stat(requestedPath);
    if (stats.isFile()) {
      return requestedPath;
    }
  } catch {
    // Fall back to SPA index file below.
  }

  return path.join(distRoot, AFTER_SALES_INDEX);
}

async function serveAfterSales(request: NextRequest) {
  const filePath = await resolveFilePath(request);
  const contentType = contentTypeFor(filePath);
  const isHtml = filePath.endsWith(".html");
  const body = isHtml
    ? Buffer.from(injectAfterSalesFetchPatch(await fs.readFile(filePath, "utf8")), "utf8")
    : await fs.readFile(filePath);

  return new NextResponse(body, {
    headers: {
      "content-type": contentType,
      "cache-control": filePath.endsWith(".html")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    },
  });
}

export async function GET(request: NextRequest) {
  return serveAfterSales(request);
}

export async function HEAD(request: NextRequest) {
  const response = await serveAfterSales(request);
  return new NextResponse(null, {
    status: response.status,
    headers: response.headers,
  });
}
