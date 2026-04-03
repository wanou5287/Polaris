"use client";

import { type ChangeEvent, type ReactNode, startTransition, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Clock3,
  FileCog,
  FileUp,
  Loader2,
  PackageOpen,
  Plus,
  Power,
  RefreshCcw,
  Rocket,
  Save,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, cn, formatNumber } from "@/lib/polaris-client";
import type {
  ProcurementSupplyBomProfile,
  ProcurementSupplyLaunchResponse,
  ProcurementSupplyWorkflowLaunchResponse,
  ProcurementSerialImportPreviewResponse,
  ProcurementSupplyBomLine,
  ProcurementSupplyConsoleResponse,
  ProcurementSupplyDocumentDetailRow,
  ProcurementSupplyDocumentModule,
  ProcurementSupplyDocumentStatus,
  ProcurementSupplyWorkflowTemplate,
  ProcurementSupplyWorkflowStatus,
} from "@/lib/polaris-types";

type WorkflowPanelMode = "published" | "management";

type DocumentStatusFilter = ProcurementSupplyDocumentStatus;

type WorkflowMeta = {
  code: string;
  status: ProcurementSupplyWorkflowStatus;
  statusLabel: string;
  statusBadgeClassName: string;
  version: string;
  bomCode: string;
};

type WorkflowDraftForm = {
  key: string;
  title: string;
  workflowCode: string;
  description: string;
  defaultMaterialCode: string;
  selectedBomCode: string;
  selectedStepKeys: string[];
};

type StandaloneLaunchFormState = {
  documentKey: string;
  materialCode: string;
  quantity: string;
  unitPrice: string;
  vouchdate: string;
  purchaseOrderCode: string;
  purchaseInboundCode: string;
  transferOrderCode: string;
  storeoutCode: string;
  warehouseCode: string;
  inwarehouseCode: string;
  bustypeCode: string;
  vendorCode: string;
  invoiceVendorCode: string;
  orgCode: string;
  exchRateType: string;
  taxitemsCode: string;
  creator: string;
  creatorId: string;
  selectedBomCode: string;
  remark: string;
  serials: string[];
  serialFileName: string;
};

type WorkflowLaunchFormState = {
  workflowKey: string;
  materialCode: string;
  quantity: string;
  purchaseOrderCode: string;
  warehouseCode: string;
  inwarehouseCode: string;
  selectedBomCode: string;
  vouchdate: string;
  remark: string;
  serials: string[];
  serialFileName: string;
};

const workflowStatusMeta: Record<
  ProcurementSupplyWorkflowStatus,
  { label: string; badgeClassName: string }
