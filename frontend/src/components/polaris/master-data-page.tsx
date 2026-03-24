"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { Database, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/polaris/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  apiFetch,
  formatDate,
  formatNumber,
} from "@/lib/polaris-client";
import type {
  ChannelItem,
  MasterDataResponse,
  SkuItem,
  StatusItem,
  WarehouseItem,
} from "@/lib/polaris-types";

type EditableDataset = "skus" | "warehouses" | "statuses" | "channels";

type Column<T> = {
  key: keyof T & string;
  label: string;
  type?: "text" | "number" | "boolean";
  width?: string;
};

function DatasetTable<T extends { id: number }>({
  rows,
  columns,
  onChange,
}: {
  rows: T[];
  columns: Column<T>[];
  onChange: (id: number, key: keyof T & string, value: string | number | boolean) => void;
}) {
  return (
    <div className="surface-table overflow-hidden">
      <ScrollArea className="h-[560px]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {columns.map((column) => (
                <TableHead key={column.key} className={column.width}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((column) => {
                  const rawValue = row[column.key];
                  return (
                    <TableCell key={column.key} className="align-top">
                      {column.type === "boolean" ? (
                        <Switch
                          checked={Boolean(rawValue)}
                          onCheckedChange={(checked) =>
                            onChange(row.id, column.key, checked)
                          }
                        />
                      ) : (
                        <Input
                          type={column.type === "number" ? "number" : "text"}
                          value={String(rawValue ?? "")}
                          onChange={(event) =>
                            onChange(
                              row.id,
                              column.key,
                              column.type === "number"
                                ? Number(event.target.value || 0)
                                : event.target.value,
                            )
                          }
                          className="h-10 rounded-xl border-border/70 bg-white"
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

function updateRows<T extends { id: number }>(
  rows: T[],
  id: number,
  key: keyof T & string,
  value: string | number | boolean,
) {
  return rows.map((row) => (row.id === id ? { ...row, [key]: value } : row));
}

async function requestMasterData() {
  return apiFetch<MasterDataResponse>("/api/backend/master-data");
}

export function MasterDataPage() {
  const [data, setData] = useState<MasterDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<EditableDataset>("skus");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  async function loadMasterData() {
    setLoading(true);
    try {
      const response = await requestMasterData();
      setData(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        const response = await requestMasterData();
        if (!cancelled) {
          setData(response);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "主数据加载失败");
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
      await apiFetch("/api/backend/master-data", {
        method: "PUT",
        body: JSON.stringify({
          skus: data.skus,
          warehouses: data.warehouses,
          statuses: data.statuses,
          channels: data.channels,
        }),
      });
      toast.success("主数据已保存");
      const response = await requestMasterData();
      setData(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主数据保存失败");
    } finally {
      setSaving(false);
    }
  }

  function updateDataset(
    dataset: EditableDataset,
    id: number,
    key: string,
    value: string | number | boolean,
  ) {
    setData((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [dataset]: updateRows(
          current[dataset] as Array<{ id: number }>,
          id,
          key as never,
          value,
        ),
      } as MasterDataResponse;
    });
  }

  const skuColumns = [
    { key: "sku_code", label: "SKU 编码" },
    { key: "sku_name", label: "SKU 名称", width: "min-w-[220px]" },
    { key: "sku_type", label: "类型" },
    { key: "product_line", label: "产品线" },
    { key: "lifecycle_status", label: "生命周期" },
    { key: "owner_dept", label: "责任部门" },
    { key: "sort_order", label: "排序", type: "number" as const },
    { key: "is_active", label: "启用", type: "boolean" as const },
  ] satisfies Column<SkuItem>[];

  const warehouseColumns = [
    { key: "source_warehouse_name", label: "原始仓库名", width: "min-w-[200px]" },
    { key: "warehouse_name_clean", label: "标准仓库名", width: "min-w-[200px]" },
    { key: "warehouse_code", label: "仓库编码" },
    { key: "warehouse_type", label: "类型" },
    { key: "city", label: "城市" },
    { key: "is_sellable_warehouse", label: "可售", type: "boolean" as const },
    { key: "is_reverse_warehouse", label: "逆向", type: "boolean" as const },
    { key: "is_enabled", label: "启用", type: "boolean" as const },
  ] satisfies Column<WarehouseItem>[];

  const statusColumns = [
    { key: "stock_status_id", label: "状态 ID" },
    { key: "stock_status_name", label: "状态名", width: "min-w-[180px]" },
    { key: "status_group", label: "分组" },
    { key: "can_sell", label: "可售", type: "boolean" as const },
    { key: "can_forecast_supply", label: "参与预测", type: "boolean" as const },
    { key: "need_quality_check", label: "质检", type: "boolean" as const },
    { key: "next_default_status", label: "默认后续状态" },
    { key: "is_enabled", label: "启用", type: "boolean" as const },
  ] satisfies Column<StatusItem>[];

  const channelColumns = [
    { key: "channel_code", label: "渠道编码" },
    { key: "channel_name", label: "渠道名称" },
    { key: "shop_name", label: "店铺名", width: "min-w-[220px]" },
    { key: "platform_name", label: "平台" },
    { key: "owner_dept", label: "责任部门" },
    { key: "sort_order", label: "排序", type: "number" as const },
    { key: "is_active", label: "启用", type: "boolean" as const },
  ] satisfies Column<ChannelItem>[];

  const skuRows =
    data?.skus.filter((row) =>
      JSON.stringify(row).toLowerCase().includes(deferredQuery.toLowerCase()),
    ) ?? [];
  const warehouseRows =
    data?.warehouses.filter((row) =>
      JSON.stringify(row).toLowerCase().includes(deferredQuery.toLowerCase()),
    ) ?? [];
  const statusRows =
    data?.statuses.filter((row) =>
      JSON.stringify(row).toLowerCase().includes(deferredQuery.toLowerCase()),
    ) ?? [];
  const channelRows =
    data?.channels.filter((row) =>
      JSON.stringify(row).toLowerCase().includes(deferredQuery.toLowerCase()),
    ) ?? [];

  const tabs = [
    { key: "skus" as const, label: `SKU (${formatNumber(data?.skus.length ?? 0)})`, count: skuRows.length },
    { key: "warehouses" as const, label: `仓库 (${formatNumber(data?.warehouses.length ?? 0)})`, count: warehouseRows.length },
    { key: "statuses" as const, label: `库存状态 (${formatNumber(data?.statuses.length ?? 0)})`, count: statusRows.length },
    { key: "channels" as const, label: `渠道店铺 (${formatNumber(data?.channels.length ?? 0)})`, count: channelRows.length },
  ];

  const currentTab = tabs.find((item) => item.key === activeTab) ?? tabs[0];

  function renderCurrentTable() {
    if (!data) {
      return null;
    }

    if (activeTab === "skus") {
      return (
        <DatasetTable
          rows={skuRows}
          columns={skuColumns}
          onChange={(id, key, value) => updateDataset("skus", id, key, value)}
        />
      );
    }

    if (activeTab === "warehouses") {
      return (
        <DatasetTable
          rows={warehouseRows}
          columns={warehouseColumns}
          onChange={(id, key, value) =>
            updateDataset("warehouses", id, key, value)
          }
        />
      );
    }

    if (activeTab === "statuses") {
      return (
        <DatasetTable
          rows={statusRows}
          columns={statusColumns}
          onChange={(id, key, value) => updateDataset("statuses", id, key, value)}
        />
      );
    }

    return (
      <DatasetTable
        rows={channelRows}
        columns={channelColumns}
        onChange={(id, key, value) => updateDataset("channels", id, key, value)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="surface-panel p-6 sm:p-8">
        <PageHeader
          eyebrow="Governance"
          title="主数据治理中心"
          description="围绕 SKU、仓库、库存状态与渠道店铺建立统一对象中心。新界面将这四类对象收敛为同一套标签式维护体验。"
          badge={data ? `最近库存清洗 ${formatDate(data.summary.latest_inventory_cleaning_date)}` : "加载中"}
          actions={
            <>
              <Button variant="outline" className="rounded-full" onClick={() => void loadMasterData()}>
                <RefreshCcw className="size-4" />
                刷新
              </Button>
              <Button className="cta-button rounded-full" onClick={saveAll} disabled={saving || !data}>
                <Save className={saving ? "size-4 animate-pulse" : "size-4"} />
                保存全部
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">SKU</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {formatNumber(data?.summary.sku_count ?? null)}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">仓库</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {formatNumber(data?.summary.warehouse_count ?? null)}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">库存状态</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {formatNumber(data?.summary.status_count ?? null)}
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/80 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">渠道店铺</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tracking-tight">
            {formatNumber(data?.summary.channel_count ?? null)}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[28px] border-border/80 shadow-[var(--shadow-panel)]">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-lg">对象维护</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                通过单一工作台切换不同主数据对象，避免团队在多套旧页面中来回跳转。
              </p>
            </div>
            <Input
              placeholder="搜索当前标签中的任意字段"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 rounded-2xl border-border/80 bg-white lg:w-[320px]"
            />
          </div>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as EditableDataset)}>
            <TabsList className="h-auto rounded-[20px] border border-border/80 bg-white p-1">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="rounded-[16px] px-4 py-2"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="h-[560px] rounded-[22px] border border-border/70 bg-muted/30" />
          ) : currentTab.count ? (
            renderCurrentTable()
          ) : (
            <Empty className="border-border/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Database className="size-4" />
                </EmptyMedia>
                <EmptyTitle>当前筛选下没有数据</EmptyTitle>
                <EmptyDescription>换个关键词或刷新数据后再试。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
