"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { BookCheck, CalendarDays, PencilLine } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { TransitionLink } from "@/components/polaris/transition-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getChartPalette } from "@/lib/bi-dashboard-chart-palettes";
import { apiFetch, cn, formatDate, formatDateTime, formatNumber } from "@/lib/polaris-client";
import type {
  BiDashboardMetaResponse,
  BiDashboardViewDetail,
  BiDashboardViewSummary,
  BiDashboardViewsResponse,
  BiDashboardWidget,
  BiDashboardWidgetDataItem,
  BiDashboardWidgetDataResponse,
} from "@/lib/polaris-types";

const VIEW_COPY: Record<number, { title: string; description: string }> = {
  2: {
    title: "销售/退货看板",
    description: "聚焦销售出库、销售退货、在途拦截与明细排行，帮助团队快速把握当日经营变化。",
  },
  3: {
    title: "库存清洗看板",
    description: "聚焦库存结构、库存状态分布与库存清洗明细，帮助团队判断库存质量与清洗节奏。",
  },
};

const parsePositiveInt = (value: string | null) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const formatInputDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export const getDefaultBusinessDate = () => {
  const current = new Date();
  current.setDate(current.getDate() - 1);
  return formatInputDate(current);
};

const decodeLatinUtf8 = (value: string) => {
  const bytes = Uint8Array.from(Array.from(value), (char) => char.charCodeAt(0) & 0xff);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
};

const looksBroken = (value: string) => /[À-ÿ]/.test(value) || /[锟�]/.test(value);

const isReadableText = (value: string) => {
  if (!value.trim()) {
    return false;
  }
  if (value.includes("�")) {
    return false;
  }
  const latinCount = (value.match(/[À-ÿ]/g) ?? []).length;
  return latinCount < Math.max(2, Math.ceil(value.length / 5));
};

export function normalizeText(value: string | null | undefined, fallback: string) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }

  const candidates = [raw];
  if (looksBroken(raw)) {
    try {
      const repaired = decodeLatinUtf8(raw);
      if (repaired) {
        candidates.unshift(repaired);
      }
    } catch {
      // Ignore repair failures and fall back below.
    }
  }

  return candidates.find((candidate) => isReadableText(candidate)) || fallback;
}

const toNumber = (value: string | number | null | undefined) => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatMetricValue = (value: string | number | null | undefined) => {
  const numeric = toNumber(value);
  return Number.isInteger(numeric)
    ? formatNumber(numeric)
    : numeric.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
};

const truncateLabel = (value: string, maxLength = 12) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;

export const requestDashboardMeta = () => apiFetch<BiDashboardMetaResponse>("/api/backend/meta");
export const requestDashboardViews = () => apiFetch<BiDashboardViewsResponse>("/api/backend/views");
export const requestDashboardViewDetail = (viewId: number) => apiFetch<BiDashboardViewDetail>(`/api/backend/views/${viewId}`);
export const requestDashboardWidgetData = (viewId: number, bizDate: string) =>
  apiFetch<BiDashboardWidgetDataResponse>(`/api/backend/views/${viewId}/widget-data?biz_date=${bizDate}`);

export const visibleViews = (views: BiDashboardViewSummary[]) => views.filter((view) => view.widget_count > 0);
export const defaultViewId = (views: BiDashboardViewSummary[], preferred: number | null) => {
  const pool = visibleViews(views).length ? visibleViews(views) : views;
  if (!pool.length) {
    return null;
  }
  return preferred && pool.some((view) => view.id === preferred) ? preferred : pool[0].id;
};

export const sortWidgets = (widgets: BiDashboardWidget[]) =>
  [...widgets].sort((left, right) => (left.layout.y - right.layout.y) || (left.layout.x - right.layout.x) || (left.sort_order - right.sort_order));

const spanClass = (widget: BiDashboardWidget) => {
  if (widget.widget_type === "table" || widget.layout.span === 2 || widget.layout.w >= 24) return "xl:col-span-12";
  if (widget.layout.w >= 18) return "xl:col-span-8";
  if (widget.layout.w >= 12) return "xl:col-span-6";
  return "xl:col-span-4";
};

const datasetLabel = (meta: BiDashboardMetaResponse | null, dataset: string) =>
  normalizeText(meta?.dataset_map?.[dataset], dataset);

const fieldLabel = (meta: BiDashboardMetaResponse | null, dataset: string, field: string) =>
  normalizeText(meta?.dataset_fields?.[dataset]?.[field]?.label, field);

