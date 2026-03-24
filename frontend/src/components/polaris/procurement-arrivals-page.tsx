"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, PackagePlus, RefreshCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/polaris/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, cn, formatDate, formatNumber } from "@/lib/polaris-client";
import type { Option, ProcurementArrivalItem, ProcurementArrivalResponse } from "@/lib/polaris-types";

type SelectedKey = number | "new";

const statusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: "草稿", className: "border-border/80 bg-muted/60 text-muted-foreground" },
  ready: { label: "待执行", className: "border-sky-200 bg-sky-50 text-sky-700" },
  completed: { label: "已到货", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  exception: { label: "异常", className: "border-amber-200 bg-amber-50 text-amber-700" },
};

const documentStatusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "待编排", className: "border-border/80 bg-white text-muted-foreground" },
  generated: { label: "已生成", className: "border-sky-200 bg-sky-50 text-sky-700" },
  synced: { label: "已回写", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  failed: { label: "失败待补偿", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

function createDraft(response?: ProcurementArrivalResponse): ProcurementArrivalItem {
  const today = new Date().toISOString().slice(0, 10);
  const warehouse = response?.warehouse_options[0];
  const channel = response?.channel_options[0];
  return {
    id: 0,
    arrival_no: "",
    purchase_order_no: "",
    supplier_name: "",
    warehouse_code: warehouse?.value ?? "",
    warehouse_name: warehouse?.label ?? "",
    channel_code: channel?.value ?? "",
    channel_name: channel?.label ?? "",
    sku_code: "",
    sku_name: "",
    expected_qty: 0,
    arrived_qty: 0,
    qualified_qty: 0,
    exception_qty: 0,
    pending_qty: 0,
    fulfillment_rate: 0,
    quality_rate: 0,
    unit: "台",
    arrival_date: today,
    status: "draft",
    document_status: "pending",
    exception_reason: "",
    remark: "",
    source_system: "manual",
    created_by: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
    sort_order: 100,
  };
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

async function requestProcurementArrivals(params: URLSearchParams) {
  return apiFetch<ProcurementArrivalResponse>(`/api/backend/procurement-arrivals?${params.toString()}`);
}

export function ProcurementArrivalsPage() {
  const [data, setData] = useState<ProcurementArrivalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<SelectedKey>("new");
  const [draft, setDraft] = useState<ProcurementArrivalItem>(createDraft());
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [documentStatusFilter, setDocumentStatusFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const deferredKeyword = useDeferredValue(keyword);

  async function loadArrivals(nextSelectedKey?: SelectedKey) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (documentStatusFilter !== "all") params.set("document_status", documentStatusFilter);
      if (warehouseFilter !== "all") params.set("warehouse_code", warehouseFilter);
      if (deferredKeyword.trim()) params.set("keyword", deferredKeyword.trim());
      params.set("limit", "120");
      const response = await requestProcurementArrivals(params);
      setData(response);
      startTransition(() => {
        const currentTarget = nextSelectedKey ?? selectedKey;
        if (currentTarget === "new") {
          setSelectedKey("new");
          setDraft(createDraft(response));
          return;
        }
        const matched = response.items.find((item) => item.id === currentTarget) ?? response.items[0];
        if (matched) {
          setSelectedKey(matched.id);
          setDraft({ ...matched });
          return;
        }
        setSelectedKey("new");
        setDraft(createDraft(response));
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "采购到货数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadArrivals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, documentStatusFilter, warehouseFilter, deferredKeyword]);

  function updateDraft<K extends keyof ProcurementArrivalItem>(key: K, value: ProcurementArrivalItem[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectArrival(item: ProcurementArrivalItem) {
    startTransition(() => {
      setSelectedKey(item.id);
      setDraft({ ...item });
    });
  }

  function startNewDraft() {
    startTransition(() => {
      setSelectedKey("new");
      setDraft(createDraft(data ?? undefined));
    });
  }

  function updateWarehouse(nextValue: string) {
    const option = data?.warehouse_options.find((item) => item.value === nextValue);
    setDraft((current) => ({ ...current, warehouse_code: nextValue, warehouse_name: option?.label ?? nextValue }));
  }

  function updateChannel(nextValue: string) {
    if (nextValue === "__none") {
      setDraft((current) => ({ ...current, channel_code: "", channel_name: "" }));
      return;
    }
    const option = data?.channel_options.find((item) => item.value === nextValue);
    setDraft((current) => ({ ...current, channel_code: nextValue, channel_name: option?.label ?? nextValue }));
  }

  async function saveArrival(overrides?: Partial<ProcurementArrivalItem>) {
    setSaving(true);
    try {
      const response = await apiFetch<{ created: boolean; item: ProcurementArrivalItem }>("/api/backend/procurement-arrivals", {
        method: "POST",
        body: JSON.stringify({ ...draft, ...overrides }),
      });
      toast.success(response.created ? "采购到货草稿已创建" : "采购到货记录已更新");
      await loadArrivals(response.item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "采购到货保存失败");
    } finally {
      setSaving(false);
    }
  }

  const expectedQty = Number(draft.expected_qty || 0);
  const arrivedQty = Number(draft.arrived_qty || 0);
  const qualifiedQty = Math.min(Number(draft.qualified_qty || 0), arrivedQty);
  const exceptionQty = Math.max(0, Math.min(Number(draft.exception_qty || 0), Math.max(arrivedQty - qualifiedQty, 0)));
  const remainingQty = Math.max(expectedQty - arrivedQty, 0);
  const fulfillmentRate = expectedQty > 0 ? arrivedQty / expectedQty : 0;
  const qualityRate = arrivedQty > 0 ? qualifiedQty / arrivedQty : 0;

  return (
    <div className="space-y-6">
      <div className="surface-panel p-6 sm:p-8">
        <PageHeader
          eyebrow="Operations"
          title="采购到货协同"
          description="先落统一的到货录入、单据编排状态和异常备注入口，为后续任务中心、异常补偿和自动回写铺路。"
          badge={data ? `${formatNumber(data.summary.total_count)} 条到货记录` : "加载中"}
          actions={
            <>
              <Button variant="outline" className="rounded-full" onClick={() => void loadArrivals(selectedKey)}>
                <RefreshCcw className="size-4" />
                刷新列表
              </Button>
              <Button variant="outline" className="rounded-full" onClick={startNewDraft}>
                <PackagePlus className="size-4" />
                新建草稿
              </Button>
              <Button className="cta-button rounded-full" onClick={() => void saveArrival()} disabled={saving}>
                <Save className="size-4" />
                保存记录
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="到货单数" value={formatNumber(data?.summary.total_count ?? 0)} />
        <SummaryCard title="待执行" value={formatNumber(data?.summary.ready_count ?? 0)} />
        <SummaryCard title="异常待补偿" value={formatNumber(data?.summary.exception_count ?? 0)} />
        <SummaryCard title="待编排 / 回写" value={formatNumber(data?.summary.pending_document_count ?? 0)} />
        <SummaryCard title="累计到货数量" value={formatNumber(data?.summary.total_arrived_qty ?? 0)} hint={`合格 ${formatNumber(data?.summary.total_qualified_qty ?? 0)}`} />
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.9fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索到货单号、采购单号、供应商或 SKU" className="h-11 rounded-2xl border-border/80 bg-white pl-11" />
            </div>
            <FilterSelect value={statusFilter} onValueChange={setStatusFilter} placeholder="到货状态" options={data?.status_options ?? []} allLabel="全部状态" />
            <FilterSelect value={documentStatusFilter} onValueChange={setDocumentStatusFilter} placeholder="编排状态" options={data?.document_status_options ?? []} allLabel="全部编排状态" />
            <FilterSelect value={warehouseFilter} onValueChange={setWarehouseFilter} placeholder="到货仓" options={data?.warehouse_options ?? []} allLabel="全部到货仓" />
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => void loadArrivals(selectedKey)}>
              立即刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">到货清单</CardTitle>
            <p className="text-sm text-muted-foreground">左侧看清单，右侧推进状态与补录异常。</p>
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
                        onClick={() => selectArrival(item)}
                        className={cn(
                          "w-full rounded-[24px] border px-4 py-4 text-left transition",
                          selectedKey === item.id ? "border-slate-900 bg-slate-900 text-white shadow-[var(--shadow-card)]" : "border-border/70 bg-white hover:border-slate-200 hover:shadow-[var(--shadow-card)]",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold tracking-tight">{item.arrival_no}</p>
                            <p className={cn("mt-1 text-xs", selectedKey === item.id ? "text-slate-300" : "text-muted-foreground")}>
                              {item.purchase_order_no} · {item.supplier_name}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge active={selectedKey === item.id} status={item.status} />
                            <DocumentBadge active={selectedKey === item.id} status={item.document_status} />
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className={cn("text-xs", selectedKey === item.id ? "text-slate-300" : "text-muted-foreground")}>{item.sku_code}</p>
                            <p className="mt-1 text-sm font-medium">{item.sku_name}</p>
                          </div>
                          <div>
                            <p className={cn("text-xs", selectedKey === item.id ? "text-slate-300" : "text-muted-foreground")}>{item.warehouse_name}</p>
                            <p className="mt-1 text-sm font-medium">{formatDate(item.arrival_date)}</p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <MetricMini label="应到" value={formatNumber(item.expected_qty)} active={selectedKey === item.id} />
                          <MetricMini label="实到" value={formatNumber(item.arrived_qty)} active={selectedKey === item.id} />
                          <MetricMini label="差额" value={formatNumber(item.pending_qty)} active={selectedKey === item.id} />
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <Empty className="border-border/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><ClipboardCheck className="size-4" /></EmptyMedia>
                  <EmptyTitle>当前筛选下没有到货记录</EmptyTitle>
                  <EmptyDescription>可以先新建草稿，或者调整筛选条件重新查看。</EmptyDescription>
                </EmptyHeader>
                <Button className="cta-button rounded-full" onClick={startNewDraft}>新建到货草稿</Button>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">到货单编辑</CardTitle>
            <p className="text-sm text-muted-foreground">保存草稿后，再把状态推进到待执行、已到货或异常。</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="到货单号"><Input value={draft.arrival_no} onChange={(event) => updateDraft("arrival_no", event.target.value)} placeholder="留空则保存时自动生成" className="h-11 rounded-2xl border-border/80 bg-white" /></Field>
              <Field label="采购单号"><Input value={draft.purchase_order_no} onChange={(event) => updateDraft("purchase_order_no", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" /></Field>
              <Field label="供应商"><Input value={draft.supplier_name} onChange={(event) => updateDraft("supplier_name", event.target.value)} list="supplier-options" className="h-11 rounded-2xl border-border/80 bg-white" /><datalist id="supplier-options">{(data?.supplier_options ?? []).map((option) => <option key={option.value} value={option.label} />)}</datalist></Field>
              <Field label="到货日期"><Input type="date" value={draft.arrival_date ?? ""} onChange={(event) => updateDraft("arrival_date", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" /></Field>
              <Field label="到货状态"><FilterSelect value={draft.status} onValueChange={(value) => updateDraft("status", value)} placeholder="到货状态" options={data?.status_options ?? []} /></Field>
              <Field label="编排状态"><FilterSelect value={draft.document_status} onValueChange={(value) => updateDraft("document_status", value)} placeholder="编排状态" options={data?.document_status_options ?? []} /></Field>
              <Field label="到货仓"><FilterSelect value={draft.warehouse_code} onValueChange={updateWarehouse} placeholder="选择到货仓" options={data?.warehouse_options ?? []} /></Field>
              <Field label="渠道"><FilterSelect value={draft.channel_code || "__none"} onValueChange={updateChannel} placeholder="选择渠道" options={[{ value: "__none", label: "未指定" }, ...(data?.channel_options ?? [])]} /></Field>
              <Field label="SKU 编码"><Input value={draft.sku_code} onChange={(event) => updateDraft("sku_code", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" /></Field>
              <Field label="SKU 名称"><Input value={draft.sku_name} onChange={(event) => updateDraft("sku_name", event.target.value)} className="h-11 rounded-2xl border-border/80 bg-white" /></Field>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <Field label="应到数量"><Input type="number" min="0" step="1" value={draft.expected_qty} onChange={(event) => updateDraft("expected_qty", Number(event.target.value || 0))} className="h-11 rounded-2xl border-border/80 bg-white" /></Field>
              <Field label="实到数量"><Input type="number" min="0" step="1" value={draft.arrived_qty} onChange={(event) => updateDraft("arrived_qty", Number(event.target.value || 0))} className="h-11 rounded-2xl border-border/80 bg-white" /></Field>
              <Field label="合格数量"><Input type="number" min="0" step="1" value={draft.qualified_qty} onChange={(event) => updateDraft("qualified_qty", Number(event.target.value || 0))} className="h-11 rounded-2xl border-border/80 bg-white" /></Field>
              <Field label="异常数量"><Input type="number" min="0" step="1" value={draft.exception_qty} onChange={(event) => updateDraft("exception_qty", Number(event.target.value || 0))} className="h-11 rounded-2xl border-border/80 bg-white" /></Field>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
              <div className="rounded-[24px] border border-border/70 bg-muted/20 p-5">
                <p className="text-sm font-medium text-foreground">执行快照</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SnapshotCard label="到货完成率" value={formatPercent(fulfillmentRate)} />
                  <SnapshotCard label="合格率" value={formatPercent(qualityRate)} />
                  <SnapshotCard label="待到货差额" value={formatNumber(remainingQty)} />
                  <SnapshotCard label="异常数量" value={formatNumber(exceptionQty)} />
                </div>
              </div>
              <div className="rounded-[24px] border border-border/70 bg-muted/20 p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">异常与补偿说明</p>
                </div>
                <div className="mt-4 space-y-3">
                  <Textarea value={draft.exception_reason} onChange={(event) => updateDraft("exception_reason", event.target.value)} placeholder="例如：破损 6 台，待供应商补发" className="min-h-[96px] rounded-[20px] border-border/80 bg-white" />
                  <Textarea value={draft.remark} onChange={(event) => updateDraft("remark", event.target.value)} placeholder="补充线下沟通结论、后续执行安排或特殊说明" className="min-h-[96px] rounded-[20px] border-border/80 bg-white" />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="rounded-full" onClick={() => void saveArrival({ status: "draft" })} disabled={saving}>保存为草稿</Button>
              <Button className="cta-button rounded-full" onClick={() => void saveArrival({ status: "ready", document_status: draft.document_status === "synced" ? "synced" : "pending" })} disabled={saving}>标记待执行</Button>
              <Button variant="outline" className="rounded-full" onClick={() => void saveArrival({ status: "completed", document_status: draft.document_status === "pending" ? "generated" : draft.document_status })} disabled={saving}>标记已到货</Button>
              <Button variant="outline" className="rounded-full" onClick={() => void saveArrival({ status: "exception", document_status: "failed" })} disabled={saving}>标记异常</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1"><p className="text-3xl font-semibold tracking-tight">{value}</p>{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</CardContent>
    </Card>
  );
}

function MetricMini({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div>
      <p className={cn("text-xs", active ? "text-slate-300" : "text-muted-foreground")}>{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function SnapshotCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-border/70 bg-white px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function StatusBadge({ status, active }: { status: string; active: boolean }) {
  return <Badge variant="outline" className={cn("h-6 rounded-full px-2.5", active ? "border-white/30 bg-white/10 text-white" : statusMeta[status]?.className)}>{statusMeta[status]?.label ?? status}</Badge>;
}

function DocumentBadge({ status, active }: { status: string; active: boolean }) {
  return <Badge variant="outline" className={cn("h-6 rounded-full px-2.5", active ? "border-white/30 bg-white/10 text-white" : documentStatusMeta[status]?.className)}>{documentStatusMeta[status]?.label ?? status}</Badge>;
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
      <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allLabel ? <SelectItem value="all">{allLabel}</SelectItem> : null}
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