> = {
  published: {
    label: "生效中",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  unpublished: {
    label: "未发布",
    badgeClassName: "border-slate-200 bg-slate-100 text-slate-700",
  },
  draft: {
    label: "草稿",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
  },
  disabled: {
    label: "已停用",
    badgeClassName: "border-zinc-200 bg-zinc-100 text-zinc-600",
  },
};

const workflowStatusOrder: Record<ProcurementSupplyWorkflowStatus, number> = {
  published: 0,
  unpublished: 1,
  draft: 2,
  disabled: 3,
};

const documentStatusMeta: Record<
  DocumentStatusFilter,
  { label: string; badgeClassName: string; activeClassName: string }
> = {
  pending: {
    label: "审批中",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    activeClassName: "border-amber-300 bg-amber-50 text-amber-900",
  },
  draft: {
    label: "草稿",
    badgeClassName: "border-slate-200 bg-slate-100 text-slate-700",
    activeClassName: "border-slate-300 bg-slate-100 text-slate-900",
  },
  approved: {
    label: "已通过",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    activeClassName: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
  completed: {
    label: "已完成",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    activeClassName: "border-sky-300 bg-sky-50 text-sky-900",
  },
};

const workflowManagementActions = [
  {
    key: "add",
    title: "新增业务流",
    description: "新建业务流骨架，并在内部维护模板、节点和执行顺序。",
    icon: Plus,
  },
  {
    key: "save",
    title: "保存业务流",
    description: "保存当前编排方案，供继续编辑和联调。",
    icon: Save,
  },
  {
    key: "publish",
    title: "发布业务流",
    description: "发布后即进入默认可用列表，前台开始按新规则执行。",
    icon: Rocket,
  },
  {
    key: "disable",
    title: "停用业务流",
    description: "临时关闭一条已发布业务流，但保留历史配置与记录。",
    icon: Power,
  },
  {
    key: "delete",
    title: "删除业务流",
    description: "删除草稿或已废弃业务流，收拢无效入口。",
    icon: Trash2,
  },
] as const;

const fallbackConsoleData: ProcurementSupplyConsoleResponse = {
  module_intro: {
    title: "采购供应",
    summary: "采购供应模块聚焦两件事：高频单据独立发起，以及已发布业务流的一键执行。",
    highlights: [],
  },
  summary: {
    document_module_count: 8,
    workflow_template_count: 4,
    standalone_launch_count: 8,
    serial_managed_material_count: 2,
    workflow_step_count: 5,
  },
  document_modules: [
    {
      key: "purchase_order",
      title: "采购订单",
      description: "作为新业务起点，直接向用友创建采购订单。",
      stage_label: "供应起点",
      supports_standalone: true,
      supports_workflow: true,
      serial_policy: "none",
      required_fields: ["业务类型", "供应商", "采购组织", "汇率类型", "税目", "物料", "数量", "单价"],
      recommended_fields: ["开票供应商", "主单位", "创建人"],
      yonyou_interfaces: [
        { label: "采购订单保存", path: "/yonbip/scm/purchaseorder/singleSave_v1" },
        { label: "采购订单提交", path: "/yonbip/scm/purchaseorder/batchsubmit" },
      ],
      status_summary: { draft: 1, pending: 1, approved: 0, completed: 0 },
    },
    {
      key: "purchase_inbound",
      title: "采购入库",
      description: "引用采购订单来源生成采购入库单，并继续提交审批。",
      stage_label: "仓内入库",
      supports_standalone: true,
      supports_workflow: true,
      serial_policy: "material_based",
      required_fields: ["采购订单编号", "仓库", "交易类型", "物料", "数量"],
      recommended_fields: ["供应商", "业务组织", "单据日期"],
      yonyou_interfaces: [
        { label: "采购入库来源生单保存", path: "/yonbip/scm/purinrecord/mergeSourceData/save" },
        { label: "采购入库提交", path: "/yonbip/scm/purinrecord/batchsubmit" },
      ],
      status_summary: { draft: 0, pending: 1, approved: 1, completed: 0 },
    },
    {
      key: "morphology_conversion",
      title: "形态转换",
      description: "按 BOM 发起形态转换，并在必要时校验序列号明细。",
      stage_label: "加工转换",
      supports_standalone: true,
      supports_workflow: true,
      serial_policy: "material_based",
      required_fields: ["交易类型", "转换前仓库", "转换后仓库", "成品", "BOM 子件", "数量"],
      recommended_fields: ["备注", "创建人", "操作员"],
      yonyou_interfaces: [
        { label: "形态转换保存", path: "/yonbip/scm/morphologyconversion/save" },
        { label: "形态转换提交", path: "/yonbip/scm/morphologyconversion/batchsubmit" },
      ],
      status_summary: { draft: 1, pending: 0, approved: 1, completed: 0 },
    },
    {
      key: "transfer_order",
      title: "调拨订单",
      description: "在前置环节通过后创建仓间调拨订单，并按租户规则审核。",
      stage_label: "仓间申请",
      supports_standalone: true,
      supports_workflow: true,
      serial_policy: "none",
      required_fields: ["调出仓", "调入仓", "物料", "数量", "交易类型"],
      recommended_fields: ["备注", "来源单据编号"],
      yonyou_interfaces: [
        { label: "调拨订单保存", path: "/yonbip/scm/transferapply/save" },
        { label: "调拨订单审核", path: "/yonbip/scm/transferapply/batchaudit" },
      ],
      status_summary: { draft: 0, pending: 0, approved: 1, completed: 0 },
    },
    {
      key: "storeout",
      title: "调出单",
      description: "承接调拨订单或其他来源单据生成调出单并提交。",
      stage_label: "仓间调出",
      supports_standalone: true,
      supports_workflow: true,
      serial_policy: "material_based",
      required_fields: ["来源单据编号", "调出仓", "调入仓", "物料", "数量"],
      recommended_fields: ["交易类型", "生单规则"],
      yonyou_interfaces: [
        { label: "调出来源生单保存", path: "/yonbip/scm/storeout/mergeSourceData/save" },
        { label: "调出提交", path: "/yonbip/scm/storeout/batchsubmit" },
      ],
      status_summary: { draft: 1, pending: 0, approved: 0, completed: 1 },
    },
    {
      key: "storein",
      title: "调入单",
      description: "根据调出单自动下推调入单，并完成提交。",
      stage_label: "仓间调入",
      supports_standalone: true,
      supports_workflow: true,
      serial_policy: "material_based",
      required_fields: ["来源调出单编号", "调入仓", "物料", "数量"],
      recommended_fields: ["交易类型", "生单规则"],
      yonyou_interfaces: [
        { label: "调入来源生单保存", path: "/yonbip/scm/storein/mergeSourceData/save" },
        { label: "调入提交", path: "/yonbip/scm/storein/batchsubmit" },
      ],
      status_summary: { draft: 0, pending: 1, approved: 0, completed: 1 },
    },
    {
      key: "purchase_return",
      title: "采购退货",
      description: "面向采购入库后的退货场景，用于承接供应商退货退仓的单据入口。",
      stage_label: "退货处理",
      supports_standalone: true,
      supports_workflow: true,
      serial_policy: "material_based",
      required_fields: ["来源入库单号", "供应商", "退货仓库", "物料", "数量", "退货原因"],
      recommended_fields: ["业务类型", "红蓝字标记", "备注"],
      yonyou_interfaces: [{ label: "采购退货接口待补充", path: "待确认接口路径" }],
      status_summary: { draft: 0, pending: 0, approved: 0, completed: 0 },
    },
    {
      key: "purchase_invoice",
      title: "采购发票",
      description: "面向采购结算场景的发票录入和核对入口，用于承接采购单据的票据管理。",
      stage_label: "票据结算",
      supports_standalone: true,
      supports_workflow: false,
      serial_policy: "none",
      required_fields: ["供应商", "发票类型", "发票号", "开票日期", "金额", "税额"],
      recommended_fields: ["来源采购单号", "币种", "税率"],
      yonyou_interfaces: [{ label: "采购发票接口待补充", path: "待确认接口路径" }],
      status_summary: { draft: 0, pending: 0, approved: 0, completed: 0 },
    },
  ],
  workflow_templates: [
    {
      key: "learning_device_bulk_shipping",
      title: "学习机大货出货",
      description: "采购订单已在用友完成建单后，从采购入库开始串行推进后续环节。",
      workflow_code: "WF-LEARN-001",
      version: "v1.0",
      bom_code: "BOM20260301",
      status: "published",
      purchase_order_required: true,
      serial_upload_policy: "material_based_required",
      serial_upload_label: "序列号明细表",
      serial_upload_note: "当所选物料为序列号管理时，必须导入序列号明细表。",
      default_material_code: "yscs061601",
      default_purchase_order_placeholder: "例如：CGDD260325000004",
      steps: [
        { key: "purchase_inbound", title: "采购入库", description: "引用现有采购订单生成采购入库单。" },
        { key: "morphology_conversion", title: "形态转换", description: "依据 BOM 完成成品与子件转换。" },
        { key: "transfer_order", title: "调拨订单", description: "形态转换通过后自动创建调拨订单。" },
        { key: "storeout", title: "调出单", description: "按调拨订单生成调出单并提交。" },
        { key: "storein", title: "调入单", description: "根据调出单自动下推调入单并完成提交。" },
      ],
      required_inputs: ["用友采购订单编号", "物料编码", "数量", "序列号明细表"],
      bom_preview: [
        { line_type: "成品", material_code: "yscs061601", material_name: "学习机成品", qty: 2026 },
        { line_type: "半成品", material_code: "yscs061601", material_name: "学习机成品", qty: 2026 },
        { line_type: "半成品", material_code: "003000013", material_name: "学习机彩盒", qty: 2026 },
        { line_type: "半成品", material_code: "004000001", material_name: "学习机主板", qty: 20 },
      ],
    },
    {
      key: "learning_device_city_restock",
      title: "学习机城市补货",
      description: "待发布业务流，面向区域补货场景编排采购入库、调拨订单、调出和调入链路。",
      workflow_code: "WF-LEARN-002",
      version: "v0.9",
      bom_code: "BOM20260308",
      status: "unpublished",
      purchase_order_required: true,
      serial_upload_policy: "material_based_required",
      serial_upload_label: "序列号明细表",
      serial_upload_note: "城市补货默认沿用学习机序列号校验规则，发布前需完成明细模板联调。",
      default_material_code: "yscs061601",
      default_purchase_order_placeholder: "例如：CGDD260325000004",
      steps: [
        { key: "purchase_inbound", title: "采购入库", description: "沿用原始采购订单生成采购入库，作为区域补货的起点。" },
        { key: "transfer_order", title: "调拨订单", description: "按目标城市云仓创建调拨订单，等待审核并进入执行。" },
        { key: "storeout", title: "调出单", description: "根据调拨订单下推调出单，驱动仓间出库。" },
        { key: "storein", title: "调入单", description: "在目标仓完成调入单提交，形成补货闭环。" },
      ],
      required_inputs: ["用友采购订单编号", "物料编码", "数量", "调入仓", "序列号明细表"],
      bom_preview: [
        { line_type: "成品", material_code: "yscs061601", material_name: "学习机成品", qty: 800 },
        { line_type: "半成品", material_code: "003000013", material_name: "学习机彩盒", qty: 800 },
        { line_type: "半成品", material_code: "004000001", material_name: "学习机主板", qty: 8 },
      ],
    },
    {
      key: "learning_device_market_trial",
      title: "学习机市场试投",
      description: "草稿态业务流，当前仅保留试投场景的入库、形态转换和调拨节点草案。",
      workflow_code: "WF-LEARN-003",
      version: "v0.3",
      bom_code: "BOM20260312",
      status: "draft",
      purchase_order_required: true,
      serial_upload_policy: "material_based_required",
      serial_upload_label: "序列号明细表",
      serial_upload_note: "草稿态仅完成了基础字段和序列号入口预配置，正式发布前仍需补齐仓库规则。",
      default_material_code: "yscs061601",
      default_purchase_order_placeholder: "例如：CGDD260325000004",
      steps: [
        { key: "purchase_inbound", title: "采购入库", description: "承接已有采购订单，生成试投批次的采购入库。" },
        { key: "morphology_conversion", title: "形态转换", description: "按轻量试投 BOM 做形态转换，为后续调拨预热。" },
        { key: "transfer_order", title: "调拨订单", description: "草稿中仅定义调拨订单骨架，后续需补齐目标仓和审批规则。" },
      ],
      required_inputs: ["用友采购订单编号", "物料编码", "数量", "目标业务流模板"],
      bom_preview: [
        { line_type: "成品", material_code: "yscs061601", material_name: "学习机成品", qty: 120 },
        { line_type: "半成品", material_code: "003000013", material_name: "学习机彩盒", qty: 120 },
      ],
    },
    {
      key: "learning_device_reverse_allocation",
      title: "学习机逆向调拨",
      description: "已停用业务流，保留历史逆向调拨配置供审计查看，默认不再出现在前台执行列表。",
      workflow_code: "WF-LEARN-004",
      version: "v1.1",
      bom_code: "BOM20260218",
      status: "disabled",
      purchase_order_required: false,
      serial_upload_policy: "material_based_optional",
      serial_upload_label: "序列号明细表",
      serial_upload_note: "逆向调拨流程已停用，如需复用请先恢复业务流后再执行。",
      default_material_code: "yscs061601",
      default_purchase_order_placeholder: "该业务流无需采购订单编号",
      steps: [
        { key: "transfer_order", title: "调拨订单", description: "从逆向仓生成调拨订单，准备回流主仓。" },
        { key: "storeout", title: "调出单", description: "按逆向调拨订单执行调出，释放逆向仓库存。" },
        { key: "storein", title: "调入单", description: "在主仓完成调入，收口逆向回流流程。" },
      ],
      required_inputs: ["调出仓", "调入仓", "物料编码", "数量"],
      bom_preview: [{ line_type: "成品", material_code: "yscs061601", material_name: "学习机成品", qty: 60 }],
    },
  ],
  material_profiles: [
    {
      material_code: "yscs061601",
      material_name: "学习机成品",
      material_type: "成品",
      serial_managed: true,
      default_unit: "EA",
      recommended_workflow: "learning_device_bulk_shipping",
      description: "学习机成品，启用序列号管理。",
    },
    {
      material_code: "003000013",
      material_name: "学习机彩盒",
      material_type: "半成品",
      serial_managed: false,
      default_unit: "EA",
      recommended_workflow: "learning_device_bulk_shipping",
      description: "学习机彩盒，不启用序列号管理。",
    },
    {
      material_code: "004000001",
      material_name: "学习机主板",
      material_type: "半成品",
      serial_managed: true,
      default_unit: "EA",
      recommended_workflow: "learning_device_bulk_shipping",
      description: "学习机主板，启用序列号管理。",
    },
  ],
  bom_profiles: [
    {
      bom_code: "BOM20260301",
      bom_name: "学习机大货出货 BOM",
      material_code: "yscs061601",
      material_name: "学习机成品",
      version_tag: "v1.0",
      status: "启用",
      component_count: 3,
      description: "用于学习机大货出货的标准形态转换 BOM。",
      lines: [
        { line_type: "成品", material_code: "yscs061601", material_name: "学习机成品", qty: 2026 },
        { line_type: "半成品", material_code: "yscs061601", material_name: "学习机成品", qty: 2026 },
        { line_type: "半成品", material_code: "003000013", material_name: "学习机彩盒", qty: 2026 },
        { line_type: "半成品", material_code: "004000001", material_name: "学习机主板", qty: 20 },
      ],
    },
    {
      bom_code: "BOM20260308",
      bom_name: "学习机城市补货 BOM",
      material_code: "yscs061601",
      material_name: "学习机成品",
      version_tag: "v0.9",
      status: "联调中",
      component_count: 3,
      description: "用于区域补货的轻量化形态转换 BOM。",
      lines: [
        { line_type: "成品", material_code: "yscs061601", material_name: "学习机成品", qty: 800 },
        { line_type: "半成品", material_code: "003000013", material_name: "学习机彩盒", qty: 800 },
        { line_type: "半成品", material_code: "004000001", material_name: "学习机主板", qty: 8 },
      ],
    },
    {
      bom_code: "BOM20260320",
      bom_name: "学习机彩盒独立组装 BOM",
      material_code: "003000013",
      material_name: "学习机彩盒",
      version_tag: "v1.0",
      status: "启用",
      component_count: 1,
      description: "面向彩盒独立组装的包装 BOM。",
      lines: [{ line_type: "半成品", material_code: "003000013", material_name: "学习机彩盒", qty: 1 }],
    },
  ],
  unfinished_workflow_instances: {
    unfinished_count: 0,
    items: [],
  },
  serial_import_template: {
    accepted_extensions: [".xlsx", ".csv"],
    required_headers: ["序列号"],
    optional_headers: ["物料编码", "物料名称", "备注"],
    tips: ["每个序列号一行", "系统会自动识别重复 SN 和空白行"],
  },
};

async function requestProcurementSupplyConsole() {
  return apiFetch<ProcurementSupplyConsoleResponse>("/api/backend/procurement-supply");
}

async function launchStandaloneDocument(documentKey: string, payload: Record<string, unknown>) {
  return apiFetch<ProcurementSupplyLaunchResponse>(`/api/backend/procurement-supply/documents/${documentKey}/launch`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function launchWorkflowDocument(workflowKey: string, payload: Record<string, unknown>) {
  return apiFetch<ProcurementSupplyWorkflowLaunchResponse>(
    `/api/backend/procurement-supply/workflows/${workflowKey}/launch`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

function buildDefaultVouchdate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function uploadSerialPreview(materialCode: string, file: File) {
  const formData = new FormData();
  formData.append("material_code", materialCode);
  formData.append("file", file);
  const response = await fetch("/api/backend/procurement-supply/serial-import-preview", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    body: formData,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : (payload?.message as string | undefined) ||
          (payload?.detail as string | undefined) ||
          "序列号明细预检失败";
    throw new Error(message);
  }

  return payload as ProcurementSerialImportPreviewResponse;
}

function buildStandaloneLaunchForm(
  document: ProcurementSupplyDocumentModule,
  materials: ProcurementSupplyConsoleResponse["material_profiles"],
  boms: ProcurementSupplyBomProfile[],
): StandaloneLaunchFormState {
  const defaultMaterialCode = materials[0]?.material_code ?? "yscs061601";
  const defaultBomCode = boms.find((item) => item.material_code === defaultMaterialCode)?.bom_code ?? boms[0]?.bom_code ?? "";
  return {
    documentKey: document.key,
    materialCode: defaultMaterialCode,
    quantity: "2026",
    unitPrice: "0",
    vouchdate: "2026-03-26 00:00:00",
    purchaseOrderCode: "",
    purchaseInboundCode: "",
    transferOrderCode: "",
    storeoutCode: "",
    warehouseCode: "000003",
    inwarehouseCode: "15532921",
    bustypeCode: "A20001",
    vendorCode: "01000327",
    invoiceVendorCode: "01000327",
    orgCode: "ZJJZX",
    exchRateType: "01",
    taxitemsCode: "VATR1",
    creator: "",
    creatorId: "",
    selectedBomCode: defaultBomCode,
    remark: "",
    serials: [],
    serialFileName: "",
  };
}

function buildWorkflowLaunchForm(
  workflow: ProcurementSupplyWorkflowTemplate,
  materials: ProcurementSupplyConsoleResponse["material_profiles"],
  boms: ProcurementSupplyBomProfile[],
  seed?: Partial<WorkflowLaunchFormState>,
): WorkflowLaunchFormState {
  const defaultMaterialCode =
    seed?.materialCode ||
    workflow.default_material_code ||
    materials.find((item) => item.recommended_workflow === workflow.key)?.material_code ||
    materials[0]?.material_code ||
    "yscs061601";
  const defaultBomCode =
    seed?.selectedBomCode ||
    boms.find((item) => item.bom_code === workflow.bom_code)?.bom_code ||
    boms.find((item) => item.material_code === defaultMaterialCode)?.bom_code ||
    boms[0]?.bom_code ||
    "";

  return {
    workflowKey: workflow.key,
    materialCode: defaultMaterialCode,
    quantity: seed?.quantity ?? "",
    purchaseOrderCode: seed?.purchaseOrderCode ?? "",
    warehouseCode: seed?.warehouseCode ?? "000003",
    inwarehouseCode: seed?.inwarehouseCode ?? "15532921",
    selectedBomCode: defaultBomCode,
    vouchdate: seed?.vouchdate ?? buildDefaultVouchdate(),
    remark: seed?.remark ?? "",
    serials: seed?.serials ?? [],
    serialFileName: seed?.serialFileName ?? "",
  };
}

function getWorkflowMeta(workflow: ProcurementSupplyWorkflowTemplate | null | undefined): WorkflowMeta {
  const status = workflow?.status ?? "draft";
  const statusInfo = workflowStatusMeta[status];
  return {
    code: workflow?.workflow_code ?? "WF-DRAFT-000",
    status,
    statusLabel: statusInfo.label,
    statusBadgeClassName: statusInfo.badgeClassName,
    version: workflow?.version ?? "v0.1",
    bomCode: workflow?.bom_code ?? "BOM00000000",
  };
}

function getWorkflowInstanceBadgeClassName(status: string) {
  if (status === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function getWorkflowDocumentBadgeClassName(status: string) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "approved") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (status === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function bumpWorkflowVersion(version: string) {
  const match = /^v(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return "v0.1";
  }
  const major = Number(match[1]);
  const minor = Number(match[2]) + 1;
  return `v${major}.${minor}`;
}

function normalizePublishedVersion(version: string) {
  const match = /^v(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return "v1.0";
  }
  const major = Number(match[1]);
  return major === 0 ? "v1.0" : version;
}

function buildNextWorkflowOrdinal(workflows: ProcurementSupplyWorkflowTemplate[]) {
  const usedOrdinals = new Set(
    workflows
      .map((workflow) => /^WF-CUSTOM-(\d+)$/.exec(workflow.workflow_code.trim().toUpperCase()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number(match[1])),
  );

  let nextOrdinal = 1;
  while (usedOrdinals.has(nextOrdinal)) {
    nextOrdinal += 1;
  }
  return nextOrdinal;
}

function buildDraftWorkflowTemplate(
  sourceWorkflow: ProcurementSupplyWorkflowTemplate | null,
  workflows: ProcurementSupplyWorkflowTemplate[],
  defaultMaterialCode: string,
): ProcurementSupplyWorkflowTemplate {
  const nextIndex = buildNextWorkflowOrdinal(workflows);
  const paddedIndex = String(nextIndex).padStart(3, "0");
  const source = sourceWorkflow ?? fallbackConsoleData.workflow_templates[0];

  return {
    ...(source ?? fallbackConsoleData.workflow_templates[0]),
    key: `custom_workflow_${Date.now()}`,
    title: `新业务流 ${paddedIndex}`,
    description: "请继续补充业务场景、节点和执行顺序，保存后会进入未发布列表等待联调。",
    workflow_code: `WF-CUSTOM-${paddedIndex}`,
    version: "v0.1",
    bom_code: `BOMDRAFT${String(nextIndex).padStart(4, "0")}`,
    status: "draft",
    default_material_code: defaultMaterialCode,
  };
}

function buildWorkflowDraftForm(
  sourceWorkflow: ProcurementSupplyWorkflowTemplate | null,
  workflows: ProcurementSupplyWorkflowTemplate[],
  defaultMaterialCode: string,
  bomProfiles: ProcurementSupplyBomProfile[],
): WorkflowDraftForm {
  const draftSeed = buildDraftWorkflowTemplate(sourceWorkflow, workflows, defaultMaterialCode);
  const matchedBom =
    bomProfiles.find((item) => item.material_code === defaultMaterialCode && item.bom_code === draftSeed.bom_code) ??
    bomProfiles.find((item) => item.material_code === defaultMaterialCode) ??
    bomProfiles[0];
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

function requiresPurchaseOrderInput(stepKeys: string[]) {
  return !stepKeys.includes("purchase_order");
}

function StatusMetric({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: "default" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-muted/35 px-4 py-3",
        emphasis === "success" && "border-emerald-200 bg-emerald-50/70",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{formatNumber(value)}</p>
    </div>
  );
}

function resolveDocumentStatusFilter(
  document: ProcurementSupplyDocumentModule | null,
  preferredStatus: DocumentStatusFilter = "pending",
): DocumentStatusFilter {
  if (!document) {
    return preferredStatus;
  }

  const availableStatuses = (Object.keys(documentStatusMeta) as DocumentStatusFilter[]).filter(
    (statusKey) => (document.status_summary?.[statusKey] ?? 0) > 0,
  );

  if (availableStatuses.includes(preferredStatus)) {
    return preferredStatus;
  }
  return availableStatuses[0] ?? "pending";
}

function DocumentStatusFilterButton({
  statusKey,
  value,
  active,
  onClick,
}: {
  statusKey: DocumentStatusFilter;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  const meta = documentStatusMeta[statusKey];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-left transition-all",
        active
          ? `${meta.activeClassName} shadow-[0_10px_24px_rgba(15,23,42,0.08)]`
          : "border-border/80 bg-white hover:border-primary/20 hover:bg-muted/20",
      )}
    >
      <span className="text-sm font-medium text-foreground">{meta.label}</span>
      <span className="text-2xl font-semibold tracking-tight text-foreground">{formatNumber(value)}</span>
    </button>
  );
}

function DocumentNavButton({
  item,
  active,
  onClick,
}: {
  item: ProcurementSupplyDocumentModule;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative w-full overflow-hidden rounded-[20px] border px-4 py-3 text-left transition-all",
        active
          ? "border-sky-300 bg-sky-50/90 shadow-[0_16px_36px_rgba(14,116,144,0.14)] ring-1 ring-sky-200/80"
          : "border-border/70 bg-white/85 hover:border-sky-200 hover:bg-white",
      )}
    >
      <span
        className={cn(
          "absolute bottom-2 left-0 top-2 w-1 rounded-full transition-all",
          active ? "bg-sky-500" : "bg-transparent",
        )}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full transition-all",
              active ? "bg-sky-500 shadow-[0_0_0_5px_rgba(14,165,233,0.14)]" : "bg-border",
            )}
          />
          <p className={cn("text-sm font-semibold", active ? "text-sky-950" : "text-foreground")}>{item.title}</p>
        </div>
        <Badge
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium shadow-none",
            active
              ? "border-sky-200 bg-white text-sky-700"
              : "border border-border/80 bg-white text-muted-foreground",
          )}
        >
          {item.stage_label}
        </Badge>
      </div>
    </button>
  );
}

function WorkflowManagementCard({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: typeof Plus;
  onClick: () => void;
}) {
  const Icon = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[24px] border border-border/70 bg-white/90 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/8 text-primary">
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </button>
  );
}

function WorkflowStepCard({
  index,
  total,
  title,
  description,
  stageLabel,
}: {
  index: number;
  total: number;
  title: string;
  description: string;
  stageLabel?: string;
}) {
  return (
    <div className="relative pl-14 sm:pl-16">
      {index < total - 1 ? <div className="absolute left-5 top-12 h-[calc(100%-1rem)] w-px bg-border" /> : null}
      <div className="absolute left-0 top-0 flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
        {index + 1}
      </div>
      <div className="rounded-[22px] border border-border/70 bg-white/90 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-base font-semibold text-foreground">{title}</p>
          {stageLabel ? (
            <Badge variant="outline" className="rounded-full border-border/70 bg-white text-[11px] text-muted-foreground">
              {stageLabel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-sm leading-7 text-muted-foreground sm:pr-6">{description}</p>
      </div>
    </div>
  );
}

function SerialPreviewSummary({
  preview,
  fileName,
}: {
  preview: ProcurementSerialImportPreviewResponse;
  fileName: string;
}) {
  return (
    <div className="space-y-4 rounded-[24px] border border-border/70 bg-white/90 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">导入预检结果</p>
          <p className="mt-1 text-xs text-muted-foreground">{fileName || preview.preview.file_name}</p>
        </div>
        <Badge className="rounded-full border border-border/80 bg-white px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-none">
          {preview.upload_required ? "必须导入" : "可选导入"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusMetric label="数据行" value={preview.preview.total_rows} />
        <StatusMetric label="有效序列号" value={preview.preview.accepted_count} emphasis="success" />
        <StatusMetric label="重复序列号" value={preview.preview.duplicate_count} />
        <StatusMetric label="空白行" value={preview.preview.missing_count} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">样例序列号</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {preview.preview.sample_serials.length > 0 ? (
              preview.preview.sample_serials.map((serial) => (
                <Badge
                  key={serial}
                  variant="outline"
                  className="rounded-full border-border/80 bg-white px-3 py-1 text-xs font-medium text-foreground"
                >
                  {serial}
                </Badge>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">当前文件还没有可用序列号样本。</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">异常提示</p>
          <div className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground">
            <p>重复序列号：{preview.preview.duplicates.length > 0 ? preview.preview.duplicates.join("，") : "无"}</p>
            <p>
              空白行位置：
              {preview.preview.missing_rows.length > 0 ? preview.preview.missing_rows.join("，") : "无"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionPanel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="pt-1">{children}</CardContent>
    </Card>
  );
}

export function ProcurementArrivalsPage() {
  const [data, setData] = useState<ProcurementSupplyConsoleResponse>(fallbackConsoleData);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(true);
  const [selectedDocumentKey, setSelectedDocumentKey] = useState(fallbackConsoleData.document_modules[0]?.key ?? "");
  const [selectedDocumentStatus, setSelectedDocumentStatus] = useState<DocumentStatusFilter>(
    resolveDocumentStatusFilter(fallbackConsoleData.document_modules[0] ?? null),
  );
  const [selectedWorkflowKey, setSelectedWorkflowKey] = useState(fallbackConsoleData.workflow_templates[0]?.key ?? "");
  const [workflowPanelMode, setWorkflowPanelMode] = useState<WorkflowPanelMode>("published");
  const [workflowManagementOpen, setWorkflowManagementOpen] = useState(false);
  const [createWorkflowOpen, setCreateWorkflowOpen] = useState(false);
  const [workflowDraftForm, setWorkflowDraftForm] = useState<WorkflowDraftForm | null>(null);
  const [bomPreviewWorkflowKey, setBomPreviewWorkflowKey] = useState<string | null>(null);
  const [executionDetailWorkflowKey, setExecutionDetailWorkflowKey] = useState<string | null>(null);
  const [disableWorkflowKey, setDisableWorkflowKey] = useState<string | null>(null);
  const [deleteWorkflowKey, setDeleteWorkflowKey] = useState<string | null>(null);
  const [purchaseOrderNo, setPurchaseOrderNo] = useState("");
  const [selectedMaterialCode, setSelectedMaterialCode] = useState(
    fallbackConsoleData.workflow_templates[0]?.default_material_code ?? "",
  );
  const [plannedQty, setPlannedQty] = useState("2026");
  const [serialPreview, setSerialPreview] = useState<ProcurementSerialImportPreviewResponse | null>(null);
  const [serialFileName, setSerialFileName] = useState("");
  const [uploadingSerial, setUploadingSerial] = useState(false);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [launchSubmitting, setLaunchSubmitting] = useState(false);
  const [launchUploadingSerial, setLaunchUploadingSerial] = useState(false);
  const [launchSerialPreview, setLaunchSerialPreview] = useState<ProcurementSerialImportPreviewResponse | null>(null);
  const [launchForm, setLaunchForm] = useState<StandaloneLaunchFormState | null>(null);
  const [workflowLaunchDialogOpen, setWorkflowLaunchDialogOpen] = useState(false);
  const [workflowLaunchSubmitting, setWorkflowLaunchSubmitting] = useState(false);
  const [workflowLaunchUploadingSerial, setWorkflowLaunchUploadingSerial] = useState(false);
  const [workflowLaunchSerialPreview, setWorkflowLaunchSerialPreview] =
    useState<ProcurementSerialImportPreviewResponse | null>(null);
  const [workflowLaunchForm, setWorkflowLaunchForm] = useState<WorkflowLaunchFormState | null>(null);
  const [unfinishedWorkflowDialogOpen, setUnfinishedWorkflowDialogOpen] = useState(false);

  async function loadConsole() {
    setLoading(true);
    try {
      const response = await requestProcurementSupplyConsole();
      setData(response);
      setUsingFallback(false);
      startTransition(() => {
        setSelectedDocumentKey((current) =>
          response.document_modules.some((item) => item.key === current) ? current : response.document_modules[0]?.key || "",
        );
        setSelectedWorkflowKey((current) =>
          response.workflow_templates.some((item) => item.key === current) ? current : response.workflow_templates[0]?.key || "",
        );
        setSelectedMaterialCode((current) =>
          response.material_profiles.some((item) => item.material_code === current)
            ? current
            : response.workflow_templates[0]?.default_material_code || response.material_profiles[0]?.material_code || "",
        );
      });
    } catch (_error) {
      setData(fallbackConsoleData);
      setUsingFallback(true);
      toast.warning("采购供应接口暂未返回，当前先展示控制台示意布局。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConsole();
  }, []);

  useEffect(() => {
    setSerialPreview(null);
    setSerialFileName("");
  }, [selectedMaterialCode, selectedWorkflowKey]);

  const selectedDocument =
    data.document_modules.find((item) => item.key === selectedDocumentKey) ?? data.document_modules[0] ?? null;
  const selectedWorkflow =
    data.workflow_templates.find((item) => item.key === selectedWorkflowKey) ?? data.workflow_templates[0] ?? null;
  const selectedMaterial =
    data.material_profiles.find((item) => item.material_code === selectedMaterialCode) ?? data.material_profiles[0] ?? null;
  const selectedWorkflowMeta = getWorkflowMeta(selectedWorkflow);
  const serialUploadEnabled = Boolean(selectedMaterial?.serial_managed);
  const publishedWorkflows = data.workflow_templates.filter((item) => item.status === "published");
  const allManagedWorkflows = [...data.workflow_templates].sort(
    (left, right) =>
      workflowStatusOrder[left.status] - workflowStatusOrder[right.status] || left.workflow_code.localeCompare(right.workflow_code),
  );
  const bomPreviewWorkflow =
    data.workflow_templates.find((item) => item.key === bomPreviewWorkflowKey) ?? null;
  const executionDetailWorkflow =
    data.workflow_templates.find((item) => item.key === executionDetailWorkflowKey) ?? null;
  const disableTargetWorkflow =
    data.workflow_templates.find((item) => item.key === disableWorkflowKey) ?? null;
  const deleteTargetWorkflow =
    data.workflow_templates.find((item) => item.key === deleteWorkflowKey) ?? null;
  const workflowStatusSummary = {
    published: data.workflow_templates.filter((item) => item.status === "published").length,
    unpublished: data.workflow_templates.filter((item) => item.status === "unpublished").length,
    draft: data.workflow_templates.filter((item) => item.status === "draft").length,
    disabled: data.workflow_templates.filter((item) => item.status === "disabled").length,
  };
  const workflowCapableModules = data.document_modules.filter((item) => item.supports_workflow);
  const availableDraftBomProfiles = workflowDraftForm
    ? data.bom_profiles.filter((item) => item.material_code === workflowDraftForm.defaultMaterialCode)
    : [];
  const selectedDocumentRows = (selectedDocument?.detail_rows ?? []).filter(
    (row) => row.status === selectedDocumentStatus,
  );
  const launchSelectedMaterial = launchForm
    ? data.material_profiles.find((item) => item.material_code === launchForm.materialCode) ?? null
    : null;
  const launchSelectedBom = launchForm
    ? data.bom_profiles.find((item) => item.bom_code === launchForm.selectedBomCode) ?? null
    : null;
  const workflowLaunchTargetWorkflow = workflowLaunchForm
    ? data.workflow_templates.find((item) => item.key === workflowLaunchForm.workflowKey) ?? null
    : null;
  const workflowLaunchSelectedMaterial = workflowLaunchForm
    ? data.material_profiles.find((item) => item.material_code === workflowLaunchForm.materialCode) ?? null
    : null;
  const workflowLaunchAvailableBomProfiles = workflowLaunchForm
    ? data.bom_profiles.filter((item) => item.material_code === workflowLaunchForm.materialCode)
    : [];
  const workflowLaunchSelectedBom = workflowLaunchForm
    ? data.bom_profiles.find((item) => item.bom_code === workflowLaunchForm.selectedBomCode) ?? null
    : null;
  const unfinishedWorkflowSummary = data.unfinished_workflow_instances ?? fallbackConsoleData.unfinished_workflow_instances;
  const unfinishedWorkflowItems = unfinishedWorkflowSummary.items ?? [];
  const unfinishedWorkflowCount = Number(unfinishedWorkflowSummary.unfinished_count ?? unfinishedWorkflowItems.length ?? 0);
  const workflowLaunchStepKeys = workflowLaunchTargetWorkflow?.steps.map((step) => step.key) ?? [];
  const workflowLaunchNeedsPurchaseOrder =
    Boolean(workflowLaunchTargetWorkflow?.purchase_order_required) && !workflowLaunchStepKeys.includes("purchase_order");
  const workflowLaunchNeedsInboundWarehouse = workflowLaunchStepKeys.includes("purchase_inbound");
  const workflowLaunchNeedsBom = workflowLaunchStepKeys.includes("morphology_conversion");
  const workflowLaunchNeedsQuantity =
    workflowLaunchStepKeys.includes("purchase_order") || workflowLaunchStepKeys.includes("morphology_conversion");
  const workflowLaunchNeedsTargetWarehouse = workflowLaunchStepKeys.includes("transfer_order");
  const workflowLaunchSerialRequired =
    workflowLaunchNeedsBom &&
    Boolean(workflowLaunchSelectedMaterial?.serial_managed) &&
    workflowLaunchTargetWorkflow?.serial_upload_policy !== "none";
  const workflowLaunchNeedsSerialUpload =
    workflowLaunchSerialRequired && workflowLaunchTargetWorkflow?.serial_upload_policy === "material_based_required";
  const selectedDraftStepModules = workflowDraftForm
    ? workflowDraftForm.selectedStepKeys
        .map((stepKey) => workflowCapableModules.find((item) => item.key === stepKey) ?? null)
        .filter((item): item is ProcurementSupplyDocumentModule => item !== null)
    : [];
  useEffect(() => {
    if (!selectedWorkflow?.purchase_order_required) {
      setPurchaseOrderNo("");
    }
  }, [selectedWorkflow?.key, selectedWorkflow?.purchase_order_required]);

  useEffect(() => {
    setSelectedDocumentStatus((current) => resolveDocumentStatusFilter(selectedDocument, current));
  }, [selectedDocument?.key, selectedDocument?.status_summary]);

  useEffect(() => {
    if (!data.workflow_templates.some((item) => item.key === selectedWorkflowKey)) {
      const nextWorkflow = data.workflow_templates.find((item) => item.status === "published") ?? data.workflow_templates[0] ?? null;
      setSelectedWorkflowKey(nextWorkflow?.key ?? "");
    }
  }, [data.workflow_templates, selectedWorkflowKey]);

  async function handleSerialFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedMaterial) {
      return;
    }
    setUploadingSerial(true);
    try {
      const response = await uploadSerialPreview(selectedMaterial.material_code, file);
      setSerialPreview(response);
      setSerialFileName(file.name);
      if (response.preview.duplicate_count > 0 || response.preview.missing_count > 0) {
        toast.warning("序列号明细已导入，但仍有重复项或空白行需要处理。");
      } else {
        toast.success("序列号明细预检通过");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "序列号明细预检失败");
      setSerialPreview(null);
      setSerialFileName("");
    } finally {
      setUploadingSerial(false);
      event.target.value = "";
    }
  }

  function openStandaloneLaunchDialog(document: ProcurementSupplyDocumentModule) {
    if (!["purchase_order", "purchase_inbound", "morphology_conversion", "transfer_order", "storeout", "storein"].includes(document.key)) {
      toast.info(`${document.title} 入口已经保留，等你给我对应的用友接口文档后我继续接真实链路。`);
      return;
    }
    setLaunchSerialPreview(null);
    setLaunchForm(buildStandaloneLaunchForm(document, data.material_profiles, data.bom_profiles));
    setLaunchDialogOpen(true);
  }

  function updateStandaloneLaunchForm<K extends keyof StandaloneLaunchFormState>(
    field: K,
    value: StandaloneLaunchFormState[K],
  ) {
    setLaunchForm((current) => (current ? { ...current, [field]: value } : current));
  }

  async function handleStandaloneLaunchSerialFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !launchForm || !launchSelectedMaterial) {
      return;
    }
    setLaunchUploadingSerial(true);
    try {
      const response = await uploadSerialPreview(launchSelectedMaterial.material_code, file);
      setLaunchSerialPreview(response);
      setLaunchForm((current) =>
        current
          ? {
              ...current,
              serials: response.preview.accepted_serials,
              serialFileName: file.name,
            }
          : current,
      );
      toast.success("序列号预检通过，可以直接用于形态转换建单。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "序列号预检失败");
      setLaunchSerialPreview(null);
      setLaunchForm((current) =>
        current
          ? {
              ...current,
              serials: [],
              serialFileName: "",
            }
          : current,
      );
    } finally {
      setLaunchUploadingSerial(false);
      event.target.value = "";
    }
  }

  async function submitStandaloneLaunch() {
    if (!launchForm) {
      return;
    }
    const payload: Record<string, unknown> = {};
    if (launchForm.documentKey === "purchase_order") {
      Object.assign(payload, {
        material_code: launchForm.materialCode,
        quantity: Number(launchForm.quantity || 0),
        unit_price: Number(launchForm.unitPrice || 0),
        bustype_code: launchForm.bustypeCode,
        vendor_code: launchForm.vendorCode,
        invoice_vendor_code: launchForm.invoiceVendorCode,
        org_code: launchForm.orgCode,
        exch_rate_type: launchForm.exchRateType,
        taxitems_code: launchForm.taxitemsCode,
        creator: launchForm.creator,
        creator_id: launchForm.creatorId,
        vouchdate: launchForm.vouchdate,
      });
    } else if (launchForm.documentKey === "purchase_inbound") {
      Object.assign(payload, {
        purchase_order_code: launchForm.purchaseOrderCode,
        warehouse_code: launchForm.warehouseCode,
        vouchdate: launchForm.vouchdate,
      });
    } else if (launchForm.documentKey === "morphology_conversion") {
      Object.assign(payload, {
        purchase_inbound_code: launchForm.purchaseInboundCode,
        bom_code: launchForm.selectedBomCode,
        quantity: Number(launchForm.quantity || 0),
        remark: launchForm.remark,
        vouchdate: launchForm.vouchdate,
        serials: launchForm.serials,
      });
    } else if (launchForm.documentKey === "transfer_order") {
      Object.assign(payload, {
        purchase_inbound_code: launchForm.purchaseInboundCode,
        inwarehouse_code: launchForm.inwarehouseCode,
        memo: launchForm.remark,
        vouchdate: launchForm.vouchdate,
      });
    } else if (launchForm.documentKey === "storeout") {
      Object.assign(payload, {
        transfer_order_code: launchForm.transferOrderCode,
        vouchdate: launchForm.vouchdate,
      });
    } else if (launchForm.documentKey === "storein") {
      Object.assign(payload, {
        storeout_code: launchForm.storeoutCode,
        vouchdate: launchForm.vouchdate,
      });
    }

    setLaunchSubmitting(true);
    try {
      const result = await launchStandaloneDocument(launchForm.documentKey, payload);
      toast.success(`${selectedDocument?.title ?? "单据"} 已创建：${result.document_code}`);
      setLaunchDialogOpen(false);
      setLaunchForm(null);
      setLaunchSerialPreview(null);
      await loadConsole();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "单据创建失败");
    } finally {
      setLaunchSubmitting(false);
    }
  }

  function openWorkflowLaunchDialog(workflow: ProcurementSupplyWorkflowTemplate | null) {
    if (!workflow) {
      return;
    }
    if (workflow.status !== "published") {
      toast.warning(`${workflow.title} 当前还不是已发布业务流，请先发布后再发起业务流单据。`);
      return;
    }
    setWorkflowLaunchSerialPreview(null);
    setWorkflowLaunchForm(buildWorkflowLaunchForm(workflow, data.material_profiles, data.bom_profiles));
    setWorkflowLaunchDialogOpen(true);
  }

  function updateWorkflowLaunchForm<K extends keyof WorkflowLaunchFormState>(
    field: K,
    value: WorkflowLaunchFormState[K],
  ) {
    setWorkflowLaunchForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function handleWorkflowLaunchMaterialChange(nextMaterialCode: string) {
    setWorkflowLaunchSerialPreview(null);
    setWorkflowLaunchForm((current) => {
      if (!current) {
        return current;
      }
      const matchedBom =
        data.bom_profiles.find((item) => item.material_code === nextMaterialCode && item.bom_code === current.selectedBomCode) ??
        data.bom_profiles.find((item) => item.material_code === nextMaterialCode) ??
        null;
      return {
        ...current,
        materialCode: nextMaterialCode,
        selectedBomCode: matchedBom?.bom_code ?? "",
        serials: [],
        serialFileName: "",
      };
    });
  }

  async function handleWorkflowLaunchSerialFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !workflowLaunchForm || !workflowLaunchSelectedMaterial) {
      return;
    }
    setWorkflowLaunchUploadingSerial(true);
    try {
      const response = await uploadSerialPreview(workflowLaunchSelectedMaterial.material_code, file);
      setWorkflowLaunchSerialPreview(response);
      setWorkflowLaunchForm((current) =>
        current
          ? {
              ...current,
              serials: response.preview.accepted_serials,
              serialFileName: file.name,
            }
          : current,
      );
      toast.success("序列号预检通过，可以直接用于业务流单据下推。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "序列号预检失败");
      setWorkflowLaunchSerialPreview(null);
      setWorkflowLaunchForm((current) =>
        current
          ? {
              ...current,
              serials: [],
              serialFileName: "",
            }
          : current,
      );
    } finally {
      setWorkflowLaunchUploadingSerial(false);
      event.target.value = "";
    }
  }

  async function submitWorkflowLaunch() {
    if (!workflowLaunchForm || !workflowLaunchTargetWorkflow) {
      return;
    }

    if (!workflowLaunchForm.materialCode) {
      toast.warning("请先选择物料。");
      return;
    }
    if (workflowLaunchNeedsPurchaseOrder && !workflowLaunchForm.purchaseOrderCode.trim()) {
      toast.warning("请先填写用友采购订单编号。");
      return;
    }
    if (workflowLaunchNeedsInboundWarehouse && !workflowLaunchForm.warehouseCode.trim()) {
      toast.warning("请先填写采购入库仓库。");
      return;
    }
    if (workflowLaunchNeedsTargetWarehouse && !workflowLaunchForm.inwarehouseCode.trim()) {
      toast.warning("请先填写调入仓。");
      return;
    }
    if (workflowLaunchNeedsBom && !workflowLaunchForm.selectedBomCode.trim()) {
      toast.warning("请先选择形态转换 BOM。");
      return;
    }
    if (workflowLaunchNeedsQuantity) {
      const quantity = Number(workflowLaunchForm.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        toast.warning("请先输入有效的计划数量。");
        return;
      }
    }
    if (workflowLaunchNeedsSerialUpload && workflowLaunchForm.serials.length === 0) {
      toast.warning("当前业务流要求导入序列号明细，请先完成预检。");
      return;
    }

    const payload: Record<string, unknown> = {
      material_code: workflowLaunchForm.materialCode,
      vouchdate: workflowLaunchForm.vouchdate,
      remark: workflowLaunchForm.remark.trim(),
    };

    if (workflowLaunchNeedsPurchaseOrder) {
      payload.purchase_order_code = workflowLaunchForm.purchaseOrderCode.trim();
    }
    if (workflowLaunchNeedsInboundWarehouse) {
      payload.warehouse_code = workflowLaunchForm.warehouseCode.trim();
    }
    if (workflowLaunchNeedsTargetWarehouse) {
      payload.inwarehouse_code = workflowLaunchForm.inwarehouseCode.trim();
    }
    if (workflowLaunchNeedsBom) {
      payload.bom_code = workflowLaunchForm.selectedBomCode.trim();
    }
    if (workflowLaunchNeedsQuantity) {
      payload.quantity = Number(workflowLaunchForm.quantity || 0);
    }
    if (workflowLaunchSerialRequired && workflowLaunchForm.serials.length > 0) {
      payload.serials = workflowLaunchForm.serials;
    }

    setWorkflowLaunchSubmitting(true);
    try {
      const result = await launchWorkflowDocument(workflowLaunchTargetWorkflow.key, payload);
      toast.success(
        result.instance_status === "completed"
          ? `${result.workflow_title} 已完结，共执行 ${result.step_results.length} 个节点。`
          : `${result.workflow_title} 已发起，当前停留在 ${result.current_step_title || "当前环节"}。`,
      );
      setWorkflowLaunchDialogOpen(false);
      setWorkflowLaunchForm(null);
      setWorkflowLaunchSerialPreview(null);
      await loadConsole();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "业务流单据发起失败");
    } finally {
      setWorkflowLaunchSubmitting(false);
    }
  }

  function handleWorkflowManagementAction(actionKey: string) {
    const label = workflowManagementActions.find((item) => item.key === actionKey)?.title ?? "该功能";
    toast.info(`${label} 入口已留好，下一步接真实的业务流保存与发布接口。`);
  }

  function handleLaunchDocument(document: ProcurementSupplyDocumentModule) {
    toast.info(`${document.title} 的独立发起入口已预留，下一步接昨天跑通的真实用友执行链路。`);
  }

  function handleOpenWorkflowExecution(workflow: ProcurementSupplyWorkflowTemplate | null) {
    openWorkflowLaunchDialog(workflow);
  }

  function handleWorkflowChange(nextWorkflowKey: string) {
    setSelectedWorkflowKey(nextWorkflowKey);
    const nextWorkflow = data.workflow_templates.find((item) => item.key === nextWorkflowKey);
    if (nextWorkflow?.default_material_code) {
      setSelectedMaterialCode(nextWorkflow.default_material_code);
    }
  }

  function openCreateWorkflowDialog() {
    const nextDraftForm = buildWorkflowDraftForm(
      selectedWorkflow,
      data.workflow_templates,
      selectedMaterial?.material_code ?? data.material_profiles[0]?.material_code ?? "yscs061601",
      data.bom_profiles,
    );
    setWorkflowDraftForm(nextDraftForm);
    setCreateWorkflowOpen(true);
  }

  function handleDraftFormChange<K extends keyof WorkflowDraftForm>(field: K, value: WorkflowDraftForm[K]) {
    setWorkflowDraftForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function handleDraftMaterialChange(nextMaterialCode: string) {
    const nextBom =
      data.bom_profiles.find((item) => item.material_code === nextMaterialCode) ?? null;
    setWorkflowDraftForm((current) =>
      current
        ? {
            ...current,
            defaultMaterialCode: nextMaterialCode,
            selectedBomCode: nextBom?.bom_code ?? "",
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
    if (!workflowDraftForm) {
      return;
    }

    const title = workflowDraftForm.title.trim();
    const workflowCode = workflowDraftForm.workflowCode.trim().toUpperCase();
    const description = workflowDraftForm.description.trim();
    const bomCode = workflowDraftForm.selectedBomCode.trim().toUpperCase();

    if (!title || !workflowCode || !bomCode || !description) {
      toast.warning("请先完整填写业务流名称、描述，并选择默认物料和 BOM。");
      return;
    }
    if (workflowDraftForm.selectedStepKeys.length === 0) {
      toast.warning("请至少选择一个执行节点后再保存草稿。");
      return;
    }
    const materialProfile =
      data.material_profiles.find((item) => item.material_code === workflowDraftForm.defaultMaterialCode) ?? selectedMaterial ?? null;
    const selectedBomProfile =
      data.bom_profiles.find((item) => item.bom_code === workflowDraftForm.selectedBomCode) ?? null;
    const steps = workflowDraftForm.selectedStepKeys
      .map((stepKey) => {
        const module = data.document_modules.find((item) => item.key === stepKey);
        if (!module) {
          return null;
        }
        const fromSource = selectedWorkflow?.steps.find((step) => step.key === stepKey);
        return {
          key: module.key,
          title: module.title,
          description: fromSource?.description ?? module.description,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const nextWorkflow: ProcurementSupplyWorkflowTemplate = {
      key: workflowDraftForm.key,
      title,
      description,
      workflow_code: workflowCode,
      version: "v0.1",
      bom_code: bomCode,
      status: "draft",
      purchase_order_required: requiresPurchaseOrderInput(workflowDraftForm.selectedStepKeys),
      serial_upload_policy: materialProfile?.serial_managed ? "material_based_required" : "material_based_optional",
      serial_upload_label: "序列号明细表",
      serial_upload_note: materialProfile?.serial_managed
        ? "当前所选物料启用了序列号管理，后续执行时会强制要求导入序列号明细表。"
        : "当前所选物料默认不启用序列号管理，系统会在执行时按基础数据自动判断是否开启。",
      default_material_code: workflowDraftForm.defaultMaterialCode,
      default_purchase_order_placeholder: requiresPurchaseOrderInput(workflowDraftForm.selectedStepKeys) ? "例如：CGDD260325000004" : "该业务流已包含采购订单节点，无需额外输入采购订单编号",
      steps,
      required_inputs: [
        ...(requiresPurchaseOrderInput(workflowDraftForm.selectedStepKeys) ? ["用友采购订单编号"] : []),
        "物料编码",
        "数量",
        ...(materialProfile?.serial_managed ? ["序列号明细表"] : []),
      ],
      bom_preview:
        selectedBomProfile?.lines && selectedBomProfile.lines.length > 0
          ? selectedBomProfile.lines
          : [
              {
                line_type: "成品",
                material_code: workflowDraftForm.defaultMaterialCode,
                material_name: materialProfile?.material_name ?? workflowDraftForm.defaultMaterialCode,
                qty: 1,
              },
            ],
    };

    setData((current) => ({
      ...current,
      summary: {
        ...current.summary,
        workflow_template_count: current.workflow_templates.length + 1,
      },
      workflow_templates: [nextWorkflow, ...current.workflow_templates],
    }));
    setSelectedWorkflowKey(nextWorkflow.key);
    setCreateWorkflowOpen(false);
    setWorkflowDraftForm(null);
    toast.success(`${nextWorkflow.title} 已保存为草稿。`);
  }

  function handleSaveWorkflow(workflow: ProcurementSupplyWorkflowTemplate) {
    const nextStatus = workflow.status === "draft" ? "unpublished" : workflow.status;
    const nextVersion = bumpWorkflowVersion(workflow.version);
    setData((current) => ({
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
    }));
    toast.success(
      workflow.status === "draft"
        ? `${workflow.title} 已保存，当前状态变更为未发布。`
        : `${workflow.title} 已保存，版本更新为 ${nextVersion}。`,
    );
  }

  function handlePublishWorkflow(workflow: ProcurementSupplyWorkflowTemplate) {
    if (workflow.status === "published") {
      toast.info(`${workflow.title} 当前已经是已发布状态。`);
      return;
    }
    const nextVersion = normalizePublishedVersion(workflow.version);
    setData((current) => ({
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
    }));
    toast.success(`${workflow.title} 已发布，前台执行区现在会展示这条业务流。`);
  }

  function handleDeleteWorkflowRequest(workflow: ProcurementSupplyWorkflowTemplate) {
    setDeleteWorkflowKey(workflow.key);
  }

  function handleDeleteWorkflowConfirm() {
    if (!deleteTargetWorkflow || deleteTargetWorkflow.status === "published") {
      return;
    }

    setData((current) => {
      const nextWorkflows = current.workflow_templates.filter((item) => item.key !== deleteTargetWorkflow.key);
      return {
        ...current,
        summary: {
          ...current.summary,
          workflow_template_count: nextWorkflows.length,
        },
        workflow_templates: nextWorkflows,
      };
    });

    if (selectedWorkflowKey === deleteTargetWorkflow.key) {
      const nextWorkflow = publishedWorkflows.find((item) => item.key !== deleteTargetWorkflow.key) ?? data.workflow_templates.find((item) => item.key !== deleteTargetWorkflow.key) ?? null;
      setSelectedWorkflowKey(nextWorkflow?.key ?? "");
    }
    if (bomPreviewWorkflowKey === deleteTargetWorkflow.key) {
      setBomPreviewWorkflowKey(null);
    }
    if (executionDetailWorkflowKey === deleteTargetWorkflow.key) {
      setExecutionDetailWorkflowKey(null);
    }
    if (disableWorkflowKey === deleteTargetWorkflow.key) {
      setDisableWorkflowKey(null);
    }
    setDeleteWorkflowKey(null);
    toast.success(`${deleteTargetWorkflow.title} 已删除，不再展示在业务流列表中。`);
  }

  function handleDisableWorkflowConfirm() {
    if (!disableTargetWorkflow) {
      return;
    }

    setData((current) => ({
      ...current,
      workflow_templates: current.workflow_templates.map((item) =>
        item.key === disableTargetWorkflow.key
          ? {
              ...item,
              status: "disabled",
            }
          : item,
      ),
    }));
    setDisableWorkflowKey(null);
    toast.success(`${disableTargetWorkflow.title} 已停用，后续不再展示在已发布业务流里。`);
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-end xl:gap-x-8 xl:gap-y-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <Workflow className="size-4" />
                Workflow
              </div>
              <CardTitle className="text-2xl">业务流编排</CardTitle>
            </div>

            <p className="hidden overflow-hidden whitespace-nowrap text-sm leading-6 text-muted-foreground xl:block xl:pb-1">
              点击右侧“业务流编排”按钮，让我们开始业务流程编排之旅吧。
            </p>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                className="h-11 rounded-full bg-sky-600 px-5 text-white shadow-[0_14px_34px_rgba(2,132,199,0.28)] transition-all hover:bg-sky-700 hover:shadow-[0_18px_40px_rgba(2,132,199,0.34)]"
                onClick={() => setWorkflowManagementOpen(true)}
              >
                <FileCog className="size-4" />
                业务流编排
              </Button>
            </div>
          </div>

          <p className="text-sm leading-6 text-muted-foreground xl:hidden">
            点击右侧“业务流编排”按钮，让我们开始业务流程编排之旅吧。
          </p>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="rounded-[24px] border border-border/70 bg-white/85 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Workflow className="size-4" />
              已发布业务流
            </div>

            {publishedWorkflows.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-[20px] border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>业务流名称</TableHead>
                      <TableHead>版本号</TableHead>
                      <TableHead>物料编码</TableHead>
                      <TableHead>形态转换 BOM</TableHead>
                      <TableHead>执行链路</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {publishedWorkflows.map((workflow) => {
                      const workflowMeta = getWorkflowMeta(workflow);
                      return (
                        <TableRow key={workflow.key}>
                          <TableCell className="font-medium">{workflow.title}</TableCell>
                          <TableCell>{workflowMeta.version}</TableCell>
                          <TableCell className="font-mono text-xs">{workflow.default_material_code}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-950 shadow-sm transition hover:border-slate-400 hover:bg-slate-200"
                              onClick={() => setBomPreviewWorkflowKey(workflow.key)}
                            >
                              {workflowMeta.bomCode}
                            </button>
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-800 shadow-sm transition hover:border-sky-400 hover:bg-sky-200"
                              onClick={() => setExecutionDetailWorkflowKey(workflow.key)}
                            >
                              详情
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("rounded-full text-xs", workflowMeta.statusBadgeClassName)}
                            >
                              {workflowMeta.statusLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                className="text-sm font-medium text-sky-700 transition hover:underline"
                                onClick={() => openWorkflowLaunchDialog(workflow)}
                              >
                                发起业务流单据
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="mt-4 rounded-[20px] border border-dashed border-border/80 bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
                当前没有生效中的业务流。你可以点击右侧“业务流编排”按钮继续新增、发布或恢复业务流。
              </div>
            )}

            <div className="mt-4 rounded-[20px] border border-border/70 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Clock3 className="size-4 text-sky-600" />
                    未完成的业务流单据
                  </div>
                  <p className="text-sm text-muted-foreground">
                    汇总当前仍未完结的业务流卡点，点击数量即可查看所处环节、单号、状态和待审批人。
                  </p>
                </div>

                <button
                  type="button"
                  className="inline-flex min-w-[180px] items-center justify-center gap-3 rounded-[18px] border border-sky-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
                  onClick={() => setUnfinishedWorkflowDialogOpen(true)}
                >
                  <span className="text-sm font-medium text-slate-600">当前数量</span>
                  <span className="text-3xl font-semibold tracking-tight text-slate-950">
                    {formatNumber(unfinishedWorkflowCount)}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <SectionPanel
          title="单据中心"
          description="选择左侧单据后，右侧直接查看状态、字段和接口。"
        >
          <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
            <ScrollArea className="max-h-[720px] pr-3">
              <div className="space-y-3">
                {data.document_modules.map((item) => (
                  <DocumentNavButton
                    key={item.key}
                    item={item}
                    active={item.key === selectedDocument?.key}
                    onClick={() => setSelectedDocumentKey(item.key)}
                  />
                ))}
              </div>
            </ScrollArea>

            {selectedDocument ? (
              <div className="rounded-[28px] border border-border/80 bg-gradient-to-br from-white via-white to-muted/30 p-5 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-3xl font-semibold tracking-tight text-foreground">{selectedDocument.title}</h2>
                    <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
                      {selectedDocument.stage_label}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button className="rounded-full" onClick={() => openStandaloneLaunchDialog(selectedDocument)}>
                      <PackageOpen className="size-4" />
                      单独向用友发起{selectedDocument.title}
                    </Button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  {(Object.keys(documentStatusMeta) as DocumentStatusFilter[]).map((statusKey) => (
                    <DocumentStatusFilterButton
                      key={statusKey}
                      statusKey={statusKey}
                      value={selectedDocument.status_summary[statusKey]}
                      active={selectedDocumentStatus === statusKey}
                      onClick={() => setSelectedDocumentStatus(statusKey)}
                    />
                  ))}
                </div>

                <div className="mt-5 rounded-[24px] border border-border/70 bg-white/90 p-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-base font-semibold text-foreground">
                        {documentStatusMeta[selectedDocumentStatus].label}单据明细
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        当前展示 {selectedDocument.title} 在“{documentStatusMeta[selectedDocumentStatus].label}”状态下的单据列表。
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full text-xs",
                        documentStatusMeta[selectedDocumentStatus].badgeClassName,
                      )}
                    >
                      {formatNumber(selectedDocumentRows.length)} 条
                    </Badge>
                  </div>

                  {selectedDocumentRows.length > 0 && (selectedDocument.detail_columns?.length ?? 0) > 0 ? (
                    <div className="mt-4 overflow-hidden rounded-[20px] border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/35">
                            {(selectedDocument.detail_columns ?? []).map((column) => (
                              <TableHead key={column.key}>{column.label}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedDocumentRows.map((row: ProcurementSupplyDocumentDetailRow) => (
                            <TableRow key={row.id}>
                              {(selectedDocument.detail_columns ?? []).map((column) => (
                                <TableCell key={`${row.id}-${column.key}`}>
                                  {String(row.values[column.key] ?? "-")}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[20px] border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                      当前状态下还没有可展示的单据明细。
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </SectionPanel>

        <div className="hidden">
        <SectionPanel
          title="业务流程编排"
          description="只保留一个业务流程编排主模块。默认展示已发布业务流；点击右上角工作流编码，切到业务流管理入口。"
          actions={
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setWorkflowPanelMode((current) => (current === "published" ? "management" : "published"))}
            >
              <FileCog className="size-4" />
              {workflowPanelMode === "published" ? `工作流编码 · ${selectedWorkflowMeta.code}` : "返回已发布业务流"}
            </Button>
          }
        >
          {workflowPanelMode === "published" && selectedWorkflow ? (
            <div className="space-y-5">
              <div className="rounded-[28px] border border-border/80 bg-gradient-to-br from-sky-50 via-white to-white p-5">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
                      已发布业务流
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-border/70 bg-white text-xs text-muted-foreground">
                      {selectedWorkflowMeta.statusLabel}
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-border/70 bg-white text-xs text-muted-foreground">
                      {selectedWorkflowMeta.version}
                    </Badge>
                  </div>

                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">{selectedWorkflow.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{selectedWorkflow.description}</p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
                    <div className="space-y-4 rounded-[24px] border border-border/70 bg-white/90 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">当前业务流</p>
                          <Select value={selectedWorkflow.key} onValueChange={handleWorkflowChange}>
                            <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                              <SelectValue placeholder="选择业务流" />
                            </SelectTrigger>
                            <SelectContent>
                              {data.workflow_templates.map((workflow) => (
                                <SelectItem key={workflow.key} value={workflow.key}>
                                  {workflow.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">物料</p>
                          <Select value={selectedMaterialCode} onValueChange={setSelectedMaterialCode}>
                            <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                              <SelectValue placeholder="选择物料" />
                            </SelectTrigger>
                            <SelectContent>
                              {data.material_profiles.map((material) => (
                                <SelectItem key={material.material_code} value={material.material_code}>
                                  {material.material_code} · {material.material_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        {selectedWorkflow.purchase_order_required ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                用友采购订单编号
                              </p>
                              <Badge
                                variant="outline"
                                className="rounded-full border-amber-200 bg-amber-50 text-[11px] text-amber-700"
                              >
                                必填
                              </Badge>
                            </div>
                            <Input
                              value={purchaseOrderNo}
                              onChange={(event) => setPurchaseOrderNo(event.target.value)}
                              placeholder={selectedWorkflow.default_purchase_order_placeholder}
                              className="h-11 rounded-2xl border-border/80 bg-white"
                            />
                          </div>
                        ) : (
                          <div className="rounded-[20px] border border-border/70 bg-muted/30 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              采购订单规则
                            </p>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">
                              当前业务流已包含采购订单节点，执行时无需额外输入用友采购订单编号。
                            </p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">计划数量</p>
                          <Input
                            value={plannedQty}
                            onChange={(event) => setPlannedQty(event.target.value)}
                            className="h-11 rounded-2xl border-border/80 bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-border/70 bg-white/90 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">前置校验</p>
                      <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                        <p>工作流编码：{selectedWorkflowMeta.code}</p>
                        <p>已发布后默认出现在这里，员工日常只看已发布业务流。</p>
                        <p>
                          {selectedMaterial
                            ? `${selectedMaterial.material_name}（${selectedMaterial.material_code}）${
                                selectedMaterial.serial_managed ? "已启用" : "未启用"
                              }序列号管理。`
                            : "请先选择物料。"}
                        </p>
                        <p>当物料启用序列号时，系统自动打开序列号导入入口；否则入口关闭。</p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedWorkflow.required_inputs.map((field) => (
                          <Badge
                            key={field}
                            variant="outline"
                            className="rounded-full border-border/80 bg-white px-3 py-1 text-xs font-medium text-foreground"
                          >
                            {field}
                          </Badge>
                        ))}
                      </div>

                      <div className="mt-5">
                        <Button className="rounded-full" onClick={() => handleOpenWorkflowExecution(selectedWorkflow)}>
                          <Workflow className="size-4" />
                          发起业务流
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {serialUploadEnabled && selectedMaterial ? (
                <div className="space-y-4 rounded-[28px] border border-amber-200 bg-amber-50/65 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-700">
                        <FileUp className="size-4" />
                        序列号导入
                      </div>
                      <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
                        {selectedWorkflow.serial_upload_label}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {selectedWorkflow.serial_upload_note}
                      </p>
                    </div>

                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-amber-300">
                      <FileUp className="size-4" />
                      {uploadingSerial ? "正在预检..." : "导入序列号文件"}
                      <input
                        type="file"
                        accept={data.serial_import_template.accepted_extensions.join(",")}
                        className="hidden"
                        onChange={(event) => void handleSerialFileChange(event)}
                        disabled={uploadingSerial}
                      />
                    </label>
                  </div>

                  <div className="rounded-[24px] border border-amber-200/80 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">导入模板规则</p>
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">必需表头</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {data.serial_import_template.required_headers.map((header) => (
                            <Badge
                              key={header}
                              variant="outline"
                              className="rounded-full border-amber-200 bg-white px-3 py-1 text-xs font-medium text-foreground"
                            >
                              {header}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">支持格式</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {data.serial_import_template.accepted_extensions.map((extension) => (
                            <Badge
                              key={extension}
                              variant="outline"
                              className="rounded-full border-amber-200 bg-white px-3 py-1 text-xs font-medium text-foreground"
                            >
                              {extension}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1 text-xs leading-6 text-muted-foreground">
                      {data.serial_import_template.tips.map((tip) => (
                        <p key={tip}>{tip}</p>
                      ))}
                    </div>
                  </div>

                  {serialPreview ? <SerialPreviewSummary preview={serialPreview} fileName={serialFileName} /> : null}
                </div>
              ) : (
                <div className="rounded-[28px] border border-emerald-200 bg-emerald-50/60 p-5">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                    <PackageOpen className="size-4" />
                    序列号规则
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    当前物料未启用序列号管理，所以这里不展示导入入口。后续实际做单时，系统会按物料编码自动去基础数据中判断是否开启序列号。
                  </p>
                </div>
              )}

              <div className="rounded-[28px] border border-border/80 bg-white/90 p-5">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  <Workflow className="size-4" />
                  已发布业务流
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">执行链路</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  当前业务流已经把昨天验证通过的单据链路固化为标准步骤，员工只需要补齐关键输入即可执行。
                </p>

                <div className="mt-5 space-y-4">
                  {selectedWorkflow.steps.map((step, index) => {
                    const linkedModule = data.document_modules.find((item) => item.key === step.key);
                    return (
                      <WorkflowStepCard
                        key={step.key}
                        index={index}
                        total={selectedWorkflow.steps.length}
                        title={step.title}
                        description={step.description}
                        stageLabel={linkedModule?.stage_label}
                      />
                    );
                  })}
                </div>
              </div>

              {selectedWorkflow.bom_preview.length > 0 ? (
                <div className="rounded-[28px] border border-border/80 bg-white/90 p-5">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <PackageOpen className="size-4" />
                    BOM 预览
                  </div>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">当前业务流绑定的物料结构</h3>
                  <div className="mt-4 overflow-hidden rounded-[24px] border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>类型</TableHead>
                          <TableHead>物料编码</TableHead>
                          <TableHead>物料名称</TableHead>
                          <TableHead className="text-right">数量</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedWorkflow.bom_preview.map((line: ProcurementSupplyBomLine) => (
                          <TableRow key={`${line.line_type}-${line.material_code}`}>
                            <TableCell>{line.line_type}</TableCell>
                            <TableCell className="font-mono text-xs">{line.material_code}</TableCell>
                            <TableCell>{line.material_name}</TableCell>
                            <TableCell className="text-right">{formatNumber(line.qty)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-border/80 bg-gradient-to-br from-slate-50 via-white to-white p-5">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  <FileCog className="size-4" />
                  业务流管理入口
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">管理动作集中到一个入口里</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  工作流模板不再单独做成一级模块，而是作为业务流管理的下级能力，统一放进这里维护。
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {workflowManagementActions.map((action) => (
                  <WorkflowManagementCard
                    key={action.key}
                    title={action.title}
                    description={action.description}
                    icon={action.icon}
                    onClick={() => handleWorkflowManagementAction(action.key)}
                  />
                ))}
              </div>

              <div className="rounded-[28px] border border-border/80 bg-white/90 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">当前上下文</p>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>当前工作流编码：{selectedWorkflowMeta.code}</p>
                  <p>默认前台展示：已发布业务流</p>
                  <p>管理侧动作：新增、保存、发布、停用、删除</p>
                </div>
              </div>
            </div>
          )}
        </SectionPanel>
        </div>
      </div>

      <Dialog open={workflowManagementOpen} onOpenChange={setWorkflowManagementOpen}>
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-none p-0 sm:w-[min(100vw-2rem,1040px)] sm:max-w-[1040px] lg:w-[min(100vw-4rem,1160px)] lg:max-w-[1160px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>业务流编排</DialogTitle>
            <DialogDescription>
              在这里继续完成新增业务流、保存业务流、发布业务流、停用业务流和删除业务流等管理动作。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 pb-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
                  已发布 {workflowStatusSummary.published}
                </Badge>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-100 text-slate-700">
                  未发布 {workflowStatusSummary.unpublished}
                </Badge>
                <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                  草稿 {workflowStatusSummary.draft}
                </Badge>
                <Badge variant="outline" className="rounded-full border-zinc-200 bg-zinc-100 text-zinc-600">
                  已停用 {workflowStatusSummary.disabled}
                </Badge>
              </div>

              <Button className="rounded-full" onClick={openCreateWorkflowDialog}>
                <Plus className="size-4" />
                新增业务流
              </Button>
            </div>

            <div className="overflow-hidden rounded-[20px] border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>业务流名称</TableHead>
                    <TableHead>版本号</TableHead>
                    <TableHead>物料编码</TableHead>
                    <TableHead>形态转换 BOM</TableHead>
                    <TableHead>执行链路</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allManagedWorkflows.map((workflow) => {
                    const workflowMeta = getWorkflowMeta(workflow);
                    return (
                      <TableRow key={workflow.key}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{workflow.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{workflowMeta.code}</p>
                          </div>
                        </TableCell>
                        <TableCell>{workflowMeta.version}</TableCell>
                        <TableCell className="font-mono text-xs">{workflow.default_material_code}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-950 shadow-sm transition hover:border-slate-400 hover:bg-slate-200"
                            onClick={() => setBomPreviewWorkflowKey(workflow.key)}
                          >
                            {workflowMeta.bomCode}
                          </button>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-800 shadow-sm transition hover:border-sky-400 hover:bg-sky-200"
                            onClick={() => setExecutionDetailWorkflowKey(workflow.key)}
                          >
                            详情
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-full text-xs", workflowMeta.statusBadgeClassName)}>
                            {workflowMeta.statusLabel}
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
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={launchDialogOpen}
        onOpenChange={(open) => {
          setLaunchDialogOpen(open);
          if (!open) {
            setLaunchForm(null);
            setLaunchSerialPreview(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100vh-0.75rem)] w-[calc(100vw-0.75rem)] max-w-none flex-col overflow-hidden p-0 sm:max-h-[calc(100vh-2rem)] sm:w-[min(100vw-2rem,820px)] sm:max-w-[820px] lg:w-[min(100vw-4rem,920px)] lg:max-w-[920px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{launchForm ? `单独向用友发起${selectedDocument?.title ?? ""}` : "单独发起单据"}</DialogTitle>
            <DialogDescription>这里直接调用昨天已经跑通的真实用友链路；保存成功后，下面的单据中心会立即刷新成最新列表。</DialogDescription>
          </DialogHeader>
          {launchForm ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="space-y-5">
                {launchForm.documentKey === "purchase_order" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">物料</p>
                      <Select value={launchForm.materialCode} onValueChange={(value) => updateStandaloneLaunchForm("materialCode", value)}>
                        <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                          <SelectValue placeholder="选择物料" />
                        </SelectTrigger>
                        <SelectContent>
                          {data.material_profiles.map((material) => (
                            <SelectItem key={material.material_code} value={material.material_code}>
                              {material.material_code} 路 {material.material_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">采购数量</p>
                      <Input value={launchForm.quantity} onChange={(event) => updateStandaloneLaunchForm("quantity", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">单价</p>
                      <Input value={launchForm.unitPrice} onChange={(event) => updateStandaloneLaunchForm("unitPrice", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">单据日期</p>
                      <Input value={launchForm.vouchdate} onChange={(event) => updateStandaloneLaunchForm("vouchdate", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">业务类型</p>
                      <Input value={launchForm.bustypeCode} onChange={(event) => updateStandaloneLaunchForm("bustypeCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">供应商编码</p>
                      <Input value={launchForm.vendorCode} onChange={(event) => updateStandaloneLaunchForm("vendorCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">开票供应商</p>
                      <Input value={launchForm.invoiceVendorCode} onChange={(event) => updateStandaloneLaunchForm("invoiceVendorCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">采购组织</p>
                      <Input value={launchForm.orgCode} onChange={(event) => updateStandaloneLaunchForm("orgCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">汇率类型</p>
                      <Input value={launchForm.exchRateType} onChange={(event) => updateStandaloneLaunchForm("exchRateType", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">税目</p>
                      <Input value={launchForm.taxitemsCode} onChange={(event) => updateStandaloneLaunchForm("taxitemsCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">创建人</p>
                      <Input value={launchForm.creator} onChange={(event) => updateStandaloneLaunchForm("creator", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">创建人 ID</p>
                      <Input value={launchForm.creatorId} onChange={(event) => updateStandaloneLaunchForm("creatorId", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                  </div>
                ) : null}

                {launchForm.documentKey === "purchase_inbound" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">采购订单号</p>
                      <Input value={launchForm.purchaseOrderCode} onChange={(event) => updateStandaloneLaunchForm("purchaseOrderCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" placeholder="例如：CGDD260325000004" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">入库仓编码</p>
                      <Input value={launchForm.warehouseCode} onChange={(event) => updateStandaloneLaunchForm("warehouseCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">单据日期</p>
                      <Input value={launchForm.vouchdate} onChange={(event) => updateStandaloneLaunchForm("vouchdate", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                  </div>
                ) : null}

                {launchForm.documentKey === "morphology_conversion" ? (
                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">采购入库单号</p>
                        <Input value={launchForm.purchaseInboundCode} onChange={(event) => updateStandaloneLaunchForm("purchaseInboundCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" placeholder="例如：CGRK000020260325000005" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">形态转换 BOM</p>
                        <Select value={launchForm.selectedBomCode} onValueChange={(value) => updateStandaloneLaunchForm("selectedBomCode", value)}>
                          <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                            <SelectValue placeholder="选择 BOM" />
                          </SelectTrigger>
                          <SelectContent>
                            {data.bom_profiles.map((bom) => (
                              <SelectItem key={bom.bom_code} value={bom.bom_code}>
                                {bom.bom_code} 路 {bom.bom_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">转换数量</p>
                        <Input value={launchForm.quantity} onChange={(event) => updateStandaloneLaunchForm("quantity", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">单据日期</p>
                        <Input value={launchForm.vouchdate} onChange={(event) => updateStandaloneLaunchForm("vouchdate", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">备注</p>
                      <Textarea value={launchForm.remark} onChange={(event) => updateStandaloneLaunchForm("remark", event.target.value)} className="min-h-[100px] rounded-[20px] border-border/80 bg-white" />
                    </div>
                    <div className="rounded-[22px] border border-amber-200 bg-amber-50/70 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">序列号明细表</p>
                          <p className="mt-1 text-sm text-muted-foreground">如果当前 BOM 包含序列号管理子件，请先导入序列号明细表。系统会直接把预检通过的 SN 带入真实形态转换单。</p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-amber-300">
                          <FileUp className="size-4" />
                          {launchUploadingSerial ? "正在预检..." : "导入序列号"}
                          <input
                            type="file"
                            accept={data.serial_import_template.accepted_extensions.join(",")}
                            className="hidden"
                            onChange={(event) => void handleStandaloneLaunchSerialFileChange(event)}
                            disabled={launchUploadingSerial}
                          />
                        </label>
                      </div>
                      {launchForm.serialFileName ? <p className="mt-3 text-sm text-amber-800">当前文件：{launchForm.serialFileName}</p> : null}
                      {launchSerialPreview ? <SerialPreviewSummary preview={launchSerialPreview} fileName={launchForm.serialFileName} /> : null}
                    </div>
                    {launchSelectedBom ? (
                      <div className="rounded-[22px] border border-border/70 bg-white/90 p-4">
                        <p className="text-sm font-semibold text-foreground">当前 BOM 预览</p>
                        <div className="mt-3 overflow-hidden rounded-[18px] border border-border/70">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>类型</TableHead>
                                <TableHead>物料编码</TableHead>
                                <TableHead>物料名称</TableHead>
                                <TableHead className="text-right">数量</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {launchSelectedBom.lines.map((line) => (
                                <TableRow key={`${line.line_type}-${line.material_code}`}>
                                  <TableCell>{line.line_type}</TableCell>
                                  <TableCell className="font-mono text-xs">{line.material_code}</TableCell>
                                  <TableCell>{line.material_name}</TableCell>
                                  <TableCell className="text-right">{formatNumber(line.qty)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {launchForm.documentKey === "transfer_order" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">采购入库单号</p>
                        <Input value={launchForm.purchaseInboundCode} onChange={(event) => updateStandaloneLaunchForm("purchaseInboundCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">调入仓编码</p>
                        <Input value={launchForm.inwarehouseCode} onChange={(event) => updateStandaloneLaunchForm("inwarehouseCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">备注</p>
                      <Textarea value={launchForm.remark} onChange={(event) => updateStandaloneLaunchForm("remark", event.target.value)} className="min-h-[100px] rounded-[20px] border-border/80 bg-white" />
                    </div>
                  </div>
                ) : null}

                {launchForm.documentKey === "storeout" ? (
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">调拨订单号</p>
                      <Input value={launchForm.transferOrderCode} onChange={(event) => updateStandaloneLaunchForm("transferOrderCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">单据日期</p>
                      <Input value={launchForm.vouchdate} onChange={(event) => updateStandaloneLaunchForm("vouchdate", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                  </div>
                ) : null}

                {launchForm.documentKey === "storein" ? (
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">调出单号</p>
                      <Input value={launchForm.storeoutCode} onChange={(event) => updateStandaloneLaunchForm("storeoutCode", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">单据日期</p>
                      <Input value={launchForm.vouchdate} onChange={(event) => updateStandaloneLaunchForm("vouchdate", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 px-6 py-4">
            <Button variant="outline" onClick={() => setLaunchDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void submitStandaloneLaunch()} disabled={launchSubmitting}>
              {launchSubmitting ? <Loader2 className="size-4 animate-spin" /> : <PackageOpen className="size-4" />}
              创建单据
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={workflowLaunchDialogOpen}
        onOpenChange={(open) => {
          setWorkflowLaunchDialogOpen(open);
          if (!open) {
            setWorkflowLaunchForm(null);
            setWorkflowLaunchSerialPreview(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100vh-0.75rem)] w-[calc(100vw-0.75rem)] max-w-none flex-col overflow-hidden p-0 sm:max-h-[calc(100vh-2rem)] sm:w-[min(100vw-2rem,1040px)] sm:max-w-[1040px] lg:w-[min(100vw-4rem,1120px)] lg:max-w-[1120px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>发起业务流单据</DialogTitle>
            <DialogDescription>
              填写当前业务流的必填字段后，系统会按照已发布的执行链路自动向下推单。
            </DialogDescription>
          </DialogHeader>
          {workflowLaunchForm && workflowLaunchTargetWorkflow ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[1.06fr_0.94fr]">
                  <div className="space-y-4 rounded-[24px] border border-border/70 bg-white/90 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
                        已发布业务流
                      </Badge>
                      <Badge variant="outline" className="rounded-full border-border/70 bg-white text-xs text-muted-foreground">
                        {getWorkflowMeta(workflowLaunchTargetWorkflow).version}
                      </Badge>
                      <Badge variant="outline" className="rounded-full border-border/70 bg-white text-xs text-muted-foreground">
                        {getWorkflowMeta(workflowLaunchTargetWorkflow).bomCode}
                      </Badge>
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
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          物料
                        </p>
                        <Select
                          value={workflowLaunchForm.materialCode}
                          onValueChange={handleWorkflowLaunchMaterialChange}
                        >
                          <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                            <SelectValue placeholder="选择物料" />
                          </SelectTrigger>
                          <SelectContent>
                            {data.material_profiles.map((material) => (
                              <SelectItem key={material.material_code} value={material.material_code}>
                                {material.material_code} · {material.material_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {workflowLaunchNeedsQuantity ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            计划数量
                          </p>
                          <Input
                            value={workflowLaunchForm.quantity}
                            onChange={(event) => updateWorkflowLaunchForm("quantity", event.target.value)}
                            className="h-11 rounded-2xl border-border/80 bg-white"
                            placeholder="请输入计划数量"
                          />
                        </div>
                      ) : null}

                      {workflowLaunchNeedsPurchaseOrder ? (
                        <div className="space-y-2 md:col-span-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              用友采购订单编号
                            </p>
                            <Badge
                              variant="outline"
                              className="rounded-full border-amber-200 bg-amber-50 text-[11px] text-amber-700"
                            >
                              必填
                            </Badge>
                          </div>
                          <Input
                            value={workflowLaunchForm.purchaseOrderCode}
                            onChange={(event) =>
                              updateWorkflowLaunchForm("purchaseOrderCode", event.target.value)
                            }
                            className="h-11 rounded-2xl border-border/80 bg-white"
                            placeholder={workflowLaunchTargetWorkflow.default_purchase_order_placeholder}
                          />
                        </div>
                      ) : null}

                      {workflowLaunchNeedsInboundWarehouse ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            采购入库仓库
                          </p>
                          <Input
                            value={workflowLaunchForm.warehouseCode}
                            onChange={(event) => updateWorkflowLaunchForm("warehouseCode", event.target.value)}
                            className="h-11 rounded-2xl border-border/80 bg-white"
                            placeholder="请输入采购入库仓库编码"
                          />
                        </div>
                      ) : null}

                      {workflowLaunchNeedsTargetWarehouse ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            调入仓
                          </p>
                          <Input
                            value={workflowLaunchForm.inwarehouseCode}
                            onChange={(event) =>
                              updateWorkflowLaunchForm("inwarehouseCode", event.target.value)
                            }
                            className="h-11 rounded-2xl border-border/80 bg-white"
                            placeholder="请输入调入仓编码"
                          />
                        </div>
                      ) : null}

                      {workflowLaunchNeedsBom ? (
                        <div className="space-y-2 md:col-span-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            形态转换 BOM
                          </p>
                          <Select
                            value={workflowLaunchForm.selectedBomCode}
                            onValueChange={(value) => updateWorkflowLaunchForm("selectedBomCode", value)}
                            disabled={workflowLaunchAvailableBomProfiles.length === 0}
                          >
                            <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                              <SelectValue placeholder="选择 BOM" />
                            </SelectTrigger>
                            <SelectContent>
                              {workflowLaunchAvailableBomProfiles.map((bom) => (
                                <SelectItem key={bom.bom_code} value={bom.bom_code}>
                                  {bom.bom_code} · {bom.bom_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      <div className="space-y-2 md:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          单据日期
                        </p>
                        <Input
                          value={workflowLaunchForm.vouchdate}
                          onChange={(event) => updateWorkflowLaunchForm("vouchdate", event.target.value)}
                          className="h-11 rounded-2xl border-border/80 bg-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        备注
                      </p>
                      <Textarea
                        value={workflowLaunchForm.remark}
                        onChange={(event) => updateWorkflowLaunchForm("remark", event.target.value)}
                        className="min-h-[110px] rounded-[20px] border-border/80 bg-white"
                        placeholder="补充本次业务流单据的说明、城市或仓库备注"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-[24px] border border-border/70 bg-white/90 p-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        自动下推链路
                      </p>
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
                      <p className="text-sm font-semibold text-foreground">本次发起将自动完成</p>
                      <div className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
                        <p>系统会按业务流顺序逐步创建单据，并自动承接上一步生成的单号。</p>
                        <p>发起成功后，新的单据会直接写入用友，不需要再逐张手工点击下推。</p>
                        <p>如果任一步骤失败，系统会中断并返回失败原因，方便你立即修正重试。</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        必填字段
                      </p>
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

                    {workflowLaunchNeedsBom && workflowLaunchSelectedBom ? (
                      <div className="rounded-[20px] border border-border/70 bg-white/95 p-4">
                        <p className="text-sm font-semibold text-foreground">当前 BOM 预览</p>
                        <div className="mt-3 overflow-hidden rounded-[18px] border border-border/70">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>类型</TableHead>
                                <TableHead>物料编码</TableHead>
                                <TableHead>物料名称</TableHead>
                                <TableHead className="text-right">数量</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {workflowLaunchSelectedBom.lines.map((line) => (
                                <TableRow key={`${line.line_type}-${line.material_code}`}>
                                  <TableCell>{line.line_type}</TableCell>
                                  <TableCell className="font-mono text-xs">{line.material_code}</TableCell>
                                  <TableCell>{line.material_name}</TableCell>
                                  <TableCell className="text-right">{formatNumber(line.qty)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {workflowLaunchSerialRequired ? (
                  <div className="rounded-[24px] border border-amber-200 bg-amber-50/65 p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">序列号明细表</p>
                        <p className="mt-1 text-sm leading-7 text-muted-foreground">
                          {workflowLaunchNeedsSerialUpload
                            ? "当前业务流要求导入序列号明细表。系统会先做预检，再把通过的 SN 自动带入后续单据。"
                            : "当前物料启用了序列号管理。你可以先导入序列号明细表，系统会把预检通过的 SN 自动带入业务流。"}
                        </p>
                      </div>

                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-amber-300">
                        <FileUp className="size-4" />
                        {workflowLaunchUploadingSerial ? "正在预检..." : "导入序列号文件"}
                        <input
                          type="file"
                          accept={data.serial_import_template.accepted_extensions.join(",")}
                          className="hidden"
                          onChange={(event) => void handleWorkflowLaunchSerialFileChange(event)}
                          disabled={workflowLaunchUploadingSerial}
                        />
                      </label>
                    </div>

                    {workflowLaunchForm.serialFileName ? (
                      <p className="mt-3 text-sm text-amber-800">
                        当前文件：{workflowLaunchForm.serialFileName}
                      </p>
                    ) : null}

                    {workflowLaunchSerialPreview ? (
                      <div className="mt-4">
                        <SerialPreviewSummary
                          preview={workflowLaunchSerialPreview}
                          fileName={workflowLaunchForm.serialFileName}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 px-6 py-4">
            <Button variant="outline" onClick={() => setWorkflowLaunchDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void submitWorkflowLaunch()} disabled={workflowLaunchSubmitting}>
              {workflowLaunchSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
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
              这里只展示仍未完结的业务流实例，方便快速查看当前卡点环节、单号、单据状态和待审批人。
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
                    {unfinishedWorkflowItems.map((item) => (
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
                              className={cn("rounded-full text-xs", getWorkflowInstanceBadgeClassName(item.instance_status))}
                            >
                              {item.instance_status_label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-mono text-sm text-foreground">{item.current_document_code || "--"}</p>
                            {item.error_message ? (
                              <p className="flex items-start gap-1 text-xs text-rose-600">
                                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                                <span>{item.error_message}</span>
                              </p>
                            ) : item.step_count > 0 ? (
                              <p className="text-xs text-muted-foreground">
                                已完成 {item.completed_step_count}/{item.step_count} 步
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full text-xs",
                              getWorkflowDocumentBadgeClassName(item.current_document_status),
                            )}
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
                <p className="text-base font-medium text-foreground">当前没有未完成的业务流单据</p>
                <p className="mt-2 text-sm text-muted-foreground">新的业务流发起后，如果仍处于审批中或执行失败，会自动出现在这里。</p>
              </div>
            )}
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
        <DialogContent className="flex max-h-[calc(100vh-0.75rem)] w-[calc(100vw-0.75rem)] max-w-none flex-col overflow-hidden p-0 sm:max-h-[calc(100vh-2rem)] sm:w-[min(100vw-2rem,920px)] sm:max-w-[920px] lg:w-[min(100vw-4rem,1020px)] lg:max-w-[1020px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>新增业务流</DialogTitle>
            <DialogDescription>
              先完成业务流基础配置，再保存为草稿。保存之前不会正式新增到业务流列表里。
            </DialogDescription>
          </DialogHeader>
          {workflowDraftForm ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">业务流名称</p>
                  <Input
                    value={workflowDraftForm.title}
                    onChange={(event) => handleDraftFormChange("title", event.target.value)}
                    className="h-11 rounded-2xl border-border/80 bg-white"
                    placeholder="例如：学习机城市大货补仓"
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
                  <Select
                    value={workflowDraftForm.defaultMaterialCode}
                    onValueChange={handleDraftMaterialChange}
                  >
                    <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                      <SelectValue placeholder="选择物料" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.material_profiles.map((material) => (
                        <SelectItem key={material.material_code} value={material.material_code}>
                          {material.material_code} 路 {material.material_name}
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
                          {bom.bom_code} 路 {bom.bom_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">BOM 选项会根据默认物料自动联动，来源于基础数据中的 BOM 管理。</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">业务流描述</p>
                <Textarea
                  value={workflowDraftForm.description}
                  onChange={(event) => handleDraftFormChange("description", event.target.value)}
                  className="min-h-[120px] rounded-[20px] border-border/80 bg-white"
                  placeholder="描述这条业务流适用于什么场景、解决什么问题、如何触发。"
                />
              </div>

              <div className="space-y-3 rounded-[24px] border border-border/70 bg-white/90 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">执行节点</p>
                  <p className="mt-2 text-sm text-muted-foreground">先把需要的节点加入执行链路，再按上下顺序调整。保存后会按这里的顺序作为业务流执行逻辑。</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
                  <div className="space-y-3 rounded-[20px] border border-border/70 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">已选执行顺序</p>
                        <p className="mt-1 text-xs text-muted-foreground">拖动功能后续再补，这一版先支持上下调整顺序。</p>
                      </div>
                      <Badge className="rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-none">
                        {selectedDraftStepModules.length} 个节点
                      </Badge>
                    </div>

                    {selectedDraftStepModules.length > 0 ? (
                      <div className="space-y-3">
                        {selectedDraftStepModules.map((item, index) => (
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
                                    {item.stage_label}
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
                                  disabled={index === selectedDraftStepModules.length - 1}
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
                      <p className="mt-1 text-xs text-muted-foreground">点击“加入链路”把节点放进执行顺序；已加入的节点不会重复添加。</p>
                    </div>
                    <div className="space-y-3">
                      {workflowCapableModules.map((item) => {
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
                                    {item.stage_label}
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
        open={Boolean(bomPreviewWorkflow)}
        onOpenChange={(open) => {
          if (!open) {
            setBomPreviewWorkflowKey(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-none p-0 sm:w-[min(100vw-2rem,1000px)] sm:max-w-[1000px] lg:w-[min(100vw-4rem,1080px)] lg:max-w-[1080px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>形态转换 BOM 预览</DialogTitle>
            <DialogDescription>
              {bomPreviewWorkflow ? `${bomPreviewWorkflow.title} 当前绑定的 BOM 明细如下。` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <div className="overflow-hidden rounded-[20px] border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>物料编码</TableHead>
                    <TableHead>物料名称</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(bomPreviewWorkflow?.bom_preview ?? []).map((line: ProcurementSupplyBomLine) => (
                    <TableRow key={`${line.line_type}-${line.material_code}`}>
                      <TableCell>{line.line_type}</TableCell>
                      <TableCell className="font-mono text-xs">{line.material_code}</TableCell>
                      <TableCell>{line.material_name}</TableCell>
                      <TableCell className="text-right">{formatNumber(line.qty)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(executionDetailWorkflow)}
        onOpenChange={(open) => {
          if (!open) {
            setExecutionDetailWorkflowKey(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-none p-0 sm:w-[min(100vw-2rem,980px)] sm:max-w-[980px] lg:w-[min(100vw-4rem,1080px)] lg:max-w-[1080px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>执行链路详情</DialogTitle>
            <DialogDescription>
              {executionDetailWorkflow ? `${executionDetailWorkflow.title} 的执行链路如下。` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 pb-6">
            {(executionDetailWorkflow?.steps ?? []).map((step, index, steps) => {
              const linkedModule = data.document_modules.find((item) => item.key === step.key);
              return (
                <WorkflowStepCard
                  key={step.key}
                  index={index}
                  total={steps.length}
                  title={step.title}
                  description={step.description}
                  stageLabel={linkedModule?.stage_label}
                />
              );
            })}
          </div>
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
                  : `确认删除 ${deleteTargetWorkflow.title} 吗？删除后该业务流将从业务流列表中移除。`
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
    </div>
  );
}
