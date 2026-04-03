"use client";

import { startTransition, type ReactNode, useDeferredValue, useEffect, useId, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  ChevronDown,
  Clock3,
  FileCog,
  GitBranchPlus,
  Plus,
  Rocket,
  Save,
  Search,
  Settings2,
  Trash2,
  Waypoints,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, cn, formatDate, formatDateTime, formatNumber } from "@/lib/polaris-client";
import type {
  InventoryFlowResponse,
  InventoryFlowRule,
  InventoryFlowScheduleTask,
  InventoryFlowTask,
  InventoryLiveStockResponse,
  InventoryLiveStockReportConfig,
  InventoryLiveStockReportPreview,
  InventoryFlowWorkflowInstance,
  InventoryFlowWorkflowLaunchResponse,
  InventoryFlowWorkflowTemplate,
  Option,
} from "@/lib/polaris-types";

type SelectedKey = number | "new";
type LiveStockFilterState = {
  warehouseCode: string;
  stockStatusId: string;
  materialCode: string;
  materialName: string;
};

type LiveStockReportOption = {
  value: string;
  label: string;
};

type InventoryWorkflowLaunchFormState = {
  workflowKey: string;
  materialCode: string;
  purchaseInboundCode: string;
  transferOrderCode: string;
  inwarehouseCode: string;
  scrapOrg: string;
  scrapBustype: string;
  scrapWarehouse: string;
  scrapStockStatus: string;
  selectedBomCode: string;
  quantity: string;
  vouchdate: string;
  remark: string;
  serialsText: string;
};

type InventoryWorkflowDraftForm = {
  key: string;
  title: string;
  workflowCode: string;
  description: string;
  defaultMaterialCode: string;
  selectedBomCode: string;
  selectedStepKeys: string[];
};

type InventoryWorkflowStepDefinition = {
  key: string;
  title: string;
  description: string;
  stageLabel: string;
};

function createInventoryLiveStockReportConfig(): InventoryLiveStockReportConfig {
  return {
    warehouse_codes: [],
    material_codes: [],
    status_buckets: ["良品", "未检", "不良品"],
    max_families: 6,
    max_materials_per_section: 10,
  };
}

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

const inventoryWorkflowStatusMeta: Record<
  string,
  { label: string; className: string; order: number }
> = {
  published: { label: "生效中", className: "border-emerald-200 bg-emerald-50 text-emerald-700", order: 0 },
  unpublished: { label: "未发布", className: "border-amber-200 bg-amber-50 text-amber-700", order: 1 },
  draft: { label: "草稿", className: "border-border/80 bg-white text-muted-foreground", order: 2 },
  disabled: { label: "已停用", className: "border-slate-200 bg-slate-100 text-slate-700", order: 3 },
};

function getInventoryWorkflowStatusMeta(status: string) {
  return (
    inventoryWorkflowStatusMeta[status] ?? {
      label: status || "--",
      className: "border-border/80 bg-white text-muted-foreground",
      order: 9,
    }
  );
}

const inventoryWorkflowStepDefinitions: InventoryWorkflowStepDefinition[] = [
  {
    key: "morphology_conversion",
    title: "形态转换",
    description: "基于采购入库单和 BOM 完成库存形态转换，生成后续库存执行的起点单据。",
    stageLabel: "形态转换",
  },
  {
    key: "transfer_order",
    title: "调拨订单",
    description: "创建跨仓调拨订单，明确目标仓与计划执行数量，作为调出和调入的前置节点。",
    stageLabel: "调拨申请",
  },
  {
    key: "storeout",
    title: "调出单",
    description: "执行源仓出库动作，推动库存从当前仓位正式扣减并进入运输或在途状态。",
    stageLabel: "调出执行",
  },
  {
    key: "storein",
    title: "调入单",
    description: "完成目标仓调入入库，闭合整条库存流转链路并同步目标库存状态。",
    stageLabel: "调入完成",
  },
  {
    key: "scrap_create",
    title: "报废单新增",
    description: "依据库存组织、交易类型、报废仓库和库存状态创建报废单。",
    stageLabel: "报废建单",
  },
  {
    key: "scrap_submit",
    title: "报废单提交",
    description: "将已生成的报废单提交审批，进入财务和库存核销链路。",
    stageLabel: "报废提交",
  },
];

function getInventoryWorkflowInstanceBadgeClassName(status: string) {
  return status === "completed"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "failed"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-sky-200 bg-sky-50 text-sky-700";
}

function getInventoryWorkflowDocumentBadgeClassName(status: string) {
  return status === "completed"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "approved"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : status === "pending"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "failed"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-border/80 bg-white text-muted-foreground";
}

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

function buildScheduleDraft(response?: InventoryFlowResponse) {
  return (response?.schedule_tasks ?? []).map((item) => ({ ...item }));
}

function maskWebhookUrl(value: string) {
  if (!value) return "--";
  if (value.length <= 28) return value;
  return `${value.slice(0, 24)}...${value.slice(-10)}`;
}

function timeToCronExpression(value: string, fallback: string) {
  const [hour, minute] = value.split(":");
  if (!hour || !minute) return fallback;
  const normalizedHour = Number(hour);
  const normalizedMinute = Number(minute);
  if (Number.isNaN(normalizedHour) || Number.isNaN(normalizedMinute)) return fallback;
  return `${normalizedMinute} ${normalizedHour} * * *`;
}

async function requestInventoryFlows(params: URLSearchParams) {
  return apiFetch<InventoryFlowResponse>(`/api/backend/inventory-flows?${params.toString()}`);
}

async function requestInventoryLiveStock(params: URLSearchParams) {
  const query = params.toString();
  return apiFetch<InventoryLiveStockResponse>(
    `/api/backend/inventory-flows/live-stock${query ? `?${query}` : ""}`,
  );
}

