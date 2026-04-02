"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

function resolveAfterSalesUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_AFTER_SALES_INVENTORY_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  return `${window.location.origin}/after-sales-app/`;
}

export default function AfterSalesEntryPage() {
  const [targetUrl, setTargetUrl] = useState("");

  useEffect(() => {
    const nextUrl = resolveAfterSalesUrl();
    setTargetUrl(nextUrl);
    window.location.replace(nextUrl);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="surface-panel max-w-xl space-y-4 px-8 py-10 text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          After-Sales
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          正在进入售后库存
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          即将跳转到售后库存独立系统。该模块使用自己的账号登录，不依赖当前北极星主系统登录态。
        </p>
        <div className="pt-2">
          <Button asChild className="rounded-full px-6">
            <a href={targetUrl || "#"}>继续前往售后库存</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
