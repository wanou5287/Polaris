"use client";

import { startTransition, type ReactNode, useDeferredValue, useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  Factory,
  PackagePlus,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Truck,
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
import { apiFetch, cn, formatDate, formatNumber } from "@/lib/polaris-client";
import type {
  Option,
  ReplenishmentAlertSnapshot,
  ReplenishmentForecastSnapshot,
  ReplenishmentPlanItem,
  ReplenishmentWorkbenchResponse,
} from "@/lib/polaris-types";

type SelectedKey = number | "new";

function todayOffset(offset = 0) {
  const current = new Date();
  current.setDate(current.getDate() + offset);
  return current.toISOString().slice(0, 10);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function numberFromInput(value: string) {
  if (!value.trim()) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function leadDaysBySupplyMode(supplyMode: string) {
  switch (supplyMode) {
    case "transfer":
      return 3;
    case "refurb":
      return 5;
    case "watch":
      return 2;
    case "purchase":
    default:
      return 7;
  }
}

function withDerivedMetrics(item: ReplenishmentPlanItem) {
  const currentStockQty = Math.max(0, Number(item.current_stock_qty || 0));
  const forecast14dQty = Math.max(0, Number(item.forecast_14d_qty || 0));
  const thresholdDays = Math.max(1, Number(item.threshold_days || 14));
  const manualTarget = Math.max(0, Number(item.target_stock_qty || 0));
  const dailyDemand = forecast14dQty > 0 ? forecast14dQty / 14 : 0;
  const computedCoverageDays = dailyDemand > 0 ? currentStockQty / dailyDemand : 0;
  const baselineTarget = dailyDemand > 0 ? dailyDemand * Math.max(thresholdDays, 14) : 0;
  const targetStockQty = round(Math.max(manualTarget, baselineTarget));
  const suggestedQty = round(Math.max(targetStockQty - currentStockQty, 0));

  return {
    ...item,
    current_stock_qty: round(currentStockQty),
    forecast_14d_qty: round(forecast14dQty),
    threshold_days: thresholdDays,
    coverage_days: round(computedCoverageDays),
    target_stock_qty: targetStockQty,
    suggested_qty: suggestedQty,
    expected_ready_date:
      item.expected_ready_date || todayOffset(leadDaysBySupplyMode(item.supply_mode)),
  };
}

function createDraft(response?: ReplenishmentWorkbenchResponse): ReplenishmentPlanItem {
  const defaultSupplyMode = response?.supply_mode_options.find((item) => item.value === "purchase")?.value ?? "purchase";
  const defaultDemandType = response?.demand_type_options[0]?.value ?? "sales";
  return withDerivedMetrics({
    id: 0,
    suggestion_no: "",
    plan_date: todayOffset(0),
    material_name: "",
    demand_type: defaultDemandType,
    material_role: "",
    current_stock_qty: 0,
    forecast_14d_qty: 0,
    coverage_days: 0,
    threshold_days: 14,
    target_stock_qty: 0,
    suggested_qty: 0,
    supply_mode: defaultSupplyMode,
    supply_mode_label: "",
    plan_status: "draft",
    plan_status_label: "",
    priority: "normal",
    priority_label: "",
    owner_name: "",
    owner_role: "计划运营",
    expected_ready_date: todayOffset(leadDaysBySupplyMode(defaultSupplyMode)),
    supplier_name: "",
    linked_refurb_category: "",
    note: "",
    source_snapshot: null,
    sort_order: 100,
    created_by: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
    is_overdue: false,
  });
}

async function requestWorkbench(params: URLSearchParams) {
  return apiFetch<ReplenishmentWorkbenchResponse>(`/api/backend/replenishment-workbench?${params.toString()}`);
}

const planStatusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: "待评审", className: "border-border/80 bg-white text-muted-foreground" },
  reviewing: { label: "评审中", className: "border-sky-200 bg-sky-50 text-sky-700" },
  confirmed: { label: "已确认", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  executing: { label: "执行中", className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
  closed: { label: "已闭环", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  blocked: { label: "阻塞", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

const supplyModeMeta: Record<string, { label: string; className: string }> = {
  purchase: { label: "采购补货", className: "border-slate-200 bg-slate-100 text-slate-700" },
  refurb: { label: "翻新承接", className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
  transfer: { label: "调拨补货", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  watch: { label: "继续观察", className: "border-border/80 bg-white text-muted-foreground" },
};

const priorityMeta: Record<string, { label: string; className: string }> = {
  high: { label: "高优先级", className: "border-rose-200 bg-rose-50 text-rose-700" },
  normal: { label: "中优先级", className: "border-border/80 bg-white text-muted-foreground" },
  low: { label: "低优先级", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const demandTypeMeta: Record<string, { label: string; className: string }> = {
  sales: { label: "销售", className: "border-slate-200 bg-slate-100 text-slate-700" },
  refurb: { label: "翻新", className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
};

const alertMeta: Record<string, { label: string; className: string }> = {
  critical: { label: "严重告警", className: "border-rose-200 bg-rose-50 text-rose-700" },
  warning: { label: "库存预警", className: "border-amber-200 bg-amber-50 text-amber-700" },
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

function MetaBadge({
  meta,
  active = false,
}: {
  meta: { label: string; className: string };
  active?: boolean;
}) {
  return (
    <Badge
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-none",
        active ? "border-white/20 bg-white/10 text-white" : meta.className,
      )}
    >
      {meta.label}
    </Badge>
  );
}

function StatPill({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={cn("rounded-[18px] border px-3 py-3", active ? "border-white/10 bg-white/5" : "border-border/70 bg-muted/20")}>
      <p className={cn("text-[11px]", active ? "text-slate-300" : "text-muted-foreground")}>{label}</p>
      <p className={cn("mt-2 text-sm font-medium", active ? "text-white" : "text-foreground")}>{value}</p>
    </div>
  );
}

function SignalField({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={cn("rounded-[22px] border px-4 py-4", emphasize ? "border-slate-200 bg-white" : "border-border/70 bg-muted/20")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function AlertCard({ alert }: { alert: ReplenishmentAlertSnapshot }) {
  const meta = alertMeta[alert.alert_level] ?? alertMeta.warning;
  const demandMeta = demandTypeMeta[alert.demand_type] ?? demandTypeMeta.sales;
  return (
    <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{alert.material_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(alert.snapshot_date)} · 阈值 {formatNumber(alert.threshold_days)} 天
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MetaBadge meta={demandMeta} />
          <MetaBadge meta={meta} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatPill label="当前库存" value={formatNumber(alert.current_stock_qty)} />
        <StatPill label="14天预测" value={formatNumber(alert.forecast_14d_qty)} />
        <StatPill label="覆盖天数" value={formatNumber(alert.coverage_days)} />
      </div>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">{alert.message || "暂无补充说明"}</p>
    </div>
  );
}

function ForecastCard({ item }: { item: ReplenishmentForecastSnapshot }) {
  const demandMeta = demandTypeMeta[item.demand_type] ?? demandTypeMeta.sales;
  return (
    <div className="rounded-[22px] border border-border/70 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{item.material_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            角色 {item.material_role || "--"} · 最近预测 {formatDate(item.latest_forecast_date)}
          </p>
        </div>
        <MetaBadge meta={demandMeta} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SignalField label="14天预测需求" value={formatNumber(item.forecast_14d_qty)} emphasize />
        <SignalField label="安全阈值" value={`${formatNumber(item.threshold_days)} 天`} />
      </div>
    </div>
  );
}

export function ReplenishmentPlanningPage() {
  const [data, setData] = useState<ReplenishmentWorkbenchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<SelectedKey>("new");
  const [draft, setDraft] = useState<ReplenishmentPlanItem>(createDraft());
  const [keyword, setKeyword] = useState("");
  const [planStatusFilter, setPlanStatusFilter] = useState("all");
  const [supplyModeFilter, setSupplyModeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [demandTypeFilter, setDemandTypeFilter] = useState("all");
  const deferredKeyword = useDeferredValue(keyword);

  async function loadWorkbench(nextSelectedKey?: SelectedKey) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (planStatusFilter !== "all") params.set("plan_status", planStatusFilter);
      if (supplyModeFilter !== "all") params.set("supply_mode", supplyModeFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (demandTypeFilter !== "all") params.set("demand_type", demandTypeFilter);
      if (deferredKeyword.trim()) params.set("keyword", deferredKeyword.trim());
      params.set("limit", "180");
      const response = await requestWorkbench(params);
      setData(response);
      startTransition(() => {
        const targetKey = nextSelectedKey ?? selectedKey;
        if (targetKey === "new") {
          setSelectedKey("new");
          setDraft(createDraft(response));
          return;
        }
        const matched = response.items.find((item) => item.id === targetKey) ?? response.items[0];
        if (matched) {
          setSelectedKey(matched.id);
          setDraft({ ...matched });
          return;
        }
        setSelectedKey("new");
        setDraft(createDraft(response));
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "补货协同数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkbench();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStatusFilter, supplyModeFilter, priorityFilter, demandTypeFilter, deferredKeyword]);

  function updateDraft<K extends keyof ReplenishmentPlanItem>(key: K, value: ReplenishmentPlanItem[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateDerivedDraft<K extends keyof ReplenishmentPlanItem>(key: K, value: ReplenishmentPlanItem[K]) {
    setDraft((current) => withDerivedMetrics({ ...current, [key]: value }));
  }

  function selectPlan(item: ReplenishmentPlanItem) {
    startTransition(() => {
      setSelectedKey(item.id);
      setDraft({ ...item });
    });
  }

  function startNewDraft() {
    startTransition(() => {
      setSelectedKey("new");
      setDraft(createDraft(data ?? undefined));
    });
  }

  async function savePlan() {
    setSaving(true);
    try {
      const payload = withDerivedMetrics({ ...draft });
      const response = await apiFetch<{ created: boolean; item: ReplenishmentPlanItem }>(
        "/api/backend/replenishment-workbench/plans",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      toast.success(response.created ? "补货计划草稿已创建" : "补货计划已更新");
      await loadWorkbench(response.item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "补货计划保存失败");
    } finally {
      setSaving(false);
    }
  }

  const currentStockQty = Number(draft.current_stock_qty || 0);
  const forecast14dQty = Number(draft.forecast_14d_qty || 0);
  const coverageDays = Number(draft.coverage_days || 0);
  const suggestedQty = Number(draft.suggested_qty || 0);
  const executionCount = (data?.summary.confirmed_count ?? 0) + (data?.summary.executing_count ?? 0);
  const reviewCount = (data?.summary.draft_count ?? 0) + (data?.summary.reviewing_count ?? 0);

  return (
    <div className="space-y-6" data-page="replenishment-planning">
      <div className="surface-panel p-6 sm:p-8">
        <PageHeader
          eyebrow="Operations"
          title="补货建议与计划协同"
          description="把库存预警、未来 14 天预测和供应动作放进同一块工作台里，先形成建议，再把补货方式、责任人和准备日期落到可执行计划。"
          badge={data ? `${formatNumber(data.summary.total_count)} 条补货建议` : "加载中"}
          actions={
            <>
              <Button variant="outline" className="rounded-full" onClick={() => void loadWorkbench(selectedKey)}>
                <RefreshCcw className="size-4" />
                刷新工作台
              </Button>
              <Button variant="outline" className="rounded-full" onClick={startNewDraft}>
                <PackagePlus className="size-4" />
                新建建议
              </Button>
              <Button className="cta-button rounded-full" onClick={() => void savePlan()} disabled={saving}>
                <Save className="size-4" />
                保存计划
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard title="待评审" value={formatNumber(reviewCount)} hint="等待计划确认或跟进" icon={<ClipboardCheck className="size-4" />} />
        <SummaryCard title="执行中" value={formatNumber(executionCount)} hint="已确认或进入执行节奏" icon={<Truck className="size-4" />} />
        <SummaryCard title="阻塞计划" value={formatNumber(data?.summary.blocked_count ?? 0)} hint="供应或准备日期存在风险" icon={<AlertTriangle className="size-4" />} />
        <SummaryCard title="高优先级" value={formatNumber(data?.summary.high_priority_count ?? 0)} hint={`库存告警 ${formatNumber(data?.summary.alert_count ?? 0)}`} icon={<Sparkles className="size-4" />} />
        <SummaryCard title="建议补货量" value={formatNumber(data?.summary.total_suggested_qty ?? 0)} hint={`目标库存 ${formatNumber(data?.summary.total_target_stock_qty ?? 0)}`} icon={<PackagePlus className="size-4" />} />
        <SummaryCard title="翻新承接" value={formatNumber(data?.summary.refurb_count ?? 0)} hint={`采购 ${formatNumber(data?.summary.purchase_count ?? 0)} / 调拨 ${formatNumber(data?.summary.transfer_count ?? 0)}`} icon={<Factory className="size-4" />} />
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader>
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.8fr_0.8fr_0.8fr_0.8fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索建议号、物料名、供应商或备注"
                className="h-11 rounded-2xl border-border/80 bg-white pl-11"
              />
            </div>
            <FilterSelect value={planStatusFilter} onValueChange={setPlanStatusFilter} placeholder="计划状态" options={data?.plan_status_options ?? []} allLabel="全部计划状态" />
            <FilterSelect value={supplyModeFilter} onValueChange={setSupplyModeFilter} placeholder="供应方式" options={data?.supply_mode_options ?? []} allLabel="全部供应方式" />
            <FilterSelect value={priorityFilter} onValueChange={setPriorityFilter} placeholder="优先级" options={data?.priority_options ?? []} allLabel="全部优先级" />
            <FilterSelect value={demandTypeFilter} onValueChange={setDemandTypeFilter} placeholder="需求类型" options={data?.demand_type_options ?? []} allLabel="全部需求类型" />
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => void loadWorkbench(selectedKey)}>
              立即刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">建议队列</CardTitle>
            <p className="text-sm text-muted-foreground">左侧快速筛选风险物料，右侧把建议量落到正式补货计划。</p>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="h-[760px] rounded-[22px] border border-border/70 bg-muted/30" />
            ) : data?.items.length ? (
              <div className="surface-table overflow-hidden">
                <ScrollArea className="h-[760px]">
                  <div className="space-y-3 p-3">
                    {data.items.map((item) => {
                      const active = selectedKey === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectPlan(item)}
                          className={cn(
                            "w-full rounded-[24px] border px-4 py-4 text-left transition",
                            active
                              ? "border-slate-900 bg-slate-900 text-white shadow-[var(--shadow-card)]"
                              : "border-border/70 bg-white hover:border-slate-200 hover:shadow-[var(--shadow-card)]",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={cn("truncate text-base font-semibold tracking-tight", active ? "text-white" : "text-foreground")}>{item.material_name}</p>
                              <p className={cn("mt-1 text-xs", active ? "text-slate-300" : "text-muted-foreground")}>
                                {item.suggestion_no || "待生成建议号"} · 计划 {formatDate(item.plan_date)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <MetaBadge meta={planStatusMeta[item.plan_status] ?? planStatusMeta.draft} active={active} />
                              <MetaBadge meta={supplyModeMeta[item.supply_mode] ?? supplyModeMeta.purchase} active={active} />
                              <MetaBadge meta={priorityMeta[item.priority] ?? priorityMeta.normal} active={active} />
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <StatPill label="14天预测" value={formatNumber(item.forecast_14d_qty)} active={active} />
                            <StatPill label="当前库存" value={formatNumber(item.current_stock_qty)} active={active} />
                            <StatPill label="覆盖天数" value={formatNumber(item.coverage_days)} active={active} />
                            <StatPill label="建议补货" value={formatNumber(item.suggested_qty)} active={active} />
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div className={cn("text-xs", active ? "text-slate-300" : "text-muted-foreground")}>
                              {item.supplier_name || item.linked_refurb_category || "待补充供应协同信息"}
                            </div>
                            <div className={cn("text-xs", active ? "text-slate-300" : "text-muted-foreground")}>
                              预计就绪 {formatDate(item.expected_ready_date)}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <Empty className="rounded-[24px] border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackagePlus className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>当前没有匹配的补货建议</EmptyTitle>
                  <EmptyDescription>可以放宽筛选条件，或者直接新建一条计划草稿。</EmptyDescription>
                </EmptyHeader>
                <Button variant="outline" className="rounded-full" onClick={startNewDraft}>
                  新建草稿
                </Button>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">计划编辑</CardTitle>
              <p className="text-sm text-muted-foreground">建议量可以自动推导，也可以按供应条件进行微调，保存后会同步进入任务中心。</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SignalField label="当前库存" value={formatNumber(currentStockQty)} emphasize />
                <SignalField label="14天预测" value={formatNumber(forecast14dQty)} />
                <SignalField label="覆盖天数" value={`${formatNumber(coverageDays)} 天`} />
                <SignalField label="建议补货" value={formatNumber(suggestedQty)} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">建议号</label>
                  <Input value={draft.suggestion_no || "留空保存时自动生成"} onChange={(event) => updateDraft("suggestion_no", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">计划日期</label>
                  <Input type="date" value={draft.plan_date ?? ""} onChange={(event) => updateDraft("plan_date", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">物料名称</label>
                  <Input value={draft.material_name} onChange={(event) => updateDraft("material_name", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" placeholder="输入物料名称或机型" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">物料角色</label>
                  <Input value={draft.material_role} onChange={(event) => updateDraft("material_role", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" placeholder="整机 / 配件 / 包材" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">需求类型</label>
                  <Select value={draft.demand_type} onValueChange={(value) => updateDraft("demand_type", value)}>
                    <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                      <SelectValue placeholder="选择需求类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {(data?.demand_type_options ?? []).map((option) => (
                        <SelectItem key={`demand-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">供应方式</label>
                  <Select value={draft.supply_mode} onValueChange={(value) => updateDerivedDraft("supply_mode", value)}>
                    <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                      <SelectValue placeholder="选择供应方式" />
                    </SelectTrigger>
                    <SelectContent>
                      {(data?.supply_mode_options ?? []).map((option) => (
                        <SelectItem key={`mode-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">计划状态</label>
                  <Select value={draft.plan_status} onValueChange={(value) => updateDraft("plan_status", value)}>
                    <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                      <SelectValue placeholder="选择计划状态" />
                    </SelectTrigger>
                    <SelectContent>
                      {(data?.plan_status_options ?? []).map((option) => (
                        <SelectItem key={`status-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">优先级</label>
                  <Select value={draft.priority} onValueChange={(value) => updateDraft("priority", value)}>
                    <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                      <SelectValue placeholder="选择优先级" />
                    </SelectTrigger>
                    <SelectContent>
                      {(data?.priority_options ?? []).map((option) => (
                        <SelectItem key={`priority-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">当前库存</label>
                  <Input type="number" value={draft.current_stock_qty} onChange={(event) => updateDerivedDraft("current_stock_qty", numberFromInput(event.target.value))} className="h-11 rounded-2xl border-border/80 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">14 天预测</label>
                  <Input type="number" value={draft.forecast_14d_qty} onChange={(event) => updateDerivedDraft("forecast_14d_qty", numberFromInput(event.target.value))} className="h-11 rounded-2xl border-border/80 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">安全阈值天数</label>
                  <Input type="number" value={draft.threshold_days} onChange={(event) => updateDerivedDraft("threshold_days", numberFromInput(event.target.value))} className="h-11 rounded-2xl border-border/80 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">目标库存</label>
                  <Input type="number" value={draft.target_stock_qty} onChange={(event) => updateDerivedDraft("target_stock_qty", numberFromInput(event.target.value))} className="h-11 rounded-2xl border-border/80 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">建议补货量</label>
                  <Input type="number" value={draft.suggested_qty} onChange={(event) => updateDraft("suggested_qty", numberFromInput(event.target.value))} className="h-11 rounded-2xl border-border/80 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">预计就绪日期</label>
                  <Input type="date" value={draft.expected_ready_date ?? ""} onChange={(event) => updateDraft("expected_ready_date", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">负责人</label>
                  <Input value={draft.owner_name} onChange={(event) => updateDraft("owner_name", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" placeholder="填写责任人" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">角色</label>
                  <Input value={draft.owner_role} onChange={(event) => updateDraft("owner_role", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" placeholder="计划运营 / 采购 / 翻新运营" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">供应商</label>
                  <Input value={draft.supplier_name} onChange={(event) => updateDraft("supplier_name", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" placeholder="采购模式下优先填写" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">关联翻新品类</label>
                  <Input value={draft.linked_refurb_category} onChange={(event) => updateDraft("linked_refurb_category", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" placeholder="翻新承接时填写" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">备注与动作说明</label>
                <Textarea value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} className="min-h-28 rounded-[24px] border-border/80 bg-white" placeholder="记录风险判断、供应方案或需要团队配合的内容" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">信号源与洞察</CardTitle>
              <p className="text-sm text-muted-foreground">左侧看最新库存预警，右侧看未来 14 天需求热点，帮助把补货方式从感觉变成有证据的判断。</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <SignalField label="物料数" value={formatNumber(data?.summary.material_count ?? 0)} emphasize />
                <SignalField label="最新预警日期" value={formatDate(data?.summary.latest_alert_date)} />
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">库存预警</p>
                      <p className="mt-1 text-xs text-muted-foreground">优先查看覆盖天数最短的物料</p>
                    </div>
                    <Badge className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none">
                      {formatNumber(data?.alerts.length ?? 0)} 条
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {data?.alerts.length ? (
                      data.alerts.map((alert) => <AlertCard key={`${alert.material_name}-${alert.snapshot_date}`} alert={alert} />)
                    ) : (
                      <div className="rounded-[22px] border border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">当前没有可用的库存告警快照。</div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">预测热点</p>
                      <p className="mt-1 text-xs text-muted-foreground">聚合未来 14 天预测，帮助提前锁定供应动作</p>
                    </div>
                    <Badge className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none">
                      最新计划 {formatDate(data?.summary.latest_plan_date)}
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {data?.forecasts.length ? (
                      data.forecasts.map((item) => (
                        <ForecastCard key={`${item.material_name}-${item.demand_type}-${item.material_role}`} item={item} />
                      ))
                    ) : (
                      <div className="rounded-[22px] border border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">当前还没有可用的 AI 预测快照。</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
