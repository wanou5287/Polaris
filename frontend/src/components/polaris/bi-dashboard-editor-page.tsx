"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookCheck,
  CalendarDays,
  Copy,
  LayoutDashboard,
  MoreHorizontal,
  PencilLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

import { TransitionLink } from "@/components/polaris/transition-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  BI_DASHBOARD_CHART_PALETTES,
  DEFAULT_CHART_PALETTE_KEY,
  resolveChartPaletteKey,
  supportsChartPalette,
} from "@/lib/bi-dashboard-chart-palettes";
import { apiFetch, cn, formatDate, formatDateTime } from "@/lib/polaris-client";
import type {
  BiDashboardMetaResponse,
  BiDashboardMetricConfig,
  BiDashboardViewDetail,
  BiDashboardViewSummary,
  BiDashboardWidget,
  BiDashboardWidgetDataResponse,
} from "@/lib/polaris-types";
import {
  buildRuntimeHref,
  DashboardCanvas,
  defaultViewId,
  getDefaultBusinessDate,
  normalizeText,
  requestDashboardMeta,
  requestDashboardViewDetail,
  requestDashboardViews,
  requestDashboardWidgetData,
  viewDescription,
  viewTitle,
} from "./bi-dashboard-page";

type WidgetMetricDraft = {
  field: string;
  agg: string;
  label: string;
};

type WidgetEditorDraft = {
  id: number;
  title: string;
  widgetType: string;
  dataset: string;
  dimension: string;
  seriesField: string;
  metrics: WidgetMetricDraft[];
  chartPalette: string;
  dateMode: string;
  dateValue: string;
  startDate: string;
  endDate: string;
  dateField: string;
  sortField: string;
  sortDirection: string;
  limit: number;
  textContent: string;
  analysisText: string;
  layoutWidth: number;
  layoutHeight: "compact" | "normal" | "tall";
  layoutX: number;
  layoutY: number;
  sortOrder: number;
};

type WidgetLibraryItem = {
  type: string;
  title: string;
  summary: string;
  badge: string;
};

const AGGREGATION_FALLBACK = [
  { key: "sum", label: "求和" },
  { key: "avg", label: "平均值" },
  { key: "count", label: "记录数" },
  { key: "max", label: "最大值" },
  { key: "min", label: "最小值" },
];

const DATE_MODE_OPTIONS = [
  { value: "follow_page", label: "跟随页面" },
  { value: "fixed_date", label: "固定日期" },
  { value: "date_range", label: "区间日期" },
];

const LAYOUT_WIDTH_OPTIONS = [
  { value: 8, label: "三分之一" },
  { value: 12, label: "二分之一" },
  { value: 16, label: "三分之二" },
  { value: 24, label: "整行" },
];

const LAYOUT_HEIGHT_OPTIONS: Array<{ value: WidgetEditorDraft["layoutHeight"]; label: string }> = [
  { value: "compact", label: "紧凑" },
  { value: "normal", label: "标准" },
  { value: "tall", label: "高版" },
];

const WIDGET_LIBRARY_GROUPS: Array<{ title: string; items: WidgetLibraryItem[] }> = [
  {
    title: "指标组件",
    items: [
      { type: "metric", title: "指标卡", summary: "用于展示单个核心经营指标。", badge: "指标" },
      { type: "ranking", title: "排行榜", summary: "输出 Top 榜单和区域排行。", badge: "排行" },
      { type: "table", title: "表格", summary: "查看明细、对账和数据明细。", badge: "明细" },
    ],
  },
  {
    title: "图表组件",
    items: [
      { type: "line", title: "折线图", summary: "适合销售趋势、库存趋势和周/月走势。", badge: "趋势" },
      { type: "bar", title: "柱状图", summary: "适合 Top 榜、单维度对比。", badge: "对比" },
      { type: "stacked_bar", title: "堆叠柱图", summary: "适合多系列结构对比。", badge: "结构" },
      { type: "stacked_hbar", title: "横向堆叠图", summary: "适合区域、仓库类排行。", badge: "横排" },
      { type: "pie", title: "饼图", summary: "适合状态占比和结构分布。", badge: "占比" },
      { type: "text", title: "文本卡", summary: "用于补充经营说明、备注和解读。", badge: "说明" },
    ],
  },
];

const supportsDimensions = (widgetType: string) => !["metric", "text"].includes(widgetType);
const supportsSeries = (widgetType: string) => ["line", "bar", "stacked_bar", "stacked_hbar", "pie"].includes(widgetType);
const supportsMetrics = (widgetType: string) => widgetType !== "text";
const supportsLimit = (widgetType: string) => ["bar", "stacked_bar", "stacked_hbar", "ranking", "table", "pie"].includes(widgetType);
const maxMetricCount = (widgetType: string) => {
  if (["metric", "pie", "ranking"].includes(widgetType)) return 1;
  if (widgetType === "table") return 3;
  if (widgetType === "text") return 0;
  return 3;
};

