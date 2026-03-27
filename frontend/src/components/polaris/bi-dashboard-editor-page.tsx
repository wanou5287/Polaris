"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookCheck,
  ChevronLeft,
  Copy,
  LayoutDashboard,
  PencilLine,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  DashboardCanvas,
  buildRuntimeHref,
  getDefaultBusinessDate,
  LoadingState,
  normalizeText,
  requestDashboardMeta,
  requestDashboardViewDetail,
  requestDashboardViews,
  requestDashboardWidgetData,
  viewDescription,
  viewTitle,
} from "@/components/polaris/bi-dashboard-page";
import { TransitionLink } from "@/components/polaris/transition-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BI_DASHBOARD_CHART_PALETTES,
  DEFAULT_CHART_PALETTE_KEY,
  getChartPalette,
  resolveChartPaletteKey,
  supportsChartPalette,
} from "@/lib/bi-dashboard-chart-palettes";
import { apiFetch, cn, formatDate, formatDateTime } from "@/lib/polaris-client";
import type {
  BiDashboardMetaField,
  BiDashboardMetaResponse,
  BiDashboardViewDetail,
  BiDashboardViewSummary,
  BiDashboardViewsResponse,
  BiDashboardWidget,
  BiDashboardWidgetDataResponse,
} from "@/lib/polaris-types";

const AGGREGATION_FALLBACK = [
  { key: "sum", label: "求和" },
  { key: "avg", label: "平均值" },
  { key: "max", label: "最大值" },
  { key: "min", label: "最小值" },
  { key: "median", label: "中位数" },
  { key: "count", label: "计数" },
];

const DATE_MODE_OPTIONS = [
  { key: "follow_page", label: "跟随页面日期" },
  { key: "single", label: "固定单日" },
  { key: "range", label: "日期区间" },
  { key: "all", label: "全部数据" },
];

const LAYOUT_SPAN_OPTIONS = [
  { key: "1", label: "单列卡片" },
  { key: "2", label: "跨列卡片" },
];

type FieldOption = {
  value: string;
  label: string;
};

type ViewDraft = {
  name: string;
  description: string;
};

type CreateViewDraft = ViewDraft;

type CreateWidgetDraft = {
  title: string;
  widgetType: string;
  dataset: string;
};

type WidgetDraft = {
  title: string;
  widgetType: string;
  dataset: string;
  chartPalette: string;
  dimensionPrimary: string;
  dimensionSecondary: string;
  seriesField: string;
  metricOneField: string;
  metricOneAgg: string;
  metricOneLabel: string;
  metricTwoField: string;
  metricTwoAgg: string;
  metricTwoLabel: string;
  sortField: string;
  sortDirection: string;
  limit: string;
  dateMode: string;
  date: string;
  startDate: string;
  endDate: string;
  textContent: string;
  analysisText: string;
  layoutWidth: string;
  layoutHeightRows: string;
  layoutSpan: string;
  layoutHeightKey: string;
};

const parsePositiveInt = (value: string | null) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const requestViews = () => apiFetch<BiDashboardViewsResponse>("/api/backend/views");
const requestCreateView = (payload: CreateViewDraft) =>
  apiFetch<{ id: number }>("/api/backend/views", {
    method: "POST",
    body: JSON.stringify(payload),
  });
