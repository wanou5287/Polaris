import { NextRequest, NextResponse } from "next/server";

import type {
  AuditLogItem,
  AuditLogResponse,
  DataAgentReportsResponse,
  DataAgentStatus,
  MasterDataResponse,
  MetricDictionaryResponse,
  OverviewResponse,
} from "@/lib/polaris-types";
import {
  POLARIS_SESSION_COOKIE,
  fetchPolarisJson,
} from "@/lib/polaris-server";

function countBy<T>(items: T[], selector: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = selector(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

function countByToSeries<T>(items: T[], selector: (item: T) => string) {
  return countBy(items, selector).map(({ label, value }) => ({ label, count: value }));
}

export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get(POLARIS_SESSION_COOKIE)?.value ?? null;

    const [
      metricDictionary,
      masterData,
      auditLogs,
      agentStatus,
      reports,
    ] = await Promise.all([
      fetchPolarisJson<MetricDictionaryResponse>(
        "/financial/bi-dashboard/api/metric-dictionary",
        undefined,
        session,
      ),
      fetchPolarisJson<MasterDataResponse>(
        "/financial/bi-dashboard/api/master-data",
        undefined,
        session,
      ),
      fetchPolarisJson<AuditLogResponse>(
        "/financial/bi-dashboard/api/audit-logs?limit=24",
        undefined,
        session,
      ),
      fetchPolarisJson<DataAgentStatus>(
        "/financial/bi-dashboard/api/data-agent/status",
        undefined,
        session,
      ),
      fetchPolarisJson<DataAgentReportsResponse>(
        "/financial/bi-dashboard/api/data-agent/reports?limit=8",
        undefined,
        session,
      ),
    ]);

    const auditItems = auditLogs.items || [];
    const reportItems = reports.items || [];

    const payload: OverviewResponse = {
      metricSummary: metricDictionary.summary,
      masterSummary: masterData.summary,
      auditSummary: {
        total: auditItems.length,
        success: auditItems.filter((item) => item.result_status === "success").length,
        failed: auditItems.filter((item) => item.result_status === "failed").length,
        latestItems: auditItems.slice(0, 6),
        moduleBreakdown: countBy(
          auditItems,
          (item: AuditLogItem) => item.module_name || item.module_key || "未分类",
        ),
      },
      agentStatus,
      reports: {
        items: reportItems,
        weeklyCount: reportItems.filter((item) => item.report_type === "weekly")
          .length,
        monthlyCount: reportItems.filter(
          (item) => item.report_type === "monthly",
        ).length,
        series: countByToSeries(
          reportItems,
          (item) => item.period_label || "未命名周期",
        ),
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "总览数据加载失败，请稍后重试";
    return NextResponse.json({ message }, { status: 500 });
  }
}
