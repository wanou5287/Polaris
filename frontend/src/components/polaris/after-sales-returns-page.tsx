"use client";

import { startTransition, type ReactNode, useDeferredValue, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  PackageSearch,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/polaris/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, cn, formatDate, formatDateTime, formatNumber } from "@/lib/polaris-client";
import type {
  AfterSalesCase,
  AfterSalesWorkbenchResponse,
  Option,
  ReturnUnpackAttendanceSummary,
} from "@/lib/polaris-types";

function todayOffset(offset = 0) {
  const current = new Date();
  current.setDate(current.getDate() + offset);
  return current.toISOString().slice(0, 10);
}

function numberFromInput(value: string) {
  if (!value.trim()) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createDraft(response?: AfterSalesWorkbenchResponse): AfterSalesCase {
  const warehouse = response?.warehouse_options[0];
  const channel = response?.channel_options[0];
  return {
    id: 0,
    case_no: "",
    order_no: "",
    reverse_type: "return_refund",
    reverse_type_label: "退货退款",
    status: "submitted",
    status_label: "待收件",
    severity: "normal",
    severity_label: "中优先级",
    channel_code: channel?.value ?? "",
    channel_name: channel?.label ?? "",
    shop_name: "",
    sku_code: "",
    sku_name: "",
    request_qty: 0,
    received_qty: 0,
    pending_receive_qty: 0,
    receive_rate: 0,
    refund_amount: 0,
    issue_category: "",
    reverse_warehouse_code: warehouse?.value ?? "",
    reverse_warehouse_name: warehouse?.label ?? "",
    intake_date: todayOffset(0),
    promised_finish_date: todayOffset(2),
    owner_name: "",
    owner_role: "售后运营",
    customer_reason: "",
    diagnosis_result: "",
    action_plan: "",
    note: "",
    sort_order: 100,
    created_by: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
    aging_days: 0,
    is_overdue: false,
  };
}

async function requestWorkbench(params: URLSearchParams) {
  return apiFetch<AfterSalesWorkbenchResponse>(`/api/backend/after-sales-workbench?${params.toString()}`);
}

const statusMeta: Record<string, { label: string; className: string }> = {
  submitted: { label: "待收件", className: "border-border/80 bg-white text-muted-foreground" },
  received: { label: "已收件", className: "border-sky-200 bg-sky-50 text-sky-700" },
  diagnosing: { label: "质检诊断", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  refurbishing: { label: "翻新处理中", className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
  refund_pending: { label: "待退款", className: "border-amber-200 bg-amber-50 text-amber-700" },
  closed: { label: "已闭环", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  blocked: { label: "阻塞异常", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

const severityMeta: Record<string, { label: string; className: string }> = {
  high: { label: "高优先级", className: "border-rose-200 bg-rose-50 text-rose-700" },
  normal: { label: "中优先级", className: "border-border/80 bg-white text-muted-foreground" },
  low: { label: "低优先级", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const typeMeta: Record<string, { label: string; className: string }> = {
  return_refund: { label: "退货退款", className: "border-slate-200 bg-slate-100 text-slate-700" },
  refund_only: { label: "仅退款", className: "border-slate-200 bg-white text-foreground" },
  exchange: { label: "换货", className: "border-sky-200 bg-sky-50 text-sky-700" },
  repair: { label: "维修", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  reverse_refurb: { label: "退回翻新", className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
};

function SummaryCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-white text-foreground">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value,
  onValueChange,
  options,
  placeholder,
  allLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder: string;
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={`${placeholder}-${option.value}`} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TypeBadge({ value }: { value: string }) {
  const meta = typeMeta[value] ?? typeMeta.return_refund;
  return <Badge className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-none", meta.className)}>{meta.label}</Badge>;
}

function StatusBadge({ value }: { value: string }) {
  const meta = statusMeta[value] ?? statusMeta.submitted;
  return <Badge className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-none", meta.className)}>{meta.label}</Badge>;
}

function SeverityBadge({ value }: { value: string }) {
  const meta = severityMeta[value] ?? severityMeta.normal;
  return <Badge className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-none", meta.className)}>{meta.label}</Badge>;
}

function MetricMini({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className={cn("rounded-[18px] border px-3 py-3", active ? "border-white/10 bg-white/5" : "border-border/70 bg-muted/20")}>
      <p className={cn("text-[11px]", active ? "text-slate-300" : "text-muted-foreground")}>{label}</p>
      <p className={cn("mt-2 text-sm font-medium", active ? "text-white" : "text-foreground")}>{value}</p>
    </div>
  );
}

function LiveMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-border/80 bg-muted/20 px-4 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function AttendanceRow({ row }: { row: ReturnUnpackAttendanceSummary }) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{formatDate(row.biz_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">退货拆包与逆向入仓快照</p>
        </div>
        <Badge className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none">
          效率 {formatNumber(row.return_unpack_efficiency)}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricMini label="出勤" value={formatNumber(row.attendance_count)} active={false} />
        <MetricMini label="退货入仓" value={formatNumber(row.total_return_qty)} active={false} />
        <MetricMini label="销售退仓" value={formatNumber(row.sales_return_warehouse)} active={false} />
      </div>
    </div>
  );
}

export function AfterSalesReturnsPage() {
  const [data, setData] = useState<AfterSalesWorkbenchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<AfterSalesCase>(createDraft());
  const [startDate, setStartDate] = useState(todayOffset(-14));
  const [endDate, setEndDate] = useState(todayOffset(0));
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);

  async function loadWorkbench(nextSelectedId?: number | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        limit: "180",
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("reverse_type", typeFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (warehouseFilter !== "all") params.set("reverse_warehouse_code", warehouseFilter);
      if (deferredKeyword.trim()) params.set("keyword", deferredKeyword.trim());
      const response = await requestWorkbench(params);
      setData(response);
      startTransition(() => {
        const matched =
          response.items.find((item) => item.id === (nextSelectedId ?? selectedId)) ??
          response.items[0] ??
          createDraft(response);
        setSelectedId(matched.id > 0 ? matched.id : null);
        setDraft({ ...matched });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "逆向售后工作台加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkbench(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, statusFilter, typeFilter, severityFilter, warehouseFilter, deferredKeyword]);

  function updateDraft<K extends keyof AfterSalesCase>(key: K, value: AfterSalesCase[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectCase(item: AfterSalesCase) {
    startTransition(() => {
      setSelectedId(item.id);
      setDraft({ ...item });
    });
  }

  function startNewDraft() {
    startTransition(() => {
      setSelectedId(null);
      setDraft(createDraft(data ?? undefined));
    });
  }

  function updateWarehouse(nextValue: string) {
    if (nextValue === "__none") {
      setDraft((current) => ({ ...current, reverse_warehouse_code: "", reverse_warehouse_name: "" }));
      return;
    }
    const option = data?.warehouse_options.find((item) => item.value === nextValue);
    setDraft((current) => ({
      ...current,
      reverse_warehouse_code: nextValue,
      reverse_warehouse_name: option?.label ?? nextValue,
    }));
  }

  function updateChannel(nextValue: string) {
    if (nextValue === "__none") {
      setDraft((current) => ({ ...current, channel_code: "", channel_name: "" }));
      return;
    }
    const option = data?.channel_options.find((item) => item.value === nextValue);
    setDraft((current) => ({
      ...current,
      channel_code: nextValue,
      channel_name: option?.label ?? nextValue,
    }));
  }

  async function saveCase() {
    setSaving(true);
    try {
      const response = await apiFetch<{ saved: boolean; created: boolean; item: AfterSalesCase }>("/api/backend/after-sales-workbench/cases", {
        method: "POST",
        body: JSON.stringify({
          id: draft.id,
          case_no: draft.case_no,
          order_no: draft.order_no,
          reverse_type: draft.reverse_type,
          status: draft.status,
          severity: draft.severity,
          channel_code: draft.channel_code,
          channel_name: draft.channel_name,
          shop_name: draft.shop_name,
          sku_code: draft.sku_code,
          sku_name: draft.sku_name,
          request_qty: draft.request_qty,
          received_qty: draft.received_qty,
          refund_amount: draft.refund_amount,
          issue_category: draft.issue_category,
          reverse_warehouse_code: draft.reverse_warehouse_code,
          reverse_warehouse_name: draft.reverse_warehouse_name,
          intake_date: draft.intake_date,
          promised_finish_date: draft.promised_finish_date,
          owner_name: draft.owner_name,
          owner_role: draft.owner_role,
          customer_reason: draft.customer_reason,
          diagnosis_result: draft.diagnosis_result,
          action_plan: draft.action_plan,
          note: draft.note,
          sort_order: draft.sort_order,
        }),
      });
      toast.success(response.created ? "逆向售后工单已创建" : "逆向售后工单已更新");
      await loadWorkbench(response.item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "逆向售后工单保存失败");
    } finally {
      setSaving(false);
    }
  }

  const requestQty = Number(draft.request_qty || 0);
  const receivedQty = Number(draft.received_qty || 0);
  const pendingReceiveQty = Math.max(requestQty - receivedQty, 0);
  const receiveRate = requestQty > 0 ? receivedQty / requestQty : 0;
  const intakeDateValue = draft.intake_date ? new Date(draft.intake_date) : null;
  const agingDays =
    intakeDateValue == null ? 0 : Math.max(Math.floor((Date.now() - intakeDateValue.getTime()) / (1000 * 60 * 60 * 24)), 0);
  const latestAttendance = data?.attendance[0];

  return (
    <div className="space-y-6" data-page="after-sales-returns">
      <div className="surface-panel p-6 sm:p-8">
        <PageHeader
          eyebrow="Operations"
          title="逆向售后与退货承接"
          description="把退货收件、质检诊断、翻新承接、退款闭环和退货拆包观察收敛到同一张工作台里，先稳定逆向入口，再逐步补审批与平台回写。"
          badge={data ? `${formatNumber(data.summary.total_count)} 个逆向工单` : "加载中"}
          actions={
            <>
              <Button variant="outline" className="rounded-full" onClick={() => void loadWorkbench(selectedId)}>
                <RefreshCcw className="size-4" />
                刷新工作台
              </Button>
              <Button variant="outline" className="rounded-full" onClick={startNewDraft}>
                <RotateCcw className="size-4" />
                新建工单
              </Button>
              <Button className="cta-button rounded-full" onClick={() => void saveCase()} disabled={saving}>
                <Save className="size-4" />
                保存工单
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard title="工单总数" value={formatNumber(data?.summary.total_count ?? 0)} hint={`高优先级 ${formatNumber(data?.summary.high_severity_count ?? 0)}`} icon={<ClipboardCheck className="size-4" />} />
        <SummaryCard title="阻塞异常" value={formatNumber(data?.summary.blocked_count ?? 0)} hint={`逾期 ${formatNumber(data?.summary.overdue_count ?? 0)}`} icon={<AlertTriangle className="size-4" />} />
        <SummaryCard title="待退款" value={formatNumber(data?.summary.refund_pending_count ?? 0)} hint={`已闭环 ${formatNumber(data?.summary.closed_count ?? 0)}`} icon={<Wallet className="size-4" />} />
        <SummaryCard title="翻新承接" value={formatNumber(data?.summary.refurbishing_count ?? 0)} hint={`诊断中 ${formatNumber(data?.summary.diagnosing_count ?? 0)}`} icon={<RotateCcw className="size-4" />} />
        <SummaryCard title="逆向收件" value={formatNumber(data?.summary.total_received_qty ?? 0)} hint={`申请 ${formatNumber(data?.summary.total_request_qty ?? 0)}`} icon={<PackageSearch className="size-4" />} />
        <SummaryCard title="退款金额" value={formatNumber(data?.summary.total_refund_amount ?? 0)} hint={`最新收件 ${formatDate(data?.summary.latest_intake_date ?? null)}`} icon={<Wallet className="size-4" />} />
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader>
          <div className="grid gap-4 xl:grid-cols-[0.82fr_0.82fr_0.9fr_0.9fr_0.9fr_0.9fr_1.15fr]">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
            <FilterSelect value={statusFilter} onValueChange={setStatusFilter} options={data?.status_options ?? []} placeholder="售后状态" allLabel="全部售后状态" />
            <FilterSelect value={typeFilter} onValueChange={setTypeFilter} options={data?.type_options ?? []} placeholder="逆向类型" allLabel="全部逆向类型" />
            <FilterSelect value={severityFilter} onValueChange={setSeverityFilter} options={data?.severity_options ?? []} placeholder="优先级" allLabel="全部优先级" />
            <FilterSelect value={warehouseFilter} onValueChange={setWarehouseFilter} options={data?.warehouse_options ?? []} placeholder="逆向仓" allLabel="全部逆向仓" />
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索工单号、订单号、SKU 或客户原因" className="h-11 rounded-2xl border-border/80 bg-white pl-11" />
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">逆向工单清单</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">优先把阻塞、逾期和高优先级工单拎出来，右侧统一维护诊断与处理动作。</p>
              </div>
              <Button variant="outline" className="rounded-full" onClick={startNewDraft}>
                新建工单
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="h-[760px] rounded-[22px] border border-border/70 bg-muted/30" />
            ) : data?.items.length ? (
              <div className="surface-table overflow-hidden">
                <ScrollArea className="h-[760px]">
                  <div className="space-y-3 p-3">
                    {data.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectCase(item)}
                        className={cn(
                          "w-full rounded-[24px] border px-4 py-4 text-left transition",
                          selectedId === item.id
                            ? "border-slate-900 bg-slate-900 text-white shadow-[var(--shadow-card)]"
                            : "border-border/70 bg-white hover:border-slate-200 hover:shadow-[var(--shadow-card)]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold tracking-tight">{item.case_no || "新工单草稿"}</p>
                            <p className={cn("mt-1 text-xs", selectedId === item.id ? "text-slate-300" : "text-muted-foreground")}>
                              {item.order_no || "--"} / {item.sku_name || item.sku_code || "待补充 SKU"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <TypeBadge value={item.reverse_type} />
                            <SeverityBadge value={item.severity} />
                            <StatusBadge value={item.status} />
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <MetricMini label="收件" value={`${formatNumber(item.received_qty)} / ${formatNumber(item.request_qty)}`} active={selectedId === item.id} />
                          <MetricMini label="退款" value={formatNumber(item.refund_amount)} active={selectedId === item.id} />
                          <MetricMini label="承诺日期" value={formatDate(item.promised_finish_date)} active={selectedId === item.id} />
                        </div>
                        <p className={cn("mt-4 line-clamp-2 text-sm leading-6", selectedId === item.id ? "text-slate-200" : "text-muted-foreground")}>
                          {item.customer_reason || item.diagnosis_result || item.note || "当前没有补充说明。"}
                        </p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <Empty className="border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <RotateCcw className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>当前筛选下没有逆向工单</EmptyTitle>
                  <EmptyDescription>可以先新建一条逆向售后工单，或调整时间区间与优先级筛选。</EmptyDescription>
                </EmptyHeader>
                <Button variant="outline" className="rounded-full" onClick={startNewDraft}>
                  新建逆向工单
                </Button>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">工单编排</CardTitle>
              <p className="text-sm text-muted-foreground">统一维护收件状态、退款金额、责任人和诊断动作，保存后会自动同步到任务中心。</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-[24px] border border-border/70 bg-muted/25 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge value={draft.reverse_type} />
                  <SeverityBadge value={draft.severity} />
                  <StatusBadge value={draft.status} />
                  {draft.is_overdue ? <Badge className="rounded-full border-amber-200 bg-amber-50 text-amber-700">已逾期</Badge> : null}
                </div>
                <p className="mt-4 text-xl font-semibold tracking-tight text-foreground">{draft.case_no || "新建逆向工单"}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{draft.sku_name || "先补齐 SKU、订单号和逆向处理方式，再继续维护诊断与退款动作。"}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input type="date" value={draft.intake_date ?? ""} onChange={(event) => updateDraft("intake_date", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input type="date" value={draft.promised_finish_date ?? ""} onChange={(event) => updateDraft("promised_finish_date", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input value={draft.case_no} onChange={(event) => updateDraft("case_no", event.target.value)} placeholder="工单号，可留空自动生成" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input value={draft.order_no} onChange={(event) => updateDraft("order_no", event.target.value)} placeholder="订单号 / 售后单号" className="h-11 rounded-2xl border-border/80 bg-white" />

                <Select value={draft.reverse_type} onValueChange={(value) => updateDraft("reverse_type", value)}>
                  <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                    <SelectValue placeholder="逆向类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.type_options ?? []).map((option) => (
                      <SelectItem key={`type-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={draft.status} onValueChange={(value) => updateDraft("status", value)}>
                  <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                    <SelectValue placeholder="售后状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.status_options ?? []).map((option) => (
                      <SelectItem key={`status-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={draft.channel_code || "__none"} onValueChange={updateChannel}>
                  <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                    <SelectValue placeholder="渠道" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">暂不指定渠道</SelectItem>
                    {(data?.channel_options ?? []).map((option) => (
                      <SelectItem key={`channel-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={draft.reverse_warehouse_code || "__none"} onValueChange={updateWarehouse}>
                  <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                    <SelectValue placeholder="逆向仓" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">暂不指定逆向仓</SelectItem>
                    {(data?.warehouse_options ?? []).map((option) => (
                      <SelectItem key={`warehouse-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input value={draft.shop_name} onChange={(event) => updateDraft("shop_name", event.target.value)} placeholder="店铺名 / 渠道子账号" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input value={draft.issue_category} onChange={(event) => updateDraft("issue_category", event.target.value)} placeholder="问题分类，例如屏幕异常 / 电池异常" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input value={draft.sku_code} onChange={(event) => updateDraft("sku_code", event.target.value)} placeholder="SKU 编码" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input value={draft.sku_name} onChange={(event) => updateDraft("sku_name", event.target.value)} placeholder="SKU 名称" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input type="number" min="0" step="0.01" value={draft.request_qty} onChange={(event) => updateDraft("request_qty", numberFromInput(event.target.value))} placeholder="申请数量" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input type="number" min="0" step="0.01" value={draft.received_qty} onChange={(event) => updateDraft("received_qty", numberFromInput(event.target.value))} placeholder="已收件数量" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input type="number" min="0" step="0.01" value={draft.refund_amount} onChange={(event) => updateDraft("refund_amount", numberFromInput(event.target.value))} placeholder="退款金额" className="h-11 rounded-2xl border-border/80 bg-white" />

                <Select value={draft.severity} onValueChange={(value) => updateDraft("severity", value)}>
                  <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                    <SelectValue placeholder="优先级" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.severity_options ?? []).map((option) => (
                      <SelectItem key={`severity-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input value={draft.owner_name} onChange={(event) => updateDraft("owner_name", event.target.value)} placeholder="负责人" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input value={draft.owner_role} onChange={(event) => updateDraft("owner_role", event.target.value)} placeholder="角色" className="h-11 rounded-2xl border-border/80 bg-white" />
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <LiveMetric label="待收件" value={formatNumber(pendingReceiveQty)} />
                <LiveMetric label="收件率" value={`${(receiveRate * 100).toFixed(1)}%`} />
                <LiveMetric label="已流转天数" value={formatNumber(agingDays)} />
                <LiveMetric label="最近更新" value={formatDateTime(draft.updated_at)} />
              </div>

              <Textarea value={draft.customer_reason} onChange={(event) => updateDraft("customer_reason", event.target.value)} placeholder="记录客户发起售后的原因、平台要求和关键上下文。" className="min-h-[96px] rounded-[22px] border-border/80 bg-white" />
              <Textarea value={draft.diagnosis_result} onChange={(event) => updateDraft("diagnosis_result", event.target.value)} placeholder="记录质检结论、责任判断和是否可返修 / 换新 / 退款。" className="min-h-[112px] rounded-[22px] border-border/80 bg-white" />
              <Textarea value={draft.action_plan} onChange={(event) => updateDraft("action_plan", event.target.value)} placeholder="补充下一步动作，例如退回翻新、等待供应商赔付、先退款后追偿等。" className="min-h-[112px] rounded-[22px] border-border/80 bg-white" />
              <Textarea value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} placeholder="保留平台沟通、补偿约束或交接备注。" className="min-h-[96px] rounded-[22px] border-border/80 bg-white" />

              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <TypeBadge value={draft.reverse_type} />
                  <SeverityBadge value={draft.severity} />
                  <StatusBadge value={draft.status} />
                </div>
                <Button className="cta-button rounded-full" onClick={() => void saveCase()} disabled={saving}>
                  <Save className="size-4" />
                  保存售后工单
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">逆向执行快照</CardTitle>
              <p className="text-sm text-muted-foreground">复用已有退货拆包出勤与逆向仓主数据，帮助判断当前退货承接是否有能力瓶颈。</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <LiveMetric label="逆向仓数量" value={formatNumber(data?.summary.reverse_warehouse_count ?? 0)} />
                <LiveMetric label="最新拆包出勤" value={formatNumber(data?.summary.latest_attendance_count ?? 0)} />
                <LiveMetric label="最新退货入仓" value={formatNumber(data?.summary.latest_return_qty ?? 0)} />
              </div>

              <div className="rounded-[24px] border border-border/80 bg-muted/20 p-4">
                <p className="text-sm font-medium text-foreground">逆向仓覆盖</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(data?.warehouse_options ?? []).length ? (
                    data?.warehouse_options.map((option) => (
                      <Badge key={option.value} className="rounded-full border border-border/70 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
                        {option.label}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">当前还没有维护逆向仓主数据。</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {latestAttendance ? (
                  <div className="rounded-[24px] border border-border/80 bg-muted/20 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">最新拆包观察</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(data?.summary.latest_attendance_date ?? null)}</p>
                      </div>
                      <Badge className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none">
                        销售退仓 {formatNumber(latestAttendance.sales_return_warehouse)}
                      </Badge>
                    </div>
                  </div>
                ) : null}

                {(data?.attendance ?? []).length ? (
                  data?.attendance.slice(0, 6).map((row) => <AttendanceRow key={`${row.biz_date}`} row={row} />)
                ) : (
                  <Empty className="border-border/70">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CalendarClock className="size-4" />
                      </EmptyMedia>
                      <EmptyTitle>最近还没有退货拆包观察数据</EmptyTitle>
                      <EmptyDescription>旧版退货拆包出勤入口仍然可用，这里会自动复用最近的出勤和退货入仓快照。</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
