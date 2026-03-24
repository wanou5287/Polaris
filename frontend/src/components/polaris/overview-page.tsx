"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Bot, RefreshCcw, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from "recharts";

import { overviewQuickLinks } from "@/components/polaris/nav-config";
import { PageHeader } from "@/components/polaris/page-header";
import { TransitionLink } from "@/components/polaris/transition-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, formatCompactNumber, formatDateTime, formatNumber } from "@/lib/polaris-client";
import type { OverviewResponse } from "@/lib/polaris-types";

const chartConfig = {
  count: {
    label: "报表数量",
    color: "#93c5fd",
  },
  value: {
    label: "审计条数",
    color: "#27272a",
  },
};

async function requestOverviewData() {
  return apiFetch<OverviewResponse>("/api/overview");
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="surface-panel p-6">
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="mt-4 h-10 w-72 rounded-2xl" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full rounded-full" />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="rounded-[22px] border-border/80 shadow-[var(--shadow-card)]">
            <CardHeader className="space-y-3 pb-2">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-8 w-28 rounded-2xl" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-24 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOverview(showRefreshing = false) {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiFetch<OverviewResponse>("/api/overview");
      setData(response);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "总览数据加载失败",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      try {
        const response = await requestOverviewData();
        if (!cancelled) {
          setData(response);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "总览数据加载失败",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !data) {
    return <OverviewSkeleton />;
  }

  if (!data) {
    return (
      <div className="surface-panel p-10">
        <Empty className="border-border/70">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot className="size-4" />
            </EmptyMedia>
            <EmptyTitle>总览数据暂时不可用</EmptyTitle>
            <EmptyDescription>{error || "请稍后刷新重试。"}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" className="rounded-full" onClick={() => void loadOverview()}>
            <RefreshCcw className="size-4" />
            重新加载
          </Button>
        </Empty>
      </div>
    );
  }

  const latestReport = data.reports.items[0];

  return (
    <div className="space-y-6">
      <div className="surface-panel p-6 sm:p-8">
        <PageHeader
          eyebrow="Workspace"
          title="北极星总览"
          description="这个工作台只保留底层能力的产品化入口。你可以在这里快速感知治理进度、运营风险以及 DataAgent 的可用状态。"
          badge="新前端首屏"
          actions={
            <>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => void loadOverview(true)}
                disabled={refreshing}
              >
                <RefreshCcw className={refreshing ? "size-4 animate-spin" : "size-4"} />
                刷新数据
              </Button>
              <TransitionLink href="/analysis/data-agent">
                <Button className="cta-button rounded-full">
                  <Bot className="size-4" />
                  进入 DataAgent
                </Button>
              </TransitionLink>
            </>
          }
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              指标口径
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {formatNumber(data.metricSummary.active_count)}
            </p>
            <p className="text-sm text-muted-foreground">
              已启用 / 总数 {formatNumber(data.metricSummary.total_count)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              主数据对象
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {formatCompactNumber(data.masterSummary.sku_count)}
            </p>
            <p className="text-sm text-muted-foreground">
              SKU {formatNumber(data.masterSummary.sku_count)} / 仓库{" "}
              {formatNumber(data.masterSummary.warehouse_count)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              审计留痕
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {formatNumber(data.auditSummary.total)}
            </p>
            <p className="text-sm text-muted-foreground">
              成功 {formatNumber(data.auditSummary.success)} / 失败{" "}
              {formatNumber(data.auditSummary.failed)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              DataAgent 状态
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {data.agentStatus.api_online ? "在线" : "待启动"}
            </p>
            <p className="text-sm text-muted-foreground">
              仓库 {data.agentStatus.repo_present ? "已接入" : "未接入"} / 配置{" "}
              {data.agentStatus.config_ready ? "就绪" : "待补充"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">报表生成节奏</CardTitle>
            <p className="text-sm text-muted-foreground">
              以 DataAgent 已生成的周报 / 月报为基线，观察运营分析输出频率。
            </p>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={chartConfig}
              className="h-[280px] w-full"
            >
              <LineChart
                accessibilityLayer
                data={data.reports.series}
                margin={{ left: 12, right: 12, top: 8 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-reports)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-reports)" }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">快速入口</CardTitle>
            <p className="text-sm text-muted-foreground">
              从治理到分析，直接进入当前最关键的底层能力模块。
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {overviewQuickLinks.map((link) => (
              <TransitionLink
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-[22px] border border-border/80 bg-white px-4 py-4 transition hover:shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-muted text-foreground">
                    <link.icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{link.title}</p>
                    <p className="text-xs text-muted-foreground">打开新的工作台视图</p>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </TransitionLink>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">最近审计动作</CardTitle>
            <p className="text-sm text-muted-foreground">
              平台近期的治理动作和任务执行结果留痕。
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.auditSummary.latestItems.length ? (
              data.auditSummary.latestItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-border/70 bg-white px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.action_name || item.action_key}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.module_name || item.module_key} ·{" "}
                        {item.triggered_by || "系统触发"}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{item.result_status}</p>
                      <p className="mt-1">{formatDateTime(item.created_at)}</p>
                    </div>
                  </div>
                  {item.detail_summary ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {item.detail_summary}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">暂未获取到近期审计记录。</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">审计模块分布</CardTitle>
              <p className="text-sm text-muted-foreground">
                当前留痕较多的模块，能帮助团队判断哪里最活跃。
              </p>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={data.auditSummary.moduleBreakdown} margin={{ left: 12, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="dot" />}
                  />
                  <Bar dataKey="value" fill="var(--color-modules)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">分析代理状态</CardTitle>
              <p className="text-sm text-muted-foreground">
                DataAgent 的仓库接入、API 在线情况和最近报表输出。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {data.agentStatus.display_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      API {data.agentStatus.api_online ? "在线" : "离线"} · UI{" "}
                      {data.agentStatus.ui_online ? "在线" : "离线"}
                    </p>
                  </div>
                  <ShieldCheck className="size-5 text-foreground" />
                </div>
              </div>
              <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                <p className="text-sm font-medium text-foreground">最近输出</p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                  {latestReport?.title || "暂无自动分析报表"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {latestReport
                    ? `最近一份 ${latestReport.report_type === "weekly" ? "周报" : "月报"} 创建于 ${formatDateTime(latestReport.created_at)}。`
                    : "当前还没有可展示的 DataAgent 报表。"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                  <p className="text-xs text-muted-foreground">周报数量</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {formatNumber(data.reports.weeklyCount)}
                  </p>
                </div>
                <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                  <p className="text-xs text-muted-foreground">月报数量</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {formatNumber(data.reports.monthlyCount)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
