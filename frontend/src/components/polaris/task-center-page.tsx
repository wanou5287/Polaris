"use client";

import { startTransition, type ReactNode, useDeferredValue, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  ListTodo,
  RefreshCcw,
  Save,
  Search,
  Workflow,
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
import type { Option, TaskCenterItem, TaskCenterResponse } from "@/lib/polaris-types";

const taskStatusMeta: Record<string, { label: string; className: string }> = {
  open: { label: "待处理", className: "border-sky-200 bg-sky-50 text-sky-700" },
  in_progress: { label: "处理中", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  blocked: { label: "阻塞", className: "border-amber-200 bg-amber-50 text-amber-700" },
  completed: { label: "已完成", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

const priorityMeta: Record<string, { label: string; className: string }> = {
  high: { label: "高优先级", className: "border-rose-200 bg-rose-50 text-rose-700" },
  normal: { label: "中优先级", className: "border-border/80 bg-white text-muted-foreground" },
  low: { label: "低优先级", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const sourceMeta: Record<string, { label: string; className: string }> = {
  procurement: { label: "采购到货", className: "border-slate-200 bg-slate-100 text-slate-700" },
  inventory_flow: { label: "库存流转", className: "border-zinc-900 bg-zinc-900 text-white" },
};

async function requestTaskCenter(params: URLSearchParams) {
  return apiFetch<TaskCenterResponse>(`/api/backend/task-center?${params.toString()}`);
}

function asText(value: unknown) {
  if (value == null) {
    return "--";
  }
  const text = String(value).trim();
  return text || "--";
}

function asNumber(value: unknown) {
  if (value == null || value === "") {
    return "--";
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatNumber(numeric) : asText(value);
}

export function TaskCenterPage() {
  const [data, setData] = useState<TaskCenterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TaskCenterItem | null>(null);
  const [keyword, setKeyword] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const deferredKeyword = useDeferredValue(keyword);

  async function loadTaskCenter(nextSelectedId?: number | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (taskStatusFilter !== "all") params.set("task_status", taskStatusFilter);
      if (sourceFilter !== "all") params.set("source_module", sourceFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (deferredKeyword.trim()) params.set("keyword", deferredKeyword.trim());
      params.set("limit", "180");
      const response = await requestTaskCenter(params);
      setData(response);
      startTransition(() => {
        const targetId = nextSelectedId ?? selectedId;
        const matched = response.items.find((item) => item.id === targetId) ?? response.items[0] ?? null;
        setSelectedId(matched?.id ?? null);
        setDraft(matched ? { ...matched } : null);
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务中心加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTaskCenter(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskStatusFilter, sourceFilter, priorityFilter, deferredKeyword]);

  function selectItem(item: TaskCenterItem) {
    startTransition(() => {
      setSelectedId(item.id);
      setDraft({ ...item });
    });
  }

  function updateDraft<K extends keyof TaskCenterItem>(key: K, value: TaskCenterItem[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveTaskItem() {
    if (!draft) {
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch<{ saved: boolean; item: TaskCenterItem }>("/api/backend/task-center/items", {
        method: "POST",
        body: JSON.stringify({
          id: draft.id,
          task_status: draft.task_status,
          priority: draft.priority,
          owner_name: draft.owner_name,
          owner_role: draft.owner_role,
          due_date: draft.due_date,
          note: draft.note,
        }),
      });
      toast.success("任务中心待办已保存");
      await loadTaskCenter(response.item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务中心保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6" data-page="task-center">
      <div className="surface-panel p-6 sm:p-8">
        <PageHeader
          eyebrow="Operations"
          title="任务中心与异常待办"
          description="把采购到货跟进、库存执行任务和阻塞异常拉到同一块操作面板里，先统一节奏，再逐步补审批与补偿闭环。"
          badge={data ? `${formatNumber(data.summary.total_count)} 个统一待办` : "加载中"}
          actions={
            <>
              <Button variant="outline" className="rounded-full" onClick={() => void loadTaskCenter(selectedId)}>
                <RefreshCcw className="size-4" />
                刷新待办
              </Button>
              <Button className="cta-button rounded-full" onClick={() => void saveTaskItem()} disabled={saving || !draft}>
                <Save className="size-4" />
                保存跟进
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard title="待处理" value={formatNumber(data?.summary.open_count ?? 0)} hint="尚未开工或等待领取" icon={<ListTodo className="size-4" />} />
        <SummaryCard title="处理中" value={formatNumber(data?.summary.in_progress_count ?? 0)} hint="已进入执行节奏" icon={<Workflow className="size-4" />} />
        <SummaryCard title="阻塞异常" value={formatNumber(data?.summary.blocked_count ?? 0)} hint="需要升级或补偿" icon={<AlertTriangle className="size-4" />} />
        <SummaryCard title="已完成" value={formatNumber(data?.summary.completed_count ?? 0)} hint="已经闭环归档" icon={<CheckCheck className="size-4" />} />
        <SummaryCard title="逾期待办" value={formatNumber(data?.summary.overdue_count ?? 0)} hint="超过计划日期未完成" icon={<CalendarClock className="size-4" />} />
        <SummaryCard title="高优先级" value={formatNumber(data?.summary.high_priority_count ?? 0)} hint={`采购 ${formatNumber(data?.summary.procurement_count ?? 0)} / 流转 ${formatNumber(data?.summary.inventory_flow_count ?? 0)}`} icon={<AlertTriangle className="size-4" />} />
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索任务标题、来源单号或备注"
                className="h-11 rounded-2xl border-border/80 bg-white pl-11"
              />
            </div>
            <FilterSelect value={taskStatusFilter} onValueChange={setTaskStatusFilter} placeholder="任务状态" options={data?.task_status_options ?? []} allLabel="全部任务状态" />
            <FilterSelect value={sourceFilter} onValueChange={setSourceFilter} placeholder="来源模块" options={data?.source_module_options ?? []} allLabel="全部来源模块" />
            <FilterSelect value={priorityFilter} onValueChange={setPriorityFilter} placeholder="优先级" options={data?.priority_options ?? []} allLabel="全部优先级" />
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => void loadTaskCenter(selectedId)}>
              立即刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">统一待办清单</CardTitle>
            <p className="text-sm text-muted-foreground">默认优先展示阻塞和高优先级任务，方便团队先消化风险。</p>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="h-[720px] rounded-[22px] border border-border/70 bg-muted/30" />
            ) : data?.items.length ? (
              <div className="surface-table overflow-hidden">
                <ScrollArea className="h-[720px]">
                  <div className="space-y-3 p-3">
                    {data.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectItem(item)}
                        className={cn(
                          "w-full rounded-[24px] border px-4 py-4 text-left transition",
                          selectedId === item.id
                            ? "border-slate-900 bg-slate-900 text-white shadow-[var(--shadow-card)]"
                            : "border-border/70 bg-white hover:border-slate-200 hover:shadow-[var(--shadow-card)]",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold tracking-tight">{item.task_title}</p>
                            <p className={cn("mt-1 text-xs", selectedId === item.id ? "text-slate-300" : "text-muted-foreground")}>
                              {item.source_no} · {item.task_category_label}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <SourceBadge sourceModule={item.source_module} active={selectedId === item.id} />
                            <PriorityBadge priority={item.priority} active={selectedId === item.id} />
                            <TaskStatusBadge status={item.task_status} active={selectedId === item.id} />
                          </div>
                        </div>
                        <p className={cn("mt-4 line-clamp-2 text-sm leading-6", selectedId === item.id ? "text-slate-200" : "text-muted-foreground")}>
                          {item.summary_text || "暂无摘要"}
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <MetricMini label="负责人" value={item.owner_name || item.owner_role || "待分配"} active={selectedId === item.id} />
                          <MetricMini label="计划日期" value={formatDate(item.due_date)} active={selectedId === item.id} />
                          <MetricMini label="最近更新" value={formatDateTime(item.updated_at)} active={selectedId === item.id} />
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
                    <ListTodo className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>当前筛选下没有统一待办</EmptyTitle>
                  <EmptyDescription>可以切换筛选条件，或者先去采购到货和库存流转创建业务动作。</EmptyDescription>
                </EmptyHeader>
                <Button variant="outline" className="rounded-full" onClick={() => void loadTaskCenter()}>
                  刷新任务中心
                </Button>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">跟进编排</CardTitle>
              <p className="text-sm text-muted-foreground">这里先维护跨模块执行状态、责任人和备注，后面再逐步补审批与通知。</p>
            </CardHeader>
            <CardContent>
              {draft ? (
                <div className="space-y-6">
                  <div className="rounded-[24px] border border-border/70 bg-muted/25 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge sourceModule={draft.source_module} />
                      <PriorityBadge priority={draft.priority} />
                      <TaskStatusBadge status={draft.task_status} />
                      {draft.is_overdue ? <Badge className="rounded-full border-amber-200 bg-amber-50 text-amber-700">已逾期</Badge> : null}
                    </div>
                    <p className="mt-4 text-xl font-semibold tracking-tight text-foreground">{draft.task_title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{draft.summary_text || "暂无补充摘要"}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="统一状态">
                      <FilterSelect value={draft.task_status} onValueChange={(value) => updateDraft("task_status", value)} placeholder="统一状态" options={data?.task_status_options ?? []} />
                    </Field>
                    <Field label="优先级">
                      <FilterSelect value={draft.priority} onValueChange={(value) => updateDraft("priority", value)} placeholder="优先级" options={data?.priority_options ?? []} />
                    </Field>
                    <Field label="负责人">
                      <Input value={draft.owner_name} onChange={(event) => updateDraft("owner_name", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </Field>
                    <Field label="责任角色">
                      <Input value={draft.owner_role} onChange={(event) => updateDraft("owner_role", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </Field>
                    <Field label="计划完成日期">
                      <Input type="date" value={draft.due_date ?? ""} onChange={(event) => updateDraft("due_date", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </Field>
                    <Field label="来源状态">
                      <div className="flex h-11 items-center rounded-2xl border border-border/80 bg-muted/25 px-4 text-sm text-muted-foreground">
                        {draft.source_status || "--"} / {draft.source_detail_status || "--"}
                      </div>
                    </Field>
                  </div>

                  <Field label="跟进备注">
                    <Textarea
                      value={draft.note}
                      onChange={(event) => updateDraft("note", event.target.value)}
                      placeholder="记录升级动作、补偿结论、责任人确认信息或交接备注"
                      className="min-h-[150px] rounded-[22px] border-border/80 bg-white"
                    />
                  </Field>
                </div>
              ) : (
                <Empty className="border-border/70">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Workflow className="size-4" />
                    </EmptyMedia>
                    <EmptyTitle>先从左侧选择一条待办</EmptyTitle>
                    <EmptyDescription>选中后可以统一维护状态、责任人、日期和跟进备注。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">来源快照</CardTitle>
              <p className="text-sm text-muted-foreground">不改老系统入口，先把关键来源信息聚到这里，方便团队一眼判断下一步动作。</p>
            </CardHeader>
            <CardContent>
              {draft ? (
                <SourceSnapshot item={draft} />
              ) : (
                <p className="text-sm text-muted-foreground">当前没有可展示的来源快照。</p>
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

function TaskStatusBadge({ status, active = false }: { status: string; active?: boolean }) {
  const meta = taskStatusMeta[status] ?? taskStatusMeta.open;
  return <Badge className={cn("rounded-full border font-medium", active ? "border-white/20 bg-white/10 text-white" : meta.className)}>{meta.label}</Badge>;
}

function PriorityBadge({ priority, active = false }: { priority: string; active?: boolean }) {
  const meta = priorityMeta[priority] ?? priorityMeta.normal;
  return <Badge className={cn("rounded-full border font-medium", active ? "border-white/20 bg-white/10 text-white" : meta.className)}>{meta.label}</Badge>;
}

function SourceBadge({ sourceModule, active = false }: { sourceModule: string; active?: boolean }) {
  const meta = sourceMeta[sourceModule] ?? sourceMeta.procurement;
  return <Badge className={cn("rounded-full border font-medium", active ? "border-white/20 bg-white/10 text-white" : meta.className)}>{meta.label}</Badge>;
}

function SnapshotField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-border/70 bg-muted/20 px-4 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function SourceSnapshot({ item }: { item: TaskCenterItem }) {
  const snapshot = item.source_snapshot ?? {};

  if (item.source_module === "procurement") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <SnapshotField label="采购单号" value={asText(snapshot.purchase_order_no)} />
        <SnapshotField label="供应商" value={asText(snapshot.supplier_name)} />
        <SnapshotField label="到货仓" value={asText(snapshot.warehouse_name)} />
        <SnapshotField label="渠道" value={asText(snapshot.channel_name)} />
        <SnapshotField label="SKU" value={`${asText(snapshot.sku_code)} / ${asText(snapshot.sku_name)}`} />
        <SnapshotField label="应到 / 实到" value={`${asNumber(snapshot.expected_qty)} / ${asNumber(snapshot.arrived_qty)}`} />
        <SnapshotField label="合格 / 异常" value={`${asNumber(snapshot.qualified_qty)} / ${asNumber(snapshot.exception_qty)}`} />
        <SnapshotField label="待补数量" value={asNumber(snapshot.pending_qty)} />
        <SnapshotField label="单据状态" value={`${asText(snapshot.status)} / ${asText(snapshot.document_status)}`} />
        <SnapshotField label="异常原因" value={asText(snapshot.exception_reason)} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SnapshotField label="来源单号" value={asText(snapshot.source_record_no)} />
      <SnapshotField label="触发来源" value={asText(snapshot.trigger_source)} />
      <SnapshotField label="动作类型" value={asText(snapshot.action_type)} />
      <SnapshotField label="SKU" value={`${asText(snapshot.sku_code)} / ${asText(snapshot.sku_name)}`} />
      <SnapshotField label="申请 / 确认" value={`${asNumber(snapshot.request_qty)} / ${asNumber(snapshot.confirmed_qty)}`} />
      <SnapshotField label="完成率" value={typeof snapshot.completion_rate === "number" ? `${(snapshot.completion_rate * 100).toFixed(1)}%` : asText(snapshot.completion_rate)} />
      <SnapshotField label="来源状态" value={asText(snapshot.source_status_name)} />
      <SnapshotField label="目标状态" value={asText(snapshot.target_status_name)} />
      <SnapshotField label="来源仓" value={asText(snapshot.source_warehouse_name)} />
      <SnapshotField label="目标仓" value={asText(snapshot.target_warehouse_name)} />
      <SnapshotField label="原因" value={asText(snapshot.reason_text)} />
      <SnapshotField label="来源备注" value={asText(snapshot.note)} />
    </div>
  );
}
