"use client";

import { startTransition, type ReactNode, useDeferredValue, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

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
import type { Option, ReconciliationCase, ReconciliationResponse } from "@/lib/polaris-types";

const caseStatusMeta: Record<string, { label: string; className: string }> = {
  open: { label: "待处理", className: "border-rose-200 bg-rose-50 text-rose-700" },
  compensating: { label: "补偿中", className: "border-sky-200 bg-sky-50 text-sky-700" },
  resolved: { label: "已解决", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  ignored: { label: "已忽略", className: "border-border/80 bg-white text-muted-foreground" },
};

const severityMeta: Record<string, { label: string; className: string }> = {
  high: { label: "高严重性", className: "border-amber-200 bg-amber-50 text-amber-700" },
  normal: { label: "中严重性", className: "border-border/80 bg-white text-muted-foreground" },
  low: { label: "低严重性", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const sourceMeta: Record<string, { label: string; className: string }> = {
  procurement: { label: "采购到货", className: "border-slate-200 bg-slate-100 text-slate-700" },
  inventory_flow: { label: "库存流转", className: "border-zinc-900 bg-zinc-900 text-white" },
};

const suggestedActionByType: Record<string, string> = {
  document_sync: "retry_document_sync",
  inventory_task_missing: "resync_inventory_tasks",
  inventory_task_lag: "resync_inventory_tasks",
  inventory_task_blocked: "reopen_inventory_task",
  inventory_task_overdue: "reopen_inventory_task",
};

async function requestReconciliationCases(params: URLSearchParams) {
  return apiFetch<ReconciliationResponse>(`/api/backend/reconciliation-center?${params.toString()}`);
}

function formatSnapshotValue(value: unknown): string {
  if (value == null || value === "") {
    return "--";
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatSnapshotValue(item)).join(" / ");
  }
  if (typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  }
  return String(value);
}

function suggestedCompensationAction(item: ReconciliationCase | null) {
  if (!item) {
    return "none";
  }
  return suggestedActionByType[item.case_type] ?? "none";
}

export function ReconciliationCenterPage() {
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ReconciliationCase | null>(null);
  const [compensationAction, setCompensationAction] = useState("none");
  const [keyword, setKeyword] = useState("");
  const [caseStatusFilter, setCaseStatusFilter] = useState("all");
  const [caseTypeFilter, setCaseTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const deferredKeyword = useDeferredValue(keyword);

  async function loadCases(nextSelectedId?: number | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (caseStatusFilter !== "all") params.set("case_status", caseStatusFilter);
      if (caseTypeFilter !== "all") params.set("case_type", caseTypeFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (deferredKeyword.trim()) params.set("keyword", deferredKeyword.trim());
      params.set("limit", "180");
      const response = await requestReconciliationCases(params);
      setData(response);
      startTransition(() => {
        const targetId = nextSelectedId ?? selectedId;
        const matched = response.items.find((item) => item.id === targetId) ?? response.items[0] ?? null;
        setSelectedId(matched?.id ?? null);
        setDraft(matched ? { ...matched } : null);
        setCompensationAction(suggestedCompensationAction(matched));
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "对账补偿数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCases(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseStatusFilter, caseTypeFilter, severityFilter, deferredKeyword]);

  function selectCase(item: ReconciliationCase) {
    startTransition(() => {
      setSelectedId(item.id);
      setDraft({ ...item });
      setCompensationAction(suggestedCompensationAction(item));
    });
  }

  function updateDraft<K extends keyof ReconciliationCase>(key: K, value: ReconciliationCase[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveCase() {
    if (!draft) {
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch<{ saved: boolean; item: ReconciliationCase }>("/api/backend/reconciliation-center/cases", {
        method: "POST",
        body: JSON.stringify({
          id: draft.id,
          case_status: draft.case_status,
          owner_name: draft.owner_name,
          owner_role: draft.owner_role,
          due_date: draft.due_date,
          compensation_action: compensationAction,
          compensation_note: draft.compensation_note,
        }),
      });
      toast.success(compensationAction === "none" ? "对账案例已保存" : "补偿动作已执行");
      await loadCases(response.item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "对账补偿保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6" data-page="reconciliation-center">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard title="待处理" value={formatNumber(data?.summary.open_count ?? 0)} hint="尚未开始补偿" icon={<ShieldAlert className="size-4" />} />
        <SummaryCard title="补偿中" value={formatNumber(data?.summary.compensating_count ?? 0)} hint="已推进但仍需复查" icon={<Sparkles className="size-4" />} />
        <SummaryCard title="高严重性" value={formatNumber(data?.summary.high_severity_count ?? 0)} hint="优先级最高的差异" icon={<AlertTriangle className="size-4" />} />
        <SummaryCard title="单据异常" value={formatNumber(data?.summary.document_sync_count ?? 0)} hint="回写或编排失败" icon={<ShieldAlert className="size-4" />} />
        <SummaryCard title="任务缺失" value={formatNumber(data?.summary.inventory_missing_count ?? 0)} hint="自动流转链路未补全" icon={<BadgeCheck className="size-4" />} />
        <SummaryCard title="逾期/阻塞" value={formatNumber((data?.summary.overdue_count ?? 0) + (data?.summary.blocked_count ?? 0))} hint={`阻塞 ${formatNumber(data?.summary.blocked_count ?? 0)}`} icon={<ShieldCheck className="size-4" />} />
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索案例标题、来源单号或补偿备注"
                className="h-11 rounded-2xl border-border/80 bg-white pl-11"
              />
            </div>
            <FilterSelect value={caseStatusFilter} onValueChange={setCaseStatusFilter} placeholder="案例状态" options={data?.case_status_options ?? []} allLabel="全部案例状态" />
            <FilterSelect value={caseTypeFilter} onValueChange={setCaseTypeFilter} placeholder="案例类型" options={data?.case_type_options ?? []} allLabel="全部案例类型" />
            <FilterSelect value={severityFilter} onValueChange={setSeverityFilter} placeholder="严重性" options={data?.severity_options ?? []} allLabel="全部严重性" />
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => void loadCases(selectedId)}>
              立即刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">对账案例清单</CardTitle>
            <p className="text-sm text-muted-foreground">优先展示待处理和补偿中的高严重性案例，让团队先把链路打通。</p>
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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold tracking-tight">{item.case_title}</p>
                            <p className={cn("mt-1 text-xs", selectedId === item.id ? "text-slate-300" : "text-muted-foreground")}>
                              {item.case_type_label} · {item.source_no}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <SourceBadge sourceModule={item.source_module} active={selectedId === item.id} />
                            <SeverityBadge severity={item.severity} active={selectedId === item.id} />
                            <CaseStatusBadge status={item.case_status} active={selectedId === item.id} />
                          </div>
                        </div>
                        <p className={cn("mt-4 line-clamp-2 text-sm leading-6", selectedId === item.id ? "text-slate-200" : "text-muted-foreground")}>
                          {item.diff_summary || "暂无差异描述"}
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <MetricMini label="责任人" value={item.owner_name || item.owner_role || "待分配"} active={selectedId === item.id} />
                          <MetricMini label="计划日期" value={formatDate(item.due_date)} active={selectedId === item.id} />
                          <MetricMini label="最近动作" value={item.last_compensation_action_label || "未补偿"} active={selectedId === item.id} />
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <Empty className="border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ShieldCheck className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>当前筛选下没有对账案例</EmptyTitle>
                  <EmptyDescription>可以调整筛选条件，或者先在采购到货与库存流转里制造一条测试链路。</EmptyDescription>
                </EmptyHeader>
                <Button variant="outline" className="rounded-full" onClick={() => void loadCases()}>
                  刷新对账案例
                </Button>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">补偿编排</CardTitle>
              <p className="text-sm text-muted-foreground">先记录谁来跟、何时完成、要执行什么动作；补偿执行后，再由系统自动回刷案例状态。</p>
            </CardHeader>
            <CardContent>
              {draft ? (
                <div className="space-y-6">
                  <div className="rounded-[24px] border border-border/70 bg-muted/25 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge sourceModule={draft.source_module} />
                      <SeverityBadge severity={draft.severity} />
                      <CaseStatusBadge status={draft.case_status} />
                      {draft.is_overdue ? <Badge className="rounded-full border-amber-200 bg-amber-50 text-amber-700">已逾期</Badge> : null}
                    </div>
                    <p className="mt-4 text-xl font-semibold tracking-tight text-foreground">{draft.case_title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{draft.diff_summary || "暂无差异说明"}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="案例状态">
                      <FilterSelect value={draft.case_status} onValueChange={(value) => updateDraft("case_status", value)} placeholder="案例状态" options={data?.case_status_options ?? []} />
                    </Field>
                    <Field label="补偿动作">
                      <FilterSelect value={compensationAction} onValueChange={setCompensationAction} placeholder="补偿动作" options={data?.compensation_action_options ?? []} />
                    </Field>
                    <Field label="责任人">
                      <Input value={draft.owner_name} onChange={(event) => updateDraft("owner_name", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </Field>
                    <Field label="责任角色">
                      <Input value={draft.owner_role} onChange={(event) => updateDraft("owner_role", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </Field>
                    <Field label="计划完成日期">
                      <Input type="date" value={draft.due_date ?? ""} onChange={(event) => updateDraft("due_date", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </Field>
                    <Field label="最近补偿">
                      <div className="flex h-11 items-center rounded-2xl border border-border/80 bg-muted/25 px-4 text-sm text-muted-foreground">
                        {draft.last_compensation_action_label || "暂无"} / {formatDateTime(draft.compensated_at)}
                      </div>
                    </Field>
                  </div>

                  <Field label="补偿备注">
                    <Textarea
                      value={draft.compensation_note}
                      onChange={(event) => updateDraft("compensation_note", event.target.value)}
                      placeholder="记录定位结论、补偿原因、回写说明或人工兜底方式"
                      className="min-h-[150px] rounded-[22px] border-border/80 bg-white"
                    />
                  </Field>
                </div>
              ) : (
                <Empty className="border-border/70">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ShieldAlert className="size-4" />
                    </EmptyMedia>
                    <EmptyTitle>先从左侧选择一条对账案例</EmptyTitle>
                    <EmptyDescription>选中后可以直接指定补偿动作、责任人和补偿备注。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">预期 vs 实际</CardTitle>
              <p className="text-sm text-muted-foreground">把系统预期和当前实际并排摆出来，减少来回切多个页面找差异。</p>
            </CardHeader>
            <CardContent>
              {draft ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <SnapshotPanel title="预期快照" snapshot={draft.expected_snapshot} />
                  <SnapshotPanel title="实际快照" snapshot={draft.actual_snapshot} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">当前没有可展示的对账快照。</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
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
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-muted text-foreground">{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {children}
    </div>
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
  allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allLabel ? <SelectItem value="all">{allLabel}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MetricMini({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border px-3 py-3", active ? "border-white/15 bg-white/8" : "border-border/70 bg-muted/20")}>
      <p className={cn("text-xs", active ? "text-slate-300" : "text-muted-foreground")}>{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function CaseStatusBadge({ status, active = false }: { status: string; active?: boolean }) {
  const meta = caseStatusMeta[status] ?? caseStatusMeta.open;
  return <Badge className={cn("rounded-full border font-medium", active ? "border-white/20 bg-white/10 text-white" : meta.className)}>{meta.label}</Badge>;
}

function SeverityBadge({ severity, active = false }: { severity: string; active?: boolean }) {
  const meta = severityMeta[severity] ?? severityMeta.normal;
  return <Badge className={cn("rounded-full border font-medium", active ? "border-white/20 bg-white/10 text-white" : meta.className)}>{meta.label}</Badge>;
}

function SourceBadge({ sourceModule, active = false }: { sourceModule: string; active?: boolean }) {
  const meta = sourceMeta[sourceModule] ?? sourceMeta.procurement;
  return <Badge className={cn("rounded-full border font-medium", active ? "border-white/20 bg-white/10 text-white" : meta.className)}>{meta.label}</Badge>;
}

function SnapshotPanel({
  title,
  snapshot,
}: {
  title: string;
  snapshot: Record<string, unknown> | null;
}) {
  const entries = Object.entries(snapshot ?? {}).slice(0, 12);

  return (
    <div className="rounded-[24px] border border-border/80 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="rounded-full border border-border/70 bg-white px-3 py-1 text-xs text-muted-foreground">
          {entries.length} 项
        </div>
      </div>
      {entries.length ? (
        <div className="mt-4 grid gap-3">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-[18px] border border-border/70 bg-white px-3 py-3">
              <p className="text-xs text-muted-foreground">{key}</p>
              <p className="mt-2 text-sm font-medium leading-6 text-foreground">{formatSnapshotValue(value)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">当前没有可展示的字段。</p>
      )}
    </div>
  );
}
