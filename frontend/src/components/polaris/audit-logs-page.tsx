"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, formatDateTime, formatNumber } from "@/lib/polaris-client";
import type { AuditLogItem, AuditLogResponse } from "@/lib/polaris-types";

async function requestAuditLogs(params: URLSearchParams) {
  return apiFetch<AuditLogResponse>(`/api/backend/audit-logs?${params.toString()}`);
}

export function AuditLogsPage() {
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleKey, setModuleKey] = useState("all");
  const [resultStatus, setResultStatus] = useState("all");
  const [actor, setActor] = useState("");
  const [keyword, setKeyword] = useState("");
  const [limit, setLimit] = useState("50");
  const [selected, setSelected] = useState<AuditLogItem | null>(null);

  async function loadLogs() {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (moduleKey !== "all") params.set("module_key", moduleKey);
      if (resultStatus !== "all") params.set("result_status", resultStatus);
      if (actor.trim()) params.set("actor", actor.trim());
      if (keyword.trim()) params.set("keyword", keyword.trim());
      params.set("limit", limit);

      const response = await requestAuditLogs(params);
      setData(response);
      setSelected((current) => current ?? response.items[0] ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "审计日志加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (moduleKey !== "all") params.set("module_key", moduleKey);
        if (resultStatus !== "all") params.set("result_status", resultStatus);
        params.set("limit", limit);
        const response = await requestAuditLogs(params);
        if (!cancelled) {
          setData(response);
          setSelected(response.items[0] ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "审计日志加载失败");
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
  }, [moduleKey, resultStatus, limit]);

  const successCount =
    data?.items.filter((item) => item.result_status === "success").length ?? 0;
  const failedCount =
    data?.items.filter((item) => item.result_status === "failed").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-3">
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">结果总数</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {formatNumber(data?.items.length ?? null)}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">成功</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {formatNumber(successCount)}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">失败</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {formatNumber(failedCount)}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_0.9fr_0.8fr_1fr_0.6fr_auto]">
            <Select value={moduleKey} onValueChange={setModuleKey}>
              <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                <SelectValue placeholder="模块" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模块</SelectItem>
                {data?.module_options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={resultStatus} onValueChange={setResultStatus}>
              <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {data?.status_options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="触发人"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              className="h-11 rounded-2xl border-border/80 bg-white"
            />
            <Input
              placeholder="关键字"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="h-11 rounded-2xl border-border/80 bg-white"
            />
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                <SelectValue placeholder="条数" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20 条</SelectItem>
                <SelectItem value="50">50 条</SelectItem>
                <SelectItem value="100">100 条</SelectItem>
              </SelectContent>
            </Select>
            <Button className="cta-button h-11 rounded-2xl" onClick={() => void loadLogs()}>
              查询
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">日志结果</CardTitle>
            <p className="text-sm text-muted-foreground">
              点击任意一行可在右侧查看完整上下文。
            </p>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="h-[560px] rounded-[22px] border border-border/70 bg-muted/30" />
            ) : data?.items.length ? (
              <div className="surface-table overflow-hidden">
                <ScrollArea className="h-[560px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>模块</TableHead>
                        <TableHead>动作</TableHead>
                        <TableHead>结果</TableHead>
                        <TableHead>触发人</TableHead>
                        <TableHead>时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((item) => (
                        <TableRow
                          key={item.id}
                          className="cursor-pointer"
                          onClick={() => setSelected(item)}
                        >
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">
                                {item.module_name || item.module_key}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.target_type || "target"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[260px]">
                            <p className="truncate text-sm text-foreground">
                              {item.action_name || item.action_key}
                            </p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {item.detail_summary || "无摘要"}
                            </p>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.result_status}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.triggered_by || "系统"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(item.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            ) : (
              <Empty className="border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Activity className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>当前筛选下没有日志</EmptyTitle>
                  <EmptyDescription>可以调整筛选条件后再查一次。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">日志详情</CardTitle>
            <p className="text-sm text-muted-foreground">
              针对单条日志查看来源接口、影响范围与原始 detail 结构。
            </p>
          </CardHeader>
          <CardContent>
            {selected ? (
              <div className="space-y-4">
                <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                  <p className="text-sm font-medium text-foreground">
                    {selected.action_name || selected.action_key}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {selected.detail_summary || "无摘要说明"}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                    <p className="text-xs text-muted-foreground">模块</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selected.module_name || selected.module_key}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                    <p className="text-xs text-muted-foreground">结果</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selected.result_status}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                    <p className="text-xs text-muted-foreground">触发人</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selected.triggered_by || "系统"}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                    <p className="text-xs text-muted-foreground">影响条数</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {formatNumber(selected.affected_count ?? null)}
                    </p>
                  </div>
                </div>
                <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                  <p className="text-xs text-muted-foreground">来源接口</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {selected.source_method || "METHOD"} {selected.source_path || "未记录"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    时间 {formatDateTime(selected.created_at)}
                  </p>
                </div>
                <div className="rounded-[22px] border border-border/70 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                  <pre className="overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(selected.detail ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <Empty className="border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Activity className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>选择一条日志</EmptyTitle>
                  <EmptyDescription>
                    右侧会展开完整的上下文、来源接口和 detail 内容。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
