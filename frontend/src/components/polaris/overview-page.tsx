"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Bot, RefreshCcw, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from "recharts";

import { overviewQuickLinks } from "@/components/polaris/nav-config";
import { TransitionLink } from "@/components/polaris/transition-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { canAccessPermission } from "@/lib/polaris-access";
import {
  apiFetch,
  formatCompactNumber,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/polaris-client";
import type { OverviewResponse } from "@/lib/polaris-types";

const chartConfig = {
  count: {
    label: "报告数量",
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
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card
            key={index}
            className="rounded-[22px] border-border/80 shadow-[var(--shadow-card)]"
          >
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
      const response = await requestOverviewData();
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
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => void loadOverview()}
          >
            <RefreshCcw className="size-4" />
            重新加载
          </Button>
        </Empty>
      </div>
    );
  }

  const latestReport = data.reports.items[0];
  const canViewAuditLogs = Boolean(data.currentUser?.is_admin);
  const visibleQuickLinks = overviewQuickLinks.filter((link) =>
    canAccessPermission(data.currentUser, link.permissionKey, link.adminOnly),
  );

  return (
    <div className="space-y-6">
      <div
        className={`grid gap-5 md:grid-cols-2 ${canViewAuditLogs ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}
      >
        <SummaryCard
          title="BI 看板"
          value={formatNumber(data.metricSummary.active_count)}
          hint={`已启用 / 总数 ${formatNumber(data.metricSummary.total_count)}`}
        />
        <SummaryCard
          title="基础数据"
          value={formatCompactNumber(data.masterSummary.sku_count)}
          hint={`SKU ${formatNumber(data.masterSummary.sku_count)} / 仓库 ${formatNumber(data.masterSummary.warehouse_count)}`}
        />
        <SummaryCard
          title="任务中心"
          value={formatNumber(data.taskCenterSummary.open_count + data.taskCenterSummary.blocked_count)}
          hint={`待处理 ${formatNumber(data.taskCenterSummary.open_count)} / 阻塞 ${formatNumber(data.taskCenterSummary.blocked_count)}`}
        />
        <SummaryCard
          title="对账补偿"
          value={formatNumber(data.reconciliationSummary.open_count + data.reconciliationSummary.compensating_count)}
          hint={`高严重 ${formatNumber(data.reconciliationSummary.high_severity_count)} / 逾期 ${formatNumber(data.reconciliationSummary.overdue_count)}`}
        />
        {canViewAuditLogs ? (
          <SummaryCard
            title="审计留痕"
            value={formatNumber(data.auditSummary.total)}
            hint={`成功 ${formatNumber(data.auditSummary.success)} / 失败 ${formatNumber(data.auditSummary.failed)}`}
          />
        ) : null}
        <SummaryCard
          title="智能助手"
          value={data.agentStatus.api_online ? "在线" : "待启动"}
          hint={`仓库 ${data.agentStatus.repo_present ? "已接入" : "未接入"} / 配置 ${data.agentStatus.config_ready ? "就绪" : "待补全"}`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">报表生成节奏</CardTitle>
            <p className="text-sm text-muted-foreground">
              以小北·数据分析 Agent 已生成的周报和月报为基础，观察分析输出频率。
            </p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
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
            <CardTitle className="text-lg">快速入口与重点待办</CardTitle>
            <p className="text-sm text-muted-foreground">
              从治理到执行，优先进入可访问模块，再查看统一任务中心的最新动作。
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {visibleQuickLinks.map((link) => (
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
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </TransitionLink>
            ))}
            <ListBlock
              title="任务中心最新待办"
              hint={`最近同步于 ${formatDateTime(data.taskCenterSummary.latest_updated_at)}`}
              count={data.taskCenterSummary.latestItems.length}
              emptyText="当前还没有可展示的统一待办。"
              items={data.taskCenterSummary.latestItems.map((item) => ({
                key: String(item.id),
                title: item.task_title,
                subtitle: `${item.source_module_label} / ${item.source_no}`,
                status: item.task_status_label,
                date: formatDate(item.due_date),
              }))}
            />
            <ListBlock
              title="对账补偿最新案例"
              hint={`最近同步于 ${formatDateTime(data.reconciliationSummary.latest_updated_at)}`}
              count={data.reconciliationSummary.latestItems.length}
              emptyText="当前还没有可展示的对账案例。"
              items={data.reconciliationSummary.latestItems.map((item) => ({
                key: String(item.id),
                title: item.case_title,
                subtitle: `${item.case_type_label} / ${item.source_no}`,
                status: item.case_status_label,
                date: formatDate(item.due_date),
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div
        className={`grid gap-6 ${canViewAuditLogs ? "xl:grid-cols-[0.92fr_1.08fr]" : "xl:grid-cols-1"}`}
      >
        {canViewAuditLogs ? (
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
                          {(item.module_name || item.module_key) + " / " + (item.triggered_by || "系统触发")}
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
                <p className="text-sm text-muted-foreground">暂无审计记录。</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className={`grid gap-6 ${canViewAuditLogs ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {canViewAuditLogs ? (
            <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg">审计模块分布</CardTitle>
                <p className="text-sm text-muted-foreground">
                  当前留痕较多的模块，帮助管理员判断哪些区域最活跃。
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
          ) : null}

          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">分析代理状态</CardTitle>
              <p className="text-sm text-muted-foreground">
                小北·数据分析 Agent 的在线状态和最近报告输出。
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
                      API {data.agentStatus.api_online ? "在线" : "离线"} / UI{" "}
                      {data.agentStatus.ui_online ? "在线" : "离线"}
                    </p>
                  </div>
                  <ShieldCheck className="size-5 text-foreground" />
                </div>
              </div>
              <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                <p className="text-sm font-medium text-foreground">最近输出</p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                  {latestReport?.title || "暂无自动分析报告"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {latestReport
                    ? `最近一份${latestReport.report_type === "weekly" ? "周报" : "月报"}创建于 ${formatDateTime(latestReport.created_at)}。`
                    : "当前还没有可展示的智能分析报告。"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat title="周报数量" value={formatNumber(data.reports.weeklyCount)} />
                <MiniStat title="月报数量" value={formatNumber(data.reports.monthlyCount)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => void loadOverview(true)}
          disabled={refreshing}
        >
          <RefreshCcw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          刷新总览
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ListBlock({
  title,
  hint,
  count,
  items,
  emptyText,
}: {
  title: string;
  hint: string;
  count: number;
  items: Array<{
    key: string;
    title: string;
    subtitle: string;
    status: string;
    date: string;
  }>;
  emptyText: string;
}) {
  return (
    <div className="rounded-[24px] border border-border/80 bg-muted/20 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="rounded-full border border-border/70 bg-white px-3 py-1 text-xs text-muted-foreground">
          {formatNumber(count)} 条
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.key}
              className="rounded-[20px] border border-border/70 bg-white px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.subtitle}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{item.status}</p>
                  <p className="mt-1">{item.date}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
