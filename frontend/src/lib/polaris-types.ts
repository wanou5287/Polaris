export type Option = {
  value: string;
  label: string;
};

export type MetricItem = {
  id: number;
  metric_key: string;
  metric_name: string;
  business_domain: string;
  owner_role: string;
  definition_text: string;
  formula_text: string;
  source_table: string;
  source_fields: string;
  dimension_notes: string;
  version_tag: string;
  effective_date: string | null;
  sort_order: number;
  is_enabled: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MetricDictionaryResponse = {
  items: MetricItem[];
  summary: {
    total_count: number;
    active_count: number;
    domain_count: number;
    latest_updated_at: string | null;
  };
};

export type SkuItem = {
  id: number;
  sku_code: string;
  sku_name: string;
  sku_type: string;
  product_line: string;
  model: string;
  spec_version: string;
  lifecycle_status: string;
  owner_dept: string;
  sort_order: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type WarehouseItem = {
  id: number;
  source_warehouse_name: string;
  warehouse_name_clean: string;
  warehouse_code: string;
  warehouse_type: string;
  platform_owner: string;
  city: string;
  is_sellable_warehouse: boolean;
  is_reverse_warehouse: boolean;
  sort_order: number;
  is_enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type StatusItem = {
  id: number;
  stock_status_id: string;
  stock_status_name: string;
  status_group: string;
  can_sell: boolean;
  can_forecast_supply: boolean;
  need_quality_check: boolean;
  next_default_status: string;
  sort_order: number;
  is_enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type ChannelItem = {
  id: number;
  channel_code: string;
  channel_name: string;
  shop_name: string;
  platform_name: string;
  owner_dept: string;
  sort_order: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type MasterDataResponse = {
  skus: SkuItem[];
  warehouses: WarehouseItem[];
  statuses: StatusItem[];
  channels: ChannelItem[];
  summary: {
    sku_count: number;
    warehouse_count: number;
    status_count: number;
    channel_count: number;
    latest_inventory_cleaning_date: string | null;
    latest_sales_date: string | null;
  };
};

export type AuditLogItem = {
  id: number;
  module_key: string;
  module_name: string;
  action_key: string;
  action_name: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  result_status: string;
  detail_summary: string | null;
  detail: Record<string, unknown> | null;
  source_path: string | null;
  source_method: string | null;
  triggered_by: string | null;
  affected_count: number | null;
  created_at: string | null;
};

export type AuditLogResponse = {
  items: AuditLogItem[];
  summary: Record<string, unknown>;
  module_options: Option[];
  status_options: Option[];
};

export type ProcurementArrivalItem = {
  id: number;
  arrival_no: string;
  purchase_order_no: string;
  supplier_name: string;
  warehouse_code: string;
  warehouse_name: string;
  channel_code: string;
  channel_name: string;
  sku_code: string;
  sku_name: string;
  expected_qty: number;
  arrived_qty: number;
  qualified_qty: number;
  exception_qty: number;
  pending_qty: number;
  fulfillment_rate: number;
  quality_rate: number;
  unit: string;
  arrival_date: string | null;
  status: string;
  document_status: string;
  exception_reason: string;
  remark: string;
  source_system: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  sort_order: number;
};

export type ProcurementArrivalResponse = {
  items: ProcurementArrivalItem[];
  summary: {
    total_count: number;
    draft_count: number;
    ready_count: number;
    completed_count: number;
    exception_count: number;
    pending_document_count: number;
    total_expected_qty: number;
    total_arrived_qty: number;
    total_qualified_qty: number;
    latest_arrival_date: string | null;
  };
  status_options: Option[];
  document_status_options: Option[];
  warehouse_options: Option[];
  channel_options: Option[];
  supplier_options: Option[];
};

export type InventoryFlowRule = {
  id: number;
  rule_name: string;
  trigger_source: string;
  trigger_condition: string;
  action_type: string;
  source_status_id: string;
  source_status_name: string;
  target_status_id: string;
  target_status_name: string;
  source_warehouse_code: string;
  source_warehouse_name: string;
  target_warehouse_code: string;
  target_warehouse_name: string;
  priority: string;
  auto_create_task: boolean;
  is_enabled: boolean;
  sort_order: number;
  note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type InventoryFlowTask = {
  id: number;
  task_no: string;
  source_record_type: string;
  source_record_id: string;
  source_record_no: string;
  trigger_source: string;
  action_type: string;
  task_status: string;
  priority: string;
  sku_code: string;
  sku_name: string;
  request_qty: number;
  confirmed_qty: number;
  completion_rate: number;
  source_status_id: string;
  source_status_name: string;
  target_status_id: string;
  target_status_name: string;
  source_warehouse_code: string;
  source_warehouse_name: string;
  target_warehouse_code: string;
  target_warehouse_name: string;
  planned_execute_date: string | null;
  reason_text: string;
  note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  sort_order: number;
};

export type InventoryFlowResponse = {
  rules: InventoryFlowRule[];
  tasks: InventoryFlowTask[];
  summary: {
    task_count: number;
    pending_count: number;
    blocked_count: number;
    completed_count: number;
    enabled_rule_count: number;
    auto_rule_count: number;
    transfer_count: number;
  };
  action_options: Option[];
  task_status_options: Option[];
  priority_options: Option[];
  trigger_source_options: Option[];
  status_options: Option[];
  warehouse_options: Option[];
};

export type TaskCenterItem = {
  id: number;
  source_module: string;
  source_module_label: string;
  source_type: string;
  source_id: string;
  source_no: string;
  task_title: string;
  task_category: string;
  task_category_label: string;
  task_status: string;
  task_status_label: string;
  source_status: string;
  source_detail_status: string;
  priority: string;
  priority_label: string;
  owner_name: string;
  owner_role: string;
  due_date: string | null;
  summary_text: string;
  note: string;
  source_snapshot: Record<string, unknown> | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_overdue: boolean;
};

export type TaskCenterResponse = {
  items: TaskCenterItem[];
  summary: {
    total_count: number;
    open_count: number;
    in_progress_count: number;
    blocked_count: number;
    completed_count: number;
    overdue_count: number;
    procurement_count: number;
    inventory_flow_count: number;
    high_priority_count: number;
    latest_updated_at: string | null;
  };
  task_status_options: Option[];
  source_module_options: Option[];
  priority_options: Option[];
  category_options: Option[];
};

export type ReconciliationCase = {
  id: number;
  source_module: string;
  source_module_label: string;
  source_type: string;
  source_id: string;
  source_no: string;
  case_type: string;
  case_type_label: string;
  case_title: string;
  case_status: string;
  case_status_label: string;
  severity: string;
  severity_label: string;
  diff_summary: string;
  owner_name: string;
  owner_role: string;
  due_date: string | null;
  expected_snapshot: Record<string, unknown> | null;
  actual_snapshot: Record<string, unknown> | null;
  last_compensation_action: string;
  last_compensation_action_label: string;
  compensation_note: string;
  compensated_at: string | null;
  compensated_by: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_overdue: boolean;
};

export type ReconciliationResponse = {
  items: ReconciliationCase[];
  summary: {
    total_count: number;
    open_count: number;
    compensating_count: number;
    resolved_count: number;
    ignored_count: number;
    high_severity_count: number;
    document_sync_count: number;
    inventory_missing_count: number;
    blocked_count: number;
    overdue_count: number;
    latest_updated_at: string | null;
  };
  case_status_options: Option[];
  case_type_options: Option[];
  severity_options: Option[];
  source_module_options: Option[];
  compensation_action_options: Option[];
};

export type DataAgentStatus = {
  module_name: string;
  display_name: string;
  github_url: string;
  repo_path: string;
  repo_present: boolean;
  config_ready: boolean;
  files: Record<string, boolean>;
  env_ready: Record<string, boolean>;
  api_url: string;
  ui_url: string;
  api_online: boolean;
  ui_online: boolean;
  startup_steps: string[];
  capabilities: Record<string, string[]> | string[];
  integration_note: string;
};

export type DataAgentReport = {
  id: number;
  report_type: "weekly" | "monthly" | string;
  period_start: string | null;
  period_end: string | null;
  period_label: string;
  trigger_mode: string;
  title: string;
  report_content: string;
  generated_by: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  summary: Record<string, unknown> | null;
};

export type DataAgentReportsResponse = {
  items: DataAgentReport[];
};

export type DataAgentChatResponse = {
  session_id: string;
  answer: string;
  source: string;
};

export type OverviewResponse = {
  metricSummary: MetricDictionaryResponse["summary"];
  masterSummary: MasterDataResponse["summary"];
  taskCenterSummary: TaskCenterResponse["summary"] & {
    latestItems: TaskCenterItem[];
  };
  reconciliationSummary: ReconciliationResponse["summary"] & {
    latestItems: ReconciliationCase[];
  };
  auditSummary: {
    total: number;
    success: number;
    failed: number;
    latestItems: AuditLogItem[];
    moduleBreakdown: Array<{ label: string; value: number }>;
  };
  agentStatus: DataAgentStatus;
  reports: {
    items: DataAgentReport[];
    weeklyCount: number;
    monthlyCount: number;
    series: Array<{ label: string; count: number }>;
  };
};