const parsePositiveNumber = (value: string | number | null | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const rowsFromHeight = (height: WidgetEditorDraft["layoutHeight"]) => {
  if (height === "compact") return 4;
  if (height === "tall") return 7;
  return 5;
};

const heightFromRows = (rows: number): WidgetEditorDraft["layoutHeight"] => {
  if (rows >= 7) return "tall";
  if (rows <= 4) return "compact";
  return "normal";
};

const requestCreateView = (payload: { name: string; description: string }) =>
  apiFetch<{ id: number }>("/api/backend/views", {
    method: "POST",
    body: JSON.stringify(payload),
  });

const requestUpdateView = (viewId: number, payload: { name: string; description: string; global_filters?: unknown[] }) =>
  apiFetch<{ id: number }>(`/api/backend/views/${viewId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

const requestCreateWidget = (viewId: number, payload: { title: string; widget_type: string; dataset: string }) =>
  apiFetch<{ id: number }>(`/api/backend/views/${viewId}/widgets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

const requestUpdateWidget = (
  widgetId: number,
  payload: {
    title: string;
    widget_type: string;
    dataset: string;
    config: Record<string, unknown>;
    layout: Record<string, unknown>;
    sort_order: number;
    analysis_text: string;
  },
) =>
  apiFetch<{ id: number }>(`/api/backend/widgets/${widgetId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

const requestDuplicateWidget = (widgetId: number) =>
  apiFetch<{ id: number }>(`/api/backend/widgets/${widgetId}/duplicate`, {
    method: "POST",
  });

const requestDeleteWidget = (widgetId: number) =>
  apiFetch<{ deleted: boolean }>(`/api/backend/widgets/${widgetId}`, {
    method: "DELETE",
  });

function datasetFieldEntries(meta: BiDashboardMetaResponse | null, dataset: string) {
  return Object.entries(meta?.dataset_fields?.[dataset] ?? {}).map(([key, field]) => ({
    key,
    label: normalizeText(field.label, key),
    field,
  }));
}

function dimensionFieldOptions(meta: BiDashboardMetaResponse | null, dataset: string) {
  return datasetFieldEntries(meta, dataset)
    .filter(({ field }) => field.groupable !== false || !field.numeric)
    .map(({ key }) => key);
}

function metricFieldOptions(meta: BiDashboardMetaResponse | null, dataset: string) {
  return datasetFieldEntries(meta, dataset)
    .filter(({ field }) => field.numeric || ["number", "integer", "float", "decimal"].includes(field.type))
    .map(({ key }) => key);
}

function dateFieldOptions(meta: BiDashboardMetaResponse | null, dataset: string) {
  return datasetFieldEntries(meta, dataset)
    .filter(({ key, field }) => field.type.includes("date") || key.includes("date"))
    .map(({ key }) => key);
}

function fieldLabel(meta: BiDashboardMetaResponse | null, dataset: string, fieldKey: string, fallback = "未命名字段") {
  return normalizeText(meta?.dataset_fields?.[dataset]?.[fieldKey]?.label, fieldKey || fallback);
}

function widgetTypeLabel(meta: BiDashboardMetaResponse | null, widgetType: string) {
  return normalizeText(meta?.widget_type_map?.[widgetType], widgetType);
}

function ensureMetricDrafts(
  metrics: WidgetMetricDraft[],
  widgetType: string,
  metricOptions: ReturnType<typeof metricFieldOptions>,
  meta: BiDashboardMetaResponse | null,
  dataset: string,
) {
  if (!supportsMetrics(widgetType)) {
    return [];
  }

  const optionKeys = new Set(metricOptions);
  const cleaned = metrics
    .filter((metric) => metric.field && optionKeys.has(metric.field))
    .map((metric) => ({
      field: metric.field,
      agg: metric.agg || "sum",
      label: metric.label || fieldLabel(meta, dataset, metric.field, metric.field),
    }));

  if (!cleaned.length && metricOptions[0]) {
    cleaned.push({
      field: metricOptions[0],
      agg: "sum",
      label: fieldLabel(meta, dataset, metricOptions[0], metricOptions[0]),
    });
  }

  return cleaned.slice(0, maxMetricCount(widgetType));
}

function sortOptionsForDraft(draft: WidgetEditorDraft, meta: BiDashboardMetaResponse | null) {
  const options: Array<{ value: string; label: string }> = [];
  if (draft.dimension) {
    options.push({ value: draft.dimension, label: `${fieldLabel(meta, draft.dataset, draft.dimension)}（横轴）` });
  }
  draft.metrics.forEach((metric, index) => {
    options.push({ value: `metric_${index}`, label: metric.label || fieldLabel(meta, draft.dataset, metric.field) });
  });
  return options;
}

function normalizeWidgetDraft(draft: WidgetEditorDraft, meta: BiDashboardMetaResponse | null): WidgetEditorDraft {
  const dimensions = dimensionFieldOptions(meta, draft.dataset);
  const metricOptions = metricFieldOptions(meta, draft.dataset);
  const dateOptions = dateFieldOptions(meta, draft.dataset);
  const dimensionSet = new Set(dimensions);
  const dateSet = new Set(dateOptions);

  const nextDimension = supportsDimensions(draft.widgetType)
    ? dimensionSet.has(draft.dimension)
      ? draft.dimension
      : dimensions[0] ?? ""
    : "";

  const nextSeries = supportsSeries(draft.widgetType) && dimensionSet.has(draft.seriesField) && draft.seriesField !== nextDimension
    ? draft.seriesField
    : "";

  const nextMetrics = ensureMetricDrafts(draft.metrics, draft.widgetType, metricOptions, meta, draft.dataset);
  const nextDateField = dateSet.has(draft.dateField) ? draft.dateField : dateOptions[0] ?? "";
  const nextChartPalette = supportsChartPalette(draft.widgetType)
    ? resolveChartPaletteKey(draft.chartPalette)
    : DEFAULT_CHART_PALETTE_KEY;
  const nextSortOptions = [
    ...(nextDimension ? [{ value: nextDimension }] : []),
    ...nextMetrics.map((_, index) => ({ value: `metric_${index}` })),
  ];
  const nextSortField = nextSortOptions.some((option) => option.value === draft.sortField)
    ? draft.sortField
    : nextMetrics.length
      ? "metric_0"
      : nextDimension;

  return {
    ...draft,
    dimension: nextDimension,
    seriesField: nextSeries,
    metrics: nextMetrics.map((metric) => ({
      ...metric,
      label: metric.label || fieldLabel(meta, draft.dataset, metric.field, metric.field),
    })),
    dateField: nextDateField,
    chartPalette: nextChartPalette,
    sortField: nextSortField,
    limit: Math.max(5, Math.min(50, parsePositiveNumber(draft.limit, 20))),
    layoutWidth: LAYOUT_WIDTH_OPTIONS.some((option) => option.value === draft.layoutWidth) ? draft.layoutWidth : 12,
    layoutHeight: LAYOUT_HEIGHT_OPTIONS.some((option) => option.value === draft.layoutHeight) ? draft.layoutHeight : "normal",
  };
}

function buildWidgetDraft(widget: BiDashboardWidget, meta: BiDashboardMetaResponse | null): WidgetEditorDraft {
  const sortRule = widget.config.sort?.[0] ?? { field: "metric_0", direction: "desc" };
  const dateFilter = widget.config.date_filter ?? {
    mode: "follow_page",
    date: "",
    start_date: "",
    end_date: "",
    date_col: "",
  };

  return normalizeWidgetDraft(
    {
      id: widget.id,
      title: normalizeText(widget.title, "未命名图表"),
      widgetType: widget.widget_type,
      dataset: widget.dataset,
      dimension: widget.config.dimensions?.[0] ?? "",
      seriesField: widget.config.series_field ?? "",
      metrics: (widget.config.metrics ?? []).map((metric) => ({
        field: metric.field,
        agg: metric.agg,
        label: normalizeText(metric.label, metric.field),
      })),
      chartPalette: resolveChartPaletteKey(widget.config.chart_palette),
      dateMode: dateFilter.mode || "follow_page",
      dateValue: dateFilter.date || "",
      startDate: dateFilter.start_date || "",
      endDate: dateFilter.end_date || "",
      dateField: dateFilter.date_col || "",
      sortField: sortRule.field || "metric_0",
      sortDirection: sortRule.direction || "desc",
      limit: parsePositiveNumber(widget.config.limit, 20),
      textContent: widget.config.text_content || "",
      analysisText: widget.analysis_text || "",
      layoutWidth: widget.layout.w || 12,
      layoutHeight: heightFromRows(widget.layout.h || rowsFromHeight("normal")),
      layoutX: widget.layout.x || 0,
      layoutY: widget.layout.y || 0,
      sortOrder: widget.sort_order,
    },
    meta,
  );
}

function buildWidgetPayload(draft: WidgetEditorDraft, meta: BiDashboardMetaResponse | null) {
  const nextDraft = normalizeWidgetDraft(draft, meta);
  const metrics: BiDashboardMetricConfig[] = nextDraft.metrics.map((metric) => ({
    field: metric.field,
    agg: metric.agg,
    label: metric.label || fieldLabel(meta, nextDraft.dataset, metric.field, metric.field),
  }));

  return {
    title: nextDraft.title,
    widget_type: nextDraft.widgetType,
    dataset: nextDraft.dataset,
    config: {
      dataset: nextDraft.dataset,
      dimensions: supportsDimensions(nextDraft.widgetType) && nextDraft.dimension ? [nextDraft.dimension] : [],
      series_field: supportsSeries(nextDraft.widgetType) ? nextDraft.seriesField : "",
      metrics,
      chart_palette: supportsChartPalette(nextDraft.widgetType) ? nextDraft.chartPalette : undefined,
      date_filter: {
        mode: nextDraft.dateMode,
        date: nextDraft.dateValue,
        start_date: nextDraft.startDate,
        end_date: nextDraft.endDate,
        date_col: nextDraft.dateField,
      },
      filters: [],
      sort: nextDraft.sortField ? [{ field: nextDraft.sortField, direction: nextDraft.sortDirection }] : [],
      limit: supportsLimit(nextDraft.widgetType) ? nextDraft.limit : 20,
      text_content: nextDraft.widgetType === "text" ? nextDraft.textContent : "",
    },
    layout: {
      x: nextDraft.layoutX,
      y: nextDraft.layoutY,
      w: nextDraft.layoutWidth,
      h: rowsFromHeight(nextDraft.layoutHeight),
      span: nextDraft.layoutWidth > 12 ? 2 : 1,
      height: nextDraft.layoutHeight,
    },
    sort_order: nextDraft.sortOrder,
    analysis_text: nextDraft.analysisText,
  };
}

function WidgetLibraryMenu({ onCreate }: { onCreate: (item: WidgetLibraryItem) => void }) {
  return (
    <div className="grid gap-4">
      {WIDGET_LIBRARY_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <div className="px-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{group.title}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.items.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => onCreate(item)}
                className="rounded-[24px] border border-border/80 bg-white px-4 py-4 text-left transition-all hover:border-sky-200 hover:bg-sky-50/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-foreground">{item.title}</div>
                  <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                    {item.badge}
                  </Badge>
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PalettePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      {BI_DASHBOARD_CHART_PALETTES.map((palette) => {
        const active = palette.key === value;
        return (
          <button
            key={palette.key}
            type="button"
            onClick={() => onChange(palette.key)}
            className={cn(
              "flex items-center justify-between gap-3 rounded-[20px] border px-3 py-3 text-left transition-all",
              active ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100" : "border-border/80 bg-white hover:border-slate-300",
            )}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{palette.label}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{palette.description}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {palette.colors.map((color) => (
                <span key={color} className="size-4 rounded-full ring-1 ring-black/5" style={{ backgroundColor: color }} />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function BiDashboardEditorPage() {
  const [selectedDate, setSelectedDate] = useState(getDefaultBusinessDate());
  const [meta, setMeta] = useState<BiDashboardMetaResponse | null>(null);
  const [views, setViews] = useState<BiDashboardViewSummary[]>([]);
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BiDashboardViewDetail | null>(null);
  const [data, setData] = useState<BiDashboardWidgetDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewLoading, setViewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [viewDraftName, setViewDraftName] = useState("");
  const [viewDraftDescription, setViewDraftDescription] = useState("");
  const [isCreateViewOpen, setIsCreateViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewDescription, setNewViewDescription] = useState("");
  const [widgetLibraryOpen, setWidgetLibraryOpen] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<number | null>(null);
  const [widgetDraft, setWidgetDraft] = useState<WidgetEditorDraft | null>(null);
  const [savingView, setSavingView] = useState(false);
  const [savingWidget, setSavingWidget] = useState(false);
  const [creatingWidgetType, setCreatingWidgetType] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      try {
        const [metaResponse, viewsResponse] = await Promise.all([requestDashboardMeta(), requestDashboardViews()]);
        if (cancelled) return;
        setMeta(metaResponse);
        setViews(viewsResponse.views);
        setActiveViewId(defaultViewId(viewsResponse.views, null));
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "BI 看板编辑器加载失败。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeViewId) return;
    const currentViewId = activeViewId;
    let cancelled = false;

    async function loadView() {
      setViewLoading(true);
      setError(null);
      try {
        const [viewsResponse, detailResponse, dataResponse] = await Promise.all([
          requestDashboardViews(),
          requestDashboardViewDetail(currentViewId),
          requestDashboardWidgetData(currentViewId, selectedDate),
        ]);
        if (cancelled) return;
        setViews(viewsResponse.views);
        setDetail(detailResponse);
        setData(dataResponse);
        setViewDraftName(normalizeText(detailResponse.name, "未命名看板"));
        setViewDraftDescription(detailResponse.description || "");
        setSelectedWidgetId((current) => {
          if (current && detailResponse.widgets.some((widget) => widget.id === current)) {
            return current;
          }
          return detailResponse.widgets[0]?.id ?? null;
        });
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "当前看板加载失败。");
        }
      } finally {
        if (!cancelled) {
          setViewLoading(false);
        }
      }
    }

    void loadView();
    return () => {
      cancelled = true;
    };
  }, [activeViewId, selectedDate]);

  const itemMap = useMemo(
    () => new Map((data?.items ?? []).map((item) => [item.widget_id, item])),
    [data],
  );

  const activeView = useMemo(
    () => views.find((view) => view.id === activeViewId) ?? null,
    [views, activeViewId],
  );

  const selectedWidget = useMemo(
    () => detail?.widgets.find((widget) => widget.id === selectedWidgetId) ?? null,
    [detail, selectedWidgetId],
  );
  const widgetLibraryItems = useMemo(() => WIDGET_LIBRARY_GROUPS.flatMap((group) => group.items), []);

  useEffect(() => {
    if (!selectedWidget) {
      setWidgetDraft(null);
      return;
    }
    setWidgetDraft(buildWidgetDraft(selectedWidget, meta));
  }, [selectedWidget, meta]);

  const latestDateLabel = activeView ? formatDate(activeView.updated_at) : "--";
  const widgetCount = detail?.widgets.length ?? 0;

  const refreshCurrentView = async (nextSelectedWidgetId?: number | null, nextViewId?: number) => {
    const targetViewId = nextViewId ?? activeViewId;
    if (!targetViewId) return;

    setViewLoading(true);
    try {
      const [viewsResponse, detailResponse, dataResponse] = await Promise.all([
        requestDashboardViews(),
        requestDashboardViewDetail(targetViewId),
        requestDashboardWidgetData(targetViewId, selectedDate),
      ]);
      setViews(viewsResponse.views);
      setDetail(detailResponse);
      setData(dataResponse);
      setActiveViewId(targetViewId);
      setSelectedWidgetId(
        nextSelectedWidgetId && detailResponse.widgets.some((widget) => widget.id === nextSelectedWidgetId)
          ? nextSelectedWidgetId
          : detailResponse.widgets[0]?.id ?? null,
      );
    } finally {
      setViewLoading(false);
    }
  };

  const handleCreateView = async () => {
    if (!newViewName.trim()) {
      setError("请先输入看板名称。");
      return;
    }
    setSavingView(true);
    setError(null);
    try {
      const response = await requestCreateView({
        name: newViewName.trim(),
        description: newViewDescription.trim(),
      });
      setIsCreateViewOpen(false);
      setNewViewName("");
      setNewViewDescription("");
      setMessage("已新增新的 BI 看板草稿。");
      await refreshCurrentView(null, response.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "新增看板失败。");
    } finally {
      setSavingView(false);
    }
  };

  const handleSaveView = async () => {
    if (!activeViewId) return;
    if (!viewDraftName.trim()) {
      setError("看板名称不能为空。");
      return;
    }
    setSavingView(true);
    setError(null);
    try {
      await requestUpdateView(activeViewId, {
        name: viewDraftName.trim(),
        description: viewDraftDescription.trim(),
        global_filters: detail?.global_filters ?? [],
      });
      setMessage("看板信息已保存。");
      await refreshCurrentView(selectedWidgetId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存看板信息失败。");
    } finally {
      setSavingView(false);
    }
  };

  const handleCreateWidget = async (item: WidgetLibraryItem) => {
    if (!activeViewId) return;
    const dataset = selectedWidget?.dataset || (activeView?.id === 3 ? "inventory_cleaning" : "sales_cleaning");
    setCreatingWidgetType(item.type);
    setError(null);
    setWidgetLibraryOpen(false);
    try {
      const response = await requestCreateWidget(activeViewId, {
        title: item.title,
        widget_type: item.type,
        dataset,
      });
      setMessage(`已新增${item.title}。`);
      await refreshCurrentView(response.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "新增图表失败。");
    } finally {
      setCreatingWidgetType(null);
    }
  };

  const handleSaveWidget = async () => {
    if (!widgetDraft) return;
    setSavingWidget(true);
    setError(null);
    try {
      await requestUpdateWidget(widgetDraft.id, buildWidgetPayload(widgetDraft, meta));
      setMessage("图表配置已保存。");
      await refreshCurrentView(widgetDraft.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存图表失败。");
    } finally {
      setSavingWidget(false);
    }
  };

  const handleDuplicateWidget = async (widgetId: number) => {
    setError(null);
    try {
      const response = await requestDuplicateWidget(widgetId);
      setMessage("已复制图表组件。");
      await refreshCurrentView(response.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "复制图表失败。");
    }
  };

  const handleDeleteWidget = async (widgetId: number) => {
    if (!window.confirm("删除后该图表会立即从当前看板移除，确认继续吗？")) {
      return;
    }
    setError(null);
    try {
      await requestDeleteWidget(widgetId);
      setMessage("图表已删除。");
      await refreshCurrentView(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "删除图表失败。");
    }
  };

  const selectedItem = selectedWidgetId ? itemMap.get(selectedWidgetId) : null;
  const sortOptions = widgetDraft ? sortOptionsForDraft(widgetDraft, meta) : [];
  const currentDimensionOptions = widgetDraft ? dimensionFieldOptions(meta, widgetDraft.dataset) : [];
  const currentMetricOptions = widgetDraft ? metricFieldOptions(meta, widgetDraft.dataset) : [];
  const currentDateOptions = widgetDraft ? dateFieldOptions(meta, widgetDraft.dataset) : [];
  const aggregationOptions = meta?.aggregation_options?.length ? meta.aggregation_options : AGGREGATION_FALLBACK;
  const canvasWidgets = useMemo(
    () => [...(detail?.widgets ?? [])].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)),
    [detail],
  );

  const updateWidgetDraft = (updater: (draft: WidgetEditorDraft) => WidgetEditorDraft) => {
    setWidgetDraft((current) => (current ? updater(current) : current));
  };

  const addMetricDraft = () => {
    updateWidgetDraft((current) => ({
      ...current,
      metrics: [...current.metrics, { field: "", agg: aggregationOptions[0]?.key ?? "sum", label: "" }],
    }));
  };

  const removeMetricDraft = (index: number) => {
    updateWidgetDraft((current) => ({
      ...current,
      metrics: current.metrics.filter((_, metricIndex) => metricIndex !== index),
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 rounded-[32px]" />
        <Skeleton className="h-[520px] rounded-[32px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface-panel px-6 py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              <LayoutDashboard className="size-3.5" />
              BI Dashboard Studio
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-4xl font-semibold tracking-tight text-foreground">可自定义 BI 看板</h2>
              <Badge className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 shadow-none">画布模式</Badge>
            </div>
            <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
              围绕经营指标、趋势图和排行榜建立统一画布，支持新增组件、组件级配置、图表配色和看板级视图管理。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu open={widgetLibraryOpen} onOpenChange={setWidgetLibraryOpen}>
              <DropdownMenuTrigger asChild>
                <Button className="h-11 rounded-full bg-sky-500 px-5 text-white shadow-[0_18px_35px_rgba(56,189,248,0.22)] hover:bg-sky-600">
                  <Plus className="size-4" />
                  添加图表
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[420px] rounded-[28px] p-4">
                <DropdownMenuLabel className="px-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  组件能力
                </DropdownMenuLabel>
                <div className="mt-3">
                  <WidgetLibraryMenu onCreate={handleCreateWidget} />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="h-11 rounded-full border-border/80 bg-white" onClick={() => setIsCreateViewOpen(true)}>
              <Sparkles className="size-4" />
              新建看板
            </Button>
            <Button variant="outline" className="h-11 rounded-full border-border/80 bg-white" onClick={handleSaveView} disabled={savingView || !activeViewId}>
              <Save className="size-4" />
              保存看板信息
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-full border-border/80 bg-white">
              <TransitionLink href="/governance/metric-dictionary">
                <BookCheck className="size-4" />
                指标口径
              </TransitionLink>
            </Button>
            <Button asChild className="h-11 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
              <TransitionLink href={buildRuntimeHref(activeViewId, selectedDate)}>
                <PencilLine className="size-4" />
                预览看板
              </TransitionLink>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <Card className="rounded-[30px] border border-border/70 bg-white/90 shadow-none">
            <CardHeader>
              <CardTitle>当前看板</CardTitle>
              <CardDescription>切换视图后，右侧画布和配置面板会同步刷新。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(views.length ? views : detail ? [detail] : []).map((view) => {
                  const active = view.id === activeViewId;
                  return (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => setActiveViewId(view.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",
                        active
                          ? "border-slate-950 bg-slate-950 text-white shadow-[0_16px_30px_rgba(15,23,42,0.16)]"
                          : "border-border/80 bg-white text-foreground hover:border-slate-300",
                      )}
                    >
                      {viewTitle(view)}
                    <Badge
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] shadow-none",
                        active ? "border-white/20 bg-white/10 text-white" : "border-border/80 bg-muted/40 text-muted-foreground",
                      )}
                    >
                        {"widget_count" in view ? view.widget_count : view.widgets.length}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">看板名称</span>
                  <Input
                    value={viewDraftName}
                    onChange={(event) => setViewDraftName(event.target.value)}
                    className="h-11 rounded-2xl border-border/80 bg-white"
                    placeholder="输入看板名称"
                  />
                </label>
                <label className="space-y-2">
                  <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    业务日期
                  </span>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="h-11 rounded-2xl border-border/80 bg-white"
                  />
                </label>
              </div>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">看板说明</span>
                <Textarea
                  value={viewDraftDescription}
                  onChange={(event) => setViewDraftDescription(event.target.value)}
                  className="min-h-[108px] rounded-[24px] border-border/80 bg-white"
                  placeholder="描述这个看板的业务目标、关注重点和使用对象。"
                />
              </label>
            </CardContent>
          </Card>
          <Card className="rounded-[30px] border border-border/70 bg-white/90 shadow-none">
            <CardHeader>
              <CardTitle>组件概览</CardTitle>
              <CardDescription>编辑器会围绕当前选中的看板同步刷新组件数量、最近更新时间和业务日期。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-border/70 bg-muted/30 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">组件数量</div>
                  <div className="mt-3 text-3xl font-semibold text-foreground">{widgetCount}</div>
                </div>
                <div className="rounded-[24px] border border-border/70 bg-muted/30 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">最近更新</div>
                  <div className="mt-3 text-lg font-semibold text-foreground">{latestDateLabel}</div>
                </div>
              </div>
              <div className="rounded-[24px] border border-sky-100 bg-sky-50/70 px-4 py-4 text-sm leading-6 text-slate-600">
                当前编辑视图：<span className="font-medium text-slate-900">{activeView ? viewTitle(activeView) : "未选择看板"}</span>
                <br />
                当前业务日期：<span className="font-medium text-slate-900">{formatDate(selectedDate)}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-[30px] border border-border/70 bg-white/90 shadow-none">
            <CardHeader>
              <CardTitle>编辑建议</CardTitle>
              <CardDescription>先搭建看板骨架，再逐步补齐指标卡、趋势图、排行榜和分析文本。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <div className="rounded-[22px] border border-border/70 bg-muted/25 px-4 py-3">
                1. 先新增一个视图并确定业务日期，再从左上角“添加图表”补齐经营摘要和核心趋势。
              </div>
              <div className="rounded-[22px] border border-border/70 bg-muted/25 px-4 py-3">
                2. 点击图表卡片即可在右侧编辑面板中调整数据表、维度、指标、排序和配色。
              </div>
              <div className="rounded-[22px] border border-border/70 bg-muted/25 px-4 py-3">
                3. 复制已有组件后再微调宽高和日期范围，可以更快拼出月度、周度和排行榜组合。
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {message ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {!activeViewId ? (
        <section className="surface-panel p-10">
          <Empty className="border-border/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutDashboard className="size-4" />
              </EmptyMedia>
              <EmptyTitle>先创建一个 BI 看板，再开始布置画布</EmptyTitle>
              <EmptyDescription>看板建好后，你就可以继续新增指标卡、折线图、排行榜和文本组件。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </section>
      ) : (
        <section className="surface-panel overflow-hidden px-6 py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-3xl font-semibold tracking-tight text-foreground">
                  {activeView ? viewTitle(activeView) : "未命名看板"}
                </h3>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-700 shadow-none">
                  画布模式
                </Badge>
                {creatingWidgetType ? (
                  <Badge className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 shadow-none">正在新增 {widgetTypeLabel(meta, creatingWidgetType)}</Badge>
                ) : null}
              </div>
              <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
                {activeView ? viewDescription(activeView) : "当前看板用于承载经营摘要、趋势分析和排行榜。点击图表卡片即可进入右侧配置。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <div className="rounded-[22px] border border-border/80 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">业务日期</div>
                <div className="mt-2 text-base font-semibold text-foreground">{formatDate(selectedDate)}</div>
              </div>
              <div className="rounded-[22px] border border-border/80 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">组件数量</div>
                <div className="mt-2 text-base font-semibold text-foreground">{widgetCount}</div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            {viewLoading ? (
              <div className="grid gap-5">
                <Skeleton className="h-[240px] rounded-[32px]" />
                <div className="grid gap-5 xl:grid-cols-2">
                  <Skeleton className="h-[300px] rounded-[32px]" />
                  <Skeleton className="h-[300px] rounded-[32px]" />
                </div>
              </div>
            ) : canvasWidgets.length ? (
              <DashboardCanvas
                meta={meta}
                widgets={canvasWidgets}
                itemMap={itemMap}
                onWidgetSelect={(widgetId) => setSelectedWidgetId(widgetId)}
                renderWidgetActions={(widget) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-8 items-center justify-center rounded-full border border-border/80 bg-white text-muted-foreground transition-all hover:border-slate-300 hover:text-slate-900"
                        aria-label="图表操作"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-[20px] p-2">
                      <DropdownMenuLabel className="px-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">图表菜单</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="rounded-xl" onSelect={() => setSelectedWidgetId(widget.id)}>
                        <PencilLine className="mr-2 size-4" />
                        编辑图表
                      </DropdownMenuItem>
                      <DropdownMenuItem className="rounded-xl" onSelect={() => void handleDuplicateWidget(widget.id)}>
                        <Copy className="mr-2 size-4" />
                        复制
                      </DropdownMenuItem>
                      <DropdownMenuItem className="rounded-xl text-rose-600 focus:text-rose-600" onSelect={() => void handleDeleteWidget(widget.id)}>
                        <Trash2 className="mr-2 size-4" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              />
            ) : (
              <Empty className="border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Plus className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>当前看板还没有任何图表</EmptyTitle>
                  <EmptyDescription>从左上角“添加图表”开始，为这个看板依次加入指标卡、趋势图、排行榜或文本说明。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </section>
      )}

      <Dialog open={isCreateViewOpen} onOpenChange={setIsCreateViewOpen}>
        <DialogContent className="sm:max-w-[560px] rounded-[30px] border-border/80 bg-white">
          <DialogHeader>
            <DialogTitle>新建看板</DialogTitle>
            <DialogDescription>先创建一个新的视图骨架，再继续往画布里加入图表组件。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">看板名称</span>
              <Input
                value={newViewName}
                onChange={(event) => setNewViewName(event.target.value)}
                className="h-11 rounded-2xl border-border/80 bg-white"
                placeholder="例如：销售/退货看板"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">看板说明</span>
              <Textarea
                value={newViewDescription}
                onChange={(event) => setNewViewDescription(event.target.value)}
                className="min-h-[120px] rounded-[24px] border-border/80 bg-white"
                placeholder="简要描述这个看板要回答的业务问题。"
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setIsCreateViewOpen(false)}>
              取消
            </Button>
            <Button className="rounded-full bg-sky-500 text-white hover:bg-sky-600" onClick={() => void handleCreateView()} disabled={savingView}>
              <Save className="size-4" />
              保存并创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={Boolean(widgetDraft && selectedWidgetId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedWidgetId(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-hidden border-l border-border/80 bg-white p-0 sm:max-w-[720px]">
          <SheetHeader className="border-b border-border/70 px-6 py-5 text-left">
            <SheetTitle>{widgetDraft ? widgetTypeLabel(meta, widgetDraft.widgetType) : "组件配置"}</SheetTitle>
            <SheetDescription>围绕当前选中的图表配置数据表、维度、指标、布局和分析说明。</SheetDescription>
          </SheetHeader>
          {widgetDraft ? (
            <>
              <ScrollArea className="h-[calc(100vh-168px)] px-6 py-6">
                <Tabs defaultValue="basic" className="space-y-6">
                  <TabsList className="grid h-auto grid-cols-3 rounded-full bg-muted/30 p-1">
                    <TabsTrigger value="basic" className="rounded-full">
                      基础配置
                    </TabsTrigger>
                    <TabsTrigger value="advanced" className="rounded-full">
                      自定义配置
                    </TabsTrigger>
                    <TabsTrigger value="analysis" className="rounded-full">
                      分析
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic" className="space-y-6">
                    <div className="grid gap-5 xl:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-foreground">名称</span>
                        <Input
                          value={widgetDraft.title}
                          onChange={(event) => updateWidgetDraft((current) => ({ ...current, title: event.target.value }))}
                          className="h-11 rounded-2xl border-border/80 bg-white"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-foreground">图表类型</span>
                        <Select
                          value={widgetDraft.widgetType}
                          onValueChange={(value) =>
                            updateWidgetDraft((current) => normalizeWidgetDraft({ ...current, widgetType: value }, meta))
                          }
                        >
                          <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {widgetLibraryItems.map((item) => (
                              <SelectItem key={item.type} value={item.type}>
                                {item.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-foreground">数据表</span>
                        <Select
                          value={widgetDraft.dataset}
                          onValueChange={(value) =>
                            updateWidgetDraft((current) =>
                              normalizeWidgetDraft(
                                {
                                  ...current,
                                  dataset: value,
                                  dimension: "",
                                  seriesField: "",
                                  dateField: "",
                                  sortField: "",
                                  metrics: current.metrics.map((metric) => ({ ...metric, field: "" })),
                                },
                                meta,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(meta?.datasets ?? {}).map(([key, dataset]) => (
                              <SelectItem key={key} value={key}>
                                {normalizeText(dataset.label, key)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      {supportsDimensions(widgetDraft.widgetType) ? (
                        <label className="space-y-2">
                          <span className="text-sm font-medium text-foreground">横轴维度</span>
                          <Select
                            value={widgetDraft.dimension || "__none__"}
                            onValueChange={(value) =>
                              updateWidgetDraft((current) => ({
                                ...current,
                                dimension: value === "__none__" ? "" : value,
                                sortField: current.sortField === current.dimension ? value : current.sortField,
                              }))
                            }
                          >
                            <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">暂不选择</SelectItem>
                              {currentDimensionOptions.map((field) => (
                                <SelectItem key={field} value={field}>
                                  {fieldLabel(meta, widgetDraft.dataset, field)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                      ) : null}
                    </div>

                    {supportsSeries(widgetDraft.widgetType) ? (
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-foreground">系列拆分字段</span>
                        <Select
                          value={widgetDraft.seriesField || "__none__"}
                          onValueChange={(value) =>
                            updateWidgetDraft((current) => ({ ...current, seriesField: value === "__none__" ? "" : value }))
                          }
                        >
                          <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">不拆分系列</SelectItem>
                            {currentDimensionOptions.map((field) => (
                              <SelectItem key={field} value={field}>
                                {fieldLabel(meta, widgetDraft.dataset, field)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                    ) : null}

                    {supportsMetrics(widgetDraft.widgetType) ? (
                      <Card className="rounded-[28px] border border-border/80 bg-muted/20 shadow-none">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">纵轴指标</CardTitle>
                          <CardDescription>一个图表可配置多个字段值，叠加展示更适合对比趋势或实际/退货关系。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {widgetDraft.metrics.map((metric, index) => (
                            <div key={`${widgetDraft.id}-${index}`} className="rounded-[24px] border border-border/80 bg-white px-4 py-4">
                              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr_1fr_auto]">
                                <label className="space-y-2">
                                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">字段值</span>
                                  <Select
                                    value={metric.field || "__none__"}
                                    onValueChange={(value) =>
                                      updateWidgetDraft((current) => ({
                                        ...current,
                                        metrics: current.metrics.map((currentMetric, metricIndex) =>
                                          metricIndex === index ? { ...currentMetric, field: value === "__none__" ? "" : value } : currentMetric,
                                        ),
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">请选择</SelectItem>
                                      {currentMetricOptions.map((field) => (
                                        <SelectItem key={field} value={field}>
                                          {fieldLabel(meta, widgetDraft.dataset, field)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </label>
                                <label className="space-y-2">
                                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">统计方式</span>
                                  <Select
                                    value={metric.agg}
                                    onValueChange={(value) =>
                                      updateWidgetDraft((current) => ({
                                        ...current,
                                        metrics: current.metrics.map((currentMetric, metricIndex) =>
                                          metricIndex === index ? { ...currentMetric, agg: value } : currentMetric,
                                        ),
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {aggregationOptions.map((option) => (
                                        <SelectItem key={option.key} value={option.key}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </label>
                                <label className="space-y-2">
                                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">显示名称</span>
                                  <Input
                                    value={metric.label}
                                    onChange={(event) =>
                                      updateWidgetDraft((current) => ({
                                        ...current,
                                        metrics: current.metrics.map((currentMetric, metricIndex) =>
                                          metricIndex === index ? { ...currentMetric, label: event.target.value } : currentMetric,
                                        ),
                                      }))
                                    }
                                    className="h-11 rounded-2xl border-border/80 bg-white"
                                    placeholder="例如：实际销量"
                                  />
                                </label>
                                <div className="flex items-end">
                                  <Button
                                    variant="outline"
                                    className="h-11 rounded-full border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                                    onClick={() => removeMetricDraft(index)}
                                    disabled={widgetDraft.metrics.length <= 1}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            className="rounded-full border-border/80 bg-white"
                            onClick={addMetricDraft}
                            disabled={widgetDraft.metrics.length >= maxMetricCount(widgetDraft.widgetType)}
                          >
                            <Plus className="size-4" />
                            添加字段
                          </Button>
                        </CardContent>
                      </Card>
                    ) : null}

                    {supportsChartPalette(widgetDraft.widgetType) ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-foreground">颜色主题</div>
                          <div className="text-sm text-muted-foreground">图表组件默认使用彩色色盘，其余页面仍保持黑白灰主调。</div>
                        </div>
                        <PalettePicker
                          value={resolveChartPaletteKey(widgetDraft.chartPalette)}
                          onChange={(value) => updateWidgetDraft((current) => ({ ...current, chartPalette: value }))}
                        />
                      </div>
                    ) : null}

                    {widgetDraft.widgetType === "text" ? (
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-foreground">文本内容</span>
                        <Textarea
                          value={widgetDraft.textContent}
                          onChange={(event) => updateWidgetDraft((current) => ({ ...current, textContent: event.target.value }))}
                          className="min-h-[160px] rounded-[24px] border-border/80 bg-white"
                          placeholder="输入文本组件内容，例如经营摘要、分析说明或补充说明。"
                        />
                      </label>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="advanced" className="space-y-6">
                    <Card className="rounded-[28px] border border-border/80 bg-muted/20 shadow-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">布局与尺寸</CardTitle>
                        <CardDescription>通过宽度和高度控制图表在画布中的占比，后续可继续补拖拽编排。</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="space-y-3">
                          <div className="text-sm font-medium text-foreground">宽度</div>
                          <div className="grid gap-3 sm:grid-cols-4">
                            {LAYOUT_WIDTH_OPTIONS.map((option) => {
                              const active = widgetDraft.layoutWidth === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => updateWidgetDraft((current) => ({ ...current, layoutWidth: option.value }))}
                                  className={cn(
                                    "rounded-[20px] border px-4 py-3 text-sm font-medium transition-all",
                                    active ? "border-sky-300 bg-sky-50 text-sky-700 ring-2 ring-sky-100" : "border-border/80 bg-white text-foreground hover:border-slate-300",
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="text-sm font-medium text-foreground">高度</div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            {LAYOUT_HEIGHT_OPTIONS.map((option) => {
                              const active = widgetDraft.layoutHeight === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => updateWidgetDraft((current) => ({ ...current, layoutHeight: option.value }))}
                                  className={cn(
                                    "rounded-[20px] border px-4 py-3 text-sm font-medium transition-all",
                                    active ? "border-sky-300 bg-sky-50 text-sky-700 ring-2 ring-sky-100" : "border-border/80 bg-white text-foreground hover:border-slate-300",
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="rounded-[22px] border border-border/80 bg-white px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">跨度</div>
                            <div className="mt-2 text-lg font-semibold text-foreground">{widgetDraft.layoutWidth} 列</div>
                          </div>
                          <div className="rounded-[22px] border border-border/80 bg-white px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">高度行数</div>
                            <div className="mt-2 text-lg font-semibold text-foreground">{rowsFromHeight(widgetDraft.layoutHeight)} 行</div>
                          </div>
                          <div className="rounded-[22px] border border-border/80 bg-white px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">排序序号</div>
                            <div className="mt-2 text-lg font-semibold text-foreground">{widgetDraft.sortOrder || widgetDraft.id}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-[28px] border border-border/80 bg-muted/20 shadow-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">日期与排序</CardTitle>
                        <CardDescription>支持跟随页面业务日期、固定单日或一个日期区间，也可限制排行榜数量。</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="grid gap-5 xl:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-foreground">日期模式</span>
                            <Select value={widgetDraft.dateMode} onValueChange={(value) => updateWidgetDraft((current) => ({ ...current, dateMode: value }))}>
                              <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DATE_MODE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-foreground">日期字段</span>
                            <Select
                              value={widgetDraft.dateField || "__none__"}
                              onValueChange={(value) => updateWidgetDraft((current) => ({ ...current, dateField: value === "__none__" ? "" : value }))}
                            >
                              <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">默认日期字段</SelectItem>
                                {currentDateOptions.map((field) => (
                                  <SelectItem key={field} value={field}>
                                    {fieldLabel(meta, widgetDraft.dataset, field)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                        </div>

                        {widgetDraft.dateMode === "fixed_date" ? (
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-foreground">固定日期</span>
                            <Input
                              type="date"
                              value={widgetDraft.dateValue}
                              onChange={(event) => updateWidgetDraft((current) => ({ ...current, dateValue: event.target.value }))}
                              className="h-11 rounded-2xl border-border/80 bg-white"
                            />
                          </label>
                        ) : null}

                        {widgetDraft.dateMode === "date_range" ? (
                          <div className="grid gap-5 xl:grid-cols-2">
                            <label className="space-y-2">
                              <span className="text-sm font-medium text-foreground">开始日期</span>
                              <Input
                                type="date"
                                value={widgetDraft.startDate}
                                onChange={(event) => updateWidgetDraft((current) => ({ ...current, startDate: event.target.value }))}
                                className="h-11 rounded-2xl border-border/80 bg-white"
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="text-sm font-medium text-foreground">结束日期</span>
                              <Input
                                type="date"
                                value={widgetDraft.endDate}
                                onChange={(event) => updateWidgetDraft((current) => ({ ...current, endDate: event.target.value }))}
                                className="h-11 rounded-2xl border-border/80 bg-white"
                              />
                            </label>
                          </div>
                        ) : null}

                        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr_0.6fr]">
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-foreground">排序字段</span>
                            <Select
                              value={widgetDraft.sortField || "__none__"}
                              onValueChange={(value) => updateWidgetDraft((current) => ({ ...current, sortField: value === "__none__" ? "" : value }))}
                            >
                              <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">不排序</SelectItem>
                                {sortOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-foreground">排序方向</span>
                            <Select value={widgetDraft.sortDirection} onValueChange={(value) => updateWidgetDraft((current) => ({ ...current, sortDirection: value }))}>
                              <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="desc">降序</SelectItem>
                                <SelectItem value="asc">升序</SelectItem>
                              </SelectContent>
                            </Select>
                          </label>
                          {supportsLimit(widgetDraft.widgetType) ? (
                            <label className="space-y-2">
                              <span className="text-sm font-medium text-foreground">结果数量</span>
                              <Input
                                inputMode="numeric"
                                value={widgetDraft.limit || ""}
                                onChange={(event) =>
                                  updateWidgetDraft((current) => ({
                                    ...current,
                                    limit: parsePositiveNumber(event.target.value, current.limit),
                                  }))
                                }
                                className="h-11 rounded-2xl border-border/80 bg-white"
                              />
                            </label>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="analysis" className="space-y-6">
                    <Card className="rounded-[28px] border border-border/80 bg-muted/20 shadow-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">分析摘要</CardTitle>
                        <CardDescription>适合沉淀图表口径、补充解释和需要用户关注的异常信号。</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <label className="space-y-2">
                          <span className="text-sm font-medium text-foreground">分析内容</span>
                          <Textarea
                            value={widgetDraft.analysisText}
                            onChange={(event) => updateWidgetDraft((current) => ({ ...current, analysisText: event.target.value }))}
                            className="min-h-[180px] rounded-[24px] border-border/80 bg-white"
                            placeholder="例如：本周退货率在 3 月 26 日后明显抬升，建议重点核查渠道和在途拦截差异。"
                          />
                        </label>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="rounded-[22px] border border-border/80 bg-white px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">数据记录</div>
                            <div className="mt-2 text-2xl font-semibold text-foreground">{selectedItem?.rows.length ?? 0}</div>
                          </div>
                          <div className="rounded-[22px] border border-border/80 bg-white px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">系列分组</div>
                            <div className="mt-2 text-2xl font-semibold text-foreground">{selectedItem?.series_groups.length ?? 0}</div>
                          </div>
                          <div className="rounded-[22px] border border-border/80 bg-white px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">应用日期</div>
                            <div className="mt-2 text-base font-semibold text-foreground">
                              {selectedItem?.applied_target_date ? formatDate(selectedItem.applied_target_date) : formatDate(selectedDate)}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-muted-foreground">
                          当前组件：<span className="font-medium text-slate-900">{widgetDraft.title}</span>
                          <br />
                          数据表：<span className="font-medium text-slate-900">{normalizeText(widgetDraft.dataset, "--")}</span>
                          <br />
                          当前类型：<span className="font-medium text-slate-900">{widgetTypeLabel(meta, widgetDraft.widgetType)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </ScrollArea>

              <SheetFooter className="border-t border-border/70 px-6 py-4">
                <div className="flex w-full flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="rounded-full border-border/80 bg-white" onClick={() => void handleDuplicateWidget(widgetDraft.id)}>
                      <Copy className="size-4" />
                      复制
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                      onClick={() => void handleDeleteWidget(widgetDraft.id)}
                    >
                      <Trash2 className="size-4" />
                      删除
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="rounded-full border-border/80 bg-white" onClick={() => setSelectedWidgetId(null)}>
                      关闭
                    </Button>
                    <Button className="rounded-full bg-sky-500 text-white hover:bg-sky-600" onClick={() => void handleSaveWidget()} disabled={savingWidget}>
                      <Save className="size-4" />
                      保存图表
                    </Button>
                  </div>
                </div>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
