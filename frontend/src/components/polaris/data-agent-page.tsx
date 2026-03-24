"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  RefreshCcw,
  SendHorizonal,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/polaris/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  apiFetch,
  formatDateTime,
  formatNumber,
} from "@/lib/polaris-client";
import type {
  DataAgentChatResponse,
  DataAgentReport,
  DataAgentReportsResponse,
  DataAgentStatus,
} from "@/lib/polaris-types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export function DataAgentPage() {
  const [status, setStatus] = useState<DataAgentStatus | null>(null);
  const [reports, setReports] = useState<DataAgentReport[]>([]);
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState<"weekly" | "monthly" | null>(null);
  const [prompt, setPrompt] = useState("请结合当前报表给我一个经营异常摘要");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "你好，我已经接入北极星新的分析工作台。你可以直接向我提问经营异常、库存风险或报表总结。",
      createdAt: new Date().toISOString(),
    },
  ]);

  async function loadAgentData() {
    try {
      const [statusPayload, reportsPayload] = await Promise.all([
        apiFetch<DataAgentStatus>("/api/backend/data-agent/status"),
        apiFetch<DataAgentReportsResponse>("/api/backend/data-agent/reports?limit=8"),
      ]);
      setStatus(statusPayload);
      setReports(reportsPayload.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "DataAgent 数据加载失败");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [statusPayload, reportsPayload] = await Promise.all([
          apiFetch<DataAgentStatus>("/api/backend/data-agent/status"),
          apiFetch<DataAgentReportsResponse>("/api/backend/data-agent/reports?limit=8"),
        ]);
        if (!cancelled) {
          setStatus(statusPayload);
          setReports(reportsPayload.items);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "DataAgent 数据加载失败");
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  async function sendMessage() {
    if (!prompt.trim()) {
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: prompt.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setChatSubmitting(true);

    try {
      const response = await apiFetch<DataAgentChatResponse>(
        "/api/backend/data-agent/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message: userMessage.content,
            session_id: sessionId,
          }),
        },
      );
      setSessionId(response.session_id);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.answer,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提问失败");
    } finally {
      setChatSubmitting(false);
    }
  }

  async function generateReport(reportType: "weekly" | "monthly") {
    setReportSubmitting(reportType);
    try {
      const response = await apiFetch<{ item: DataAgentReport }>(
        "/api/backend/data-agent/reports/generate",
        {
          method: "POST",
          body: JSON.stringify({ report_type: reportType }),
        },
      );
      setReports((current) => [response.item, ...current]);
      toast.success(`${reportType === "weekly" ? "周报" : "月报"}生成成功`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "报表生成失败");
    } finally {
      setReportSubmitting(null);
    }
  }

  const capabilityGroups =
    status && !Array.isArray(status.capabilities)
      ? Object.entries(status.capabilities)
      : [];

  return (
    <div className="space-y-6">
      <div className="surface-panel p-6 sm:p-8">
        <PageHeader
          eyebrow="Analysis"
          title="DataAgent 工作台"
          description="新的分析入口把代理状态、问答和自动报表统一到一屏里。团队无需再切旧壳层和外部说明页，直接围绕能力本身工作。"
          badge={status?.api_online ? "API 在线" : "API 待启动"}
          actions={
            <>
              <Button variant="outline" className="rounded-full" onClick={() => void loadAgentData()}>
                <RefreshCcw className="size-4" />
                刷新状态
              </Button>
              <Button className="cta-button rounded-full" onClick={() => generateReport("weekly")} disabled={reportSubmitting !== null}>
                <Sparkles className="size-4" />
                生成周报
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">仓库状态</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {status?.repo_present ? "已接入" : "未接入"}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">配置状态</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {status?.config_ready ? "就绪" : "待补充"}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已生成报表</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {formatNumber(reports.length)}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">会话状态</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {sessionId ? "进行中" : "空闲"}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.76fr_1.24fr]">
        <div className="space-y-6">
          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">代理状态</CardTitle>
              <p className="text-sm text-muted-foreground">
                当前接入仓库、API 和 UI 的可用性一览。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                <p className="text-sm font-medium text-foreground">
                  {status?.display_name || "DataAgent"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {status?.integration_note || "状态加载中"}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                  <p className="text-xs text-muted-foreground">API</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {status?.api_online ? "在线" : "离线"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                  <p className="text-xs text-muted-foreground">UI</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {status?.ui_online ? "在线" : "离线"}
                  </p>
                </div>
              </div>
              <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                <p className="text-xs text-muted-foreground">启动步骤</p>
                <div className="mt-3 space-y-2">
                  {(status?.startup_steps || []).map((step, index) => (
                    <div key={`${step}-${index}`} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="mt-0.5 text-foreground">{index + 1}.</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
              {capabilityGroups.length ? (
                <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
                  <p className="text-xs text-muted-foreground">能力分组</p>
                  <div className="mt-3 space-y-4">
                    {capabilityGroups.map(([group, items]) => (
                      <div key={group}>
                        <p className="text-sm font-medium text-foreground">{group}</p>
                        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                          {items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">报表输出</CardTitle>
              <p className="text-sm text-muted-foreground">
                保留最近生成的周报与月报，方便复盘与分享。
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => generateReport("weekly")}
                  disabled={reportSubmitting !== null}
                >
                  {reportSubmitting === "weekly" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <WandSparkles className="size-4" />
                  )}
                  生成周报
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => generateReport("monthly")}
                  disabled={reportSubmitting !== null}
                >
                  {reportSubmitting === "monthly" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <WandSparkles className="size-4" />
                  )}
                  生成月报
                </Button>
              </div>
              <ScrollArea className="h-[420px]">
                <div className="space-y-3 pr-4">
                  {reports.length ? (
                    reports.map((report) => (
                      <div
                        key={report.id}
                        className="rounded-[22px] border border-border/70 bg-white px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {report.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {report.report_type} · {report.period_label} ·{" "}
                              {formatDateTime(report.created_at)}
                            </p>
                          </div>
                          <div className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                            {report.status}
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">
                          {report.report_content}
                        </p>
                      </div>
                    ))
                  ) : (
                    <Empty className="border-border/70">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Sparkles className="size-4" />
                        </EmptyMedia>
                        <EmptyTitle>还没有可展示的报表</EmptyTitle>
                        <EmptyDescription>先生成一份周报或月报试试。</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">分析对话</CardTitle>
            <p className="text-sm text-muted-foreground">
              围绕经营异常、库存风险和报表摘要直接向 DataAgent 提问。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-[520px] rounded-[22px] border border-border/70 bg-white px-4 py-4">
              <div className="space-y-4 pr-2">
                {messages.map((message, index) => (
                  <div
                    key={`${message.createdAt}-${index}`}
                    className={`max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-7 ${
                      message.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted/70 text-foreground"
                    }`}
                  >
                    <p>{message.content}</p>
                    <p
                      className={`mt-2 text-[11px] ${
                        message.role === "user"
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatDateTime(message.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="rounded-[24px] border border-border/80 bg-white/80 p-4">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-[120px] rounded-[20px] border-border/80 bg-white"
                placeholder="输入你想让 DataAgent 分析的问题..."
              />
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  当前会话 {sessionId ? "已建立" : "未建立"}，支持连续追问。
                </p>
                <Button className="cta-button rounded-full" onClick={sendMessage} disabled={chatSubmitting}>
                  {chatSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <SendHorizonal className="size-4" />
                  )}
                  发送问题
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