async function requestInventoryLiveStockReportPreview(payload: {
  report_title: string;
  report_config: InventoryLiveStockReportConfig;
}) {
  return apiFetch<InventoryLiveStockReportPreview>("/api/backend/inventory-flows/live-stock/report-preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function requestInventoryFlowSchedulesSave(tasks: InventoryFlowScheduleTask[]) {
  const payload = tasks.map((item) => ({
    id: item.id,
    task_key: item.task_key,
    task_name: item.task_name,
    task_type: item.task_type,
    report_title: item.report_title,
    report_config: item.report_config,
    webhook_url: item.webhook_url,
    cron_expr: item.cron_expr,
    is_enabled: item.is_enabled,
    sort_order: item.sort_order,
  }));
  return apiFetch<{ saved: boolean; items: InventoryFlowScheduleTask[] }>("/api/backend/inventory-flows/schedules", {
    method: "PUT",
    body: JSON.stringify({ tasks: payload }),
  });
}

async function launchInventoryWorkflowDocument(workflowKey: string, payload: Record<string, unknown>) {
  return apiFetch<InventoryFlowWorkflowLaunchResponse>(`/api/backend/inventory-flows/workflows/${workflowKey}/launch`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function buildInventoryWorkflowLaunchForm(
  workflow: InventoryFlowWorkflowTemplate,
  response: InventoryFlowResponse,
): InventoryWorkflowLaunchFormState {
  const materialProfiles = response.material_profiles;
  const bomProfiles = response.bom_profiles;
  const matchedMaterial =
    materialProfiles.find((item) => item.material_code === workflow.default_material_code) ?? materialProfiles[0] ?? null;
  const matchedBom =
    bomProfiles.find(
      (item) => item.material_code === (matchedMaterial?.material_code ?? workflow.default_material_code) && item.bom_code === workflow.bom_code,
    ) ??
    bomProfiles.find((item) => item.material_code === (matchedMaterial?.material_code ?? workflow.default_material_code)) ??
    null;
  return {
    workflowKey: workflow.key,
    materialCode: matchedMaterial?.material_code ?? workflow.default_material_code ?? "",
    purchaseInboundCode: "",
    transferOrderCode: "",
    inwarehouseCode: workflow.default_inwarehouse_code ?? "",
    scrapOrg: workflow.default_scrap_org ?? response.scrap_org_options[0]?.value ?? "",
    scrapBustype: workflow.default_scrap_bustype ?? response.scrap_bustype_options[0]?.value ?? "",
    scrapWarehouse: workflow.default_scrap_warehouse ?? response.scrap_warehouse_options[0]?.value ?? "",
    scrapStockStatus: workflow.default_scrap_stock_status ?? response.scrap_status_options[0]?.value ?? "",
    selectedBomCode: matchedBom?.bom_code ?? workflow.bom_code ?? "",
    quantity: "1",
    vouchdate: new Date().toISOString().slice(0, 10),
    remark: "",
    serialsText: "",
  };
}

function buildInventoryWorkflowStepSummary(workflow: InventoryFlowWorkflowTemplate) {
  return workflow.steps.map((item) => item.title).join(" / ");
}

function bumpInventoryWorkflowVersion(version: string) {
  const match = /^v(\d+)\.(\d+)$/i.exec(version.trim());
  if (!match) {
    return "v0.1";
  }
  const major = Number(match[1]);
  const minor = Number(match[2]) + 1;
  return `v${major}.${minor}`;
}

function normalizeInventoryPublishedVersion(version: string) {
  const match = /^v(\d+)\.(\d+)$/i.exec(version.trim());
  if (!match) {
    return "v1.0";
  }
  const major = Number(match[1]);
  return major === 0 ? "v1.0" : version;
}

function buildNextInventoryWorkflowOrdinal(workflows: InventoryFlowWorkflowTemplate[]) {
  const usedOrdinals = new Set(
    workflows
      .map((workflow) => /^INVFLOW-CUSTOM-(\d+)$/i.exec(workflow.workflow_code.trim()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number(match[1])),
  );

  let nextOrdinal = 1;
  while (usedOrdinals.has(nextOrdinal)) {
    nextOrdinal += 1;
  }
  return nextOrdinal;
}

function buildInventoryWorkflowRequiredInputs(stepKeys: string[], serialManaged: boolean) {
  const inputs: string[] = ["物料编码"];
  if (stepKeys.includes("morphology_conversion") || stepKeys.includes("transfer_order")) {
    inputs.push("采购入库单号");
  }
  if (stepKeys.includes("storeout") && !stepKeys.includes("transfer_order")) {
    inputs.push("调拨订单单号");
  }
  if (stepKeys.includes("transfer_order")) {
    inputs.push("调入仓");
  }
  if (stepKeys.includes("morphology_conversion")) {
    inputs.push("形态转换 BOM");
  }
  if (stepKeys.includes("morphology_conversion") || stepKeys.includes("scrap_create")) {
    inputs.push("计划数量");
  }
  if (stepKeys.includes("scrap_create")) {
    inputs.push("库存组织", "交易类型", "报废仓库", "报废库存状态");
  }
  if (serialManaged && (stepKeys.includes("morphology_conversion") || stepKeys.includes("scrap_create"))) {
    inputs.push("序列号明细");
  }
  return Array.from(new Set(inputs));
}

function buildInventoryDraftWorkflowTemplate(
  sourceWorkflow: InventoryFlowWorkflowTemplate | null,
  workflows: InventoryFlowWorkflowTemplate[],
  defaultMaterialCode: string,
  response: InventoryFlowResponse,
): InventoryFlowWorkflowTemplate {
  const nextIndex = buildNextInventoryWorkflowOrdinal(workflows);
  const paddedIndex = String(nextIndex).padStart(3, "0");
  const source = sourceWorkflow ?? workflows[0] ?? null;
  const selectedMaterial =
    response.material_profiles.find((item) => item.material_code === defaultMaterialCode) ?? response.material_profiles[0] ?? null;
  const fallbackStepKeys = source?.steps.map((step) => step.key) ?? ["transfer_order", "storeout", "storein"];
  const fallbackSteps = fallbackStepKeys
    .map((stepKey) => inventoryWorkflowStepDefinitions.find((item) => item.key === stepKey) ?? null)
    .filter((item): item is InventoryWorkflowStepDefinition => item !== null)
    .map((item) => ({
      key: item.key,
      title: item.title,
      description: item.description,
    }));

  return {
    ...(source ?? {
      key: "",
      title: "",
      description: "",
      workflow_code: "",
      version: "v0.1",
      status: "draft",
      default_material_code: defaultMaterialCode,
      default_purchase_inbound_placeholder: "请输入采购入库单号",
      default_transfer_order_placeholder: "请输入调拨订单单号",
      default_warehouse_code: "",
      default_inwarehouse_code: "",
      bom_code: "",
      required_inputs: [],
      steps: [],
    }),
    key: `inventory_custom_workflow_${Date.now()}`,
    title: `库存业务流 ${paddedIndex}`,
    description: "请继续补充库存流转场景、节点和执行顺序，保存后会进入未发布列表等待联调。",
    workflow_code: `INVFLOW-CUSTOM-${paddedIndex}`,
    version: "v0.1",
    status: "draft",
    default_material_code: defaultMaterialCode,
    required_inputs: buildInventoryWorkflowRequiredInputs(fallbackStepKeys, Boolean(selectedMaterial?.serial_managed)),
    steps: fallbackSteps,
  };
}

function buildInventoryWorkflowDraftForm(
  sourceWorkflow: InventoryFlowWorkflowTemplate | null,
  workflows: InventoryFlowWorkflowTemplate[],
  response: InventoryFlowResponse,
  defaultMaterialCode: string,
): InventoryWorkflowDraftForm {
  const draftSeed = buildInventoryDraftWorkflowTemplate(sourceWorkflow, workflows, defaultMaterialCode, response);
  const matchedBom =
    response.bom_profiles.find(
      (item) => item.material_code === defaultMaterialCode && item.bom_code === draftSeed.bom_code,
    ) ??
    response.bom_profiles.find((item) => item.material_code === defaultMaterialCode) ??
    response.bom_profiles[0] ??
    null;

  return {
    key: draftSeed.key,
    title: draftSeed.title,
    workflowCode: draftSeed.workflow_code,
    description: draftSeed.description,
    defaultMaterialCode: draftSeed.default_material_code,
    selectedBomCode: matchedBom?.bom_code ?? draftSeed.bom_code,
    selectedStepKeys: draftSeed.steps.map((step) => step.key),
  };
}

function findMaterialOptionByCode(
  options: InventoryLiveStockResponse["filters"]["material_options"],
  value: string,
) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return options.find((item) => item.material_code.trim().toLowerCase() === normalized) ?? null;
}

function findMaterialOptionByName(
  options: InventoryLiveStockResponse["filters"]["material_options"],
  value: string,
) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return options.find((item) => item.material_name.trim().toLowerCase() === normalized) ?? null;
}

export function InventoryFlowsPage() {
  const [data, setData] = useState<InventoryFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTask, setSavingTask] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [savingSchedules, setSavingSchedules] = useState(false);
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [workflowManagementOpen, setWorkflowManagementOpen] = useState(false);
  const [createWorkflowOpen, setCreateWorkflowOpen] = useState(false);
  const [workflowLaunchDialogOpen, setWorkflowLaunchDialogOpen] = useState(false);
  const [unfinishedWorkflowDialogOpen, setUnfinishedWorkflowDialogOpen] = useState(false);
  const [workflowDraftForm, setWorkflowDraftForm] = useState<InventoryWorkflowDraftForm | null>(null);
  const [disableWorkflowKey, setDisableWorkflowKey] = useState<string | null>(null);
  const [deleteWorkflowKey, setDeleteWorkflowKey] = useState<string | null>(null);
  const [liveStockReportEditorOpen, setLiveStockReportEditorOpen] = useState(false);
  const [liveStockWarehouseSelectorOpen, setLiveStockWarehouseSelectorOpen] = useState(false);
  const [liveStockMaterialSelectorOpen, setLiveStockMaterialSelectorOpen] = useState(false);
  const [liveStockReportReferenceLoading, setLiveStockReportReferenceLoading] = useState(false);
  const [liveStockReportReference, setLiveStockReportReference] = useState<InventoryLiveStockResponse | null>(null);
  const [liveStockReportDraft, setLiveStockReportDraft] = useState<InventoryLiveStockReportConfig>(createInventoryLiveStockReportConfig());
  const [liveStockReportTitleDraft, setLiveStockReportTitleDraft] = useState("库存现存量日报");
  const [liveStockReportMaterialKeyword, setLiveStockReportMaterialKeyword] = useState("");
  const [liveStockReportSaving, setLiveStockReportSaving] = useState(false);
  const [liveStockReportPreviewLoading, setLiveStockReportPreviewLoading] = useState(false);
  const [liveStockReportPreview, setLiveStockReportPreview] = useState<InventoryLiveStockReportPreview | null>(null);
  const [workflowLaunchSubmitting, setWorkflowLaunchSubmitting] = useState(false);
  const [workflowLaunchForm, setWorkflowLaunchForm] = useState<InventoryWorkflowLaunchFormState | null>(null);
  const [liveStockLoading, setLiveStockLoading] = useState(true);
  const [liveStockData, setLiveStockData] = useState<InventoryLiveStockResponse | null>(null);
  const [selectedTaskKey, setSelectedTaskKey] = useState<SelectedKey>("new");
  const [taskDraft, setTaskDraft] = useState<InventoryFlowTask>(createTaskDraft());
  const [rulesDraft, setRulesDraft] = useState<InventoryFlowRule[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState<InventoryFlowScheduleTask[]>([]);
  const [keyword, setKeyword] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [actionTypeFilter, setActionTypeFilter] = useState("all");
  const [liveStockFilters, setLiveStockFilters] = useState<LiveStockFilterState>({
    warehouseCode: "",
    stockStatusId: "",
    materialCode: "",
    materialName: "",
  });
  const deferredKeyword = useDeferredValue(keyword);
  const deferredLiveStockReportPreviewKey = useDeferredValue(
    JSON.stringify({
      report_title: liveStockReportTitleDraft,
      report_config: liveStockReportDraft,
    }),
  );
  const salesSummaryHint = data?.summary.yesterday_sales_date
  ? `按 ${data.summary.yesterday_sales_date} 汇总`
  : "按昨天汇总";
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
      setScheduleDraft(buildScheduleDraft(response));
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
      toast.error(error instanceof Error ? error.message : "搴撳瓨娴佽浆鏁版嵁鍔犺浇澶辫触");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskStatusFilter, actionTypeFilter, deferredKeyword]);

  async function loadLiveStock(nextFilters: LiveStockFilterState = liveStockFilters) {
    setLiveStockLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextFilters.warehouseCode) params.set("warehouse_code", nextFilters.warehouseCode);
      if (nextFilters.stockStatusId) params.set("stock_status_id", nextFilters.stockStatusId);
      if (nextFilters.materialCode.trim()) params.set("material_code", nextFilters.materialCode.trim());
      if (nextFilters.materialName.trim()) params.set("material_name", nextFilters.materialName.trim());
      const response = await requestInventoryLiveStock(params);
      setLiveStockData(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "实时现存量加载失败");
    } finally {
      setLiveStockLoading(false);
    }
  }

  useEffect(() => {
    void loadLiveStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function findInventoryLiveStockScheduleTask(tasks: InventoryFlowScheduleTask[] = scheduleDraft) {
    return tasks.find((item) => item.task_type === "inventory_live_stock") ?? null;
  }

  async function loadLiveStockReportReference() {
    setLiveStockReportReferenceLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "1");
      const response = await requestInventoryLiveStock(params);
      setLiveStockReportReference(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "定时推送报表配置加载失败");
    } finally {
      setLiveStockReportReferenceLoading(false);
    }
  }

  function openLiveStockReportEditor() {
    const task = findInventoryLiveStockScheduleTask();
    if (!task) {
      toast.error("褰撳墠杩樻病鏈夊簱瀛樼幇瀛橀噺瀹氭椂浠诲姟閰嶇疆");
      return;
    }
    setLiveStockReportTitleDraft(task.report_title || task.task_name || "库存现存量日报");
    setLiveStockReportDraft(task.report_config ?? createInventoryLiveStockReportConfig());
    setLiveStockReportMaterialKeyword("");
    setLiveStockReportEditorOpen(true);
    void loadLiveStockReportReference();
  }

  function updateLiveStockFilter<K extends keyof LiveStockFilterState>(key: K, value: LiveStockFilterState[K]) {
    setLiveStockFilters((current) => ({ ...current, [key]: value }));
  }

  function updateMaterialCodeFilter(value: string) {
    const materialOptions = liveStockData?.filters.material_options ?? [];
    const matched = findMaterialOptionByCode(materialOptions, value);
    setLiveStockFilters((current) => ({
      ...current,
      materialCode: value,
      materialName: matched ? matched.material_name : "",
    }));
  }

  function updateMaterialNameFilter(value: string) {
    const materialOptions = liveStockData?.filters.material_options ?? [];
    const matched = findMaterialOptionByName(materialOptions, value);
    setLiveStockFilters((current) => ({
      ...current,
      materialCode: matched ? matched.material_code : "",
      materialName: value,
    }));
  }

  function updateTask<K extends keyof InventoryFlowTask>(key: K, value: InventoryFlowTask[K]) {
    setTaskDraft((current) => ({ ...current, [key]: value }));
  }

  function updateRule(index: number, patch: Partial<InventoryFlowRule>) {
    setRulesDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateScheduleTask(index: number, patch: Partial<InventoryFlowScheduleTask>) {
    setScheduleDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateLiveStockReportDraft(patch: Partial<InventoryLiveStockReportConfig>) {
    setLiveStockReportDraft((current) => ({ ...current, ...patch }));
  }

  function toggleLiveStockReportWarehouse(value: string) {
    setLiveStockReportDraft((current) => ({
      ...current,
      warehouse_codes: current.warehouse_codes.includes(value)
        ? current.warehouse_codes.filter((item) => item !== value)
        : [...current.warehouse_codes, value],
    }));
  }

  function toggleLiveStockReportStatusBucket(value: string) {
    setLiveStockReportDraft((current) => {
      const nextBuckets = current.status_buckets.includes(value)
        ? current.status_buckets.filter((item) => item !== value)
        : [...current.status_buckets, value];
      return {
        ...current,
        status_buckets: nextBuckets.length ? nextBuckets : current.status_buckets,
      };
    });
  }

  function toggleLiveStockReportMaterial(value: string) {
    setLiveStockReportDraft((current) => ({
      ...current,
      material_codes: current.material_codes.includes(value)
        ? current.material_codes.filter((item) => item !== value)
        : [...current.material_codes, value],
    }));
  }

  function clearLiveStockReportMaterials() {
    setLiveStockReportDraft((current) => ({ ...current, material_codes: [] }));
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
      toast.error(error instanceof Error ? error.message : "搴撳瓨娴佽浆浠诲姟淇濆瓨澶辫触");
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
      toast.error(error instanceof Error ? error.message : "搴撳瓨娴佽浆瑙勫垯淇濆瓨澶辫触");
    } finally {
      setSavingRules(false);
    }
  }

  async function saveSchedules() {
    setSavingSchedules(true);
    try {
      const response = await requestInventoryFlowSchedulesSave(scheduleDraft);
      setScheduleDraft(response.items.map((item) => ({ ...item })));
      setData((current) =>
        current
          ? {
              ...current,
              schedule_tasks: response.items,
              summary: {
                ...current.summary,
                schedule_task_count: response.items.length,
                enabled_schedule_task_count: response.items.filter((item) => item.is_enabled).length,
              },
            }
          : current,
      );
      toast.success("定时任务已保存");
      setScheduleEditorOpen(false);
      await loadFlows(selectedTaskKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "瀹氭椂浠诲姟淇濆瓨澶辫触");
    } finally {
      setSavingSchedules(false);
    }
  }

  async function saveLiveStockReportConfig() {
    const task = findInventoryLiveStockScheduleTask();
    if (!task) {
      toast.error("褰撳墠杩樻病鏈夊簱瀛樼幇瀛橀噺瀹氭椂浠诲姟閰嶇疆");
      return;
    }
    setLiveStockReportSaving(true);
    try {
      const nextTasks = scheduleDraft.map((item) =>
        item.task_key === task.task_key
          ? {
              ...item,
              report_title: liveStockReportTitleDraft.trim() || item.report_title || item.task_name,
              report_config: liveStockReportDraft,
            }
          : item,
      );
      const response = await requestInventoryFlowSchedulesSave(nextTasks);
      setScheduleDraft(response.items.map((item) => ({ ...item })));
      setData((current) =>
        current
          ? {
              ...current,
              schedule_tasks: response.items,
              summary: {
                ...current.summary,
                schedule_task_count: response.items.length,
                enabled_schedule_task_count: response.items.filter((item) => item.is_enabled).length,
              },
            }
          : current,
      );
      setLiveStockReportEditorOpen(false);
      toast.success("搴撳瓨鐜板瓨閲忔帹閫佹姤琛ㄥ凡鏇存柊");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "库存现存量推送报表保存失败");
    } finally {
      setLiveStockReportSaving(false);
    }
  }

  function openCreateWorkflowDialog() {
    if (!data) {
      return;
    }
    const defaultMaterialCode =
      workflowTemplates[0]?.default_material_code ?? data.material_profiles[0]?.material_code ?? "";
    setWorkflowDraftForm(
      buildInventoryWorkflowDraftForm(workflowTemplates[0] ?? null, workflowTemplates, data, defaultMaterialCode),
    );
    setCreateWorkflowOpen(true);
  }

  function handleDraftFormChange<K extends keyof InventoryWorkflowDraftForm>(
    field: K,
    value: InventoryWorkflowDraftForm[K],
  ) {
    setWorkflowDraftForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function handleDraftMaterialChange(nextMaterialCode: string) {
    if (!data) {
      return;
    }
    const matchedBom =
      data.bom_profiles.find((item) => item.material_code === nextMaterialCode) ??
      data.bom_profiles[0] ??
      null;
    setWorkflowDraftForm((current) =>
      current
        ? {
            ...current,
            defaultMaterialCode: nextMaterialCode,
            selectedBomCode: matchedBom?.bom_code ?? "",
          }
        : current,
    );
  }

  function handleDraftStepToggle(stepKey: string) {
    setWorkflowDraftForm((current) => {
      if (!current) {
        return current;
      }
      const selected = current.selectedStepKeys.includes(stepKey);
      return {
        ...current,
        selectedStepKeys: selected
          ? current.selectedStepKeys.filter((item) => item !== stepKey)
          : [...current.selectedStepKeys, stepKey],
      };
    });
  }

  function handleDraftStepMove(stepKey: string, direction: "up" | "down") {
    setWorkflowDraftForm((current) => {
      if (!current) {
        return current;
      }
      const index = current.selectedStepKeys.indexOf(stepKey);
      if (index === -1) {
        return current;
      }
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.selectedStepKeys.length) {
        return current;
      }
      const nextKeys = [...current.selectedStepKeys];
      [nextKeys[index], nextKeys[targetIndex]] = [nextKeys[targetIndex], nextKeys[index]];
      return {
        ...current,
        selectedStepKeys: nextKeys,
      };
    });
  }

  function handleDraftStepRemove(stepKey: string) {
    setWorkflowDraftForm((current) =>
      current
        ? {
            ...current,
            selectedStepKeys: current.selectedStepKeys.filter((item) => item !== stepKey),
          }
        : current,
    );
  }

  function handleCreateWorkflowSave() {
    if (!workflowDraftForm || !data) {
      return;
    }

    const title = workflowDraftForm.title.trim();
    const workflowCode = workflowDraftForm.workflowCode.trim().toUpperCase();
    const description = workflowDraftForm.description.trim();
    const bomCode = workflowDraftForm.selectedBomCode.trim().toUpperCase();

    if (!title || !workflowCode || !description) {
      toast.warning("请先完整填写业务流名称、编码和描述。");
      return;
    }
    if (workflowDraftForm.selectedStepKeys.length === 0) {
      toast.warning("请至少选择一个执行节点后再保存草稿。");
      return;
    }
    if (workflowDraftForm.selectedStepKeys.includes("morphology_conversion") && !bomCode) {
      toast.warning("当前链路包含形态转换，请先选择默认 BOM。");
      return;
    }

    const materialProfile =
      data.material_profiles.find((item) => item.material_code === workflowDraftForm.defaultMaterialCode) ?? null;
    const sourceWorkflow = workflowTemplates[0] ?? null;
    const steps = workflowDraftForm.selectedStepKeys
      .map((stepKey) => inventoryWorkflowStepDefinitions.find((item) => item.key === stepKey) ?? null)
      .filter((item): item is InventoryWorkflowStepDefinition => item !== null)
      .map((item) => ({
        key: item.key,
        title: item.title,
        description: item.description,
      }));

    const nextWorkflow: InventoryFlowWorkflowTemplate = {
      ...(sourceWorkflow ?? {
        key: "",
        title: "",
        description: "",
        workflow_code: "",
        version: "v0.1",
        status: "draft",
        default_material_code: workflowDraftForm.defaultMaterialCode,
        default_purchase_inbound_placeholder: "请输入采购入库单号",
        default_transfer_order_placeholder: "请输入调拨订单单号",
        default_warehouse_code: "",
        default_inwarehouse_code: "",
        bom_code: bomCode,
        required_inputs: [],
        steps: [],
      }),
      key: workflowDraftForm.key,
      title,
      description,
      workflow_code: workflowCode,
      version: "v0.1",
      status: "draft",
      default_material_code: workflowDraftForm.defaultMaterialCode,
      bom_code: bomCode,
      required_inputs: buildInventoryWorkflowRequiredInputs(
        workflowDraftForm.selectedStepKeys,
        Boolean(materialProfile?.serial_managed),
      ),
      steps,
    };

    setData((current) =>
      current
        ? {
            ...current,
            workflow_templates: [nextWorkflow, ...current.workflow_templates],
            summary: {
              ...current.summary,
              workflow_template_count: current.workflow_templates.length + 1,
            },
          }
        : current,
    );
    setCreateWorkflowOpen(false);
    setWorkflowDraftForm(null);
    toast.success(`${nextWorkflow.title} 已保存为草稿。`);
  }

  function handleSaveWorkflow(workflow: InventoryFlowWorkflowTemplate) {
    const nextStatus = workflow.status === "draft" ? "unpublished" : workflow.status;
    const nextVersion = bumpInventoryWorkflowVersion(workflow.version);
    setData((current) =>
      current
        ? {
            ...current,
            workflow_templates: current.workflow_templates.map((item) =>
              item.key === workflow.key
                ? {
                    ...item,
                    status: nextStatus,
                    version: nextVersion,
                  }
                : item,
            ),
          }
        : current,
    );
    toast.success(
      workflow.status === "draft"
        ? `${workflow.title} 已保存，当前状态变更为未发布。`
        : `${workflow.title} 已保存，版本更新为 ${nextVersion}。`,
    );
  }

  function handlePublishWorkflow(workflow: InventoryFlowWorkflowTemplate) {
    if (workflow.status === "published") {
      toast.info(`${workflow.title} 当前已经是已发布状态。`);
      return;
    }
    const nextVersion = normalizeInventoryPublishedVersion(workflow.version);
    setData((current) =>
      current
        ? {
            ...current,
            workflow_templates: current.workflow_templates.map((item) =>
              item.key === workflow.key
                ? {
                    ...item,
                    status: "published",
                    version: nextVersion,
                  }
                : item,
            ),
          }
        : current,
    );
    toast.success(`${workflow.title} 已发布，前台执行区现在会展示这条业务流。`);
  }

  function handleDeleteWorkflowRequest(workflow: InventoryFlowWorkflowTemplate) {
    setDeleteWorkflowKey(workflow.key);
  }

  function handleDeleteWorkflowConfirm() {
    if (!deleteTargetWorkflow || deleteTargetWorkflow.status === "published") {
      return;
    }

    setData((current) =>
      current
        ? {
            ...current,
            workflow_templates: current.workflow_templates.filter((item) => item.key !== deleteTargetWorkflow.key),
            summary: {
              ...current.summary,
              workflow_template_count: Math.max(current.workflow_templates.length - 1, 0),
            },
          }
        : current,
    );
    setDeleteWorkflowKey(null);
    toast.success(`${deleteTargetWorkflow.title} 已删除。`);
  }

  function handleDisableWorkflowConfirm() {
    if (!disableTargetWorkflow) {
      return;
    }
    setData((current) =>
      current
        ? {
            ...current,
            workflow_templates: current.workflow_templates.map((item) =>
              item.key === disableTargetWorkflow.key
                ? {
                    ...item,
                    status: "disabled",
                  }
                : item,
            ),
          }
        : current,
    );
    setDisableWorkflowKey(null);
    toast.success(`${disableTargetWorkflow.title} 已停用。`);
  }

  function openWorkflowLaunchDialog(workflow: InventoryFlowWorkflowTemplate) {
    if (workflow.status !== "published") {
      toast.warning("请先发布库存业务流后再发起业务流单据。");
      return;
    }
    if (!data) {
      return;
    }
    setWorkflowLaunchForm(buildInventoryWorkflowLaunchForm(workflow, data));
    setWorkflowLaunchDialogOpen(true);
  }

  async function submitWorkflowLaunch() {
    if (!workflowLaunchForm || !workflowLaunchTargetWorkflow) {
      return;
    }
    if (workflowNeedsPurchaseInbound && !workflowLaunchForm.purchaseInboundCode.trim()) {
      toast.warning("请先填写采购入库单号。");
      return;
    }
    if (workflowNeedsTransferOrder && !workflowLaunchForm.transferOrderCode.trim()) {
      toast.warning("请先填写调拨订单单号。");
      return;
    }
    if (workflowNeedsScrapCreate && !workflowLaunchForm.scrapOrg.trim()) {
      toast.warning("请先选择库存组织。");
      return;
    }
    if (workflowNeedsScrapCreate && !workflowLaunchForm.scrapBustype.trim()) {
      toast.warning("请先选择交易类型。");
      return;
    }
    if (workflowNeedsScrapCreate && !workflowLaunchForm.scrapWarehouse.trim()) {
      toast.warning("请先选择报废仓库。");
      return;
    }
    if (workflowNeedsScrapCreate && !workflowLaunchForm.scrapStockStatus.trim()) {
      toast.warning("请先选择报废库存状态。");
      return;
    }
    if (workflowNeedsTargetWarehouse && !workflowLaunchForm.inwarehouseCode.trim()) {
      toast.warning("请先填写调入仓。");
      return;
    }
    if (workflowNeedsBom && !workflowLaunchForm.selectedBomCode.trim()) {
      toast.warning("请先选择形态转换 BOM。");
      return;
    }
    if (workflowNeedsQuantity) {
      const quantity = Number(workflowLaunchForm.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        toast.warning("请输入有效的计划数量。");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      material_code: workflowLaunchForm.materialCode.trim(),
      vouchdate: workflowLaunchForm.vouchdate.trim(),
      remark: workflowLaunchForm.remark.trim(),
    };
    if (workflowNeedsPurchaseInbound) {
      payload.purchase_inbound_code = workflowLaunchForm.purchaseInboundCode.trim();
    }
    if (workflowNeedsTransferOrder) {
      payload.transfer_order_code = workflowLaunchForm.transferOrderCode.trim();
    }
    if (workflowNeedsScrapCreate) {
      payload.scrap_org = workflowLaunchForm.scrapOrg.trim();
      payload.scrap_bustype = workflowLaunchForm.scrapBustype.trim();
      payload.scrap_bustype_name =
        data?.scrap_bustype_options.find((item) => item.value === workflowLaunchForm.scrapBustype)?.label ?? "";
      payload.scrap_warehouse = workflowLaunchForm.scrapWarehouse.trim();
      payload.scrap_stock_status = workflowLaunchForm.scrapStockStatus.trim();
    }
    if (workflowNeedsTargetWarehouse) {
      payload.inwarehouse_code = workflowLaunchForm.inwarehouseCode.trim();
    }
    if (workflowNeedsBom) {
      payload.bom_code = workflowLaunchForm.selectedBomCode.trim();
    }
    if (workflowNeedsQuantity) {
      payload.quantity = Number(workflowLaunchForm.quantity || 0);
    }
    const serials = workflowLaunchForm.serialsText
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (workflowAllowsSerials && serials.length > 0) {
      payload.serials = serials;
    }

    setWorkflowLaunchSubmitting(true);
    try {
      const response = await launchInventoryWorkflowDocument(workflowLaunchTargetWorkflow.key, payload);
      toast.success(
        response.instance_status === "completed"
          ? `${response.workflow_title} 已自动下推完成`
          : `${response.workflow_title} 已发起，当前停留在 ${response.current_step_title || "当前环节"}`,
      );
      setWorkflowLaunchDialogOpen(false);
      setWorkflowLaunchForm(null);
      await loadFlows(selectedTaskKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "库存业务流发起失败");
    } finally {
      setWorkflowLaunchSubmitting(false);
    }
  }

  useEffect(() => {
    if (!liveStockReportEditorOpen) return;
    let cancelled = false;

    async function loadPreview() {
      setLiveStockReportPreviewLoading(true);
      try {
        const response = await requestInventoryLiveStockReportPreview({
          report_title: liveStockReportTitleDraft.trim() || "库存现存量日报",
          report_config: liveStockReportDraft,
        });
        if (!cancelled) {
          setLiveStockReportPreview(response);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "库存现存量预览加载失败");
        }
      } finally {
        if (!cancelled) {
          setLiveStockReportPreviewLoading(false);
        }
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [liveStockReportEditorOpen, deferredLiveStockReportPreviewKey]);

  const requestQty = Number(taskDraft.request_qty || 0);
  const confirmedQty = Math.min(Number(taskDraft.confirmed_qty || 0), Math.max(requestQty, 0));
  const completionRate = requestQty > 0 ? confirmedQty / requestQty : 0;
  const liveStockWarehouseOptions = Array.from(
    new Map(
      [
        ...(data?.warehouse_options ?? []),
        ...(liveStockData?.items.map((item) => ({
          value: item.warehouse_code,
          label: item.warehouse_name || item.warehouse_code,
        })) ?? []),
      ].map((item) => [item.value, item]),
    ).values(),
  ).filter((item) => item.value);
  const liveStockStatusOptions = Array.from(
    new Map(
      [
        ...(data?.status_options ?? []),
        ...(liveStockData?.items.map((item) => ({
          value: item.stock_status_id,
          label: item.stock_status_name || item.stock_status_id,
        })) ?? []),
      ].map((item) => [item.value, item]),
    ).values(),
  ).filter((item) => item.value);
  const liveStockReportWarehouseOptions: LiveStockReportOption[] =
    liveStockReportReference?.filters.warehouse_options?.map((item) => ({
      value: item.value,
      label: item.label,
    })) ?? [];
  const liveStockReportMaterialOptions = liveStockReportReference?.filters.material_options ?? [];
  const liveStockReportFilteredMaterialOptions = liveStockReportMaterialOptions.filter((item) => {
    const keywordValue = liveStockReportMaterialKeyword.trim().toLowerCase();
    if (!keywordValue) return true;
    return (
      item.material_code.toLowerCase().includes(keywordValue) ||
      item.material_name.toLowerCase().includes(keywordValue) ||
      item.label.toLowerCase().includes(keywordValue)
    );
  });
  const liveStockReportSelectedMaterialOptions = liveStockReportDraft.material_codes
    .map((code) => liveStockReportMaterialOptions.find((item) => item.material_code === code))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const liveStockReportSelectedWarehouseOptions = liveStockReportDraft.warehouse_codes
    .map((code) => liveStockReportWarehouseOptions.find((item) => item.value === code))
    .filter((item): item is LiveStockReportOption => Boolean(item));
  const liveStockReportWarehouseSummary = liveStockReportSelectedWarehouseOptions.length
  ? `${liveStockReportSelectedWarehouseOptions.slice(0, 3).map((item) => item.label).join("、")}${
      liveStockReportSelectedWarehouseOptions.length > 3 ? ` 等 ${liveStockReportSelectedWarehouseOptions.length} 个仓库` : ""
    }`
  : "未指定时，系统会按库存量自动挑选重点仓库。";
const liveStockReportMaterialSummary = liveStockReportSelectedMaterialOptions.length
  ? `${liveStockReportSelectedMaterialOptions.slice(0, 3).map((item) => item.material_name).join("、")}${
      liveStockReportSelectedMaterialOptions.length > 3 ? ` 等 ${liveStockReportSelectedMaterialOptions.length} 个物料` : ""
    }`
  : "未指定时，系统会自动挑选重点物料并按物料族分组。";
const liveStockReportStatusSummary = liveStockReportDraft.status_buckets.length
  ? liveStockReportDraft.status_buckets.join("、")
  : "请选择展示状态列";
  const workflowTemplates = [...(data?.workflow_templates ?? [])].sort(
    (left, right) =>
      getInventoryWorkflowStatusMeta(left.status).order - getInventoryWorkflowStatusMeta(right.status).order ||
      left.workflow_code.localeCompare(right.workflow_code),
  );
  const allManagedWorkflows = workflowTemplates;
  const publishedWorkflows = workflowTemplates.filter((item) => item.status === "published");
  const unfinishedWorkflowSummary = data?.unfinished_workflow_instances ?? { unfinished_count: 0, items: [] };
  const unfinishedWorkflowItems = unfinishedWorkflowSummary.items ?? [];
  const unfinishedWorkflowCount = Number(unfinishedWorkflowSummary.unfinished_count ?? unfinishedWorkflowItems.length ?? 0);
  const disableTargetWorkflow = disableWorkflowKey ? workflowTemplates.find((item) => item.key === disableWorkflowKey) ?? null : null;
  const deleteTargetWorkflow = deleteWorkflowKey ? workflowTemplates.find((item) => item.key === deleteWorkflowKey) ?? null : null;
  const workflowStatusSummary = {
    published: workflowTemplates.filter((item) => item.status === "published").length,
    unpublished: workflowTemplates.filter((item) => item.status === "unpublished").length,
    draft: workflowTemplates.filter((item) => item.status === "draft").length,
    disabled: workflowTemplates.filter((item) => item.status === "disabled").length,
  };
  const workflowLaunchTargetWorkflow = workflowLaunchForm
    ? workflowTemplates.find((item) => item.key === workflowLaunchForm.workflowKey) ?? null
    : null;
  const workflowLaunchSelectedMaterial = workflowLaunchForm
    ? data?.material_profiles.find((item) => item.material_code === workflowLaunchForm.materialCode) ?? null
    : null;
  const workflowLaunchAvailableBoms = workflowLaunchForm
    ? (data?.bom_profiles ?? []).filter((item) => item.material_code === workflowLaunchForm.materialCode)
    : [];
  const workflowStepKeys = workflowLaunchTargetWorkflow?.steps.map((item) => item.key) ?? [];
  const workflowNeedsPurchaseInbound =
    workflowStepKeys.includes("morphology_conversion") || workflowStepKeys.includes("transfer_order");
  const workflowNeedsTransferOrder = workflowStepKeys.includes("storeout") && !workflowStepKeys.includes("transfer_order");
  const workflowNeedsScrapCreate = workflowStepKeys.includes("scrap_create");
  const workflowNeedsTargetWarehouse = workflowStepKeys.includes("transfer_order");
  const workflowNeedsBom = workflowStepKeys.includes("morphology_conversion");
  const workflowNeedsQuantity = workflowStepKeys.includes("morphology_conversion") || workflowNeedsScrapCreate;
  const workflowAllowsSerials = Boolean((workflowNeedsBom || workflowNeedsScrapCreate) && workflowLaunchSelectedMaterial?.serial_managed);
  const availableDraftBomProfiles = workflowDraftForm
    ? (data?.bom_profiles ?? []).filter((item) => item.material_code === workflowDraftForm.defaultMaterialCode)
    : [];
  const selectedDraftStepDefinitions = workflowDraftForm
    ? workflowDraftForm.selectedStepKeys
        .map((stepKey) => inventoryWorkflowStepDefinitions.find((item) => item.key === stepKey) ?? null)
        .filter((item): item is InventoryWorkflowStepDefinition => item !== null)
    : [];
  return (
    <div className="space-y-6" data-page="inventory-flows">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
  <SummaryCard title="销售出库" value={formatNumber(data?.summary.yesterday_sales_out_qty ?? 0)} hint={salesSummaryHint} />
  <SummaryCard title="销售退货" value={formatNumber(data?.summary.yesterday_sales_return_qty ?? 0)} hint={salesSummaryHint} />
  <SummaryCard
    title="定时任务"
    value={formatNumber(data?.summary.enabled_schedule_task_count ?? 0)}
    hint={`共 ${formatNumber(data?.summary.schedule_task_count ?? 0)} 个任务，可随时暂停或调整推送时间`}
    actionLabel="编辑定时任务"
    onAction={() => setScheduleEditorOpen(true)}
  />
  <SummaryCard title="仓间调拨" value={formatNumber(data?.summary.transfer_count ?? 0)} hint="跨仓库状态流转动作" />
      </div>
      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <Waypoints className="size-4" />
                Workflow
              </div>
              <CardTitle className="mt-2 text-xl">业务流编排</CardTitle>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                将形态转换、调拨订单、调出单、调入单和报废单串成库存执行链路，发起后系统会按发布流程自动向用友下推。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data?.scrap_integration?.supported === false ? (
                <Badge className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700 shadow-none">
                  报废单待完成
                </Badge>
              ) : null}
              <Button className="h-11 rounded-full bg-sky-600 px-5 text-white shadow-[0_14px_34px_rgba(2,132,199,0.28)] transition-all hover:bg-sky-700 hover:shadow-[0_18px_40px_rgba(2,132,199,0.34)]" onClick={() => setWorkflowManagementOpen(true)}>
                <FileCog className="size-4" />
                业务流编排
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="overflow-hidden rounded-[20px] border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>业务流名称</TableHead>
                  <TableHead>版本号</TableHead>
                  <TableHead>默认物料</TableHead>
                  <TableHead>执行链路</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publishedWorkflows.length > 0 ? (
                  publishedWorkflows.map((workflow) => {
                    const statusMeta = getInventoryWorkflowStatusMeta(workflow.status);
                    return (
                      <TableRow key={workflow.key}>
                        <TableCell className="font-medium">{workflow.title}</TableCell>
                        <TableCell>{workflow.version}</TableCell>
                        <TableCell className="font-mono text-xs">{workflow.default_material_code || "--"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {buildInventoryWorkflowStepSummary(workflow)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-full text-xs", statusMeta.className)}>
                            {statusMeta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            className="h-9 rounded-full px-3 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
                            onClick={() => openWorkflowLaunchDialog(workflow)}
                          >
                            <GitBranchPlus className="size-4" />
                            发起业务流单据
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      当前还没有已发布的库存业务流。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-[20px] border border-border/70 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Clock3 className="size-4 text-sky-600" />
                  未完成的业务流单据
                </div>
                <p className="text-sm text-muted-foreground">
                  汇总当前仍在审批中或尚未走完的库存业务流，点开后可查看卡在哪个环节、当前单号和待审批人。
                </p>
              </div>

              <Button
                variant="outline"
                className="h-auto min-w-[180px] justify-between rounded-[18px] border-sky-200 bg-white px-5 py-4 hover:border-sky-300 hover:bg-sky-50"
                onClick={() => setUnfinishedWorkflowDialogOpen(true)}
              >
                <span className="text-sm font-medium text-slate-600">当前数量</span>
                <span className="text-3xl font-semibold tracking-tight text-slate-950">{formatNumber(unfinishedWorkflowCount)}</span>
              </Button>
            </div>
            {data?.scrap_integration?.supported === false ? (
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                {data.scrap_integration.note}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">实时现存量</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                直连用友查询当前库存，支持按仓库、物料编码、物料名称和库存状态筛选；定时推送报表可按仓库、物料和状态列自定义。
              </p>
            </div>
            <Button variant="outline" className="rounded-full" onClick={openLiveStockReportEditor}>
              <Settings2 className="size-4" />
              定时推送报表编辑
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))] xl:items-stretch [&>*]:min-w-0">
            <FilterSelect
              value={liveStockFilters.warehouseCode || "all"}
              onValueChange={(value) => updateLiveStockFilter("warehouseCode", value === "all" ? "" : value)}
              placeholder="选择仓库"
              options={liveStockWarehouseOptions}
              allLabel="全部仓库"
            />
            <FilterSelect
              value={liveStockFilters.stockStatusId || "all"}
              onValueChange={(value) => updateLiveStockFilter("stockStatusId", value === "all" ? "" : value)}
              placeholder="选择库存状态"
              options={liveStockStatusOptions}
              allLabel="全部库存状态"
            />
            <MaterialSuggestInput
              value={liveStockFilters.materialCode}
              onValueChange={updateMaterialCodeFilter}
              placeholder="搜索或选择物料编码"
              options={liveStockData?.filters.material_options ?? []}
              mode="code"
            />
            <MaterialSuggestInput
              value={liveStockFilters.materialName}
              onValueChange={updateMaterialNameFilter}
              placeholder="搜索或选择物料名称"
              options={liveStockData?.filters.material_options ?? []}
              mode="name"
            />
            <div className="w-full">
              <Button className="cta-button h-11 w-full rounded-2xl px-5" onClick={() => void loadLiveStock()} disabled={liveStockLoading}>
                查询现存量
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <LiveStockMetric label="匹配行数" value={formatNumber(liveStockData?.summary.matched_count ?? 0)} />
            <LiveStockMetric label="现存量合计" value={formatNumber(liveStockData?.summary.total_current_qty ?? 0)} />
            <LiveStockMetric label="可用量合计" value={formatNumber(liveStockData?.summary.total_available_qty ?? 0)} />
            <LiveStockMetric label="计划可用合计" value={formatNumber(liveStockData?.summary.total_plan_available_qty ?? 0)} />
            <LiveStockMetric
              label="查询时间"
              value={liveStockData?.summary.queried_at ? formatDateTime(liveStockData.summary.queried_at) : "--"}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {liveStockData?.summary.has_more ? (
            <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              当前仅展示前 {formatNumber(liveStockData.summary.returned_count)} 条结果，请继续收窄查询条件。
            </div>
          ) : null}

          {liveStockLoading && !liveStockData ? (
            <div className="h-[420px] rounded-[22px] border border-border/70 bg-muted/30" />
          ) : liveStockData?.items.length ? (
            <div className="surface-table overflow-hidden">
              <ScrollArea className="h-[420px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>仓库</TableHead>
                      <TableHead>物料编码</TableHead>
                      <TableHead>物料名称</TableHead>
                      <TableHead>库存状态</TableHead>
                      <TableHead className="text-right">现存量</TableHead>
                      <TableHead className="text-right">可用量</TableHead>
                      <TableHead className="text-right">计划可用</TableHead>
                      <TableHead className="text-right">在途通知</TableHead>
                      <TableHead>单位</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveStockData.items.map((item, index) => (
                      <TableRow key={`${item.warehouse_code}-${item.material_code}-${item.stock_status_id}-${index}`}>
                        <TableCell>{item.warehouse_name || item.warehouse_code || "--"}</TableCell>
                        <TableCell className="font-mono text-xs">{item.material_code || "--"}</TableCell>
                        <TableCell>{item.material_name || "--"}</TableCell>
                        <TableCell>{item.stock_status_name || "--"}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.current_qty)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.available_qty)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.plan_available_qty)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.incoming_notice_qty)}</TableCell>
                        <TableCell>{item.unit_name || "--"}</TableCell>
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
                  <Waypoints className="size-4" />
                </EmptyMedia>
                <EmptyTitle>当前筛选下没有现存量结果</EmptyTitle>
                <EmptyDescription>调整仓库、物料或库存状态条件后重新查询。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr_auto_auto]">
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
              绔嬪嵆鍒锋柊
            </Button>
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => setScheduleEditorOpen(true)}>
              <CalendarClock className="size-4" />
              缂栬緫瀹氭椂浠诲姟
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">流转任务</CardTitle>
            <p className="text-sm text-muted-foreground">左侧快速筛选任务，右侧推进状态、数量和执行说明。</p>
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
                              {item.source_record_no || "人工创建"} 路 {formatDate(item.planned_execute_date)}
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
                <Field label="鏉ユ簮鍗曞彿">
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
                        <Field label="瑙勫垯鍚嶇О">
                          <Input
                            value={rule.rule_name}
                            onChange={(event) => updateRule(index, { rule_name: event.target.value })}
                            className="h-11 rounded-2xl border-border/80 bg-white"
                          />
                        </Field>
                        <Field label="瑙﹀彂鏉ユ簮">
                          <FilterSelect
                            value={rule.trigger_source}
                            onValueChange={(value) => updateRule(index, { trigger_source: value })}
                            placeholder="閫夋嫨瑙﹀彂鏉ユ簮"
                            options={data?.trigger_source_options ?? []}
                          />
                        </Field>
                        <Field label="瑙﹀彂鏉′欢">
                          <FilterSelect
                            value={rule.trigger_condition}
                            onValueChange={(value) => updateRule(index, { trigger_condition: value })}
                            placeholder="閫夋嫨瑙﹀彂鏉′欢"
                            options={conditionOptions}
                          />
                        </Field>
                        <Field label="鍔ㄤ綔绫诲瀷">
                          <FilterSelect
                            value={rule.action_type}
                            onValueChange={(value) => updateRule(index, { action_type: value })}
                            placeholder="閫夋嫨鍔ㄤ綔绫诲瀷"
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
                        <Field label="鑷姩瑙﹀彂">
                          <div className="flex h-11 items-center justify-between rounded-2xl border border-border/80 bg-white px-4">
                            <span className="text-sm text-foreground">{rule.auto_create_task ? "自动创建任务" : "仅保留规则，不自动建单"}</span>
                            <Switch checked={rule.auto_create_task} onCheckedChange={(checked) => updateRule(index, { auto_create_task: checked })} />
                          </div>
                        </Field>
                        <Field label="鍚敤瑙勫垯">
                          <div className="flex h-11 items-center justify-between rounded-2xl border border-border/80 bg-white px-4">
                            <span className="text-sm text-foreground">{rule.is_enabled ? "规则生效中" : "规则已停用"}</span>
                            <Switch checked={rule.is_enabled} onCheckedChange={(checked) => updateRule(index, { is_enabled: checked })} />
                          </div>
                        </Field>
                        <Field label="规则说明" className="xl:col-span-2">
                          <Input
                            value={rule.note}
                            onChange={(event) => updateRule(index, { note: event.target.value })}
                            placeholder="写清触发背景、责任人或执行提醒"
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

      <Dialog
        open={workflowManagementOpen}
        onOpenChange={(open) => {
          setWorkflowManagementOpen(open);
        }}
      >
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-none p-0 sm:w-[min(100vw-2rem,1120px)] sm:max-w-[1120px]">
          <DialogHeader className="border-b border-border/70 px-6 pt-6 pb-5">
            <DialogTitle>库存业务流编排</DialogTitle>
            <DialogDescription>
              在这里继续完成新增业务流、保存业务流、发布业务流、停用业务流和删除业务流等管理动作。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 py-6">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
                    已发布 {workflowStatusSummary.published}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                    未发布 {workflowStatusSummary.unpublished}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-border/80 bg-white text-muted-foreground">
                    草稿 {workflowStatusSummary.draft}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-100 text-slate-700">
                    已停用 {workflowStatusSummary.disabled}
                  </Badge>
                </div>

                <Button className="rounded-full" onClick={openCreateWorkflowDialog}>
                  <Plus className="size-4" />
                  新增业务流
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-border/70 bg-slate-50/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">管理动作</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[20px] border border-border/70 bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">新增</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">新建业务流骨架并保存成草稿，后续再联调和发布。</p>
                    </div>
                    <div className="rounded-[20px] border border-border/70 bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">保存</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">草稿保存后会进入未发布，便于继续补配置。</p>
                    </div>
                    <div className="rounded-[20px] border border-border/70 bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">发布</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">发布后会出现在前台执行区，员工可直接发起单据。</p>
                    </div>
                    <div className="rounded-[20px] border border-border/70 bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">停用 / 删除</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">停用保留历史，删除只允许针对未发布或已停用业务流。</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-border/70 bg-white p-5">
                  <p className="text-sm font-semibold text-foreground">编排说明</p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                    <p>库存流转业务流会把已验证的库存单据节点按顺序串起来，发起后自动沿链路向用友下推。</p>
                    <p>当前可以围绕形态转换、调拨订单、调出单、调入单和报废单做标准化链路编排。</p>
                    <p>未完成实例仍会在前台单独汇总，便于追踪卡在哪个节点以及当前审批人。</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-sky-200 bg-sky-50/80 p-5">
                  <p className="text-sm font-semibold text-sky-900">当前上下文</p>
                  <p className="mt-2 text-sm leading-6 text-sky-800">
                    已发布业务流 {workflowStatusSummary.published} 条，未完成实例 {formatNumber(unfinishedWorkflowCount)} 条，
                    报废单能力 {data?.scrap_integration?.supported ? "已接入新增 / 提交 / 查询" : "待接入"}。
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="overflow-hidden rounded-[20px] border border-border/70 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>业务流名称</TableHead>
                        <TableHead>版本号</TableHead>
                        <TableHead>默认物料</TableHead>
                        <TableHead>执行链路</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allManagedWorkflows.length > 0 ? (
                        allManagedWorkflows.map((workflow) => {
                          const statusMeta = getInventoryWorkflowStatusMeta(workflow.status);
                          return (
                            <TableRow key={workflow.key}>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-foreground">{workflow.title}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{workflow.workflow_code}</p>
                                </div>
                              </TableCell>
                              <TableCell>{workflow.version}</TableCell>
                              <TableCell className="font-mono text-xs">{workflow.default_material_code || "--"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{buildInventoryWorkflowStepSummary(workflow)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("rounded-full text-xs", statusMeta.className)}>
                                  {statusMeta.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-3 text-sm">
                                  {(workflow.status === "draft" || workflow.status === "unpublished") ? (
                                    <button
                                      type="button"
                                      className="font-medium text-slate-700 transition hover:underline"
                                      onClick={() => handleSaveWorkflow(workflow)}
                                    >
                                      保存
                                    </button>
                                  ) : null}
                                  {workflow.status !== "published" ? (
                                    <button
                                      type="button"
                                      className="font-medium text-sky-700 transition hover:underline"
                                      onClick={() => handlePublishWorkflow(workflow)}
                                    >
                                      发布
                                    </button>
                                  ) : null}
                                  {workflow.status === "published" ? (
                                    <button
                                      type="button"
                                      className="font-medium text-amber-700 transition hover:underline"
                                      onClick={() => setDisableWorkflowKey(workflow.key)}
                                    >
                                      停用
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="font-medium text-rose-700 transition hover:underline"
                                    onClick={() => handleDeleteWorkflowRequest(workflow)}
                                  >
                                    删除
                                  </button>
                                  {workflow.status === "published" ? (
                                    <button
                                      type="button"
                                      className="font-medium text-sky-700 transition hover:underline"
                                      onClick={() => {
                                        setWorkflowManagementOpen(false);
                                        openWorkflowLaunchDialog(workflow);
                                      }}
                                    >
                                      发起单据
                                    </button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                            当前还没有库存业务流。点击右上角“新增业务流”先创建第一条草稿。
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createWorkflowOpen}
        onOpenChange={(open) => {
          setCreateWorkflowOpen(open);
          if (!open) {
            setWorkflowDraftForm(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(100vw-2rem,1020px)] max-w-[1020px] flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>新增库存业务流</DialogTitle>
            <DialogDescription>
              先完成库存业务流基础配置，再保存为草稿。保存之后不会直接对前台执行区生效，需要再发布。
            </DialogDescription>
          </DialogHeader>
          {workflowDraftForm && data ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">业务流名称</p>
                    <Input
                      value={workflowDraftForm.title}
                      onChange={(event) => handleDraftFormChange("title", event.target.value)}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                      placeholder="例如：学习机报废处理闭环"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">业务流编码</p>
                    <Input
                      value={workflowDraftForm.workflowCode}
                      readOnly
                      className="h-11 rounded-2xl border-border/80 bg-muted/30 text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">系统自动生成唯一编码，保存草稿前无需手动维护。</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">默认物料</p>
                    <Select value={workflowDraftForm.defaultMaterialCode} onValueChange={handleDraftMaterialChange}>
                      <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                        <SelectValue placeholder="选择物料" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.material_profiles.map((material) => (
                          <SelectItem key={material.material_code} value={material.material_code}>
                            {material.material_code} | {material.material_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">形态转换 BOM</p>
                    <Select
                      value={workflowDraftForm.selectedBomCode}
                      onValueChange={(value) => handleDraftFormChange("selectedBomCode", value)}
                      disabled={availableDraftBomProfiles.length === 0}
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                        <SelectValue placeholder="选择 BOM" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDraftBomProfiles.map((bom) => (
                          <SelectItem key={bom.bom_code} value={bom.bom_code}>
                            {bom.bom_code} | {bom.bom_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">如果业务流不包含形态转换节点，可以留空。</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">业务流描述</p>
                  <Textarea
                    value={workflowDraftForm.description}
                    onChange={(event) => handleDraftFormChange("description", event.target.value)}
                    className="min-h-[120px] rounded-[20px] border-border/80 bg-white"
                    placeholder="描述这条库存业务流服务什么场景、用在什么节点、是否涉及报废或跨仓调拨。"
                  />
                </div>

                <div className="space-y-3 rounded-[24px] border border-border/70 bg-white/90 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">执行节点</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      先把需要的节点加入执行链路，再按上下顺序调整。保存后会按这里的顺序作为库存业务流执行逻辑。
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
                    <div className="space-y-3 rounded-[20px] border border-border/70 bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">已选执行顺序</p>
                          <p className="mt-1 text-xs text-muted-foreground">先用上下移动方式调整顺序，后续再补拖拽能力。</p>
                        </div>
                        <Badge className="rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none">
                          {selectedDraftStepDefinitions.length} 个节点
                        </Badge>
                      </div>

                      {selectedDraftStepDefinitions.length > 0 ? (
                        <div className="space-y-3">
                          {selectedDraftStepDefinitions.map((item, index) => (
                            <div
                              key={item.key}
                              className="rounded-[20px] border border-primary/20 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                                      {index + 1}
                                    </span>
                                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                                    <Badge className="rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none">
                                      {item.stageLabel}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.description}</p>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    className="rounded-full"
                                    onClick={() => handleDraftStepMove(item.key, "up")}
                                    disabled={index === 0}
                                  >
                                    <ArrowUp className="size-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    className="rounded-full"
                                    onClick={() => handleDraftStepMove(item.key, "down")}
                                    disabled={index === selectedDraftStepDefinitions.length - 1}
                                  >
                                    <ArrowDown className="size-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    className="rounded-full text-rose-700 hover:text-rose-700"
                                    onClick={() => handleDraftStepRemove(item.key)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-border/80 bg-white px-4 py-6 text-sm text-muted-foreground">
                          还没有加入执行节点。先从右侧节点库里选择需要纳入业务流的单据节点。
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 rounded-[20px] border border-border/70 bg-white p-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">可选节点库</p>
                        <p className="mt-1 text-xs text-muted-foreground">点击“加入链路”把节点放入执行顺序；已加入的节点不会重复添加。</p>
                      </div>
                      <div className="space-y-3">
                        {inventoryWorkflowStepDefinitions.map((item) => {
                          const active = workflowDraftForm.selectedStepKeys.includes(item.key);
                          return (
                            <div
                              key={item.key}
                              className={cn(
                                "rounded-[18px] border px-4 py-4 transition-all",
                                active ? "border-primary/20 bg-primary/5" : "border-border/70 bg-muted/20",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                                    <Badge className="rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none">
                                      {item.stageLabel}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.description}</p>
                                </div>
                                <Button
                                  type="button"
                                  variant={active ? "outline" : "default"}
                                  className="rounded-full"
                                  onClick={() => handleDraftStepToggle(item.key)}
                                >
                                  {active ? "移出链路" : "加入链路"}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 px-6 py-4">
            <Button variant="outline" onClick={() => setCreateWorkflowOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateWorkflowSave}>
              <Save className="size-4" />
              保存草稿
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(disableTargetWorkflow)}
        onOpenChange={(open) => {
          if (!open) {
            setDisableWorkflowKey(null);
          }
        }}
      >
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>确认停用业务流</DialogTitle>
            <DialogDescription>
              {disableTargetWorkflow
                ? `确认停用 ${disableTargetWorkflow.title} 吗？停用后它将不再展示在已发布业务流列表中。`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 px-6 py-4">
            <Button variant="outline" onClick={() => setDisableWorkflowKey(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDisableWorkflowConfirm}>
              确认停用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTargetWorkflow)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteWorkflowKey(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-none p-0 sm:w-[min(100vw-2rem,560px)] sm:max-w-[560px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{deleteTargetWorkflow?.status === "published" ? "已发布业务流不可直接删除" : "确认删除业务流"}</DialogTitle>
            <DialogDescription>
              {deleteTargetWorkflow
                ? deleteTargetWorkflow.status === "published"
                  ? `${deleteTargetWorkflow.title} 当前处于已发布状态。请先停用，再执行删除操作。`
                  : `确认删除 ${deleteTargetWorkflow.title} 吗？删除后该业务流将从库存流转管理台中移除。`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 px-6 py-4">
            <Button variant="outline" onClick={() => setDeleteWorkflowKey(null)}>
              取消
            </Button>
            {deleteTargetWorkflow?.status === "published" ? (
              <Button
                className="rounded-full"
                onClick={() => {
                  setDeleteWorkflowKey(null);
                  setDisableWorkflowKey(deleteTargetWorkflow.key);
                }}
              >
                去停用
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleDeleteWorkflowConfirm}>
                确认删除
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={workflowLaunchDialogOpen}
        onOpenChange={(open) => {
          setWorkflowLaunchDialogOpen(open);
          if (!open) {
            setWorkflowLaunchForm(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(100vw-2rem,1040px)] max-w-[1040px] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-5">
            <DialogTitle>发起库存业务流单据</DialogTitle>
            <DialogDescription>
              填写当前业务流的必填字段后，系统会按发布链路自动向用友下推单据。
            </DialogDescription>
          </DialogHeader>
          {workflowLaunchForm && workflowLaunchTargetWorkflow ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
              <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
                <div className="space-y-4 rounded-[24px] border border-border/70 bg-white/90 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-muted-foreground shadow-none">
                      已发布库存业务流
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-border/70 bg-white text-xs text-muted-foreground">
                      {workflowLaunchTargetWorkflow.version}
                    </Badge>
                    {workflowLaunchTargetWorkflow.bom_code ? (
                      <Badge variant="outline" className="rounded-full border-border/70 bg-white text-xs text-muted-foreground">
                        {workflowLaunchTargetWorkflow.bom_code}
                      </Badge>
                    ) : null}
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-foreground">
                      {workflowLaunchTargetWorkflow.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {workflowLaunchTargetWorkflow.description}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">物料</p>
                      <Select
                        value={workflowLaunchForm.materialCode}
                        onValueChange={(value) =>
                          setWorkflowLaunchForm((current) =>
                            current
                              ? {
                                  ...current,
                                  materialCode: value,
                                  selectedBomCode:
                                    data?.bom_profiles.find((item) => item.material_code === value)?.bom_code ?? "",
                                  serialsText: "",
                                }
                              : current,
                          )
                        }
                      >
                        <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                          <SelectValue placeholder="选择物料" />
                        </SelectTrigger>
                        <SelectContent>
                          {(data?.material_profiles ?? []).map((material) => (
                            <SelectItem key={material.material_code} value={material.material_code}>
                              {material.material_code} | {material.material_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {workflowNeedsQuantity ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">计划数量</p>
                        <Input
                          value={workflowLaunchForm.quantity}
                          onChange={(event) =>
                            setWorkflowLaunchForm((current) =>
                              current ? { ...current, quantity: event.target.value } : current,
                            )
                          }
                          className="h-11 rounded-2xl border-border/80 bg-white"
                          placeholder="请输入计划数量"
                        />
                      </div>
                    ) : null}

                    {workflowNeedsPurchaseInbound ? (
                      <div className="space-y-2 md:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">采购入库单号</p>
                        <Input
                          value={workflowLaunchForm.purchaseInboundCode}
                          onChange={(event) =>
                            setWorkflowLaunchForm((current) =>
                              current ? { ...current, purchaseInboundCode: event.target.value } : current,
                            )
                          }
                          className="h-11 rounded-2xl border-border/80 bg-white"
                          placeholder={workflowLaunchTargetWorkflow.default_purchase_inbound_placeholder || "请输入采购入库单号"}
                        />
                      </div>
                    ) : null}

                    {workflowNeedsTransferOrder ? (
                      <div className="space-y-2 md:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">调拨订单单号</p>
                        <Input
                          value={workflowLaunchForm.transferOrderCode}
                          onChange={(event) =>
                            setWorkflowLaunchForm((current) =>
                              current ? { ...current, transferOrderCode: event.target.value } : current,
                            )
                          }
                          className="h-11 rounded-2xl border-border/80 bg-white"
                          placeholder={workflowLaunchTargetWorkflow.default_transfer_order_placeholder || "请输入调拨订单单号"}
                        />
                      </div>
                    ) : null}

                    {workflowNeedsScrapCreate ? (
                      <>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">库存组织</p>
                          <Select
                            value={workflowLaunchForm.scrapOrg}
                            onValueChange={(value) =>
                              setWorkflowLaunchForm((current) =>
                                current ? { ...current, scrapOrg: value } : current,
                              )
                            }
                          >
                            <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                              <SelectValue placeholder="选择库存组织" />
                            </SelectTrigger>
                            <SelectContent>
                              {(data?.scrap_org_options ?? []).map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">交易类型</p>
                          <Select
                            value={workflowLaunchForm.scrapBustype}
                            onValueChange={(value) =>
                              setWorkflowLaunchForm((current) =>
                                current ? { ...current, scrapBustype: value } : current,
                              )
                            }
                          >
                            <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                              <SelectValue placeholder="选择交易类型" />
                            </SelectTrigger>
                            <SelectContent>
                              {(data?.scrap_bustype_options ?? []).map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">报废仓库</p>
                          <Select
                            value={workflowLaunchForm.scrapWarehouse}
                            onValueChange={(value) =>
                              setWorkflowLaunchForm((current) =>
                                current ? { ...current, scrapWarehouse: value } : current,
                              )
                            }
                          >
                            <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                              <SelectValue placeholder="选择报废仓库" />
                            </SelectTrigger>
                            <SelectContent>
                              {(data?.scrap_warehouse_options ?? []).map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">报废库存状态</p>
                          <Select
                            value={workflowLaunchForm.scrapStockStatus}
                            onValueChange={(value) =>
                              setWorkflowLaunchForm((current) =>
                                current ? { ...current, scrapStockStatus: value } : current,
                              )
                            }
                          >
                            <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                              <SelectValue placeholder="选择报废库存状态" />
                            </SelectTrigger>
                            <SelectContent>
                              {(data?.scrap_status_options ?? []).map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    ) : null}

                    {workflowNeedsTargetWarehouse ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">调入仓</p>
                        <Input
                          value={workflowLaunchForm.inwarehouseCode}
                          onChange={(event) =>
                            setWorkflowLaunchForm((current) =>
                              current ? { ...current, inwarehouseCode: event.target.value } : current,
                            )
                          }
                          className="h-11 rounded-2xl border-border/80 bg-white"
                          placeholder="请输入调入仓编码"
                        />
                      </div>
                    ) : null}

                    {workflowNeedsBom ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">形态转换 BOM</p>
                        <Select
                          value={workflowLaunchForm.selectedBomCode}
                          onValueChange={(value) =>
                            setWorkflowLaunchForm((current) =>
                              current ? { ...current, selectedBomCode: value } : current,
                            )
                          }
                        >
                          <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                            <SelectValue placeholder="选择 BOM" />
                          </SelectTrigger>
                          <SelectContent>
                            {workflowLaunchAvailableBoms.map((bom) => (
                              <SelectItem key={bom.bom_code} value={bom.bom_code}>
                                {bom.bom_code} | {bom.bom_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    <div className="space-y-2 md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">单据日期</p>
                      <Input
                        value={workflowLaunchForm.vouchdate}
                        onChange={(event) =>
                          setWorkflowLaunchForm((current) =>
                            current ? { ...current, vouchdate: event.target.value } : current,
                          )
                        }
                        className="h-11 rounded-2xl border-border/80 bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">备注</p>
                    <Textarea
                      value={workflowLaunchForm.remark}
                      onChange={(event) =>
                        setWorkflowLaunchForm((current) =>
                          current ? { ...current, remark: event.target.value } : current,
                        )
                      }
                      className="min-h-[96px] rounded-[20px] border-border/80 bg-white"
                      placeholder="补充本次库存业务流的说明"
                    />
                  </div>

                  {workflowAllowsSerials ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">序列号明细</p>
                      <Textarea
                        value={workflowLaunchForm.serialsText}
                        onChange={(event) =>
                          setWorkflowLaunchForm((current) =>
                            current ? { ...current, serialsText: event.target.value } : current,
                          )
                        }
                        className="min-h-[110px] rounded-[20px] border-border/80 bg-white"
                        placeholder="可按换行或逗号输入序列号"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4 rounded-[24px] border border-border/70 bg-white/90 p-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">自动下推链路</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {workflowLaunchTargetWorkflow.steps.map((step) => (
                        <Badge
                          key={step.key}
                          variant="outline"
                          className="rounded-full border-border/80 bg-white px-3 py-1 text-xs font-medium text-foreground"
                        >
                          {step.title}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-border/70 bg-muted/20 p-4">
                    <p className="text-sm font-semibold text-foreground">执行说明</p>
                    <div className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
                      <p>系统会按业务流顺序逐步创建单据，并自动承接上一步生成的单号。</p>
                      <p>如果任一步骤失败，系统会保留未完结实例，方便回到库存流转继续跟进。</p>
                      <p>未完结实例会记录当前环节、当前单号、单据状态与待审批人。</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">必填字段</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {workflowLaunchTargetWorkflow.required_inputs.map((field) => (
                        <Badge
                          key={field}
                          variant="outline"
                          className="rounded-full border-border/80 bg-white px-3 py-1 text-xs font-medium text-foreground"
                        >
                          {field}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {data?.scrap_integration?.supported === false ? (
                    <div className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-4 text-sm leading-7 text-amber-800">
                      {data?.scrap_integration?.note || "报废单接口仍在接入中，请先确认用友侧开放权限。"}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="shrink-0 px-6 py-4">
            <Button variant="outline" onClick={() => setWorkflowLaunchDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void submitWorkflowLaunch()} disabled={workflowLaunchSubmitting}>
              <Rocket className={cn("size-4", workflowLaunchSubmitting ? "animate-pulse" : "")} />
              确认发起并自动下推
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unfinishedWorkflowDialogOpen} onOpenChange={setUnfinishedWorkflowDialogOpen}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(100vw-2rem,1080px)] max-w-[1080px] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-5">
            <DialogTitle>未完成的业务流单据</DialogTitle>
            <DialogDescription>
              汇总当前仍未完结的库存业务流实例，方便快速查看当前环节、单号、单据状态和待审批人。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
            {unfinishedWorkflowItems.length > 0 ? (
              <div className="overflow-hidden rounded-[20px] border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>业务流名称</TableHead>
                      <TableHead>当前环节</TableHead>
                      <TableHead>当前单号</TableHead>
                      <TableHead>单据状态</TableHead>
                      <TableHead>待审批人</TableHead>
                      <TableHead>发起时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unfinishedWorkflowItems.map((item: InventoryFlowWorkflowInstance) => (
                      <TableRow key={item.instance_no}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{item.workflow_title}</p>
                            <p className="text-xs text-muted-foreground">{item.instance_no}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{item.current_step_title}</p>
                            <Badge
                              variant="outline"
                              className={cn("rounded-full text-xs", getInventoryWorkflowInstanceBadgeClassName(item.instance_status))}
                            >
                              {item.instance_status_label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-mono text-sm text-foreground">{item.current_document_code || "--"}</p>
                            {item.error_message ? (
                              <p className="text-xs text-rose-600">{item.error_message}</p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                已完成 {item.completed_step_count}/{item.step_count} 步
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("rounded-full text-xs", getInventoryWorkflowDocumentBadgeClassName(item.current_document_status))}
                          >
                            {item.current_document_status_label || "--"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">{item.current_pending_approver || "--"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.launched_at ? String(item.launched_at).replace("T", " ").slice(0, 19) : "--"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
                <p className="text-base font-medium text-foreground">当前没有未完成的库存业务流单据</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  新的库存业务流发起后，如仍在审批中或执行失败，会自动出现在这里。
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={liveStockReportEditorOpen} onOpenChange={setLiveStockReportEditorOpen}>
        <DialogContent
          showCloseButton={false}
          className="!inset-0 !left-0 !top-0 !h-screen !w-screen !max-h-none !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden !rounded-none border-0 p-0 ring-0 sm:!h-screen sm:!w-screen sm:!max-w-none sm:!rounded-none"
        >
          <DialogHeader className="border-b border-border/70 px-6 pt-5 pb-5">
            <div className="mb-1 flex items-center justify-between gap-4">
              <Button
                variant="ghost"
                className="h-10 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={() => setLiveStockReportEditorOpen(false)}
              >
                <ArrowLeft className="size-4" />
                返回上一级
              </Button>
              <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-muted-foreground shadow-none">
                库存流转 / 定时推送报表
              </Badge>
            </div>
            <DialogTitle className="text-xl tracking-tight">编辑库存现存量定时推送报表</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              左侧决定推送图片展示哪些仓库、物料与状态列；右侧预览会实时刷新，并支持左右、上下滚动查看完整报表。
            </DialogDescription>
          </DialogHeader>

          <div className="grid h-[calc(100vh-8rem)] min-h-0 gap-0 overflow-hidden lg:grid-cols-[420px_minmax(0,1fr)] xl:grid-cols-[460px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-hidden border-b border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] lg:border-r lg:border-b-0">
              <div className="h-full overflow-y-scroll overscroll-contain px-5 py-5 pr-3 [scrollbar-gutter:stable]">
                <div className="space-y-4">
                <div className="rounded-[24px] border border-border/80 bg-white/92 p-5 shadow-[var(--shadow-card)] backdrop-blur-sm">
                  <p className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground">基础信息</p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">报表标题</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">用于钉钉推送标题和历史记录识别。</p>
                    </div>
                    <Input
                      value={liveStockReportTitleDraft}
                      onChange={(event) => setLiveStockReportTitleDraft(event.target.value)}
                      placeholder="请输入推送报表标题"
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-border/80 bg-white/92 p-5 shadow-[var(--shadow-card)] backdrop-blur-sm">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground">展示范围</p>
                    <h3 className="text-base font-semibold text-foreground">决定推送图片覆盖的仓库与状态列</h3>
                    <p className="text-sm leading-6 text-muted-foreground">仓库决定横向列范围，状态列决定每个仓库下展示哪些库存栏。</p>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="rounded-[20px] border border-border/70 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium text-foreground">展示仓库</p>
                          <p className="text-xs leading-5 text-muted-foreground">{liveStockReportWarehouseSummary}</p>
                        </div>
                        <Button variant="outline" className="shrink-0 whitespace-nowrap rounded-full" onClick={() => setLiveStockWarehouseSelectorOpen(true)}>
                          选择仓库
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-foreground shadow-none">
                          已选 {formatNumber(liveStockReportSelectedWarehouseOptions.length)} 个仓库
                        </Badge>
                        {!liveStockReportSelectedWarehouseOptions.length ? (
                          <Badge className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700 shadow-none">
                            自动选仓
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-border/70 bg-white p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">展示状态列</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">支持多选，至少保留一个状态列用于图片展示。</p>
                          </div>
                          <Badge className="shrink-0 rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-foreground shadow-none">
                            {liveStockReportDraft.status_buckets.length} 列
                          </Badge>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-11 w-full justify-between rounded-2xl border-border/80 bg-white px-4 text-left font-normal text-foreground hover:bg-white"
                            >
                              <span className="truncate">{liveStockReportStatusSummary}</span>
                              <ChevronDown className="size-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-64 rounded-[18px] border border-border/80 bg-white p-2">
                            {["良品", "未检", "不良品"].map((bucket) => (
                              <DropdownMenuCheckboxItem
                                key={bucket}
                                checked={liveStockReportDraft.status_buckets.includes(bucket)}
                                onSelect={(event) => event.preventDefault()}
                                onCheckedChange={() => toggleLiveStockReportStatusBucket(bucket)}
                                className="rounded-xl px-3 py-2"
                              >
                                {bucket}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-border/80 bg-white/92 p-5 shadow-[var(--shadow-card)] backdrop-blur-sm">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground">排版规则</p>
                    <h3 className="text-base font-semibold text-foreground">控制报表分组与单组容量</h3>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field label="分组数量上限">
                      <Select
                        value={String(liveStockReportDraft.max_families)}
                        onValueChange={(value) => updateLiveStockReportDraft({ max_families: Number(value) })}
                      >
                        <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                          <SelectValue placeholder="请选择分组数量" />
                        </SelectTrigger>
                        <SelectContent>
                          {[4, 6, 8, 10, 12].map((value) => (
                            <SelectItem key={value} value={String(value)}>
                              {value} 组
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="每组物料上限">
                      <Select
                        value={String(liveStockReportDraft.max_materials_per_section)}
                        onValueChange={(value) => updateLiveStockReportDraft({ max_materials_per_section: Number(value) })}
                      >
                        <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                          <SelectValue placeholder="请选择物料上限" />
                        </SelectTrigger>
                        <SelectContent>
                          {[6, 8, 10, 12, 15, 20].map((value) => (
                            <SelectItem key={value} value={String(value)}>
                              {value} 条
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>

                <div className="min-h-0 rounded-[24px] border border-border/80 bg-white/92 p-5 shadow-[var(--shadow-card)] backdrop-blur-sm">
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground">物料范围</p>
                        <h3 className="text-base font-semibold text-foreground">指定展示物料</h3>
                        <p className="text-sm leading-6 text-muted-foreground">{liveStockReportMaterialSummary}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" className="whitespace-nowrap rounded-full" onClick={clearLiveStockReportMaterials}>
                          清空
                        </Button>
                        <Button variant="outline" className="whitespace-nowrap rounded-full" onClick={() => setLiveStockMaterialSelectorOpen(true)}>
                          选择物料
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-foreground shadow-none">
                        已选 {formatNumber(liveStockReportSelectedMaterialOptions.length)} 个物料
                      </Badge>
                      {!liveStockReportSelectedMaterialOptions.length ? (
                        <Badge className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700 shadow-none">
                          自动选料
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-4 min-h-0 flex-1 rounded-[20px] border border-border/70 bg-muted/15 p-4">
                      {liveStockReportSelectedMaterialOptions.length ? (
                        <ScrollArea className="h-full pr-2">
                          <div className="flex flex-wrap gap-2">
                            {liveStockReportSelectedMaterialOptions.map((option) => (
                              <Badge
                                key={option.material_code}
                                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 shadow-none"
                              >
                                {option.label}
                              </Badge>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <div className="flex h-full min-h-[180px] items-center justify-center text-center text-sm leading-6 text-muted-foreground">
                          不指定时，系统会自动挑选重点物料，并按物料族分组展示。
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="min-h-0 overflow-hidden bg-muted/10 px-6 py-5">
              <div className="flex h-full flex-col">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold tracking-tight text-foreground">报表预览</p>
                    <p className="mt-1 text-sm text-muted-foreground">右侧预览会按当前配置实时刷新，并支持拖动查看完整列与完整明细。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-foreground shadow-none">
                      仓库 {formatNumber(liveStockReportPreview?.config_summary.selected_warehouse_count ?? liveStockReportDraft.warehouse_codes.length)}
                    </Badge>
                    <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-foreground shadow-none">
                      物料 {formatNumber(liveStockReportPreview?.config_summary.selected_material_count ?? liveStockReportDraft.material_codes.length)}
                    </Badge>
                    <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-foreground shadow-none">
                      状态列 {formatNumber(liveStockReportPreview?.config_summary.selected_status_bucket_count ?? liveStockReportDraft.status_buckets.length)}
                    </Badge>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-[24px] border border-border/80 bg-white shadow-[var(--shadow-card)]">
                  {liveStockReportPreviewLoading && !liveStockReportPreview ? (
                    <div className="h-full min-h-[720px] bg-muted/20" />
                  ) : liveStockReportPreview ? (
                    <InventoryLiveStockReportPreviewTable report={liveStockReportPreview} />
                  ) : (
                    <div className="p-6">
                      <Empty className="border-border/70 bg-white">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Waypoints className="size-4" />
                          </EmptyMedia>
                          <EmptyTitle>暂时还没有可预览的报表</EmptyTitle>
                          <EmptyDescription>先选择仓库、物料或状态列，系统会按最新缓存生成一份预览。</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 border-t border-border/70 bg-white px-6 py-4">
            <Button variant="outline" className="rounded-full" onClick={() => setLiveStockReportEditorOpen(false)}>
              取消
            </Button>
            <Button className="cta-button rounded-full" onClick={() => void saveLiveStockReportConfig()} disabled={liveStockReportSaving}>
              <Save className="size-4" />
              保存推送报表
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={liveStockWarehouseSelectorOpen} onOpenChange={setLiveStockWarehouseSelectorOpen}>
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-none gap-0 overflow-hidden p-0 sm:w-[min(100vw-2rem,860px)] sm:max-w-[860px]">
          <DialogHeader className="border-b border-border/70 px-6 pt-6 pb-5">
            <DialogTitle className="text-xl tracking-tight">选择展示仓库</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              可多选仓库；不选择时系统会按库存量自动选取重点仓库。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto px-6 py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-foreground shadow-none">
                已选 {formatNumber(liveStockReportSelectedWarehouseOptions.length)} 个仓库
              </Badge>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => updateLiveStockReportDraft({ warehouse_codes: [] })}
              >
                恢复自动选仓
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {liveStockReportWarehouseOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleLiveStockReportWarehouse(option.value)}
                  className={cn(
                    "rounded-[20px] border px-4 py-4 text-left transition",
                    liveStockReportDraft.warehouse_codes.includes(option.value)
                      ? "border-sky-200 bg-sky-50 shadow-[var(--shadow-card)]"
                      : "border-border/80 bg-white hover:border-slate-200 hover:bg-muted/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs font-mono text-muted-foreground">{option.value}</p>
                    </div>
                    <Badge
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] shadow-none",
                        liveStockReportDraft.warehouse_codes.includes(option.value)
                          ? "border-sky-200 bg-sky-100 text-sky-700"
                          : "border-border/80 bg-white text-muted-foreground",
                      )}
                    >
                      {liveStockReportDraft.warehouse_codes.includes(option.value) ? "已选" : "可选"}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 border-t border-border/70 bg-white px-6 py-4">
            <Button variant="outline" className="rounded-full" onClick={() => setLiveStockWarehouseSelectorOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={liveStockMaterialSelectorOpen} onOpenChange={setLiveStockMaterialSelectorOpen}>
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-none gap-0 overflow-hidden p-0 sm:w-[min(100vw-2rem,980px)] sm:max-w-[980px]">
          <DialogHeader className="border-b border-border/70 px-6 pt-6 pb-5">
            <DialogTitle className="text-xl tracking-tight">选择展示物料</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              可按物料编码或名称搜索并多选；不指定时系统会自动选取重点物料。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto px-6 py-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Input
                value={liveStockReportMaterialKeyword}
                onChange={(event) => setLiveStockReportMaterialKeyword(event.target.value)}
                placeholder="搜索物料编码或物料名称"
                className="h-11 min-w-[260px] flex-1 rounded-2xl border-border/80 bg-white"
              />
              <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-foreground shadow-none">
                已选 {formatNumber(liveStockReportSelectedMaterialOptions.length)} 个物料
              </Badge>
              <Button variant="outline" className="rounded-full" onClick={clearLiveStockReportMaterials}>
                清空已选
              </Button>
            </div>

            <div className="rounded-[22px] border border-border/80 bg-white">
              <ScrollArea className="h-[420px]">
                <div className="space-y-2 p-3">
                  {liveStockReportReferenceLoading ? (
                    <div className="rounded-[18px] border border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                      正在加载物料选项...
                    </div>
                  ) : liveStockReportFilteredMaterialOptions.length ? (
                    liveStockReportFilteredMaterialOptions.map((item) => (
                      <button
                        key={item.material_code}
                        type="button"
                        onClick={() => toggleLiveStockReportMaterial(item.material_code)}
                        className={cn(
                          "flex w-full items-start justify-between rounded-[18px] border px-4 py-3 text-left transition",
                          liveStockReportDraft.material_codes.includes(item.material_code)
                            ? "border-sky-200 bg-sky-50 text-sky-800"
                            : "border-border/70 bg-white hover:border-slate-200 hover:bg-muted/20",
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium">{item.material_name}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{item.material_code}</p>
                        </div>
                        <Badge
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] shadow-none",
                            liveStockReportDraft.material_codes.includes(item.material_code)
                              ? "border-sky-200 bg-sky-100 text-sky-700"
                              : "border-border/80 bg-white text-muted-foreground",
                          )}
                        >
                          {liveStockReportDraft.material_codes.includes(item.material_code) ? "已选" : "可选"}
                        </Badge>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                      没有匹配的物料，请调整搜索关键词。
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 border-t border-border/70 bg-white px-6 py-4">
            <Button variant="outline" className="rounded-full" onClick={() => setLiveStockMaterialSelectorOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleEditorOpen} onOpenChange={setScheduleEditorOpen}>
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-none gap-0 overflow-hidden p-0 sm:w-[min(100vw-2rem,980px)] sm:max-w-[980px]">
          <DialogHeader className="border-b border-border/70 px-6 pt-6 pb-5">
            <DialogTitle className="text-xl tracking-tight">编辑定时任务</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              这里统一维护库存现存量和每日仓库出入库的自动推送时间。保存后会立刻刷新后台调度器。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-5">
            <div className="grid gap-4">
              {scheduleDraft.map((task, index) => (
                <div key={task.task_key} className="rounded-[24px] border border-border/80 bg-white p-5 shadow-[var(--shadow-card)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold tracking-tight text-foreground">{task.task_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {task.task_type === "inventory_live_stock"
                          ? "每天拉取最新现存量，生成库存现存量图片并推送到供应链数据同步群。"
                          : "每天汇总仓库出入库数据，生成分区日报图片并推送到供应链数据同步群。"}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs shadow-none",
                        task.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border/80 bg-white text-muted-foreground",
                      )}
                    >
                      {task.is_enabled ? "已启用" : "已停用"}
                    </Badge>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field label="执行时间">
                      <Input
                        type="time"
                        value={task.time_of_day || "09:30"}
                        onChange={(event) =>
                          updateScheduleTask(index, {
                            time_of_day: event.target.value,
                            cron_expr: timeToCronExpression(event.target.value, task.cron_expr),
                          })
                        }
                        className="h-11 rounded-2xl border-border/80 bg-white"
                      />
                    </Field>

                    <Field label="报表标题">
                      <Input
                        value={task.report_title}
                        onChange={(event) => updateScheduleTask(index, { report_title: event.target.value })}
                        className="h-11 rounded-2xl border-border/80 bg-white"
                      />
                    </Field>

                    <Field label="机器人地址" className="md:col-span-2">
                      <Input value={maskWebhookUrl(task.webhook_url)} readOnly className="h-11 rounded-2xl border-border/80 bg-muted/20" />
                    </Field>

                    <div className="grid gap-3 rounded-[20px] border border-border/70 bg-muted/20 p-4 md:col-span-2 md:grid-cols-3">
                      <ScheduleMeta title="下次执行" value={task.next_run_at ? formatDateTime(task.next_run_at) : "--"} />
                      <ScheduleMeta title="最近执行" value={task.last_run_finished_at ? formatDateTime(task.last_run_finished_at) : "--"} />
                      <ScheduleMeta title="运行状态" value={task.last_run_status || "idle"} />
                    </div>

                    <div className="flex items-center justify-between rounded-[20px] border border-border/70 bg-white px-4 py-3 md:col-span-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">启用任务</p>
                        <p className="text-xs text-muted-foreground">关闭后不会进入 APScheduler 执行队列。</p>
                      </div>
                      <Switch checked={task.is_enabled} onCheckedChange={(checked) => updateScheduleTask(index, { is_enabled: checked })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 border-t border-border/70 bg-white px-6 py-4">
            <Button variant="outline" className="rounded-full" onClick={() => setScheduleEditorOpen(false)}>
              取消
            </Button>
            <Button className="cta-button rounded-full" onClick={() => void saveSchedules()} disabled={savingSchedules}>
              <Save className="size-4" />
              保存定时任务
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  value: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {actionLabel && onAction ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{hint ?? " "}</p>
      </CardContent>
    </Card>
  );
}

function ScheduleMeta({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-white px-3 py-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function LiveStockMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-border/80 bg-muted/20 px-4 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function SelectionChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition",
        selected
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-border/80 bg-white text-muted-foreground hover:border-slate-200 hover:bg-muted/20 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function InventoryLiveStockReportPreviewTable({ report }: { report: InventoryLiveStockReportPreview }) {
  if (!report.warehouses.length || !report.sections.length) {
    return (
      <div className="p-6">
        <Empty className="border-border/70 bg-white">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Waypoints className="size-4" />
            </EmptyMedia>
            <EmptyTitle>暂时还没有可预览的报表</EmptyTitle>
            <EmptyDescription>先补充仓库、物料或状态列，系统会自动生成一份结构化预览。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const detailColumnCount = report.warehouses.length * report.status_buckets.length;

  return (
    <div className="w-fit min-w-full p-5 pr-8 pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tracking-tight text-foreground">{report.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            导出时间：{report.generated_at ? formatDateTime(report.generated_at) : "--"}
          </p>
        </div>
      </div>
      <div
        className="grid overflow-hidden rounded-[20px] border border-border/70 bg-white text-xs shadow-[var(--shadow-soft)]"
        style={{
          gridTemplateColumns: `260px repeat(${detailColumnCount}, 96px) 120px 120px`,
        }}
      >
        <div className="row-span-2 border-r border-b border-border/70 bg-slate-50 px-3 py-3 font-semibold text-foreground">
          物料名称
        </div>
        {report.warehouses.map((warehouse) => (
          <div
            key={warehouse}
            className="border-r border-b border-border/70 bg-sky-50 px-3 py-3 text-center font-semibold text-slate-700"
            style={{ gridColumn: `span ${report.status_buckets.length} / span ${report.status_buckets.length}` }}
          >
            {warehouse}
          </div>
        ))}
        <div className="border-r border-b border-border/70 bg-sky-50 px-3 py-3 text-center font-semibold text-slate-700">汇总</div>
        <div className="border-b border-border/70 bg-sky-50 px-3 py-3 text-center font-semibold text-slate-700">在途数</div>

        {report.warehouses.flatMap((warehouse) =>
          report.status_buckets.map((bucket) => (
            <div
              key={`${warehouse}-${bucket}`}
              className="border-r border-border/70 bg-slate-50 px-2 py-2 text-center font-medium text-muted-foreground"
            >
              {bucket}
            </div>
          )),
        )}
        <div className="border-r border-border/70 bg-slate-50 px-2 py-2 text-center font-medium text-muted-foreground">现存量</div>
        <div className="bg-slate-50 px-2 py-2 text-center font-medium text-muted-foreground">在途数</div>

        {report.sections.map((section) => (
          <div key={section.title} className="contents">
            <div
              className="border-t border-b border-border/70 bg-sky-50 px-3 py-2 text-center text-sm font-semibold text-foreground"
              style={{ gridColumn: `1 / -1` }}
            >
              {section.title}
            </div>
            {section.rows.map((row) => (
              <div key={`${section.title}-${row.material_name}`} className="contents">
                <div className="border-r border-b border-border/70 px-3 py-2 text-sm font-medium text-foreground">
                  {row.material_name}
                </div>
                {report.warehouses.flatMap((warehouse) =>
                  report.status_buckets.map((bucket) => (
                    <div
                      key={`${section.title}-${row.material_name}-${warehouse}-${bucket}`}
                      className="border-r border-b border-border/70 px-2 py-2 text-right text-sm text-slate-700"
                    >
                      {row.values[`${warehouse}:${bucket}`] ? formatNumber(row.values[`${warehouse}:${bucket}`]) : ""}
                    </div>
                  )),
                )}
                <div className="border-r border-b border-border/70 px-2 py-2 text-right text-sm font-medium text-foreground">
                  {row.values["现存量"] ? formatNumber(row.values["现存量"]) : ""}
                </div>
                <div className="border-b border-border/70 px-2 py-2 text-right text-sm font-medium text-foreground">
                  {row.values["在途数"] ? formatNumber(row.values["在途数"]) : ""}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
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

function MaterialSuggestInput({
  value,
  onValueChange,
  placeholder,
  options,
  mode,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: Array<{
    material_code: string;
    material_name: string;
    label: string;
  }>;
  mode: "code" | "name";
}) {
  const inputId = useId();
  const [open, setOpen] = useState(false);

  const keyword = value.trim().toLowerCase();
  const filteredOptions = options
    .filter((item) => {
      if (!keyword) return true;
      return (
        item.material_code.toLowerCase().includes(keyword) ||
        item.material_name.toLowerCase().includes(keyword) ||
        item.label.toLowerCase().includes(keyword)
      );
    })
    .slice(0, 8);

  return (
    <div className="relative w-full">
      <Input
        id={inputId}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        placeholder={placeholder}
        className="h-11 rounded-2xl border-border/80 bg-white pr-9"
        autoComplete="off"
      />
      <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />

      {open && filteredOptions.length ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 rounded-[20px] border border-border/80 bg-white p-2 shadow-[var(--shadow-panel)]">
          <ScrollArea className="max-h-72">
            <div className="space-y-1">
              {filteredOptions.map((item) => {
                const displayValue = mode === "code" ? item.material_code : item.material_name;
                return (
                  <button
                    key={`${mode}-${item.material_code}`}
                    type="button"
                    className="flex w-full items-start justify-between rounded-[16px] px-3 py-2 text-left transition hover:bg-muted/40"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onValueChange(displayValue);
                      setOpen(false);
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{mode === "code" ? item.material_code : item.material_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{mode === "code" ? item.material_name : item.material_code}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status, active }: { status: string; active?: boolean }) {
  const meta = taskStatusMeta[status] ?? taskStatusMeta.draft;

  return (
    <Badge
      className={cn(
        "rounded-full border px-3 py-1 text-xs shadow-none",
        meta.className,
        active ? "border-slate-900 bg-slate-900 text-white" : "",
      )}
    >
      {meta.label}
    </Badge>
  );
}

function ActionBadge({ action, active }: { action: string; active?: boolean }) {
  const meta = actionMeta[action] ?? actionMeta.status_transition;

  return (
    <Badge
      className={cn(
        "rounded-full border px-3 py-1 text-xs shadow-none",
        meta.className,
        active ? "border-slate-900 bg-slate-900 text-white" : "",
      )}
    >
      {meta.label}
    </Badge>
  );
}

function MiniMetric({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3",
        active ? "border-slate-900/10 bg-slate-900/5" : "border-border/70 bg-muted/20",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
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
    <div className={cn("rounded-[22px] border border-border/80 bg-muted/20 p-4", className)}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
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



