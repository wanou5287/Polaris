"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { BookCheck } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  apiFetch,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/polaris-client";
import type { MetricDictionaryResponse, MetricItem } from "@/lib/polaris-types";

function updateMetricItem(
  items: MetricItem[],
  id: number,
  field: keyof MetricItem,
  value: string | number | boolean | null,
) {
  return items.map((item) => (item.id === id ? { ...item, [field]: value } : item));
}

async function requestMetricDictionary() {
  return apiFetch<MetricDictionaryResponse>("/api/backend/metric-dictionary");
}

export function MetricDictionaryPage() {
  const [data, setData] = useState<MetricDictionaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(query);

  async function loadMetrics() {
    setLoading(true);
    try {
      const response = await requestMetricDictionary();
      setData(response);
      setSelectedId((current) => current ?? response.items[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "指标口径加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        const response = await requestMetricDictionary();
        if (!cancelled) {
          setData(response);
          setSelectedId(response.items[0]?.id ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "指标口径加载失败");
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

  async function saveAll() {
    if (!data) {
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/backend/metric-dictionary", {
        method: "PUT",
        body: JSON.stringify({ items: data.items }),
      });
      toast.success("指标口径已保存");
      const response = await requestMetricDictionary();
      setData(response);
      setSelectedId((current) => current ?? response.items[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function updateSelected(field: keyof MetricItem, value: string | number | boolean | null) {
    setData((current) => {
      if (!current || selectedId == null) {
        return current;
      }
      return {
        ...current,
        items: updateMetricItem(current.items, selectedId, field, value),
      };
    });
  }

  const filteredItems =
    data?.items.filter((item) => {
      const haystack = [
        item.metric_name,
        item.metric_key,
        item.business_domain,
        item.owner_role,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(deferredQuery.trim().toLowerCase());
    }) ?? [];

  const selectedItem =
    data?.items.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;

  useEffect(() => {
    if (!selectedItem) {
      return;
    }
    if (selectedId !== selectedItem.id) {
      setSelectedId(selectedItem.id);
    }
  }, [selectedId, selectedItem]);

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-3 xl:grid-cols-4">
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">指标总数</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {data ? formatNumber(data.summary.total_count) : "--"}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已启用</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {data ? formatNumber(data.summary.active_count) : "--"}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">业务域</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {data ? formatNumber(data.summary.domain_count) : "--"}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">最近更新时间</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold tracking-tight">
            {data ? formatDateTime(data.summary.latest_updated_at) : "--"}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.42fr_0.58fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-3">
            <CardTitle className="text-lg">指标清单</CardTitle>
            <Input
              placeholder="搜索指标名 / key / 业务域 / 责任角色"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 rounded-2xl border-border/80 bg-white"
            />
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-20 rounded-[20px] border border-border/70 bg-muted/40" />
                ))}
              </div>
            ) : filteredItems.length ? (
              <ScrollArea className="h-[640px] pr-4">
                <div className="space-y-3">
                  {filteredItems.map((item) => {
                    const active = selectedItem?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                          active
                            ? "border-slate-200 bg-white shadow-[var(--shadow-card)]"
                            : "border-border/70 bg-white/70 hover:border-border hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {item.metric_name}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.metric_key}
                            </p>
                          </div>
                          <div className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                            {item.business_domain || "未分域"}
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                          责任角色 {item.owner_role || "未分配"} · 版本 {item.version_tag || "未设置"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <Empty className="border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookCheck className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>没有匹配到指标</EmptyTitle>
                  <EmptyDescription>换一个关键词试试，或者直接刷新数据。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">指标详情</CardTitle>
            <p className="text-sm text-muted-foreground">
              针对单个指标维护口径、公式、数据来源和版本信息。
            </p>
          </CardHeader>
          <CardContent>
            {selectedItem ? (
              <div className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>指标名称</Label>
                    <Input
                      value={selectedItem.metric_name}
                      onChange={(event) => updateSelected("metric_name", event.target.value)}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>指标 Key</Label>
                    <Input
                      value={selectedItem.metric_key}
                      onChange={(event) => updateSelected("metric_key", event.target.value)}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>业务域</Label>
                    <Input
                      value={selectedItem.business_domain}
                      onChange={(event) => updateSelected("business_domain", event.target.value)}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>责任角色</Label>
                    <Input
                      value={selectedItem.owner_role}
                      onChange={(event) => updateSelected("owner_role", event.target.value)}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>指标定义</Label>
                  <Textarea
                    value={selectedItem.definition_text}
                    onChange={(event) => updateSelected("definition_text", event.target.value)}
                    className="min-h-[120px] rounded-[22px] border-border/80 bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label>计算公式</Label>
                  <Textarea
                    value={selectedItem.formula_text}
                    onChange={(event) => updateSelected("formula_text", event.target.value)}
                    className="min-h-[96px] rounded-[22px] border-border/80 bg-white"
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>来源表</Label>
                    <Input
                      value={selectedItem.source_table}
                      onChange={(event) => updateSelected("source_table", event.target.value)}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>来源字段</Label>
                    <Input
                      value={selectedItem.source_fields}
                      onChange={(event) => updateSelected("source_fields", event.target.value)}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>维度说明</Label>
                  <Textarea
                    value={selectedItem.dimension_notes}
                    onChange={(event) => updateSelected("dimension_notes", event.target.value)}
                    className="min-h-[96px] rounded-[22px] border-border/80 bg-white"
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>版本标签</Label>
                    <Input
                      value={selectedItem.version_tag}
                      onChange={(event) => updateSelected("version_tag", event.target.value)}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>生效日期</Label>
                    <Input
                      value={selectedItem.effective_date ?? ""}
                      onChange={(event) => updateSelected("effective_date", event.target.value || null)}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>排序</Label>
                    <Input
                      type="number"
                      value={selectedItem.sort_order}
                      onChange={(event) => updateSelected("sort_order", Number(event.target.value || 0))}
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[22px] border border-border/70 bg-white px-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">启用状态</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      创建于 {formatDateTime(selectedItem.created_at)} · 最近更新{" "}
                      {formatDateTime(selectedItem.updated_at)}
                    </p>
                  </div>
                  <Switch
                    checked={selectedItem.is_enabled}
                    onCheckedChange={(checked) => updateSelected("is_enabled", checked)}
                  />
                </div>

                <div className="rounded-[22px] border border-border/70 bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
                  责任角色 {selectedItem.owner_role || "未分配"} · 版本{" "}
                  {selectedItem.version_tag || "未设置"} · 生效日期{" "}
                  {formatDate(selectedItem.effective_date)}
                </div>
              </div>
            ) : (
              <Empty className="border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookCheck className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>选择一个指标开始编辑</EmptyTitle>
                  <EmptyDescription>
                    左侧选择指标后，这里会展示完整口径信息和可编辑字段。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