function dimensionField(item: BiDashboardWidgetDataItem) {
  if (item.dimensions[0]) return item.dimensions[0];
  const aliases = new Set(item.metrics.map((metric) => metric.alias));
  return Object.keys(item.rows[0] ?? {}).find((key) => !aliases.has(key) && key !== item.series_field) ?? "label";
}

function seriesModel(item: BiDashboardWidgetDataItem, widget: BiDashboardWidget) {
  const palette = getChartPalette(widget.config.chart_palette);
  const colors = palette.colors;
  const dimension = dimensionField(item);
  if (item.series_field && item.metrics.length === 1) {
    const groups = item.series_groups.length
      ? item.series_groups
      : Array.from(new Set(item.rows.map((row) => String(row[item.series_field] ?? "未分类"))));

    const series = groups.map((group, index) => ({
      key: `series_${index}`,
      label: normalizeText(group, `系列 ${index + 1}`),
      color: colors[index % colors.length],
      group,
    }));

    const grouped = new Map<string, Record<string, string | number>>();
    item.rows.forEach((row, index) => {
      const label = normalizeText(String(row[dimension] ?? `第 ${index + 1} 项`), `第 ${index + 1} 项`);
      const group = String(row[item.series_field] ?? "未分类");
      const target = series.find((entry) => entry.group === group) ?? series[0];
      const current = grouped.get(label) ?? { label };
      current[target.key] = toNumber(row[item.metrics[0]?.alias]);
      grouped.set(label, current);
    });

    return { rows: Array.from(grouped.values()), series };
  }

  return {
    rows: item.rows.map((row, index) => ({
      label: normalizeText(String(row[dimension] ?? `第 ${index + 1} 项`), `第 ${index + 1} 项`),
      ...Object.fromEntries(item.metrics.map((metric) => [metric.alias, toNumber(row[metric.alias])])),
    })),
    series: item.metrics.map((metric, index) => ({
      key: metric.alias,
      label: normalizeText(metric.label, metric.field),
      color: colors[index % colors.length],
    })),
  };
}

export function viewTitle(view: BiDashboardViewSummary | BiDashboardViewDetail | null) {
  if (!view) return "经营看板";
  return normalizeText(view.name, VIEW_COPY[view.id]?.title ?? `看板 ${view.id}`);
}

export function viewDescription(view: BiDashboardViewSummary | BiDashboardViewDetail | null) {
  if (!view) return "围绕经营指标、库存状态和业务明细组织图表与指标卡。";
  return normalizeText(view.description, VIEW_COPY[view.id]?.description ?? "围绕经营指标、库存状态和业务明细组织图表与指标卡。");
}

const widgetTitle = (widget: BiDashboardWidget, item?: BiDashboardWidgetDataItem | null) =>
  normalizeText(widget.title || item?.title, widget.config.metrics[0]?.label || item?.metrics[0]?.label || `${widget.widget_type} 组件`);

const widgetSubtitle = (meta: BiDashboardMetaResponse | null, widget: BiDashboardWidget, item?: BiDashboardWidgetDataItem | null) =>
  `${datasetLabel(meta, widget.dataset)}${item?.applied_target_date ? ` · ${formatDate(item.applied_target_date)}` : ""}`;

export const buildEditorHref = (viewId: number, bizDate: string) => `/governance/metrics/editor?view_id=${viewId}&biz_date=${bizDate}`;
export const buildRuntimeHref = (viewId: number | null, bizDate?: string) => {
  const params = new URLSearchParams();
  if (viewId) params.set("view_id", String(viewId));
  if (bizDate) params.set("biz_date", bizDate);
  return `/governance/metrics${params.size ? `?${params.toString()}` : ""}`;
};

export function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="surface-panel px-5 py-5">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-36 rounded-full" />
          ))}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[152px] rounded-[26px]" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-12">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className={cn("h-[340px] rounded-[28px] xl:col-span-6", index === 2 ? "xl:col-span-12" : "")} />
        ))}
      </div>
    </div>
  );
}