const requestUpdateView = (viewId: number, payload: ViewDraft) =>
  apiFetch(`/api/backend/views/${viewId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
const requestCreateWidget = (
  viewId: number,
  payload: { title: string; widget_type: string; dataset: string },
) =>
  apiFetch<{ id: number }>(`/api/backend/views/${viewId}/widgets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
const requestUpdateWidget = (widgetId: number, payload: Record<string, unknown>) =>
  apiFetch(`/api/backend/widgets/${widgetId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
const requestDuplicateWidget = (widgetId: number) =>
  apiFetch<{ id: number }>(`/api/backend/widgets/${widgetId}/duplicate`, {
    method: "POST",
  });
const requestDeleteWidget = (widgetId: number) =>
  apiFetch(`/api/backend/widgets/${widgetId}`, {
    method: "DELETE",
  });

function resolveEditorDefaultViewId(
  views: BiDashboardViewSummary[],
  preferred: number | null,
) {
  if (!views.length) {
    return null;
  }
  if (preferred && views.some((view) => view.id === preferred)) {
    return preferred;
  }
  return views[0]?.id ?? null;
}

function clampInt(value: string, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function supportsSeriesField(widgetType: string) {
  return ["bar", "stacked_bar", "stacked_hbar", "line"].includes(widgetType);
}

function supportsDimensions(widgetType: string) {
  return !["metric", "text"].includes(widgetType);
}

function supportsMetrics(widgetType: string) {
  return widgetType !== "text";
}

function supportsSecondMetric(widgetType: string) {
  return ["bar", "stacked_bar", "stacked_hbar", "line", "table"].includes(
    widgetType,
  );
}

function supportsTextContent(widgetType: string) {
  return widgetType === "text";
}

function supportsLimit(widgetType: string) {
  return !["metric", "text"].includes(widgetType);
}

function datasetFieldEntries(
  meta: BiDashboardMetaResponse | null,
  dataset: string,
) {
  return Object.entries(meta?.dataset_fields?.[dataset] ?? {});
}

function fieldOptions(
  meta: BiDashboardMetaResponse | null,
  dataset: string,
  predicate?: (field: BiDashboardMetaField) => boolean,
): FieldOption[] {
  return datasetFieldEntries(meta, dataset)
    .filter(([, field]) => (predicate ? predicate(field) : true))
    .map(([fieldKey, field]) => ({
      value: fieldKey,
      label: normalizeText(field.label, fieldKey),
    }));
}

function metricLabel(
  meta: BiDashboardMetaResponse | null,
  dataset: string,
  field: string,
  agg: string,
) {
  const fieldMap = meta?.dataset_fields?.[dataset] ?? {};
  const aggregationOptions = meta?.aggregation_options?.length
    ? meta.aggregation_options
    : AGGREGATION_FALLBACK;
  const aggLabel =
    aggregationOptions.find((item) => item.key === agg)?.label ?? agg;
  if (!field) {
    return aggLabel;
  }
  const fieldLabel = normalizeText(fieldMap[field]?.label, field);
  return `${fieldLabel}${aggLabel}`;
}

function nextWidgetLayout(widgets: BiDashboardWidget[]) {
  const nextY = widgets.reduce(
    (maxValue, widget) =>
      Math.max(maxValue, widget.layout.y + widget.layout.h),
    0,
  );
  return {
    x: 0,
    y: nextY,
    w: 12,
    h: 5,
    span: 1,
    height: "normal",
  };
}

function sanitizeWidgetDraft(
  draft: WidgetDraft,
  meta: BiDashboardMetaResponse | null,
) {
  const groupable = fieldOptions(
    meta,
    draft.dataset,
    (field) => Boolean(field.groupable),
  );
  const numeric = fieldOptions(
    meta,
    draft.dataset,
    (field) => Boolean(field.numeric) || field.type === "number",
  );
  const sortable = fieldOptions(
    meta,
    draft.dataset,
    (field) => Boolean(field.sortable),
  );

  const dimensionPrimary =
    supportsDimensions(draft.widgetType) &&
    groupable.some((item) => item.value === draft.dimensionPrimary)
      ? draft.dimensionPrimary
      : supportsDimensions(draft.widgetType)
        ? (groupable[0]?.value ?? "")
        : "";

  const dimensionSecondary =
    supportsDimensions(draft.widgetType) &&
    draft.dimensionSecondary &&
    draft.dimensionSecondary !== dimensionPrimary &&
    groupable.some((item) => item.value === draft.dimensionSecondary)
      ? draft.dimensionSecondary
      : "";

  const metricOneField =
    supportsMetrics(draft.widgetType) &&
    numeric.some((item) => item.value === draft.metricOneField)
      ? draft.metricOneField
      : supportsMetrics(draft.widgetType)
        ? (numeric[0]?.value ?? "")
        : "";

  const metricTwoField =
    supportsSecondMetric(draft.widgetType) &&
    draft.metricTwoField &&
    draft.metricTwoField !== metricOneField &&
    numeric.some((item) => item.value === draft.metricTwoField)
      ? draft.metricTwoField
      : "";

  const seriesOptions = groupable.filter(
    (item) =>
      item.value !== dimensionPrimary && item.value !== dimensionSecondary,
  );
  const seriesField =
    supportsSeriesField(draft.widgetType) &&
    seriesOptions.some((item) => item.value === draft.seriesField)
      ? draft.seriesField
      : "";

  const sortOptions = [
    { value: "metric_0", label: "主指标" },
    ...(metricTwoField ? [{ value: "metric_1", label: "第二指标" }] : []),
    ...sortable,
  ];
  const sortField = sortOptions.some((item) => item.value === draft.sortField)
    ? draft.sortField
    : supportsMetrics(draft.widgetType)
      ? "metric_0"
      : "";
  const chartPalette = supportsChartPalette(draft.widgetType)
    ? resolveChartPaletteKey(draft.chartPalette)
    : DEFAULT_CHART_PALETTE_KEY;

  return {
    ...draft,
    chartPalette,
    dimensionPrimary,
    dimensionSecondary,
    seriesField,
    metricOneField,
    metricTwoField,
    metricOneAgg: draft.metricOneAgg || "sum",
    metricTwoAgg: draft.metricTwoAgg || "sum",
    metricOneLabel:
      draft.metricOneLabel ||
      (metricOneField
        ? metricLabel(meta, draft.dataset, metricOneField, draft.metricOneAgg || "sum")
        : ""),
    metricTwoLabel:
      draft.metricTwoLabel ||
      (metricTwoField
        ? metricLabel(meta, draft.dataset, metricTwoField, draft.metricTwoAgg || "sum")
        : ""),
    sortField,
    sortDirection: draft.sortDirection === "asc" ? "asc" : "desc",
    layoutSpan: draft.layoutSpan === "2" ? "2" : "1",
    layoutHeightKey:
      meta?.layout_heights?.includes(draft.layoutHeightKey) || !meta?.layout_heights
        ? draft.layoutHeightKey || "normal"
        : "normal",
  };
}

function buildWidgetDraft(
  widget: BiDashboardWidget,
  meta: BiDashboardMetaResponse | null,
): WidgetDraft {
  const firstMetric = widget.config.metrics[0];
  const secondMetric = widget.config.metrics[1];
  const firstSort = widget.config.sort[0];

  return sanitizeWidgetDraft(
    {
      title: normalizeText(widget.title, `${widget.widget_type} 组件`),
      widgetType: widget.widget_type,
      dataset: widget.dataset,
      chartPalette: widget.config.chart_palette ?? DEFAULT_CHART_PALETTE_KEY,
      dimensionPrimary: widget.config.dimensions[0] ?? "",
      dimensionSecondary: widget.config.dimensions[1] ?? "",
      seriesField: widget.config.series_field ?? "",
      metricOneField: firstMetric?.field ?? "",
      metricOneAgg: firstMetric?.agg ?? "sum",
      metricOneLabel:
        firstMetric?.label ??
        metricLabel(meta, widget.dataset, firstMetric?.field ?? "", firstMetric?.agg ?? "sum"),
      metricTwoField: secondMetric?.field ?? "",
      metricTwoAgg: secondMetric?.agg ?? "sum",
      metricTwoLabel:
        secondMetric?.label ??
        metricLabel(meta, widget.dataset, secondMetric?.field ?? "", secondMetric?.agg ?? "sum"),
      sortField: firstSort?.field ?? "metric_0",
      sortDirection: firstSort?.direction ?? "desc",
      limit: String(widget.config.limit ?? 20),
      dateMode: widget.config.date_filter.mode ?? "follow_page",
      date: widget.config.date_filter.date ?? "",
      startDate: widget.config.date_filter.start_date ?? "",
      endDate: widget.config.date_filter.end_date ?? "",
      textContent: widget.config.text_content ?? "",
      analysisText: widget.analysis_text ?? "",
      layoutWidth: String(widget.layout.w ?? 12),
      layoutHeightRows: String(widget.layout.h ?? 5),
      layoutSpan: String(widget.layout.span ?? 1),
      layoutHeightKey: widget.layout.height ?? "normal",
    },
    meta,
  );
}

function buildWidgetPayload(
  baseWidget: BiDashboardWidget,
  draft: WidgetDraft,
  meta: BiDashboardMetaResponse | null,
) {
  const normalized = sanitizeWidgetDraft(draft, meta);
  const metrics = [];

  if (supportsMetrics(normalized.widgetType) && normalized.metricOneField) {
    metrics.push({
      field: normalized.metricOneField,
      agg: normalized.metricOneAgg || "sum",
      label:
        normalized.metricOneLabel ||
        metricLabel(
          meta,
          normalized.dataset,
          normalized.metricOneField,
          normalized.metricOneAgg || "sum",
        ),
    });
  }
  if (supportsSecondMetric(normalized.widgetType) && normalized.metricTwoField) {
    metrics.push({
      field: normalized.metricTwoField,
      agg: normalized.metricTwoAgg || "sum",
      label:
        normalized.metricTwoLabel ||
        metricLabel(
          meta,
          normalized.dataset,
          normalized.metricTwoField,
          normalized.metricTwoAgg || "sum",
        ),
    });
  }

  return {
    title:
      normalized.title.trim() ||
      normalizeText(
        meta?.widget_type_map?.[normalized.widgetType],
        normalized.widgetType,
      ),
    widget_type: normalized.widgetType,
    dataset: normalized.dataset,
    config: {
      dataset: normalized.dataset,
      chart_palette: supportsChartPalette(normalized.widgetType)
        ? normalized.chartPalette
        : undefined,
      dimensions: supportsDimensions(normalized.widgetType)
        ? [normalized.dimensionPrimary, normalized.dimensionSecondary].filter(Boolean)
        : [],
      series_field: supportsSeriesField(normalized.widgetType)
        ? normalized.seriesField
        : "",
      metrics,
      date_filter:
        normalized.dateMode === "all"
          ? { mode: "all" }
          : normalized.dateMode === "single"
            ? { mode: "single", date: normalized.date }
            : normalized.dateMode === "range"
              ? {
                  mode: "range",
                  start_date: normalized.startDate,
                  end_date: normalized.endDate,
                }
              : { mode: "follow_page" },
      filters: baseWidget.config.filters ?? [],
      sort: normalized.sortField
        ? [{ field: normalized.sortField, direction: normalized.sortDirection }]
        : [],
      limit: supportsLimit(normalized.widgetType)
        ? clampInt(normalized.limit, 1, 500, baseWidget.config.limit ?? 20)
        : 1,
      text_content: supportsTextContent(normalized.widgetType)
        ? normalized.textContent
        : "",
    },
    layout: {
      ...baseWidget.layout,
      w: clampInt(normalized.layoutWidth, 4, 24, baseWidget.layout.w ?? 12),
      h: clampInt(
        normalized.layoutHeightRows,
        3,
        12,
        baseWidget.layout.h ?? 5,
      ),
      span: normalized.layoutSpan === "2" ? 2 : 1,
      height: normalized.layoutHeightKey || "normal",
    },
    sort_order: baseWidget.sort_order,
    analysis_text: normalized.analysisText,
  };
}

function EditorField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint ? (
          <div className="text-xs leading-5 text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      {children}
    </label>
  );
}

type WidgetSummaryCardProps = {
  widget: BiDashboardWidget;
  selected: boolean;
  onSelect: () => void;
};

function WidgetSummaryCard({
  widget,
  selected,
  onSelect,
}: WidgetSummaryCardProps) {
  const metricNames = widget.config.metrics.map((metric) =>
    normalizeText(metric.label, metric.field),
  );
  const dimensionNames = widget.config.dimensions.map((dimension) =>
    normalizeText(dimension, dimension),
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-[22px] border px-4 py-4 text-left transition-all",
        selected
          ? "border-sky-300 bg-sky-50 shadow-[0_18px_35px_rgba(56,189,248,0.12)]"
          : "border-border/80 bg-white hover:border-slate-300",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-base font-semibold text-foreground">
            {normalizeText(widget.title, `${widget.widget_type} 组件`)}
          </div>
          <div className="text-xs text-muted-foreground">
            {normalizeText(widget.widget_type, widget.widget_type)} ·{" "}
            {normalizeText(widget.dataset, widget.dataset)}
          </div>
        </div>
        <Badge
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] shadow-none",
            selected
              ? "border-sky-200 bg-white text-sky-700"
              : "border-border/80 bg-muted/40 text-muted-foreground",
          )}
        >
          {widget.id}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
        <div>指标：{metricNames.length ? metricNames.join(" / ") : "未配置"}</div>
        <div>维度：{dimensionNames.length ? dimensionNames.join(" / ") : "无维度"}</div>
      </div>
    </button>
  );
}

export function BiDashboardEditorPage() {
  const searchParams = useSearchParams();
  const preferredViewId = parsePositiveInt(searchParams.get("view_id"));
  const preferredWidgetId = parsePositiveInt(searchParams.get("widget_id"));

  const [selectedDate, setSelectedDate] = useState(
    searchParams.get("biz_date") ?? getDefaultBusinessDate(),
  );
  const [meta, setMeta] = useState<BiDashboardMetaResponse | null>(null);
  const [views, setViews] = useState<BiDashboardViewSummary[]>([]);
  const [activeViewId, setActiveViewId] = useState<number | null>(
    preferredViewId,
  );
  const [detail, setDetail] = useState<BiDashboardViewDetail | null>(null);
  const [data, setData] = useState<BiDashboardWidgetDataResponse | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<number | null>(
    preferredWidgetId,
  );
  const [pendingWidgetId, setPendingWidgetId] = useState<number | null>(
    preferredWidgetId,
  );
  const [viewDraft, setViewDraft] = useState<ViewDraft>({
    name: "",
    description: "",
  });
  const [widgetDraft, setWidgetDraft] = useState<WidgetDraft | null>(null);
  const [createViewOpen, setCreateViewOpen] = useState(false);
  const [createWidgetOpen, setCreateWidgetOpen] = useState(false);
  const [createViewDraft, setCreateViewDraft] = useState<CreateViewDraft>({
    name: "",
    description: "",
  });
  const [createWidgetDraft, setCreateWidgetDraft] = useState<CreateWidgetDraft>({
    title: "",
    widgetType: "bar",
    dataset: "sales_cleaning",
  });
  const [loading, setLoading] = useState(true);
  const [viewLoading, setViewLoading] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [savingWidget, setSavingWidget] = useState(false);
  const [creatingView, setCreatingView] = useState(false);
  const [creatingWidget, setCreatingWidget] = useState(false);
  const [duplicatingWidget, setDuplicatingWidget] = useState(false);
  const [deletingWidget, setDeletingWidget] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadViews = useCallback(async () => {
    const response = await requestViews();
    setViews(response.views);
    return response.views;
  }, []);

  const loadActiveView = useCallback(async (viewId: number, bizDate: string) => {
    setViewLoading(true);
    setError(null);
    try {
      const [detailResponse, dataResponse] = await Promise.all([
        requestDashboardViewDetail(viewId),
        requestDashboardWidgetData(viewId, bizDate),
      ]);
      setDetail(detailResponse);
      setData(dataResponse);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "当前看板编辑数据加载失败。",
      );
    } finally {
      setViewLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      try {
        const [metaResponse, viewsResponse] = await Promise.all([
          requestDashboardMeta(),
          requestDashboardViews(),
        ]);
        if (cancelled) {
          return;
        }
        setMeta(metaResponse);
        setViews(viewsResponse.views);
        setActiveViewId((current) =>
          current ?? resolveEditorDefaultViewId(viewsResponse.views, preferredViewId),
        );
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "看板编辑页加载失败。",
          );
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
  }, [preferredViewId]);

  useEffect(() => {
    if (!views.length) {
      setActiveViewId(null);
      return;
    }
    setActiveViewId((current) =>
      current && views.some((view) => view.id === current)
        ? current
        : resolveEditorDefaultViewId(views, preferredViewId),
    );
  }, [preferredViewId, views]);

  useEffect(() => {
    if (!activeViewId) {
      setDetail(null);
      setData(null);
      return;
    }
    void loadActiveView(activeViewId, selectedDate);
  }, [activeViewId, loadActiveView, selectedDate]);

  const currentDetail =
    detail?.id === activeViewId
      ? detail
      : views.find((view) => view.id === activeViewId)
        ? ({
            ...views.find((view) => view.id === activeViewId)!,
            widgets: [],
          } as BiDashboardViewDetail)
        : null;
  const activeView = views.find((view) => view.id === activeViewId) ?? null;
  const widgets = useMemo(
    () =>
      [...(currentDetail?.widgets ?? [])].sort(
        (left, right) =>
          left.layout.y - right.layout.y ||
          left.layout.x - right.layout.x ||
          left.sort_order - right.sort_order,
      ),
    [currentDetail],
  );
  const itemMap = useMemo(
    () => new Map((data?.items ?? []).map((item) => [item.widget_id, item])),
    [data],
  );

  useEffect(() => {
    if (!currentDetail) {
      setViewDraft({ name: "", description: "" });
      return;
    }
    setViewDraft({
      name: currentDetail.name ?? "",
      description: currentDetail.description ?? "",
    });
  }, [currentDetail]);

  useEffect(() => {
    if (!widgets.length) {
      setSelectedWidgetId(null);
      return;
    }
    setSelectedWidgetId((current) => {
      const targetId =
        pendingWidgetId && widgets.some((widget) => widget.id === pendingWidgetId)
          ? pendingWidgetId
          : current && widgets.some((widget) => widget.id === current)
            ? current
            : preferredWidgetId &&
                widgets.some((widget) => widget.id === preferredWidgetId)
              ? preferredWidgetId
              : widgets[0]?.id ?? null;
      return targetId;
    });
  }, [pendingWidgetId, preferredWidgetId, widgets]);

  useEffect(() => {
    if (
      pendingWidgetId &&
      widgets.some((widget) => widget.id === pendingWidgetId)
    ) {
      setPendingWidgetId(null);
    }
  }, [pendingWidgetId, widgets]);

  const selectedWidget =
    widgets.find((widget) => widget.id === selectedWidgetId) ?? null;

  useEffect(() => {
    if (!selectedWidget) {
      setWidgetDraft(null);
      return;
    }
    setWidgetDraft(buildWidgetDraft(selectedWidget, meta));
  }, [meta, selectedWidget]);

  const appliedDate =
    (data?.items ?? []).find((item) => item.applied_target_date)
      ?.applied_target_date ??
    data?.biz_date ??
    selectedDate;

  const datasetOptions =
    meta?.datasets.map((dataset) => ({
      value: dataset.key,
      label: normalizeText(dataset.label, dataset.key),
    })) ?? [];
  const widgetTypeOptions =
    meta?.widget_types.map((widgetType) => ({
      value: widgetType.key,
      label: normalizeText(widgetType.label, widgetType.key),
    })) ?? [];
  const aggregationOptions =
    meta?.aggregation_options?.map((item) => ({
      value: item.key,
      label: normalizeText(item.label, item.key),
    })) ??
    AGGREGATION_FALLBACK.map((item) => ({
      value: item.key,
      label: item.label,
    }));
  const chartPaletteOptions = BI_DASHBOARD_CHART_PALETTES.map((palette) => ({
    value: palette.key,
    label: palette.label,
    description: palette.description,
  }));

  const widgetGroupableOptions = widgetDraft
    ? fieldOptions(meta, widgetDraft.dataset, (field) => Boolean(field.groupable))
    : [];
  const widgetNumericOptions = widgetDraft
    ? fieldOptions(
        meta,
        widgetDraft.dataset,
        (field) => Boolean(field.numeric) || field.type === "number",
      )
    : [];
  const widgetSortableOptions = widgetDraft
    ? fieldOptions(meta, widgetDraft.dataset, (field) => Boolean(field.sortable))
    : [];
  const seriesOptions = widgetGroupableOptions.filter(
    (item) =>
      item.value !== widgetDraft?.dimensionPrimary &&
      item.value !== widgetDraft?.dimensionSecondary,
  );
  const sortOptions = [
    { value: "metric_0", label: "主指标" },
    ...(widgetDraft?.metricTwoField
      ? [{ value: "metric_1", label: "第二指标" }]
      : []),
    ...widgetSortableOptions,
  ];

  const selectedChartPalette = getChartPalette(widgetDraft?.chartPalette);

  const openCreateViewDialog = () => {
    setCreateViewDraft({
      name: "",
      description: "",
    });
    setCreateViewOpen(true);
  };

  const openCreateWidgetDialog = () => {
    const defaultDataset =
      selectedWidget?.dataset ??
      currentDetail?.widgets[0]?.dataset ??
      datasetOptions[0]?.value ??
      "sales_cleaning";
    const defaultWidgetType = widgetTypeOptions[0]?.value ?? "bar";

    setCreateWidgetDraft({
      title: "",
      widgetType: defaultWidgetType,
      dataset: defaultDataset,
    });
    setCreateWidgetOpen(true);
  };

  const updateWidgetDraft = (patch: Partial<WidgetDraft>) => {
    setWidgetDraft((current) =>
      current ? sanitizeWidgetDraft({ ...current, ...patch }, meta) : current,
    );
  };

  async function handleSaveView() {
    if (!activeViewId) {
      return;
    }
    if (!viewDraft.name.trim()) {
      toast.error("请先填写看板名称。");
      return;
    }

    setSavingView(true);
    try {
      await requestUpdateView(activeViewId, {
        name: viewDraft.name.trim(),
        description: viewDraft.description.trim(),
      });
      await loadViews();
      await loadActiveView(activeViewId, selectedDate);
      toast.success("看板信息已保存。");
    } catch (nextError) {
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "看板保存失败，请稍后重试。",
      );
    } finally {
      setSavingView(false);
    }
  }

  async function handleCreateView() {
    if (!createViewDraft.name.trim()) {
      toast.error("请先填写新看板名称。");
      return;
    }

    setCreatingView(true);
    try {
      const created = await requestCreateView({
        name: createViewDraft.name.trim(),
        description: createViewDraft.description.trim(),
      });
      const nextViews = await loadViews();
      setActiveViewId(created.id);
      setCreateViewOpen(false);
      setDetail(null);
      setData(null);
      if (nextViews.some((view) => view.id === created.id)) {
        toast.success("新看板已创建，现在可以继续添加图表。");
      }
    } catch (nextError) {
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "新增看板失败，请稍后重试。",
      );
    } finally {
      setCreatingView(false);
    }
  }

  async function handleCreateWidget() {
    if (!activeViewId) {
      toast.error("请先创建或选择一个看板。");
      return;
    }

    setCreatingWidget(true);
    try {
      const created = await requestCreateWidget(activeViewId, {
        title:
          createWidgetDraft.title.trim() ||
          normalizeText(
            meta?.widget_type_map?.[createWidgetDraft.widgetType],
            createWidgetDraft.widgetType,
          ),
        widget_type: createWidgetDraft.widgetType,
        dataset: createWidgetDraft.dataset,
      });

      await requestUpdateWidget(created.id, {
        title:
          createWidgetDraft.title.trim() ||
          normalizeText(
            meta?.widget_type_map?.[createWidgetDraft.widgetType],
            createWidgetDraft.widgetType,
          ),
        widget_type: createWidgetDraft.widgetType,
        dataset: createWidgetDraft.dataset,
        config: {
          dataset: createWidgetDraft.dataset,
          chart_palette: DEFAULT_CHART_PALETTE_KEY,
        },
        layout: nextWidgetLayout(widgets),
      });

      setPendingWidgetId(created.id);
      setCreateWidgetOpen(false);
      await loadViews();
      await loadActiveView(activeViewId, selectedDate);
      toast.success("图表组件已创建。");
    } catch (nextError) {
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "新增图表失败，请稍后重试。",
      );
    } finally {
      setCreatingWidget(false);
    }
  }

  async function handleSaveWidget() {
    if (!selectedWidget || !widgetDraft) {
      return;
    }
    if (!widgetDraft.title.trim()) {
      toast.error("请先填写图表标题。");
      return;
    }
    if (
      supportsMetrics(widgetDraft.widgetType) &&
      !supportsTextContent(widgetDraft.widgetType) &&
      !widgetDraft.metricOneField
    ) {
      toast.error("请至少选择一个指标字段。");
      return;
    }

    setSavingWidget(true);
    try {
      await requestUpdateWidget(
        selectedWidget.id,
        buildWidgetPayload(selectedWidget, widgetDraft, meta),
      );
      setPendingWidgetId(selectedWidget.id);
      await loadViews();
      await loadActiveView(selectedWidget.view_id, selectedDate);
      toast.success("图表配置已保存。");
    } catch (nextError) {
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "图表保存失败，请稍后重试。",
      );
    } finally {
      setSavingWidget(false);
    }
  }

  async function handleDuplicateWidget() {
    if (!selectedWidget) {
      return;
    }

    setDuplicatingWidget(true);
    try {
      const duplicated = await requestDuplicateWidget(selectedWidget.id);
      setPendingWidgetId(duplicated.id);
      await loadViews();
      await loadActiveView(selectedWidget.view_id, selectedDate);
      toast.success("图表已复制。");
    } catch (nextError) {
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "复制图表失败，请稍后重试。",
      );
    } finally {
      setDuplicatingWidget(false);
    }
  }

  async function handleDeleteWidget() {
    if (!selectedWidget) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm("确认删除当前图表吗？删除后不可恢复。")
    ) {
      return;
    }

    setDeletingWidget(true);
    try {
      await requestDeleteWidget(selectedWidget.id);
      setSelectedWidgetId(null);
      setPendingWidgetId(null);
      await loadViews();
      await loadActiveView(selectedWidget.view_id, selectedDate);
      toast.success("图表已删除。");
    } catch (nextError) {
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "删除图表失败，请稍后重试。",
      );
    } finally {
      setDeletingWidget(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (!activeView || !currentDetail) {
    return (
      <div className="surface-panel p-10">
        <Empty className="border-border/70">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PencilLine className="size-4" />
            </EmptyMedia>
            <EmptyTitle>当前还没有可编辑的 BI 看板</EmptyTitle>
            <EmptyDescription>
              {error || "先创建一个看板，再继续配置图表、指标与布局。"}
            </EmptyDescription>
          </EmptyHeader>
          <div className="flex flex-wrap justify-center gap-3">
            <Button className="rounded-full" onClick={openCreateViewDialog}>
              <Plus className="size-4" />
              新增看板
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <TransitionLink href="/governance/metrics">
                <ChevronLeft className="size-4" />
                返回 BI 看板
              </TransitionLink>
            </Button>
          </div>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface-panel px-5 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {views.map((view) => {
                const active = view.id === activeView.id;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveViewId(view.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",
                      active
                        ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_35px_rgba(15,23,42,0.16)]"
                        : "border-border/80 bg-white text-foreground hover:border-slate-300",
                    )}
                  >
                    {viewTitle(view)}
                    <Badge
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] shadow-none",
                        active
                          ? "border-white/20 bg-white/10 text-white"
                          : "border-border/80 bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {view.widget_count}
                    </Badge>
                  </button>
                );
              })}
              <Button
                variant="outline"
                className="h-10 rounded-full border-dashed border-slate-300 bg-white"
                onClick={openCreateViewDialog}
              >
                <Plus className="size-4" />
                新增看板
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm leading-6 text-muted-foreground">
              <span>{viewDescription(currentDetail)}</span>
              <span>最近更新 {formatDateTime(activeView.updated_at)}</span>
              <span>业务日期 {formatDate(appliedDate)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                业务日期
              </span>
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-11 min-w-[180px] rounded-2xl border-border/80 bg-white"
              />
            </label>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-full border-border/80 bg-white"
            >
              <TransitionLink href="/governance/metric-dictionary">
                <BookCheck className="size-4" />
                指标口径
              </TransitionLink>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-full border-border/80 bg-white"
            >
              <TransitionLink href={buildRuntimeHref(activeView.id, selectedDate)}>
                <ChevronLeft className="size-4" />
                返回看板
              </TransitionLink>
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="surface-panel p-10">
          <Empty className="border-border/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PencilLine className="size-4" />
              </EmptyMedia>
              <EmptyTitle>当前看板编辑数据暂时不可用</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <Card className="rounded-[28px] border-border/80 bg-white shadow-[var(--shadow-card)]">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <CardTitle className="text-xl font-semibold tracking-tight">
                    看板信息
                  </CardTitle>
                  <CardDescription>
                    这里直接编辑当前看板的标题和说明，保存后会立即同步到运行页。
                  </CardDescription>
                </div>
                <Button
                  className="rounded-full"
                  onClick={() => void handleSaveView()}
                  disabled={savingView}
                >
                  <Save className="size-4" />
                  {savingView ? "保存中..." : "保存看板"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditorField label="看板名称">
                <Input
                  value={viewDraft.name}
                  onChange={(event) =>
                    setViewDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="h-11 rounded-2xl border-border/80 bg-white"
                />
              </EditorField>
              <EditorField label="看板说明">
                <Textarea
                  value={viewDraft.description}
                  onChange={(event) =>
                    setViewDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="min-h-[120px] rounded-[22px] border-border/80 bg-white"
                />
              </EditorField>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[22px] border border-border/80 bg-muted/20 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    当前图表
                  </div>
                  <div className="mt-2 text-lg font-semibold text-foreground">
                    {widgets.length}
                  </div>
                </div>
                <div className="rounded-[22px] border border-border/80 bg-muted/20 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    更新时间
                  </div>
                  <div className="mt-2 text-lg font-semibold text-foreground">
                    {formatDateTime(activeView.updated_at)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 bg-white shadow-[var(--shadow-card)]">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <CardTitle className="text-xl font-semibold tracking-tight">
                    图表组件
                  </CardTitle>
                  <CardDescription>
                    新增组件后，右侧会立即开放配置表单；点击组件卡可切换当前编辑对象。
                  </CardDescription>
                </div>
                <Button className="rounded-full" onClick={openCreateWidgetDialog}>
                  <Plus className="size-4" />
                  新增图表
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {widgets.length ? (
                widgets.map((widget) => (
                  <WidgetSummaryCard
                    key={widget.id}
                    widget={widget}
                    selected={widget.id === selectedWidgetId}
                    onSelect={() => setSelectedWidgetId(widget.id)}
                  />
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                  当前看板还没有图表组件，先创建一个吧。
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-border/80 bg-white shadow-[var(--shadow-card)]">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <LayoutDashboard className="size-3.5" />
                    组件配置
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-tight">
                    {selectedWidget
                      ? normalizeText(
                          selectedWidget.title,
                          `${selectedWidget.widget_type} 组件`,
                        )
                      : "选择一个组件开始编辑"}
                  </CardTitle>
                  <CardDescription>
                    {selectedWidget
                      ? "这里可以直接修改图表类型、数据集、维度、指标和布局，保存后立即同步到看板。"
                      : "先从左侧选中一个图表，或者先新增图表组件。"}
                  </CardDescription>
                </div>
                {selectedWidget ? (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="rounded-full"
                      onClick={() => void handleSaveWidget()}
                      disabled={savingWidget}
                    >
                      <Save className="size-4" />
                      {savingWidget ? "保存中..." : "保存组件"}
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full border-border/80 bg-white"
                      onClick={() => void handleDuplicateWidget()}
                      disabled={duplicatingWidget}
                    >
                      <Copy className="size-4" />
                      {duplicatingWidget ? "复制中..." : "复制组件"}
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-full"
                      onClick={() => void handleDeleteWidget()}
                      disabled={deletingWidget}
                    >
                      <Trash2 className="size-4" />
                      {deletingWidget ? "删除中..." : "删除组件"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {selectedWidget && widgetDraft ? (
                <div className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <EditorField label="图表标题">
                      <Input
                        value={widgetDraft.title}
                        onChange={(event) =>
                          updateWidgetDraft({ title: event.target.value })
                        }
                        className="h-11 rounded-2xl border-border/80 bg-white"
                      />
                    </EditorField>
                    <EditorField label="图表类型">
                      <Select
                        value={widgetDraft.widgetType}
                        onValueChange={(value) =>
                          updateWidgetDraft({ widgetType: value })
                        }
                      >
                        <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                          <SelectValue placeholder="选择图表类型" />
                        </SelectTrigger>
                        <SelectContent>
                          {widgetTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </EditorField>
                    <EditorField label="数据集">
                      <Select
                        value={widgetDraft.dataset}
                        onValueChange={(value) =>
                          updateWidgetDraft({ dataset: value })
                        }
                      >
                        <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                          <SelectValue placeholder="选择数据集" />
                        </SelectTrigger>
                        <SelectContent>
                          {datasetOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </EditorField>
                    <EditorField label="图表解读">
                      <Input
                        value={widgetDraft.analysisText}
                        onChange={(event) =>
                          updateWidgetDraft({ analysisText: event.target.value })
                        }
                        className="h-11 rounded-2xl border-border/80 bg-white"
                        placeholder="写给业务看的图表说明"
                      />
                    </EditorField>
                  </div>

                  {supportsChartPalette(widgetDraft.widgetType) ? (
                    <Card className="rounded-[24px] border-border/80 bg-muted/15 shadow-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">图表色盘</CardTitle>
                        <CardDescription>
                          只影响当前图表组件的系列颜色，不会改变页面其余黑白灰界面样式。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
                        <EditorField label="色盘主题">
                          <Select
                            value={widgetDraft.chartPalette}
                            onValueChange={(value) =>
                              updateWidgetDraft({ chartPalette: value })
                            }
                          >
                            <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                              <SelectValue placeholder="选择图表色盘" />
                            </SelectTrigger>
                            <SelectContent>
                              {chartPaletteOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </EditorField>
                        <div className="rounded-[22px] border border-border/80 bg-white px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {selectedChartPalette.colors.map((color) => (
                              <span
                                key={color}
                                className="h-8 min-w-10 flex-1 rounded-xl border border-white/70 shadow-sm"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <p className="mt-3 text-sm font-medium text-foreground">
                            {selectedChartPalette.label}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {selectedChartPalette.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {supportsDimensions(widgetDraft.widgetType) ? (
                    <div className="grid gap-4 lg:grid-cols-3">
                      <EditorField label="主维度">
                        <Select
                          value={widgetDraft.dimensionPrimary}
                          onValueChange={(value) =>
                            updateWidgetDraft({ dimensionPrimary: value })
                          }
                        >
                          <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                            <SelectValue placeholder="选择主维度" />
                          </SelectTrigger>
                          <SelectContent>
                            {widgetGroupableOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </EditorField>
                      <EditorField label="第二维度">
                        <Select
                          value={widgetDraft.dimensionSecondary || "none"}
                          onValueChange={(value) =>
                            updateWidgetDraft({
                              dimensionSecondary: value === "none" ? "" : value,
                            })
                          }
                        >
                          <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                            <SelectValue placeholder="可选" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">不设置</SelectItem>
                            {widgetGroupableOptions
                              .filter(
                                (option) =>
                                  option.value !== widgetDraft.dimensionPrimary,
                              )
                              .map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </EditorField>
                      {supportsSeriesField(widgetDraft.widgetType) ? (
                        <EditorField label="系列字段">
                          <Select
                            value={widgetDraft.seriesField || "none"}
                            onValueChange={(value) =>
                              updateWidgetDraft({
                                seriesField: value === "none" ? "" : value,
                              })
                            }
                          >
                            <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                              <SelectValue placeholder="可选" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">不设置</SelectItem>
                              {seriesOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </EditorField>
                      ) : null}
                    </div>
                  ) : null}

                  {supportsMetrics(widgetDraft.widgetType) ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                      <Card className="rounded-[24px] border-border/80 bg-muted/15 shadow-none">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">主指标</CardTitle>
                          <CardDescription>
                            主指标决定卡片数值或图表的核心展示结果。
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                          <EditorField label="指标字段">
                            <Select
                              value={widgetDraft.metricOneField}
                              onValueChange={(value) =>
                                updateWidgetDraft({
                                  metricOneField: value,
                                  metricOneLabel:
                                    widgetDraft.metricOneLabel ||
                                    metricLabel(
                                      meta,
                                      widgetDraft.dataset,
                                      value,
                                      widgetDraft.metricOneAgg,
                                    ),
                                })
                              }
                            >
                              <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                                <SelectValue placeholder="选择指标字段" />
                              </SelectTrigger>
                              <SelectContent>
                                {widgetNumericOptions.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </EditorField>
                          <EditorField label="聚合方式">
                            <Select
                              value={widgetDraft.metricOneAgg}
                              onValueChange={(value) =>
                                updateWidgetDraft({
                                  metricOneAgg: value,
                                  metricOneLabel:
                                    widgetDraft.metricOneLabel ||
                                    metricLabel(
                                      meta,
                                      widgetDraft.dataset,
                                      widgetDraft.metricOneField,
                                      value,
                                    ),
                                })
                              }
                            >
                              <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                                <SelectValue placeholder="选择聚合方式" />
                              </SelectTrigger>
                              <SelectContent>
                                {aggregationOptions.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </EditorField>
                          <EditorField label="展示名称">
                            <Input
                              value={widgetDraft.metricOneLabel}
                              onChange={(event) =>
                                updateWidgetDraft({
                                  metricOneLabel: event.target.value,
                                })
                              }
                              className="h-11 rounded-2xl border-border/80 bg-white"
                            />
                          </EditorField>
                        </CardContent>
                      </Card>
                      {supportsSecondMetric(widgetDraft.widgetType) ? (
                        <Card className="rounded-[24px] border-border/80 bg-muted/15 shadow-none">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-lg">第二指标</CardTitle>
                            <CardDescription>
                              可选，用于双指标对比或堆叠图展示。
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-4">
                            <EditorField label="指标字段">
                              <Select
                                value={widgetDraft.metricTwoField || "none"}
                                onValueChange={(value) =>
                                  updateWidgetDraft({
                                    metricTwoField: value === "none" ? "" : value,
                                    metricTwoLabel:
                                      value === "none"
                                        ? ""
                                        : widgetDraft.metricTwoLabel ||
                                          metricLabel(
                                            meta,
                                            widgetDraft.dataset,
                                            value,
                                            widgetDraft.metricTwoAgg,
                                          ),
                                  })
                                }
                              >
                                <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                                  <SelectValue placeholder="可选" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">不设置</SelectItem>
                                  {widgetNumericOptions
                                    .filter(
                                      (option) =>
                                        option.value !== widgetDraft.metricOneField,
                                    )
                                    .map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </EditorField>
                            <EditorField label="聚合方式">
                              <Select
                                value={widgetDraft.metricTwoAgg}
                                onValueChange={(value) =>
                                  updateWidgetDraft({
                                    metricTwoAgg: value,
                                    metricTwoLabel:
                                      widgetDraft.metricTwoField &&
                                      !widgetDraft.metricTwoLabel
                                        ? metricLabel(
                                            meta,
                                            widgetDraft.dataset,
                                            widgetDraft.metricTwoField,
                                            value,
                                          )
                                        : widgetDraft.metricTwoLabel,
                                  })
                                }
                              >
                                <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                                  <SelectValue placeholder="选择聚合方式" />
                                </SelectTrigger>
                                <SelectContent>
                                  {aggregationOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </EditorField>
                            <EditorField label="展示名称">
                              <Input
                                value={widgetDraft.metricTwoLabel}
                                onChange={(event) =>
                                  updateWidgetDraft({
                                    metricTwoLabel: event.target.value,
                                  })
                                }
                                className="h-11 rounded-2xl border-border/80 bg-white"
                              />
                            </EditorField>
                          </CardContent>
                        </Card>
                      ) : null}
                    </div>
                  ) : null}

                  {supportsTextContent(widgetDraft.widgetType) ? (
                    <EditorField label="文本内容">
                      <Textarea
                        value={widgetDraft.textContent}
                        onChange={(event) =>
                          updateWidgetDraft({ textContent: event.target.value })
                        }
                        className="min-h-[160px] rounded-[22px] border-border/80 bg-white"
                      />
                    </EditorField>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="rounded-[24px] border-border/80 bg-muted/15 shadow-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">日期与排序</CardTitle>
                        <CardDescription>
                          这里决定图表取数日期、排序字段和条数上限。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        <EditorField label="日期模式">
                          <Select
                            value={widgetDraft.dateMode}
                            onValueChange={(value) =>
                              updateWidgetDraft({ dateMode: value })
                            }
                          >
                            <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                              <SelectValue placeholder="选择日期模式" />
                            </SelectTrigger>
                            <SelectContent>
                              {DATE_MODE_OPTIONS.map((option) => (
                                <SelectItem key={option.key} value={option.key}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </EditorField>

                        {widgetDraft.dateMode === "single" ? (
                          <EditorField label="固定日期">
                            <Input
                              type="date"
                              value={widgetDraft.date}
                              onChange={(event) =>
                                updateWidgetDraft({ date: event.target.value })
                              }
                              className="h-11 rounded-2xl border-border/80 bg-white"
                            />
                          </EditorField>
                        ) : null}

                        {widgetDraft.dateMode === "range" ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <EditorField label="开始日期">
                              <Input
                                type="date"
                                value={widgetDraft.startDate}
                                onChange={(event) =>
                                  updateWidgetDraft({
                                    startDate: event.target.value,
                                  })
                                }
                                className="h-11 rounded-2xl border-border/80 bg-white"
                              />
                            </EditorField>
                            <EditorField label="结束日期">
                              <Input
                                type="date"
                                value={widgetDraft.endDate}
                                onChange={(event) =>
                                  updateWidgetDraft({ endDate: event.target.value })
                                }
                                className="h-11 rounded-2xl border-border/80 bg-white"
                              />
                            </EditorField>
                          </div>
                        ) : null}

                        {supportsMetrics(widgetDraft.widgetType) ? (
                          <>
                            <EditorField label="排序字段">
                              <Select
                                value={widgetDraft.sortField || "none"}
                                onValueChange={(value) =>
                                  updateWidgetDraft({
                                    sortField: value === "none" ? "" : value,
                                  })
                                }
                              >
                                <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                                  <SelectValue placeholder="可选" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">不排序</SelectItem>
                                  {sortOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </EditorField>
                            <EditorField label="排序方向">
                              <Select
                                value={widgetDraft.sortDirection}
                                onValueChange={(value) =>
                                  updateWidgetDraft({ sortDirection: value })
                                }
                              >
                                <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                                  <SelectValue placeholder="选择排序方向" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="desc">从高到低</SelectItem>
                                  <SelectItem value="asc">从低到高</SelectItem>
                                </SelectContent>
                              </Select>
                            </EditorField>
                          </>
                        ) : null}

                        {supportsLimit(widgetDraft.widgetType) ? (
                          <EditorField label="返回条数">
                            <Input
                              type="number"
                              min="1"
                              max="500"
                              value={widgetDraft.limit}
                              onChange={(event) =>
                                updateWidgetDraft({ limit: event.target.value })
                              }
                              className="h-11 rounded-2xl border-border/80 bg-white"
                            />
                          </EditorField>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className="rounded-[24px] border-border/80 bg-muted/15 shadow-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">布局尺寸</CardTitle>
                        <CardDescription>
                          支持直接改图表占宽、占高和卡片高度，保存后会立即体现在当前看板。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 sm:grid-cols-2">
                        <EditorField label="宽度栅格">
                          <Input
                            type="number"
                            min="4"
                            max="24"
                            value={widgetDraft.layoutWidth}
                            onChange={(event) =>
                              updateWidgetDraft({
                                layoutWidth: event.target.value,
                              })
                            }
                            className="h-11 rounded-2xl border-border/80 bg-white"
                          />
                        </EditorField>
                        <EditorField label="高度行数">
                          <Input
                            type="number"
                            min="3"
                            max="12"
                            value={widgetDraft.layoutHeightRows}
                            onChange={(event) =>
                              updateWidgetDraft({
                                layoutHeightRows: event.target.value,
                              })
                            }
                            className="h-11 rounded-2xl border-border/80 bg-white"
                          />
                        </EditorField>
                        <EditorField label="跨列方式">
                          <Select
                            value={widgetDraft.layoutSpan}
                            onValueChange={(value) =>
                              updateWidgetDraft({ layoutSpan: value })
                            }
                          >
                            <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                              <SelectValue placeholder="选择跨列方式" />
                            </SelectTrigger>
                            <SelectContent>
                              {LAYOUT_SPAN_OPTIONS.map((option) => (
                                <SelectItem key={option.key} value={option.key}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </EditorField>
                        <EditorField label="卡片高度级别">
                          <Select
                            value={widgetDraft.layoutHeightKey}
                            onValueChange={(value) =>
                              updateWidgetDraft({ layoutHeightKey: value })
                            }
                          >
                            <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                              <SelectValue placeholder="选择卡片高度" />
                            </SelectTrigger>
                            <SelectContent>
                              {(meta?.layout_heights ?? [
                                "compact",
                                "normal",
                                "tall",
                              ]).map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item === "compact"
                                    ? "紧凑"
                                    : item === "tall"
                                      ? "加高"
                                      : "常规"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </EditorField>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <Empty className="border-border/70">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <LayoutDashboard className="size-4" />
                    </EmptyMedia>
                    <EmptyTitle>还没有选中图表组件</EmptyTitle>
                    <EmptyDescription>
                      从左侧选一个现有图表，或先新增图表，再开始编辑。
                    </EmptyDescription>
                  </EmptyHeader>
                  <Button className="rounded-full" onClick={openCreateWidgetDialog}>
                    <Plus className="size-4" />
                    新增图表
                  </Button>
                </Empty>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 bg-white shadow-[var(--shadow-card)]">
            <CardHeader className="space-y-2 pb-3">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                看板预览
              </CardTitle>
              <CardDescription>
                当前选中的图表会在预览区高亮，方便你核对布局、标题和数据表现。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewLoading && !widgets.length ? (
                <LoadingState />
              ) : widgets.length ? (
                <DashboardCanvas
                  meta={meta}
                  widgets={widgets}
                  itemMap={itemMap}
                  highlightWidgetId={selectedWidgetId}
                />
              ) : (
                <div className="rounded-[24px] border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center text-sm text-muted-foreground">
                  当前看板还没有图表组件，先新增一个图表就会在这里实时预览。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={createViewOpen} onOpenChange={setCreateViewOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-none p-0 sm:w-[min(100vw-2rem,640px)] sm:max-w-[640px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>新增看板</DialogTitle>
            <DialogDescription>
              新建一个空白看板后，你就可以继续往里添加图表和指标卡。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-6 pb-6">
            <EditorField label="看板名称">
              <Input
                value={createViewDraft.name}
                onChange={(event) =>
                  setCreateViewDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="h-11 rounded-2xl border-border/80 bg-white"
              />
            </EditorField>
            <EditorField label="看板说明">
              <Textarea
                value={createViewDraft.description}
                onChange={(event) =>
                  setCreateViewDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="min-h-[120px] rounded-[22px] border-border/80 bg-white"
              />
            </EditorField>
          </div>
          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 px-6 py-4">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setCreateViewOpen(false)}
            >
              取消
            </Button>
            <Button
              className="rounded-full"
              onClick={() => void handleCreateView()}
              disabled={creatingView}
            >
              <Plus className="size-4" />
              {creatingView ? "创建中..." : "创建看板"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createWidgetOpen} onOpenChange={setCreateWidgetOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-none p-0 sm:w-[min(100vw-2rem,720px)] sm:max-w-[720px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>新增图表</DialogTitle>
            <DialogDescription>
              先选好图表类型和数据集，创建后右侧就可以继续补齐维度、指标与布局。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 px-6 pb-6 lg:grid-cols-2">
            <EditorField label="图表标题">
              <Input
                value={createWidgetDraft.title}
                onChange={(event) =>
                  setCreateWidgetDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="h-11 rounded-2xl border-border/80 bg-white"
                placeholder="例如：当日销售出库分仓 TOP10"
              />
            </EditorField>
            <EditorField label="图表类型">
              <Select
                value={createWidgetDraft.widgetType}
                onValueChange={(value) =>
                  setCreateWidgetDraft((current) => ({
                    ...current,
                    widgetType: value,
                  }))
                }
              >
                <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                  <SelectValue placeholder="选择图表类型" />
                </SelectTrigger>
                <SelectContent>
                  {widgetTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </EditorField>
            <EditorField
              label="数据集"
              hint="建议先选最接近业务主题的数据集，后面再细调维度和指标。"
            >
              <Select
                value={createWidgetDraft.dataset}
                onValueChange={(value) =>
                  setCreateWidgetDraft((current) => ({
                    ...current,
                    dataset: value,
                  }))
                }
              >
                <SelectTrigger className="h-11 w-full rounded-2xl border-border/80 bg-white px-4">
                  <SelectValue placeholder="选择数据集" />
                </SelectTrigger>
                <SelectContent>
                  {datasetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </EditorField>
            <div className="rounded-[24px] border border-border/80 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                创建后默认行为
              </div>
              <div className="mt-2 leading-6">
                系统会先生成一个默认布局和默认指标，然后自动选中它，方便你继续做细节配置。
              </div>
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 px-6 py-4">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setCreateWidgetOpen(false)}
            >
              取消
            </Button>
            <Button
              className="rounded-full"
              onClick={() => void handleCreateWidget()}
              disabled={creatingWidget}
            >
              <Plus className="size-4" />
              {creatingWidget ? "创建中..." : "创建图表"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
