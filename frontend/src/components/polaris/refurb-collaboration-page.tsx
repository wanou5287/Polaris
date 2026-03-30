"use client";

import { startTransition, type ReactNode, useDeferredValue, useEffect, useState } from "react";
import {
  AlertTriangle,
  Factory,
  Gauge,
  PackageCheck,
  Save,
  Search,
  Wrench,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
  Option,
  RefurbCapacityProfile,
  RefurbCollaborationResponse,
  RefurbScheduleItem,
} from "@/lib/polaris-types";

const chartConfig = {
  planned_qty: {
    label: "计划台数",
    color: "#94a3b8",
  },
  actual_qty: {
    label: "实际完成",
    color: "#60a5fa",
  },
};

const statusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "待排产", className: "border-slate-200 bg-slate-50 text-slate-700" },
  in_progress: { label: "进行中", className: "border-sky-200 bg-sky-50 text-sky-700" },
  blocked: { label: "已阻塞", className: "border-amber-200 bg-amber-50 text-amber-700" },
  completed: { label: "已完成", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

const riskMeta: Record<string, { label: string; className: string }> = {
  high: { label: "高风险", className: "border-rose-200 bg-rose-50 text-rose-700" },
  normal: { label: "正常", className: "border-border/80 bg-white text-muted-foreground" },
  low: { label: "低风险", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

function todayOffset(offset = 0) {
  const current = new Date();
  current.setDate(current.getDate() + offset);
  return current.toISOString().slice(0, 10);
}

function buildEmptyCapacity(category = "", stage = "assembly"): RefurbCapacityProfile {
  return {
    id: 0,
    refurb_category: category,
    stage_key: stage,
    stage_label: stage,
    stage_name: stage,
    daily_capacity: 0,
    owner_name: "",
    owner_role: "翻新运营",
    effective_date: todayOffset(0),
    is_enabled: true,
    sort_order: 100,
    note: "",
    created_by: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
  };
}

function buildEmptySchedule(category = "", stage = "assembly"): RefurbScheduleItem {
  return {
    id: 0,
    schedule_no: "",
    schedule_date: todayOffset(0),
    refurb_category: category,
    material_name: "",
    stage_key: stage,
    stage_label: stage,
    planned_qty: 0,
    actual_qty: 0,
    backlog_qty: 0,
    material_ready_qty: 0,
    material_gap_qty: 0,
    stage_capacity: 0,
    capacity_gap_qty: 0,
    status: "pending",
    status_label: "待排产",
    risk_level: "normal",
    risk_level_label: "正常",
    owner_name: "",
    owner_role: "翻新运营",
    blocker_reason: "",
    note: "",
    sort_order: 100,
    created_by: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
    is_overdue: false,
  };
}

function numberFromInput(value: string) {
  if (!value.trim()) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return `${(numeric * 100).toFixed(1)}%`;
}

async function requestRefurbCollaboration(params: URLSearchParams) {
  return apiFetch<RefurbCollaborationResponse>(`/api/backend/refurb-collaboration?${params.toString()}`);
}

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
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="flex size-9 items-center justify-center rounded-2xl border border-border/70 bg-white text-foreground">
          {icon}
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
  placeholder,
  options,
  allLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: Option[];
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

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status] ?? statusMeta.pending;
  return <Badge className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-none", meta.className)}>{meta.label}</Badge>;
}

function RiskBadge({ risk }: { risk: string }) {
  const meta = riskMeta[risk] ?? riskMeta.normal;
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

function LiveMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-border/80 bg-muted/20 px-4 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

export function RefurbCollaborationPage() {
  const [data, setData] = useState<RefurbCollaborationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [selectedCapacityId, setSelectedCapacityId] = useState<number | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<RefurbScheduleItem>(buildEmptySchedule());
  const [capacityDraft, setCapacityDraft] = useState<RefurbCapacityProfile>(buildEmptyCapacity());
  const [startDate, setStartDate] = useState(todayOffset(-6));
  const [endDate, setEndDate] = useState(todayOffset(14));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);

  async function loadWorkbench(nextScheduleId?: number | null, nextCapacityId?: number | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        limit: "180",
      });
      if (categoryFilter !== "all") params.set("refurb_category", categoryFilter);
      if (stageFilter !== "all") params.set("stage_key", stageFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (riskFilter !== "all") params.set("risk_level", riskFilter);
      if (deferredKeyword.trim()) params.set("keyword", deferredKeyword.trim());
      const response = await requestRefurbCollaboration(params);
      setData(response);
      startTransition(() => {
        const categorySeed = categoryFilter !== "all" ? categoryFilter : response.category_options[0]?.value ?? "";
        const matchedSchedule =
          response.schedule_items.find((item) => item.id === (nextScheduleId ?? selectedScheduleId)) ??
          response.schedule_items[0] ??
          buildEmptySchedule(categorySeed, response.stage_options[0]?.value ?? "assembly");
        setSelectedScheduleId(matchedSchedule.id > 0 ? matchedSchedule.id : null);
        setScheduleDraft({ ...matchedSchedule });

        const matchedCapacity =
          response.capacity_profiles.find((item) => item.id === (nextCapacityId ?? selectedCapacityId)) ??
          response.capacity_profiles[0] ??
          buildEmptyCapacity(categorySeed, response.stage_options[0]?.value ?? "assembly");
        setSelectedCapacityId(matchedCapacity.id > 0 ? matchedCapacity.id : null);
        setCapacityDraft({ ...matchedCapacity });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "翻新协同数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkbench(selectedScheduleId, selectedCapacityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, categoryFilter, stageFilter, statusFilter, riskFilter, deferredKeyword]);

  function selectSchedule(item: RefurbScheduleItem) {
    startTransition(() => {
      setSelectedScheduleId(item.id);
      setScheduleDraft({ ...item });
    });
  }

  function selectCapacity(item: RefurbCapacityProfile) {
    startTransition(() => {
      setSelectedCapacityId(item.id);
      setCapacityDraft({ ...item });
    });
  }

  function updateSchedule<K extends keyof RefurbScheduleItem>(key: K, value: RefurbScheduleItem[K]) {
    setScheduleDraft((current) => ({ ...current, [key]: value }));
  }

  function updateCapacity<K extends keyof RefurbCapacityProfile>(key: K, value: RefurbCapacityProfile[K]) {
    setCapacityDraft((current) => ({ ...current, [key]: value }));
  }

  function createNewSchedule() {
    const categorySeed = categoryFilter !== "all" ? categoryFilter : data?.category_options[0]?.value ?? "";
    const stageSeed = stageFilter !== "all" ? stageFilter : data?.stage_options[0]?.value ?? "assembly";
    setSelectedScheduleId(null);
    setScheduleDraft(buildEmptySchedule(categorySeed, stageSeed));
  }

  function createNewCapacity() {
    const categorySeed = categoryFilter !== "all" ? categoryFilter : data?.category_options[0]?.value ?? "";
    setSelectedCapacityId(null);
    setCapacityDraft(buildEmptyCapacity(categorySeed, data?.stage_options[0]?.value ?? "assembly"));
  }

  async function saveCapacity() {
    setSavingCapacity(true);
    try {
      const response = await apiFetch<{ saved: boolean; item: RefurbCapacityProfile }>("/api/backend/refurb-collaboration/capacity", {
        method: "POST",
        body: JSON.stringify({
          id: capacityDraft.id,
          refurb_category: capacityDraft.refurb_category,
          stage_key: capacityDraft.stage_key,
          daily_capacity: capacityDraft.daily_capacity,
          owner_name: capacityDraft.owner_name,
          owner_role: capacityDraft.owner_role,
          effective_date: capacityDraft.effective_date,
          is_enabled: capacityDraft.is_enabled,
          sort_order: capacityDraft.sort_order,
          note: capacityDraft.note,
        }),
      });
      toast.success("翻新产能档已保存");
      await loadWorkbench(selectedScheduleId, response.item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "翻新产能档保存失败");
    } finally {
      setSavingCapacity(false);
    }
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    try {
      const response = await apiFetch<{ saved: boolean; item: RefurbScheduleItem }>("/api/backend/refurb-collaboration/schedule-items", {
        method: "POST",
        body: JSON.stringify({
          id: scheduleDraft.id,
          schedule_no: scheduleDraft.schedule_no,
          schedule_date: scheduleDraft.schedule_date,
          refurb_category: scheduleDraft.refurb_category,
          material_name: scheduleDraft.material_name,
          stage_key: scheduleDraft.stage_key,
          planned_qty: scheduleDraft.planned_qty,
          actual_qty: scheduleDraft.actual_qty,
          backlog_qty: scheduleDraft.backlog_qty,
          material_ready_qty: scheduleDraft.material_ready_qty,
          status: scheduleDraft.status,
          risk_level: scheduleDraft.risk_level,
          owner_name: scheduleDraft.owner_name,
          owner_role: scheduleDraft.owner_role,
          blocker_reason: scheduleDraft.blocker_reason,
          note: scheduleDraft.note,
          sort_order: scheduleDraft.sort_order,
        }),
      });
      toast.success("翻新排产项已保存");
      await loadWorkbench(response.item.id, selectedCapacityId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "翻新排产项保存失败");
    } finally {
      setSavingSchedule(false);
    }
  }

  const liveAchievement = scheduleDraft.planned_qty > 0 ? scheduleDraft.actual_qty / scheduleDraft.planned_qty : 0;
  const liveMaterialGap = Math.max(scheduleDraft.planned_qty - scheduleDraft.material_ready_qty, 0);

  return (
    <div className="space-y-6" data-page="refurb-collaboration">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard title="排产总数" value={formatNumber(data?.summary.schedule_count ?? 0)} hint={`活跃类别 ${formatNumber(data?.summary.active_category_count ?? 0)}`} icon={<Factory className="size-4" />} />
        <SummaryCard title="高风险" value={formatNumber(data?.summary.high_risk_count ?? 0)} hint={`阻塞 ${formatNumber(data?.summary.blocked_count ?? 0)}`} icon={<AlertTriangle className="size-4" />} />
        <SummaryCard title="产能缺口" value={formatNumber(data?.summary.capacity_gap_count ?? 0)} hint="计划大于日产能的排产项" icon={<Gauge className="size-4" />} />
        <SummaryCard title="待料缺口" value={formatNumber(data?.summary.material_shortage_count ?? 0)} hint="计划数高于可用备料" icon={<PackageCheck className="size-4" />} />
        <SummaryCard title="计划台数" value={formatNumber(data?.summary.total_planned_qty ?? 0)} hint={`实际完成 ${formatNumber(data?.summary.total_actual_qty ?? 0)}`} icon={<Wrench className="size-4" />} />
        <SummaryCard title="达成率" value={formatPercent(data?.summary.achievement_rate ?? 0)} hint={`最近实际 ${formatDate(data?.summary.latest_actual_date ?? null)}`} icon={<Gauge className="size-4" />} />
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader>
          <div className="grid gap-4 xl:grid-cols-[0.9fr_0.9fr_0.8fr_0.8fr_0.8fr_0.8fr_0.7fr]">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
            <FilterSelect value={categoryFilter} onValueChange={setCategoryFilter} placeholder="翻新类别" options={data?.category_options ?? []} allLabel="全部翻新类别" />
            <FilterSelect value={stageFilter} onValueChange={setStageFilter} placeholder="工序" options={data?.stage_options ?? []} allLabel="全部工序" />
            <FilterSelect value={statusFilter} onValueChange={setStatusFilter} placeholder="状态" options={data?.status_options ?? []} allLabel="全部状态" />
            <FilterSelect value={riskFilter} onValueChange={setRiskFilter} placeholder="风险" options={data?.risk_options ?? []} allLabel="全部风险" />
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索单号/物料/阻塞" className="h-11 rounded-2xl border-border/80 bg-white pl-11" />
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">翻新节拍日历</CardTitle>
            <p className="text-sm text-muted-foreground">看计划台数与实际完成的节奏，优先定位节拍开始失衡的日期。</p>
          </CardHeader>
          <CardContent>
            {data?.calendar.length ? (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <LineChart data={data.calendar} margin={{ left: 12, right: 12, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="schedule_date" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                  <Line type="monotone" dataKey="planned_qty" stroke="var(--color-planned_qty)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="actual_qty" stroke="var(--color-actual_qty)" strokeWidth={2.6} dot={{ fill: "var(--color-actual_qty)" }} />
                </LineChart>
              </ChartContainer>
            ) : (
              <Empty className="border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Factory className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>当前区间还没有翻新节拍数据</EmptyTitle>
                  <EmptyDescription>可以先创建一条排产项，或者调整日期范围查看历史排产。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">产能档</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">先把拆解、修复、组装的日产能维护清楚，排产缺口才有统一参照。</p>
              </div>
              <Button variant="outline" className="rounded-full" onClick={createNewCapacity}>
                新建产能档
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {(data?.capacity_profiles ?? []).map((profile) => {
                const plannedForStage = (data?.schedule_items ?? [])
                  .filter((item) => item.refurb_category === profile.refurb_category && item.stage_key === profile.stage_key)
                  .reduce((sum, item) => sum + Number(item.planned_qty || 0), 0);
                const usageRatio = profile.daily_capacity > 0 ? Math.min(plannedForStage / profile.daily_capacity, 1) : 0;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => selectCapacity(profile)}
                    className={cn(
                      "rounded-[24px] border px-4 py-4 text-left transition",
                      selectedCapacityId === profile.id
                        ? "border-slate-900 bg-slate-900 text-white shadow-[var(--shadow-card)]"
                        : "border-border/70 bg-white hover:border-slate-200 hover:shadow-[var(--shadow-card)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{profile.refurb_category}</p>
                        <p className={cn("mt-1 text-xs", selectedCapacityId === profile.id ? "text-slate-300" : "text-muted-foreground")}>
                          {profile.stage_label} / {profile.owner_name || profile.owner_role || "未分配"}
                        </p>
                      </div>
                      <RiskBadge risk={plannedForStage > Number(profile.daily_capacity || 0) ? "high" : "low"} />
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className={cn("text-xs", selectedCapacityId === profile.id ? "text-slate-300" : "text-muted-foreground")}>日产能</p>
                        <p className="mt-1 text-2xl font-semibold">{formatNumber(profile.daily_capacity)}</p>
                      </div>
                      <div className="min-w-28 text-right">
                        <p className={cn("text-xs", selectedCapacityId === profile.id ? "text-slate-300" : "text-muted-foreground")}>当前负载</p>
                        <p className="mt-1 text-sm font-medium">{formatPercent(usageRatio)}</p>
                      </div>
                    </div>
                    <div className={cn("mt-3 h-2 rounded-full", selectedCapacityId === profile.id ? "bg-white/10" : "bg-muted")}>
                      <div className={cn("h-full rounded-full", selectedCapacityId === profile.id ? "bg-white" : "bg-sky-400")} style={{ width: `${Math.min(usageRatio * 100, 100)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[24px] border border-border/80 bg-muted/20 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={capacityDraft.refurb_category} onChange={(event) => updateCapacity("refurb_category", event.target.value)} placeholder="翻新类别，例如整机翻新" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Select value={capacityDraft.stage_key} onValueChange={(value) => updateCapacity("stage_key", value)}>
                  <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                    <SelectValue placeholder="选择工序" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.stage_options ?? []).map((option) => (
                      <SelectItem key={`capacity-stage-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min="0" step="0.01" value={capacityDraft.daily_capacity} onChange={(event) => updateCapacity("daily_capacity", numberFromInput(event.target.value))} placeholder="日产能" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input type="date" value={capacityDraft.effective_date ?? ""} onChange={(event) => updateCapacity("effective_date", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input value={capacityDraft.owner_name} onChange={(event) => updateCapacity("owner_name", event.target.value)} placeholder="负责人" className="h-11 rounded-2xl border-border/80 bg-white" />
                <Input value={capacityDraft.owner_role} onChange={(event) => updateCapacity("owner_role", event.target.value)} placeholder="角色" className="h-11 rounded-2xl border-border/80 bg-white" />
              </div>
              <Textarea value={capacityDraft.note} onChange={(event) => updateCapacity("note", event.target.value)} placeholder="记录这组产能的适用条件、班次说明或最近变更原因" className="mt-3 min-h-[108px] rounded-[22px] border-border/80 bg-white" />
              <div className="mt-3 flex justify-end">
                <Button className="cta-button rounded-full" onClick={() => void saveCapacity()} disabled={savingCapacity}>
                  <Save className="size-4" />
                  保存产能档
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">排产清单</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">默认优先展示阻塞和高风险项，先把需要协同处理的排产拎出来。</p>
              </div>
              <Button variant="outline" className="rounded-full" onClick={createNewSchedule}>
                新建排产
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="h-[720px] rounded-[22px] border border-border/70 bg-muted/30" />
            ) : data?.schedule_items.length ? (
              <div className="surface-table overflow-hidden">
                <ScrollArea className="h-[720px]">
                  <div className="space-y-3 p-3">
                    {data.schedule_items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectSchedule(item)}
                        className={cn(
                          "w-full rounded-[24px] border px-4 py-4 text-left transition",
                          selectedScheduleId === item.id
                            ? "border-slate-900 bg-slate-900 text-white shadow-[var(--shadow-card)]"
                            : "border-border/70 bg-white hover:border-slate-200 hover:shadow-[var(--shadow-card)]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold tracking-tight">{item.material_name}</p>
                            <p className={cn("mt-1 text-xs", selectedScheduleId === item.id ? "text-slate-300" : "text-muted-foreground")}>
                              {item.schedule_no} / {item.refurb_category} / {item.stage_label}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <RiskBadge risk={item.risk_level} />
                            <StatusBadge status={item.status} />
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <MetricMini label="计划/实际" value={`${formatNumber(item.planned_qty)} / ${formatNumber(item.actual_qty)}`} active={selectedScheduleId === item.id} />
                          <MetricMini label="待料缺口" value={formatNumber(item.material_gap_qty)} active={selectedScheduleId === item.id} />
                          <MetricMini label="日期" value={formatDate(item.schedule_date)} active={selectedScheduleId === item.id} />
                        </div>
                        <p className={cn("mt-4 line-clamp-2 text-sm leading-6", selectedScheduleId === item.id ? "text-slate-200" : "text-muted-foreground")}>
                          {item.blocker_reason || item.note || "当前没有补充说明。"}
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
                    <Factory className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>当前筛选下没有排产项</EmptyTitle>
                  <EmptyDescription>可以先新建一条排产，或者切换时间区间查看近期翻新节拍。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">排产编排</CardTitle>
            <p className="text-sm text-muted-foreground">在这里维护负责人、状态、风险、备料情况和阻塞原因。保存后会同步到任务中心。</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Input type="date" value={scheduleDraft.schedule_date ?? ""} onChange={(event) => updateSchedule("schedule_date", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
              <Input value={scheduleDraft.schedule_no} onChange={(event) => updateSchedule("schedule_no", event.target.value)} placeholder="排产编号，可留空自动生成" className="h-11 rounded-2xl border-border/80 bg-white" />
              <Input value={scheduleDraft.refurb_category} onChange={(event) => updateSchedule("refurb_category", event.target.value)} placeholder="翻新类别" className="h-11 rounded-2xl border-border/80 bg-white" />
              <Input value={scheduleDraft.material_name} onChange={(event) => updateSchedule("material_name", event.target.value)} placeholder="物料名称" className="h-11 rounded-2xl border-border/80 bg-white" />
              <Select value={scheduleDraft.stage_key} onValueChange={(value) => updateSchedule("stage_key", value)}>
                <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                  <SelectValue placeholder="工序" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.stage_options ?? []).map((option) => (
                    <SelectItem key={`schedule-stage-${option.value}`} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={scheduleDraft.status} onValueChange={(value) => updateSchedule("status", value)}>
                <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.status_options ?? []).map((option) => (
                    <SelectItem key={`schedule-status-${option.value}`} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" min="0" step="0.01" value={scheduleDraft.planned_qty} onChange={(event) => updateSchedule("planned_qty", numberFromInput(event.target.value))} placeholder="计划台数" className="h-11 rounded-2xl border-border/80 bg-white" />
              <Input type="number" min="0" step="0.01" value={scheduleDraft.actual_qty} onChange={(event) => updateSchedule("actual_qty", numberFromInput(event.target.value))} placeholder="实际台数" className="h-11 rounded-2xl border-border/80 bg-white" />
              <Input type="number" min="0" step="0.01" value={scheduleDraft.backlog_qty} onChange={(event) => updateSchedule("backlog_qty", numberFromInput(event.target.value))} placeholder="积压台数" className="h-11 rounded-2xl border-border/80 bg-white" />
              <Input type="number" min="0" step="0.01" value={scheduleDraft.material_ready_qty} onChange={(event) => updateSchedule("material_ready_qty", numberFromInput(event.target.value))} placeholder="已备料台数" className="h-11 rounded-2xl border-border/80 bg-white" />
              <Select value={scheduleDraft.risk_level} onValueChange={(value) => updateSchedule("risk_level", value)}>
                <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                  <SelectValue placeholder="风险等级" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.risk_options ?? []).map((option) => (
                    <SelectItem key={`schedule-risk-${option.value}`} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={scheduleDraft.owner_name} onChange={(event) => updateSchedule("owner_name", event.target.value)} placeholder="负责人" className="h-11 rounded-2xl border-border/80 bg-white" />
              <Input value={scheduleDraft.owner_role} onChange={(event) => updateSchedule("owner_role", event.target.value)} placeholder="角色" className="h-11 rounded-2xl border-border/80 bg-white" />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <LiveMetric label="计划达成" value={formatPercent(liveAchievement)} />
              <LiveMetric label="待料缺口" value={formatNumber(liveMaterialGap)} />
              <LiveMetric label="最后更新" value={formatDateTime(scheduleDraft.updated_at)} />
            </div>

            <Textarea value={scheduleDraft.blocker_reason} onChange={(event) => updateSchedule("blocker_reason", event.target.value)} placeholder="如果已阻塞，请写清楚卡在哪一段：待料、产能、返修、质检，还是优先级被其他机型占用" className="min-h-[112px] rounded-[22px] border-border/80 bg-white" />
            <Textarea value={scheduleDraft.note} onChange={(event) => updateSchedule("note", event.target.value)} placeholder="补充本次排产的协同说明，例如班次安排、跨班交接、临时替代料等" className="min-h-[108px] rounded-[22px] border-border/80 bg-white" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <RiskBadge risk={scheduleDraft.risk_level} />
                <StatusBadge status={scheduleDraft.status} />
              </div>
              <Button className="cta-button rounded-full" onClick={() => void saveSchedule()} disabled={savingSchedule}>
                <Save className="size-4" />
                保存排产项
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">近期实际产出</CardTitle>
          <p className="text-sm text-muted-foreground">这里直接引用既有翻新日报结果，方便你对照排产与真实完成、质检和人效。</p>
        </CardHeader>
        <CardContent>
          {data?.recent_actuals.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.recent_actuals.map((row) => (
                <div key={`${row.id}-${row.biz_date}`} className="rounded-[24px] border border-border/70 bg-white p-4 shadow-[var(--shadow-card)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{row.material_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{row.biz_date} / {row.refurb_category}</p>
                    </div>
                    <Badge className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none">
                      人效 {formatNumber(row.refurb_efficiency)}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <MetricMini label="计划" value={formatNumber(row.plan_qty)} active={false} />
                    <MetricMini label="良品" value={formatNumber(row.final_good_qty)} active={false} />
                    <MetricMini label="不良率" value={formatPercent(row.quality_reject_rate)} active={false} />
                    <MetricMini label="达成率" value={formatPercent(row.plan_achievement_rate)} active={false} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty className="border-border/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageCheck className="size-4" />
                </EmptyMedia>
                <EmptyTitle>当前区间还没有翻新日报</EmptyTitle>
                <EmptyDescription>旧版翻新日报录入仍然可用；这里会自动读取最近的实际产出作为协同参考。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
