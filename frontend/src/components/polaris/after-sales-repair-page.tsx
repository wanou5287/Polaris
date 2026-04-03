"use client";

import {
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/polaris/page-header";

const repairSummary = [
  { title: "待接收", value: "6", hint: "今日新流入 2 单", icon: ClipboardList },
  { title: "维修中", value: "9", hint: "其中 3 单需备件", icon: Wrench },
  { title: "待复检", value: "4", hint: "优先处理超 24h 工单", icon: ShieldCheck },
  { title: "风险提醒", value: "2", hint: "1 单逾期 / 1 单待升级", icon: AlertTriangle },
];

const repairTickets = [
  {
    no: "WX20260331001",
    device: "学习平板 Lite 64G",
    issue: "屏幕触控异常，需更换模组",
    status: "待接收",
    owner: "小海涛",
    warehouse: "杭州售后维修仓",
  },
  {
    no: "WX20260331002",
    device: "TAB-PRO 256G",
    issue: "主板返修检测中",
    status: "维修中",
    owner: "小海涛",
    warehouse: "杭州售后维修仓",
  },
  {
    no: "WX20260331003",
    device: "AI 学习机 S2",
    issue: "更换电池后待复检",
    status: "待复检",
    owner: "质检协同",
    warehouse: "萧山返修仓",
  },
];

const statusClassName: Record<string, string> = {
  待接收: "border-slate-200 bg-slate-100 text-slate-700",
  维修中: "border-sky-200 bg-sky-50 text-sky-700",
  待复检: "border-amber-200 bg-amber-50 text-amber-700",
  已完结: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function AfterSalesRepairPage() {
  return (
    <div className="space-y-6" data-page="after-sales-repair">
      <PageHeader
        eyebrow="OPERATIONS"
        title="售后维修"
        description="集中处理维修接收、维修进度、复检节奏和返还闭环，让售后维修角色登录后直接进入专属工作台。"
        badge="专属模块"
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {repairSummary.map((item) => (
          <Card
            key={item.title}
            className="rounded-[24px] border-border/80 bg-white/96 shadow-[var(--shadow-card)]"
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {item.title}
                </CardTitle>
                <div className="flex size-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <item.icon className="size-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold tracking-tight text-foreground">
                {item.value}
              </p>
              <p className="text-sm text-muted-foreground">{item.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[28px] border-border/80 bg-white/96 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">维修工单池</CardTitle>
            <p className="text-sm text-muted-foreground">
              登录后优先处理维修接收、在修工单和待复检任务，保持售后维修链路节奏稳定。
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {repairTickets.map((ticket) => (
              <div
                key={ticket.no}
                className="rounded-[24px] border border-border/70 bg-white px-5 py-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{ticket.no}</p>
                    <p className="mt-1 text-base font-medium text-foreground">{ticket.device}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{ticket.issue}</p>
                  </div>
                  <Badge
                    className={`rounded-full border px-3 py-1 text-xs font-medium shadow-none ${statusClassName[ticket.status] ?? "border-border/70 bg-white text-muted-foreground"}`}
                  >
                    {ticket.status}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <p>处理人：{ticket.owner}</p>
                  <p>维修仓：{ticket.warehouse}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-border/80 bg-white/96 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">今日动作</CardTitle>
              <p className="text-sm text-muted-foreground">
                把维修角色最常用的动作集中在一个面板里，减少跨页查找成本。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                "先处理待接收单，确认设备、故障与责任归属。",
                "维修中工单同步备件需求与预计完结时间。",
                "待复检工单优先清理超过 24 小时的积压。",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[22px] border border-border/70 bg-muted/20 px-4 py-4 text-sm leading-6 text-foreground"
                >
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 bg-white/96 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">班次提醒</CardTitle>
              <p className="text-sm text-muted-foreground">
                这块会作为后续接入真实维修单据和返修进度的固定承载区。
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                当前有 1 单主板返修已接近承诺时限，建议优先处理。
              </div>
              <div className="rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-800">
                今日维修产能建议：优先清理待复检，再回收新流入工单。
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