function WidgetShell({
  title,
  subtitle,
  className,
  selected = false,
  children,
}: {
  title: string;
  subtitle: string;
  className: string;
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "rounded-[28px] border-border/80 bg-white shadow-[var(--shadow-card)] transition-all",
        selected ? "border-sky-300 ring-2 ring-sky-200/70" : "",
        className,
      )}
    >
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">{subtitle}</CardDescription>
          </div>
          {selected ? <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-none">当前选中</Badge> : null}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyWidget({ label }: { label: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function DashboardCanvas({
  meta,
  widgets,
  itemMap,
  highlightWidgetId = null,
}: {
  meta: BiDashboardMetaResponse | null;
  widgets: BiDashboardWidget[];
  itemMap: Map<number, BiDashboardWidgetDataItem>;
  highlightWidgetId?: number | null;
}) {
  const metricWidgets = widgets.filter((widget) => widget.widget_type === "metric");
  const contentWidgets = widgets.filter((widget) => widget.widget_type !== "metric");

  return (
    <div className="space-y-6">
      {metricWidgets.length ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {metricWidgets.map((widget) => {
            const item = itemMap.get(widget.id);
            const value = item?.rows[0]?.[item.metrics[0]?.alias ?? "metric_0"] ?? null;
            return (
              <Card
                key={widget.id}
                className={cn(
                  "rounded-[26px] border-border/80 bg-white shadow-[var(--shadow-card)]",
                  highlightWidgetId === widget.id ? "border-sky-300 ring-2 ring-sky-200/70" : "",
                )}
              >
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{widgetTitle(widget, item)}</CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">{widgetSubtitle(meta, widget, item)}</CardDescription>
                    </div>
                    {highlightWidgetId === widget.id ? (
                      <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-none">当前选中</Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tracking-tight">{formatMetricValue(value)}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : null}

      {contentWidgets.length ? (
        <section className="grid gap-5 xl:grid-cols-12">
          {contentWidgets.map((widget) => {
            const item = itemMap.get(widget.id);
            const title = widgetTitle(widget, item);
            const subtitle = widgetSubtitle(meta, widget, item);
            const className = spanClass(widget);
            const selected = highlightWidgetId === widget.id;

            if (!item) {
              return (
                <WidgetShell key={widget.id} title={title} subtitle={subtitle} className={className} selected={selected}>
                  <EmptyWidget label="当前组件暂未返回可展示数据。" />
                </WidgetShell>
              );
            }

            if (widget.widget_type === "ranking") {
              const dim = dimensionField(item);
              return (
                <WidgetShell key={widget.id} title={title} subtitle={subtitle} className={className} selected={selected}>
                  <div className="space-y-3">
                    {item.rows.slice(0, 10).map((row, index) => (
                      <div key={`${row[dim]}-${index}`} className="flex items-center justify-between rounded-[18px] border border-border/70 bg-white px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</div>
                          <span className="text-sm font-medium">{normalizeText(String(row[dim] ?? `第 ${index + 1} 项`), `第 ${index + 1} 项`)}</span>
                        </div>
                        <span className="text-base font-semibold">{formatMetricValue(row[item.metrics[0]?.alias])}</span>
                      </div>
                    ))}
                  </div>
                </WidgetShell>
              );
            }

            if (widget.widget_type === "table") {
              const columns = [
                ...(item.dimensions.length
                  ? item.dimensions
                  : Object.keys(item.rows[0] ?? {}).filter((key) => !item.metrics.some((metric) => metric.alias === key))),
                ...item.metrics.map((metric) => metric.alias),
              ];

              return (
                <WidgetShell key={widget.id} title={title} subtitle={subtitle} className={className} selected={selected}>
                  <div className="overflow-x-auto rounded-[22px] border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20">
                          {columns.map((column) => (
                            <TableHead key={column} className="whitespace-nowrap">
                              {item.metrics.some((metric) => metric.alias === column)
                                ? normalizeText(item.metrics.find((metric) => metric.alias === column)?.label, column)
                                : fieldLabel(meta, widget.dataset, column)}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {item.rows.slice(0, 20).map((row, index) => (
                          <TableRow key={index}>
                            {columns.map((column) => (
                              <TableCell key={column} className="whitespace-nowrap">
                                {typeof row[column] === "number"
                                  ? formatMetricValue(row[column] as number)
                                  : normalizeText(String(row[column] ?? "--"), "--")}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </WidgetShell>
              );
            }

            if (widget.widget_type === "pie") {
              const palette = getChartPalette(widget.config.chart_palette);
              const pieColors = palette.colors;
              const dim = dimensionField(item);
              const rows = item.rows
                .map((row, index) => ({
                  name: normalizeText(String(row[dim] ?? `第 ${index + 1} 项`), `第 ${index + 1} 项`),
                  value: toNumber(row[item.metrics[0]?.alias]),
                }))
                .filter((row) => row.value > 0);

              return (
                <WidgetShell key={widget.id} title={title} subtitle={subtitle} className={className} selected={selected}>
                  {rows.length ? (
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_220px]">
                      <ChartContainer
                        config={{ value: { label: normalizeText(item.metrics[0]?.label, item.metrics[0]?.field ?? "value"), color: pieColors[0] } }}
                        className="h-[320px] w-full"
                      >
                        <PieChart>
                          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={72} outerRadius={110} paddingAngle={3}>
                            {rows.map((row, index) => (
                              <Cell key={row.name} fill={pieColors[index % pieColors.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                      <div className="space-y-3">
                        {rows.slice(0, 8).map((row, index) => (
                          <div key={row.name} className="flex items-center justify-between rounded-[18px] border border-border/70 bg-muted/20 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="size-2.5 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }} />
                              <span className="text-sm">{truncateLabel(row.name, 14)}</span>
                            </div>
                            <span className="text-sm font-medium">{formatMetricValue(row.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyWidget label="当前日期下暂无分布数据。" />
                  )}
                </WidgetShell>
              );
            }

            const model = seriesModel(item, widget);
            const config = Object.fromEntries(model.series.map((entry) => [entry.key, { label: entry.label, color: entry.color }]));
            if (!model.rows.length) {
              return (
                <WidgetShell key={widget.id} title={title} subtitle={subtitle} className={className} selected={selected}>
                  <EmptyWidget label="当前日期下暂无图表数据。" />
                </WidgetShell>
              );
            }

            if (widget.widget_type === "line") {
              return (
                <WidgetShell key={widget.id} title={title} subtitle={subtitle} className={className} selected={selected}>
                  <ChartContainer config={config} className="h-[320px] w-full">
                    <LineChart data={model.rows} margin={{ top: 8, left: 8, right: 12, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} tickFormatter={(value) => truncateLabel(String(value))} />
                      <YAxis tickLine={false} axisLine={false} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                      {model.series.map((series) => (
                        <Line key={series.key} type="monotone" dataKey={series.key} stroke={`var(--color-${series.key})`} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      ))}
                      {model.series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
                    </LineChart>
                  </ChartContainer>
                </WidgetShell>
              );
            }

            const rotateTick = model.rows.some((row) => String(row.label ?? "").length > 8);
            const isStacked = widget.widget_type === "stacked_bar" || widget.widget_type === "stacked_hbar";

            return (
              <WidgetShell key={widget.id} title={title} subtitle={subtitle} className={className} selected={selected}>
                <ChartContainer config={config} className="h-[320px] w-full">
                  <BarChart
                    data={model.rows}
                    layout={widget.widget_type === "stacked_hbar" ? "vertical" : "horizontal"}
                    margin={{ top: 8, left: widget.widget_type === "stacked_hbar" ? 12 : 0, right: 12, bottom: rotateTick ? 28 : 0 }}
                    barGap={0}
                    barCategoryGap="26%"
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    {widget.widget_type === "stacked_hbar" ? (
                      <>
                        <XAxis type="number" tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={140} tickFormatter={(value) => truncateLabel(String(value))} />
                      </>
                    ) : (
                      <>
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          minTickGap={18}
                          tickFormatter={(value) => truncateLabel(String(value))}
                          angle={rotateTick ? -24 : 0}
                          textAnchor={rotateTick ? "end" : "middle"}
                          height={rotateTick ? 64 : 32}
                        />
                        <YAxis tickLine={false} axisLine={false} />
                      </>
                    )}
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    {model.series.map((series, index) => {
                      const isLastStackSegment = !isStacked || index === model.series.length - 1;
                      const radius: [number, number, number, number] =
                        widget.widget_type === "stacked_hbar"
                          ? isLastStackSegment
                            ? [0, 10, 10, 0]
                            : [0, 0, 0, 0]
                          : isLastStackSegment
                            ? [10, 10, 0, 0]
                            : [0, 0, 0, 0];

                      return (
                        <Bar
                          key={series.key}
                          dataKey={series.key}
                          stackId={isStacked ? "stack" : undefined}
                          fill={`var(--color-${series.key})`}
                          radius={radius}
                          stroke="none"
                          maxBarSize={widget.widget_type === "stacked_hbar" ? 18 : 34}
                        />
                      );
                    })}
                    {model.series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
                  </BarChart>
                </ChartContainer>
              </WidgetShell>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

export function BiDashboardPage() {
  const searchParams = useSearchParams();
  const preferredViewId = parsePositiveInt(searchParams.get("view_id"));
  const [selectedDate, setSelectedDate] = useState(searchParams.get("biz_date") ?? getDefaultBusinessDate());
  const [meta, setMeta] = useState<BiDashboardMetaResponse | null>(null);
  const [views, setViews] = useState<BiDashboardViewSummary[]>([]);
  const [activeViewId, setActiveViewId] = useState<number | null>(preferredViewId);
  const [detail, setDetail] = useState<BiDashboardViewDetail | null>(null);
  const [data, setData] = useState<BiDashboardWidgetDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewLoading, setViewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setActiveViewId((current) => current ?? defaultViewId(viewsResponse.views, preferredViewId));
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "BI 看板加载失败。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [preferredViewId]);

  useEffect(() => {
    if (!views.length) return;
    const resolved = defaultViewId(views, activeViewId);
    if (resolved !== activeViewId) setActiveViewId(resolved);
  }, [activeViewId, views]);

  useEffect(() => {
    if (!activeViewId) return;
    const currentViewId = activeViewId;
    let cancelled = false;
    async function loadView() {
      setViewLoading(true);
      setError(null);
      try {
        const [detailResponse, dataResponse] = await Promise.all([
          requestDashboardViewDetail(currentViewId),
          requestDashboardWidgetData(currentViewId, selectedDate),
        ]);
        if (cancelled) return;
        setDetail(detailResponse);
        setData(dataResponse);
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "当前看板加载失败。");
      } finally {
        if (!cancelled) setViewLoading(false);
      }
    }
    void loadView();
    return () => {
      cancelled = true;
    };
  }, [activeViewId, selectedDate]);

  if (loading) return <LoadingState />;

  const list = visibleViews(views).length ? visibleViews(views) : views;
  const activeView = list.find((view) => view.id === activeViewId) ?? null;
  if (!activeViewId || !activeView) {
    return (
      <div className="surface-panel p-10">
        <Empty className="border-border/70">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PencilLine className="size-4" />
            </EmptyMedia>
            <EmptyTitle>当前没有可展示的 BI 看板</EmptyTitle>
            <EmptyDescription>{error || "请先创建至少一个带组件的看板视图，再进入 BI 看板页面。"}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const currentDetail = detail?.id === activeViewId ? detail : ({ ...activeView, widgets: [] } as BiDashboardViewDetail);
  const widgets = sortWidgets(currentDetail.widgets);
  const itemMap = new Map((data?.items ?? []).map((item) => [item.widget_id, item]));
  const appliedDate = (data?.items ?? []).find((item) => item.applied_target_date)?.applied_target_date ?? data?.biz_date ?? selectedDate;

  return (
    <div className="space-y-6">
      <section className="surface-panel px-5 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {list.map((view) => {
                const active = view.id === activeViewId;
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
                        active ? "border-white/20 bg-white/10 text-white" : "border-border/80 bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {view.widget_count}
                    </Badge>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm leading-6 text-muted-foreground">
              <span>{viewDescription(currentDetail)}</span>
              <span>最近更新 {formatDateTime(activeView.updated_at)}</span>
              <span>业务日期 {formatDate(appliedDate)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <CalendarDays className="size-3.5" />
                业务日期
              </span>
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-11 min-w-[180px] rounded-2xl border-border/80 bg-white"
              />
            </label>
            <Button asChild variant="outline" className="h-11 rounded-full border-border/80 bg-white">
              <TransitionLink href="/governance/metric-dictionary">
                <BookCheck className="size-4" />
                指标口径
              </TransitionLink>
            </Button>
            <Button asChild className="h-11 rounded-full bg-sky-500 px-5 text-white shadow-[0_18px_35px_rgba(56,189,248,0.25)] hover:bg-sky-600">
              <TransitionLink href={buildEditorHref(activeViewId, selectedDate)}>
                <PencilLine className="size-4" />
                看板编辑
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
              <EmptyTitle>当前看板暂时不可用</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : null}

      {viewLoading && !widgets.length ? <LoadingState /> : null}

      <DashboardCanvas meta={meta} widgets={widgets} itemMap={itemMap} />
    </div>
  );
}
