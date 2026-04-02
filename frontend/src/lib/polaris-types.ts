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
  boms: BomItem[];
  warehouses: WarehouseItem[];
  statuses: StatusItem[];
  channels: ChannelItem[];
  summary: {
    sku_count: number;
    bom_count: number;
    warehouse_count: number;
    status_count: number;
    channel_count: number;
    latest_inventory_cleaning_date: string | null;
    latest_sales_date: string | null;
  };
};

export type BomItem = {
  id: number;
  bom_code: string;
  bom_name: string;
  material_code: string;
  material_name: string;
  version_tag: string;
  component_count: number;
  status: string;
  updated_at: string | null;
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

export type ProcurementSupplyInterface = {
  label: string;
  path: string;
};

export type ProcurementSupplyDocumentStatus = "draft" | "pending" | "approved" | "completed";

export type ProcurementSupplyDocumentDetailColumn = {
  key: string;
  label: string;
};

export type ProcurementSupplyDocumentDetailRow = {
  id: string;
  status: ProcurementSupplyDocumentStatus;
  values: Record<string, string | number>;
};

export type ProcurementSupplyDocumentModule = {
  key: string;
  title: string;
  description: string;
  stage_label: string;
  supports_standalone: boolean;
  supports_workflow: boolean;
  serial_policy: "none" | "material_based" | string;
  required_fields: string[];
  recommended_fields: string[];
  yonyou_interfaces: ProcurementSupplyInterface[];
  status_summary: {
    draft: number;
    pending: number;
    approved: number;
    completed: number;
  };
  detail_columns?: ProcurementSupplyDocumentDetailColumn[];
  detail_rows?: ProcurementSupplyDocumentDetailRow[];
};

export type ProcurementSupplyWorkflowStep = {
  key: string;
  title: string;
  description: string;
};

export type ProcurementSupplyWorkflowStatus = "published" | "unpublished" | "draft" | "disabled";

export type ProcurementSupplyBomLine = {
  line_type: string;
  material_code: string;
  material_name: string;
  qty: number;
};

export type ProcurementSupplyWorkflowTemplate = {
  key: string;
  title: string;
  description: string;
  workflow_code: string;
  version: string;
  bom_code: string;
  status: ProcurementSupplyWorkflowStatus;
  purchase_order_required: boolean;
  serial_upload_policy: string;
  serial_upload_label: string;
  serial_upload_note: string;
  default_material_code: string;
  default_purchase_order_placeholder: string;
  steps: ProcurementSupplyWorkflowStep[];
  required_inputs: string[];
  bom_preview: ProcurementSupplyBomLine[];
};

export type ProcurementSupplyMaterialProfile = {
  material_code: string;
  material_name: string;
  material_type: string;
  serial_managed: boolean;
  default_unit: string;
  recommended_workflow: string;
  description: string;
};

export type ProcurementSupplyBomProfile = {
  bom_code: string;
  bom_name: string;
  material_code: string;
  material_name: string;
  version_tag: string;
  status: string;
  component_count: number;
  description: string;
  lines: ProcurementSupplyBomLine[];
};

export type ProcurementSupplyConsoleResponse = {
  module_intro: {
    title: string;
    summary: string;
    highlights: string[];
  };
  summary: {
    document_module_count: number;
    workflow_template_count: number;
    standalone_launch_count: number;
    serial_managed_material_count: number;
    workflow_step_count: number;
  };
  document_modules: ProcurementSupplyDocumentModule[];
  workflow_templates: ProcurementSupplyWorkflowTemplate[];
  material_profiles: ProcurementSupplyMaterialProfile[];
  bom_profiles: ProcurementSupplyBomProfile[];
  unfinished_workflow_instances: {
    unfinished_count: number;
    items: ProcurementSupplyWorkflowInstance[];
  };
  sync_summary?: {
    data_source: string;
    cache_ready: boolean;
    is_configured: boolean;
    last_synced_at: string | null;
    is_stale: boolean;
    stale_after_seconds: number;
    total_clean_rows: number;
    last_error?: string;
    modules: Array<{
      module_key: string;
      module_name: string;
      clean_row_count: number;
      state: Record<string, unknown>;
      cursor?: {
        latest_cursor_time: string;
        latest_document_id: string;
        latest_document_no: string;
        last_incremental_synced_at: string | null;
        last_incremental_pages: number;
        last_incremental_rows: number;
        last_backfill_synced_at: string | null;
        last_backfill_pages: number;
        last_backfill_rows: number;
        has_full_backfill: boolean;
      };
    }>;
  };
  serial_import_template: {
    accepted_extensions: string[];
    required_headers: string[];
    optional_headers: string[];
    tips: string[];
  };
};

export type ProcurementSupplyWorkflowInstance = {
  id: number;
  instance_no: string;
  workflow_key: string;
  workflow_title: string;
  material_code: string;
  quantity: number | string | null;
  purchase_order_code: string;
  warehouse_code: string;
  inwarehouse_code: string;
  bom_code: string;
  current_step_key: string;
  current_step_title: string;
  current_document_key: string;
  current_document_id: string;
  current_document_code: string;
  current_document_status: string;
  current_document_status_label: string;
  current_pending_approver: string;
  instance_status: string;
  instance_status_label: string;
  error_message: string;
  step_count: number;
  completed_step_count: number;
  launched_by: string;
  launched_at: string | null;
  updated_at: string | null;
};

export type ProcurementSerialImportPreviewResponse = {
  material: ProcurementSupplyMaterialProfile;
  upload_enabled: boolean;
  upload_required: boolean;
  message: string;
  preview: {
    file_name: string;
    total_rows: number;
    accepted_count: number;
    duplicate_count: number;
    missing_count: number;
    duplicates: string[];
    missing_rows: number[];
    sample_serials: string[];
    accepted_serials: string[];
  };
};

export type ProcurementSupplyLaunchResponse = {
  document_key: string;
  document_id: string;
  document_code: string;
  summary: Record<string, string | number | null | undefined>;
  request_payload: Record<string, unknown>;
  response: Record<string, unknown>;
};

export type ProcurementSupplyWorkflowLaunchStepResult = {
  step_key: string;
  step_title: string;
  document_key: string;
  document_id: string;
  document_code: string;
  document_status: string;
  document_status_label: string;
  pending_approver: string;
  summary: Record<string, string | number | null | undefined>;
};

export type ProcurementSupplyWorkflowLaunchResponse = {
  instance_id: number;
  instance_no: string;
  workflow_key: string;
  workflow_title: string;
  instance_status: string;
  instance_status_label: string;
  current_step_key: string;
  current_step_title: string;
  current_document_code: string;
  current_document_status: string;
  current_document_status_label: string;
  current_pending_approver: string;
  launched_at: string | null;
  step_results: ProcurementSupplyWorkflowLaunchStepResult[];
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

export type InventoryLiveStockItem = {
  stock_org_name: string;
  warehouse_code: string;
  warehouse_name: string;
  material_code: string;
  material_name: string;
  sku_code: string;
  sku_name: string;
  stock_status_id: string;
  stock_status_name: string;
  batch_no: string;
  unit_name: string;
  current_qty: number;
  available_qty: number;
  plan_available_qty: number;
  incoming_notice_qty: number;
  queried_at: string;
};

export type InventoryLiveStockResponse = {
  items: InventoryLiveStockItem[];
  summary: {
    matched_count: number;
    returned_count: number;
    has_more: boolean;
    total_current_qty: number;
    total_available_qty: number;
    total_plan_available_qty: number;
    total_incoming_notice_qty: number;
    queried_at: string | null;
    raw_row_count: number;
  };
  filters: {
    warehouse_code: string;
    material_code: string;
    material_name: string;
    stock_status_id: string;
    warehouse_options: Option[];
    stock_status_options: Option[];
    material_options: Array<{
      material_code: string;
      material_name: string;
      label: string;
    }>;
  };
};

export type InventoryLiveStockReportConfig = {
  warehouse_codes: string[];
  material_codes: string[];
  status_buckets: string[];
  max_families: number;
  max_materials_per_section: number;
};

export type InventoryLiveStockReportPreview = {
  title: string;
  generated_at: string | null;
  warehouses: string[];
  status_buckets: string[];
  sections: Array<{
    title: string;
    rows: Array<{
      material_name: string;
      values: Record<string, number>;
    }>;
  }>;
  config_summary: {
    selected_warehouse_count: number;
    selected_material_count: number;
    selected_status_bucket_count: number;
  };
};

export type InventoryFlowScheduleTask = {
  id: number;
  task_key: string;
  task_name: string;
  task_type: string;
  cron_expr: string;
  time_of_day: string;
  schedule_label: string;
  report_title: string;
  report_config: InventoryLiveStockReportConfig | null;
  webhook_url: string;
  is_enabled: boolean;
  sort_order: number;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_run_status: string;
  last_run_message: string;
  last_run_trigger: string;
  last_report_path: string;
  last_report_url: string;
  next_run_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string | null;
  updated_at: string | null;
};

export type InventoryFlowWorkflowStep = ProcurementSupplyWorkflowStep;
export type InventoryFlowWorkflowStatus = ProcurementSupplyWorkflowStatus;

export type InventoryFlowWorkflowTemplate = {
  key: string;
  title: string;
  description: string;
  workflow_code: string;
  version: string;
  status: InventoryFlowWorkflowStatus;
  default_material_code: string;
  default_purchase_inbound_placeholder: string;
  default_transfer_order_placeholder: string;
  default_warehouse_code: string;
  default_inwarehouse_code: string;
  default_scrap_org?: string;
  default_scrap_bustype?: string;
  default_scrap_warehouse?: string;
  default_scrap_stock_status?: string;
  bom_code: string;
  required_inputs: string[];
  steps: InventoryFlowWorkflowStep[];
};

export type InventoryFlowWorkflowInstance = {
  id: number;
  instance_no: string;
  workflow_key: string;
  workflow_title: string;
  material_code: string;
  quantity: number | string | null;
  purchase_inbound_code: string;
  transfer_order_code: string;
  warehouse_code: string;
  inwarehouse_code: string;
  bom_code: string;
  current_step_key: string;
  current_step_title: string;
  current_document_key: string;
  current_document_id: string;
  current_document_code: string;
  current_document_status: string;
  current_document_status_label: string;
  current_pending_approver: string;
  instance_status: string;
  instance_status_label: string;
  error_message: string;
  step_count: number;
  completed_step_count: number;
  launched_by: string;
  launched_at: string | null;
  updated_at: string | null;
};

export type InventoryFlowWorkflowLaunchStepResult = ProcurementSupplyWorkflowLaunchStepResult;

export type InventoryFlowWorkflowLaunchResponse = {
  instance_id: number;
  instance_no: string;
  workflow_key: string;
  workflow_title: string;
  instance_status: string;
  instance_status_label: string;
  current_step_key: string;
  current_step_title: string;
  current_document_code: string;
  current_document_status: string;
  current_document_status_label: string;
  current_pending_approver: string;
  launched_at: string | null;
  step_results: InventoryFlowWorkflowLaunchStepResult[];
};

export type InventoryFlowResponse = {
  rules: InventoryFlowRule[];
  tasks: InventoryFlowTask[];
  schedule_tasks: InventoryFlowScheduleTask[];
  workflow_templates: InventoryFlowWorkflowTemplate[];
  unfinished_workflow_instances: {
    unfinished_count: number;
    items: InventoryFlowWorkflowInstance[];
  };
  material_profiles: ProcurementSupplyMaterialProfile[];
  bom_profiles: ProcurementSupplyBomProfile[];
  scrap_integration: {
    supported: boolean;
    status: string;
    title: string;
    note: string;
  };
  scrap_org_options: Option[];
  scrap_bustype_options: Option[];
  scrap_warehouse_options: Option[];
  scrap_status_options: Option[];
  summary: {
    task_count: number;
    pending_count: number;
    blocked_count: number;
    completed_count: number;
    schedule_task_count: number;
    enabled_schedule_task_count: number;
    enabled_rule_count: number;
    auto_rule_count: number;
    transfer_count: number;
    yesterday_sales_out_qty: number;
    yesterday_sales_return_qty: number;
    yesterday_sales_date: string | null;
    latest_sales_date: string | null;
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
    refurb_count: number;
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

export type RefurbCapacityProfile = {
  id: number;
  refurb_category: string;
  stage_key: string;
  stage_label: string;
  stage_name: string;
  daily_capacity: number;
  owner_name: string;
  owner_role: string;
  effective_date: string | null;
  is_enabled: boolean;
  sort_order: number;
  note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RefurbScheduleItem = {
  id: number;
  schedule_no: string;
  schedule_date: string | null;
  refurb_category: string;
  material_name: string;
  stage_key: string;
  stage_label: string;
  planned_qty: number;
  actual_qty: number;
  backlog_qty: number;
  material_ready_qty: number;
  material_gap_qty: number;
  stage_capacity: number;
  capacity_gap_qty: number;
  status: string;
  status_label: string;
  risk_level: string;
  risk_level_label: string;
  owner_name: string;
  owner_role: string;
  blocker_reason: string;
  note: string;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_overdue: boolean;
};

export type RefurbActualItem = {
  id: number;
  biz_date: string | null;
  refurb_category: string;
  material_name: string;
  feeding_qty: number;
  total_work_hours: number;
  plan_qty: number;
  quality_defect_qty: number;
  production_good_qty: number;
  production_bad_qty: number;
  final_good_qty: number;
  non_refurbishable_rate: number;
  quality_reject_rate: number;
  plan_achievement_rate: number;
  refurb_efficiency: number;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RefurbCollaborationResponse = {
  summary: {
    schedule_count: number;
    pending_count: number;
    in_progress_count: number;
    blocked_count: number;
    completed_count: number;
    high_risk_count: number;
    capacity_gap_count: number;
    material_shortage_count: number;
    total_planned_qty: number;
    total_actual_qty: number;
    achievement_rate: number;
    latest_schedule_date: string | null;
    latest_actual_date: string | null;
    active_category_count: number;
  };
  capacity_profiles: RefurbCapacityProfile[];
  schedule_items: RefurbScheduleItem[];
  recent_actuals: RefurbActualItem[];
  calendar: Array<{
    schedule_date: string;
    planned_qty: number;
    actual_qty: number;
    blocked_count: number;
    high_risk_count: number;
  }>;
  date_range: {
    start_date: string;
    end_date: string;
  };
  category_options: Option[];
  stage_options: Option[];
  status_options: Option[];
  risk_options: Option[];
};

export type BiDashboardMetaField = {
  label: string;
  type: string;
  groupable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  numeric?: boolean;
};

export type BiDashboardMetaResponse = {
  widget_types: Array<{ key: string; label: string }>;
  widget_type_map: Record<string, string>;
  datasets: Array<{ key: string; label: string }>;
  dataset_map: Record<string, string>;
  dataset_fields: Record<string, Record<string, BiDashboardMetaField>>;
  aggregation_options?: Array<{ key: string; label: string }>;
  layout_heights?: string[];
  latest_by_dataset?: Record<string, string | null>;
  latest_overall?: string | null;
};

export type BiDashboardSortRule = {
  field: string;
  direction: string;
};

export type BiDashboardFilterRule = {
  field: string;
  op: string;
  value?: string | number | boolean | null;
  start?: string | number | null;
  end?: string | number | null;
};

export type BiDashboardMetricConfig = {
  field: string;
  agg: string;
  label: string;
};

export type BiDashboardWidgetConfig = {
  dataset: string;
  dimensions: string[];
  series_field: string;
  metrics: BiDashboardMetricConfig[];
  chart_palette?: string;
  date_filter: {
    mode: string;
    date: string;
    start_date: string;
    end_date: string;
    date_col: string;
  };
  filters: BiDashboardFilterRule[];
  sort: BiDashboardSortRule[];
  limit: number;
  text_content: string;
};

export type BiDashboardWidgetLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  span: number;
  height: string;
};

export type BiDashboardWidget = {
  id: number;
  view_id: number;
  title: string;
  widget_type: string;
  dataset: string;
  config: BiDashboardWidgetConfig;
  layout: BiDashboardWidgetLayout;
  sort_order: number;
  analysis_text: string;
  created_at: string | null;
  updated_at: string | null;
};

export type BiDashboardViewSummary = {
  id: number;
  name: string;
  description: string;
  global_filters: unknown[];
  widget_count: number;
  created_at: string | null;
  updated_at: string | null;
};

export type BiDashboardViewsResponse = {
  views: BiDashboardViewSummary[];
};

export type BiDashboardViewDetail = Omit<BiDashboardViewSummary, "widget_count"> & {
  widgets: BiDashboardWidget[];
};

export type BiDashboardWidgetDataMetric = {
  alias: string;
  field: string;
  agg: string;
  label: string;
};

export type BiDashboardWidgetDataRow = Record<string, string | number | null>;

export type BiDashboardWidgetDataItem = {
  target_date: string | null;
  applied_target_date: string | null;
  dimensions: string[];
  series_field: string;
  series_groups: string[];
  metrics: BiDashboardWidgetDataMetric[];
  rows: BiDashboardWidgetDataRow[];
  config: BiDashboardWidgetConfig;
  date_filter_scope: string;
  widget_id: number;
  widget_type: string;
  title: string;
};

export type BiDashboardWidgetDataResponse = {
  view_id: number;
  biz_date: string | null;
  items: BiDashboardWidgetDataItem[];
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

export type CurrentUser = {
  id: number;
  username: string;
  email: string;
  display_name: string;
  role_name: string;
  is_admin: boolean;
  is_enabled: boolean;
  access_granted: boolean;
  module_permissions: string[];
  default_home_path: string;
  must_change_password: boolean;
  note: string;
  source_type: string;
  last_login_at: string | null;
  password_updated_at: string | null;
  registered_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string | null;
  updated_at: string | null;
};

export type CurrentUserResponse = {
  current_user: CurrentUser;
};

export type DashboardUserManagementResponse = {
  current_user: CurrentUser;
  items: CurrentUser[];
  role_options: Option[];
  module_options: Array<Option & { default_path: string }>;
  summary: {
    total_count: number;
    enabled_count: number;
    admin_count: number;
    pending_count: number;
    role_count: number;
  };
};

export type OverviewResponse = {
  currentUser: CurrentUser | null;
  metricSummary: MetricDictionaryResponse["summary"];
  masterSummary: MasterDataResponse["summary"];
  taskCenterSummary: TaskCenterResponse["summary"] & {
    latestItems: TaskCenterItem[];
  };
  refurbSummary: RefurbCollaborationResponse["summary"] & {
    latestItems: RefurbScheduleItem[];
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
