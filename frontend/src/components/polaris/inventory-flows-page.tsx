"use client";

import { startTransition, type ReactNode, useDeferredValue, useEffect, useState } from "react";
import { Plus, RefreshCcw, Save, Search, Waypoints } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/polaris/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, cn, formatDate, formatNumber } from "@/lib/polaris-client";
import type { InventoryFlowResponse, InventoryFlowRule, InventoryFlowTask, Option } from "@/lib/polaris-types";

type SelectedKey = number | "new";

const conditionOptions: Option[] = [
  { value: "manual", label: "人工" },
  { value: "qualified_qty", label: "合格数量" },
  { value: "exception_qty", label: "异常数量" },
];

const taskStatusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: "草稿", className: "border-border/80 bg-white text-muted-foreground" },
  pending: { label: "待执行", className: "border-sky-200 bg-sky-50 text-sky-700" },
  completed: { label: "已完成", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  blocked: { label: "阻塞", className: "border-amber-200 bg-amber-50 text-amber-700" },
  cancelled: { label: "已取消", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

const actionMeta: Record<string, { label: string; className: string }> = {
  status_transition: { label: "状态流转", className: "border-border/80 bg-muted/50 text-foreground" },
  warehouse_transfer: { label: "仓间调拨", className: "border-slate-200 bg-slate-100 text-slate-700" },
};

function createTaskDraft(response?: InventoryFlowResponse): InventoryFlowTask {
  const statusOption = response?.status_options[0];
  const warehouseOption = response?.warehouse_options[0];
  const actionOption = response?.action_options[0];
  const taskStatusOption = response?.task_status_options.find((item) => item.value === "draft") ?? response?.task_status_options[0];
  const priorityOption = response?.priority_options.find((item) => item.value === "normal") ?? response?.priority_options[0];
  const triggerOption = response?.trigger_source_options.find((item) => item.value === "manual") ?? response?.trigger_source_options[0];

  return {
    id: 0,
    task_no: "",
    source_record_type: "manual",
    source_record_id: "",
    source_record_no: "",
    trigger_source: triggerOption?.value ?? "manual",
    action_type: actionOption?.value ?? "status_transition",
    task_status: taskStatusOption?.value ?? "draft",
    priority: priorityOption?.value ?? "normal",
    sku_code: "",
    sku_name: "",
    request_qty: 0,
    confirmed_qty: 0,
    completion_rate: 0,
    source_status_id: statusOption?.value ?? "",
    source_status_name: statusOption?.label ?? "",
    target_status_id: statusOption?.value ?? "",
    target_status_name: statusOption?.label ?? "",
    source_warehouse_code: warehouseOption?.value ?? "",
    source_warehouse_name: warehouseOption?.label ?? "",
    target_warehouse_code: warehouseOption?.value ?? "",
    target_warehouse_name: warehouseOption?.label ?? "",
    planned_execute_date: new Date().toISOString().slice(0, 10),
    reason_text: "",
    note: "",
    created_by: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
    sort_order: 100,
  };
}

function createRuleDraft(response?: InventoryFlowResponse, sortOrder = 100): InventoryFlowRule {
  const statusOption = response?.status_options[0];
  const warehouseOption = response?.warehouse_options[0];
  const triggerOption = response?.trigger_source_options.find((item) => item.value === "procurement_arrival") ?? response?.trigger_source_options[0];
  const actionOption = response?.action_options[0];
  const priorityOption = response?.priority_options.find((item) => item.value === "normal") ?? response?.priority_options[0];

  return {
    id: 0,
    rule_name: "",
    trigger_source: triggerOption?.value ?? "procurement_arrival",
    trigger_condition: "manual",
    action_type: actionOption?.value ?? "status_transition",
    source_status_id: statusOption?.value ?? "",
    source_status_name: statusOption?.label ?? "",
    target_status_id: statusOption?.value ?? "",
    target_status_name: statusOption?.label ?? "",
    source_warehouse_code: warehouseOption?.value ?? "",
    source_warehouse_name: warehouseOption?.label ?? "",
    target_warehouse_code: warehouseOption?.value ?? "",
    target_warehouse_name: warehouseOption?.label ?? "",
    priority: priorityOption?.value ?? "normal",
    auto_create_task: true,
    is_enabled: true,
    sort_order: sortOrder,
    note: "",
    created_by: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
  };
}

async function requestInventoryFlows(params: URLSearchParams) {
  return apiFetch<InventoryFlowResponse>(`/api/backend/inventory-flows?${params.toString()}`);
}

export function InventoryFlowsPage() {
  const [data, setData] = useState<InventoryFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTask, setSavingTask] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [selectedTaskKey, setSelectedTaskKey] = useState<SelectedKey>("new");
  const [taskDraft, setTaskDraft] = useState<InventoryFlowTask>(createTaskDraft());
  const [rulesDraft, setRulesDraft] = useState<InventoryFlowRule[]>([]);
  const [keyword, setKeyword] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [actionTypeFilter, setActionTypeFilter] = useState("all");
  const deferredKeyword = useDeferredValue(keyword);

  async function loadFlows(nextSelectedKey?: SelectedKey) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (taskStatusFilter !== "all") params.set("task_status", taskStatusFilter);
      if (actionTypeFilter !== "all") params.set("action_type", actionTypeFilter);
      if (deferredKeyword.trim()) params.set("keyword", deferredKeyword.trim());
      params.set("limit", "120");
      const response = await requestInventoryFlows(params);
      setData(response);
      setRulesDraft(response.rules.map((item) => ({ ...item })));
      startTransition(() => {
        const currentTarget = nextSelectedKey ?? selectedTaskKey;
        if (currentTarget === "new") {
          setSelectedTaskKey("new");
          setTaskDraft(createTaskDraft(response));
          return;
        }
        const matched = response.tasks.find((item) => item.id === currentTarget) ?? response.tasks[0];
        if (matched) {
          setSelectedTaskKey(matched.id);
          setTaskDraft({ ...matched });
          return;
        }
        setSelectedTaskKey("new");
        setTaskDraft(createTaskDraft(response));
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "库存流转数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskStatusFilter, actionTypeFilter, deferredKeyword]);

  function updateTask<K extends keyof InventoryFlowTask>(key: K, value: InventoryFlowTask[K]) {
    setTaskDraft((current) => ({ ...current, [key]: value }));
  }

  function updateRule(index: number, patch: Partial<InventoryFlowRule>) {
    setRulesDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function selectTask(item: InventoryFlowTask) {
    startTransition(() => {
      setSelectedTaskKey(item.id);
      setTaskDraft({ ...item });
    });
  }

  function startNewTask() {
    startTransition(() => {
      setSelectedTaskKey("new");
      setTaskDraft(createTaskDraft(data ?? undefined));
    });
  }

  function addRule() {
    setRulesDraft((current) => [...current, createRuleDraft(data ?? undefined, current.length * 10 + 100)]);
  }

  function resolveOptionLabel(options: Option[], value: string) {
    return options.find((item) => item.value === value)?.label ?? value;
  }

  function updateStatusField(field: "source_status_id" | "target_status_id", value: string) {
    const label = resolveOptionLabel(data?.status_options ?? [], value);
    if (field === "source_status_id") {
      setTaskDraft((current) => ({ ...current, source_status_id: value, source_status_name: label }));
      return;
    }
    setTaskDraft((current) => ({ ...current, target_status_id: value, target_status_name: label }));
  }

  function updateWarehouseField(field: "source_warehouse_code" | "target_warehouse_code", value: string) {
    const label = resolveOptionLabel(data?.warehouse_options ?? [], value);
    if (field === "source_warehouse_code") {
      setTaskDraft((current) => ({ ...current, source_warehouse_code: value, source_warehouse_name: label }));
      return;
    }
    setTaskDraft((current) => ({ ...current, target_warehouse_code: value, target_warehouse_name: label }));
  }

  async function saveTask() {
    setSavingTask(true);
    try {
      const response = await apiFetch<{ created: boolean; item: InventoryFlowTask }>("/api/backend/inventory-flows/tasks", {
        method: "POST",
        body: JSON.stringify(taskDraft),
      });
      toast.success(response.created ? "库存流转任务已创建" : "库存流转任务已更新");
      await loadFlows(response.item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "库存流转任务保存失败");
    } finally {
      setSavingTask(false);
    }
  }

  async function saveRules() {
    setSavingRules(true);
    try {
      await apiFetch<{ saved: boolean; rule_count: number }>("/api/backend/inventory-flows/rules", {
        method: "PUT",
        body: JSON.stringify({ rules: rulesDraft }),
      });
      toast.success("库存流转规则已保存");
      await loadFlows(selectedTaskKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "库存流转规则保存失败");
    } finally {
      setSavingRules(false);
    }
  }

  const requestQty = Number(taskDraft.request_qty || 0);
  const confirmedQty = Math.min(Number(taskDraft.confirmed_qty || 0), Math.max(requestQty, 0));
  const completionRate = requestQty > 0 ? confirmedQty / requestQty : 0;
  const enabledRules = rulesDraft.filter((item) => item.is_enabled).length;
  const autoRules = rulesDraft.filter((item) => item.is_enabled && item.auto_create_task).length;

  return (
    <div className="space-y-6" data-page="inventory-flows">
      <div className="surface-panel p-6 sm:p-8">
        <PageHeader
          eyebrow="Operations"
          title="库存流转与调拨触发"
          description="把采购到货、质检异常、翻新回库和人工调拨统一收进一个任务台，先看状态流转，再看规则自动触发与执行闭环。"
          badge={data ? `${formatNumber(data.summary.task_count)} 个任务` : "加载中"}
          actions={
            <>
              <Button variant="outline" className="rounded-full" onClick={() => void loadFlows(selectedTaskKey)}>
                <RefreshCcw className="size-4" />
                刷新任务
              </Button>
              <Button variant="outline" className="rounded-full" onClick={startNewTask}>
                <Plus className="size-4" />
                新建任务
              </Button>
              <Button className="cta-button rounded-full" onClick={() => void saveTask()} disabled={savingTask}>
                <Save className="size-4" />
                保存任务
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="待执行" value={formatNumber(data?.summary.pending_count ?? 0)} hint="需要推进的动作任务" />
        <SummaryCard title="阻塞任务" value={formatNumber(data?.summary.blocked_count ?? 0)} hint="等待补料、确认或审批" />
        <SummaryCard title="已完成" value={formatNumber(data?.summary.completed_count ?? 0)} hint="已执行并完成闭环" />
        <SummaryCard title="启用规则" value={formatNumber(enabledRules)} hint={`自动触发 ${formatNumber(autoRules)} 条`} />
        <SummaryCard title="仓间调拨" value={formatNumber(data?.summary.transfer_count ?? 0)} hint="跨仓库流转动作" />
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索任务号、来源单号、SKU 或备注"
                className="h-11 rounded-2xl border-border/80 bg-white pl-11"
              />
            </div>
            <FilterSelect
              value={taskStatusFilter}
              onValueChange={setTaskStatusFilter}
              placeholder="任务状态"
              options={data?.task_status_options ?? []}
              allLabel="全部任务状态"
            />
            <FilterSelect
              value={actionTypeFilter}
              onValueChange={setActionTypeFilter}
              placeholder="动作类型"
              options={data?.action_options ?? []}
              allLabel="全部动作类型"
            />
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => void loadFlows(selectedTaskKey)}>
              立即刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">流转任务</CardTitle>
            <p className="text-sm text-muted-foreground">左侧快速筛任务，右侧推进状态、数量和执行说明。</p>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="h-[720px] rounded-[22px] border border-border/70 bg-muted/30" />
            ) : data?.tasks.length ? (
              <div className="surface-table overflow-hidden">
                <ScrollArea className="h-[720px]">
                  <div className="space-y-3 p-3">
                    {data.tasks.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectTask(item)}
                        className={cn(
                          "w-full rounded-[24px] border px-4 py-4 text-left transition",
                          selectedTaskKey === item.id
                            ? "border-slate-900 bg-slate-900 text-white shadow-[var(--shadow-card)]"
                            : "border-border/70 bg-white hover:border-slate-200 hover:shadow-[var(--shadow-card)]",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold tracking-tight">{item.task_no}</p>
                            <p className={cn("mt-1 text-xs", selectedTaskKey === item.id ? "text-slate-300" : "text-muted-foreground")}>
                              {item.source_record_no || "人工创建"} · {formatDate(item.planned_execute_date)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge active={selectedTaskKey === item.id} status={item.task_status} />
                            <ActionBadge active={selectedTaskKey === item.id} action={item.action_type} />
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className={cn("text-xs", selectedTaskKey === item.id ? "text-slate-300" : "text-muted-foreground")}>{item.sku_code}</p>
                            <p className="mt-1 text-sm font-medium">{item.sku_name || "待补充 SKU"}</p>
                          </div>
                          <div>
                            <p className={cn("text-xs", selectedTaskKey === item.id ? "text-slate-300" : "text-muted-foreground")}>{item.trigger_source}</p>
                            <p className="mt-1 text-sm font-medium">{item.priority}</p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <MiniMetric label="申请数量" value={formatNumber(item.request_qty)} active={selectedTaskKey === item.id} />
                          <MiniMetric label="确认数量" value={formatNumber(item.confirmed_qty)} active={selectedTaskKey === item.id} />
                          <MiniMetric label="完成率" value={`${Math.round(item.completion_rate * 100)}%`} active={selectedTaskKey === item.id} />
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
                    <Waypoints className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>当前筛选下没有库存流转任务</EmptyTitle>
                  <EmptyDescription>可以先新建任务，或者放宽筛选条件重新查看。</EmptyDescription>
                </EmptyHeader>
                <Button className="cta-button rounded-full" onClick={startNewTask}>
                  新建库存流转任务
                </Button>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">任务编辑</CardTitle>
              <p className="text-sm text-muted-foreground">把状态、仓位和执行数量都明确下来，后面再串审计和任务中心。</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="任务号">
                  <Input
                    value={taskDraft.task_no}
                    onChange={(event) => updateTask("task_no", event.target.value)}
                    placeholder="留空则保存时自动生成"
                    className="h-11 rounded-2xl border-border/80 bg-white"
                  />
                </Field>
                <Field label="来源单号">
                  <Input
                    value={taskDraft.source_record_no}
                    onChange={(event) => updateTask("source_record_no", event.target.value)}
                    className="h-11 rounded-2xl border-border/80 bg-white"
                  />
                </Field>
                <Field label="触发来源">
                  <FilterSelect
                    value={taskDraft.trigger_source}
                    onValueChange={(value) => updateTask("trigger_source", value)}
                    placeholder="选择触发来源"
                    options={data?.trigger_source_options ?? []}
                  />
                </Field>
                <Field label="动作类型">
                  <FilterSelect
                    value={taskDraft.action_type}
                    onValueChange={(value) => updateTask("action_type", value)}
                    placeholder="选择动作类型"
                    options={data?.action_options ?? []}
                  />
                </Field>
                <Field label="任务状态">
                  <FilterSelect
                    value={taskDraft.task_status}
                    onValueChange={(value) => updateTask("task_status", value)}
                    placeholder="选择任务状态"
                    options={data?.task_status_options ?? []}
                  />
                </Field>
                <Field label="优先级">
                  <FilterSelect
                    value={taskDraft.priority}
                    onValueChange={(value) => updateTask("priority", value)}
                    placeholder="选择优先级"
                    options={data?.priority_options ?? []}
                  />
                </Field>
                <Field label="SKU 编码">
                  <Input
                    value={taskDraft.sku_code}
                    onChange={(event) => updateTask("sku_code", event.target.value)}
                    className="h-11 rounded-2xl border-border/80 bg-white"
                  />
                </Field>
                <Field label="SKU 名称">
                  <Input
                    value={taskDraft.sku_name}
                    onChange={(event) => updateTask("sku_name", event.target.value)}
                    className="h-11 rounded-2xl border-border/80 bg-white"
                  />
                </Field>
                <Field label="来源状态">
                  <FilterSelect
                    value={taskDraft.source_status_id}
                    onValueChange={(value) => updateStatusField("source_status_id", value)}
                    placeholder="选择来源状态"
                    options={data?.status_options ?? []}
                  />
                </Field>
                <Field label="目标状态">
                  <FilterSelect
                    value={taskDraft.target_status_id}
                    onValueChange={(value) => updateStatusField("target_status_id", value)}
                    placeholder="选择目标状态"
                    options={data?.status_options ?? []}
                  />
                </Field>
                <Field label="来源仓">
                  <FilterSelect
                    value={taskDraft.source_warehouse_code}
                    onValueChange={(value) => updateWarehouseField("source_warehouse_code", value)}
                    placeholder="选择来源仓"
                    options={data?.warehouse_options ?? []}
                  />
                </Field>
                <Field label="目标仓">
                  <FilterSelect
                    value={taskDraft.target_warehouse_code}
                    onValueChange={(value) => updateWarehouseField("target_warehouse_code", value)}
                    placeholder="选择目标仓"
                    options={data?.warehouse_options ?? []}
                  />
                </Field>
                <Field label="申请数量">
                  <Input
                    type="number"
                    min="0"
                    value={String(taskDraft.request_qty ?? 0)}
                    onChange={(event) => updateTask("request_qty", Number(event.target.value || 0))}
                    className="h-11 rounded-2xl border-border/80 bg-white"
                  />
                </Field>
                <Field label="确认数量">
                  <Input
                    type="number"
                    min="0"
                    value={String(taskDraft.confirmed_qty ?? 0)}
                    onChange={(event) => updateTask("confirmed_qty", Number(event.target.value || 0))}
                    className="h-11 rounded-2xl border-border/80 bg-white"
                  />
                </Field>
                <Field label="计划日期">
                  <Input
                    type="date"
                    value={taskDraft.planned_execute_date ?? ""}
                    onChange={(event) => updateTask("planned_execute_date", event.target.value)}
                    className="h-11 rounded-2xl border-border/80 bg-white"
                  />
                </Field>
                <SnapshotCard
                  title="任务快照"
                  className="md:col-span-2"
                  items={[
                    { label: "完成率", value: `${Math.round(completionRate * 100)}%` },
                    { label: "来源路径", value: taskDraft.source_record_type || "manual" },
                    { label: "目标动作", value: actionMeta[taskDraft.action_type]?.label ?? taskDraft.action_type },
                  ]}
                />
              </div>

              <Field label="原因与备注">
                <Textarea
                  value={`${taskDraft.reason_text || ""}${taskDraft.note ? `\n${taskDraft.note}` : ""}`.trim()}
                  onChange={(event) => {
                    const [reasonLine, ...rest] = event.target.value.split("\n");
                    updateTask("reason_text", reasonLine ?? "");
                    updateTask("note", rest.join("\n").trim());
                  }}
                  placeholder="首行写原因，其余写处理说明、跟进人和补充备注"
                  className="min-h-28 rounded-[24px] border-border/80 bg-white"
                />
              </Field>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">流转规则</CardTitle>
                  <p className="mt-2 text-sm text-muted-foreground">规则先支持轻量编辑，后续再把优先级冲突与审批接进来。</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" className="rounded-full" onClick={addRule}>
                    <Plus className="size-4" />
                    新增规则
                  </Button>
                  <Button className="cta-button rounded-full" onClick={() => void saveRules()} disabled={savingRules}>
                    <Save className="size-4" />
                    保存规则
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {rulesDraft.length ? (
                <div className="space-y-4">
                  {rulesDraft.map((rule, index) => (
                    <div key={`${rule.id || "new"}-${index}`} className="rounded-[24px] border border-border/80 bg-white p-4 shadow-[var(--shadow-card)]">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Field label="规则名称">
                          <Input
                            value={rule.rule_name}
                            onChange={(event) => updateRule(index, { rule_name: event.target.value })}
                            className="h-11 rounded-2xl border-border/80 bg-white"
                          />
                        </Field>
                        <Field label="触发来源">
                          <FilterSelect
                            value={rule.trigger_source}
                            onValueChange={(value) => updateRule(index, { trigger_source: value })}
                            placeholder="选择触发来源"
                            options={data?.trigger_source_options ?? []}
                          />
                        </Field>
                        <Field label="触发条件">
                          <FilterSelect
                            value={rule.trigger_condition}
                            onValueChange={(value) => updateRule(index, { trigger_condition: value })}
                            placeholder="选择触发条件"
                            options={conditionOptions}
                          />
                        </Field>
                        <Field label="动作类型">
                          <FilterSelect
                            value={rule.action_type}
                            onValueChange={(value) => updateRule(index, { action_type: value })}
                            placeholder="选择动作类型"
                            options={data?.action_options ?? []}
                          />
                        </Field>
                        <Field label="来源状态">
                          <FilterSelect
                            value={rule.source_status_id}
                            onValueChange={(value) =>
                              updateRule(index, {
                                source_status_id: value,
                                source_status_name: resolveOptionLabel(data?.status_options ?? [], value),
                              })
                            }
                            placeholder="选择来源状态"
                            options={data?.status_options ?? []}
                          />
                        </Field>
                        <Field label="目标状态">
                          <FilterSelect
                            value={rule.target_status_id}
                            onValueChange={(value) =>
                              updateRule(index, {
                                target_status_id: value,
                                target_status_name: resolveOptionLabel(data?.status_options ?? [], value),
                              })
                            }
                            placeholder="选择目标状态"
                            options={data?.status_options ?? []}
                          />
                        </Field>
                        <Field label="来源仓">
                          <FilterSelect
                            value={rule.source_warehouse_code}
                            onValueChange={(value) =>
                              updateRule(index, {
                                source_warehouse_code: value,
                                source_warehouse_name: resolveOptionLabel(data?.warehouse_options ?? [], value),
                              })
                            }
                            placeholder="选择来源仓"
                            options={data?.warehouse_options ?? []}
                          />
                        </Field>
                        <Field label="目标仓">
                          <FilterSelect
                            value={rule.target_warehouse_code}
                            onValueChange={(value) =>
                              updateRule(index, {
                                target_warehouse_code: value,
                                target_warehouse_name: resolveOptionLabel(data?.warehouse_options ?? [], value),
                              })
                            }
                            placeholder="选择目标仓"
                            options={data?.warehouse_options ?? []}
                          />
                        </Field>
                        <Field label="优先级">
                          <FilterSelect
                            value={rule.priority}
                            onValueChange={(value) => updateRule(index, { priority: value })}
                            placeholder="选择优先级"
                            options={data?.priority_options ?? []}
                          />
                        </Field>
                        <Field label="自动触发">
                          <div className="flex h-11 items-center justify-between rounded-2xl border border-border/80 bg-white px-4">
                            <span className="text-sm text-foreground">{rule.auto_create_task ? "自动创建任务" : "仅保留规则，不自动建单"}</span>
                            <Switch checked={rule.auto_create_task} onCheckedChange={(checked) => updateRule(index, { auto_create_task: checked })} />
                          </div>
                        </Field>
                        <Field label="启用规则">
                          <div className="flex h-11 items-center justify-between rounded-2xl border border-border/80 bg-white px-4">
                            <span className="text-sm text-foreground">{rule.is_enabled ? "规则生效中" : "规则已停用"}</span>
                            <Switch checked={rule.is_enabled} onCheckedChange={(checked) => updateRule(index, { is_enabled: checked })} />
                          </div>
                        </Field>
                        <Field label="规则说明" className="xl:col-span-2">
                          <Input
                            value={rule.note}
                            onChange={(event) => updateRule(index, { note: event.target.value })}
                            placeholder="写清楚触发背景、责任人或执行提醒"
                            className="h-11 rounded-2xl border-border/80 bg-white"
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty className="border-border/70">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Waypoints className="size-4" />
                    </EmptyMedia>
                    <EmptyTitle>当前还没有库存流转规则</EmptyTitle>
                    <EmptyDescription>先创建几条基础规则，采购到货和异常处理就能开始自动触发任务。</EmptyDescription>
                  </EmptyHeader>
                  <Button className="cta-button rounded-full" onClick={addRule}>
                    新增第一条规则
                  </Button>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
      <CardHeader className="space-y-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{hint ?? " "}</p>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className={cn("rounded-2xl border px-3 py-3", active ? "border-white/20 bg-white/10" : "border-border/70 bg-muted/35")}>
      <p className={cn("text-xs", active ? "text-slate-300" : "text-muted-foreground")}>{label}</p>
      <p className="mt-2 text-base font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SnapshotCard({
  title,
  items,
  className,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[24px] border border-border/80 bg-muted/25 p-4", className)}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/70 bg-white px-3 py-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status, active }: { status: string; active?: boolean }) {
  const meta = taskStatusMeta[status] ?? taskStatusMeta.draft;
  return <Badge className={cn("rounded-full border px-3 py-1 text-xs shadow-none", active ? "border-white/20 bg-white/10 text-white" : meta.className)}>{meta.label}</Badge>;
}

function ActionBadge({ action, active }: { action: string; active?: boolean }) {
  const meta = actionMeta[action] ?? actionMeta.status_transition;
  return <Badge className={cn("rounded-full border px-3 py-1 text-xs shadow-none", active ? "border-white/20 bg-white/10 text-white" : meta.className)}>{meta.label}</Badge>;
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
  allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
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

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("space-y-2", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
