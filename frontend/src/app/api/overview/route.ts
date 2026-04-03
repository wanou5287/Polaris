import { NextRequest, NextResponse } from "next/server";

import { canAccessAppPath } from "@/lib/polaris-access";
import type {
  AuditLogItem,
  AuditLogResponse,
  DataAgentReportsResponse,
  DataAgentStatus,
  MasterDataResponse,
  MetricDictionaryResponse,
  OverviewResponse,
  ReconciliationResponse,
  RefurbCollaborationResponse,
  TaskCenterResponse,
} from "@/lib/polaris-types";
import {
  POLARIS_SESSION_COOKIE,
  fetchPolarisJson,
  getCurrentUserProfile,
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
    const currentUser = session ? await getCurrentUserProfile(session) : null;
    if (currentUser && !canAccessAppPath(currentUser, "/workspace")) {
      return NextResponse.json(
        { message: "当前账号无权访问工作台总览" },
        { status: 403 },
      );
    }

    const [
      metricDictionary,
      masterData,
      taskCenter,
      refurbCollaboration,
      reconciliation,
      agentStatus,
      reports,
      auditLogs,
    ] = await Promise.all([
      fetchPolarisJson<MetricDictionaryResponse>("/financial/bi-dashboard/api/metric-dictionary", undefined, session),
      fetchPolarisJson<MasterDataResponse>("/financial/bi-dashboard/api/master-data", undefined, session),
      fetchPolarisJson<TaskCenterResponse>("/financial/bi-dashboard/api/task-center?limit=12", undefined, session),
      fetchPolarisJson<RefurbCollaborationResponse>("/financial/bi-dashboard/api/refurb-collaboration?limit=10", undefined, session),
      fetchPolarisJson<ReconciliationResponse>("/financial/bi-dashboard/api/reconciliation-center?limit=10", undefined, session),
      fetchPolarisJson<DataAgentStatus>("/financial/bi-dashboard/api/data-agent/status", undefined, session),
      fetchPolarisJson<DataAgentReportsResponse>("/financial/bi-dashboard/api/data-agent/reports?limit=8", undefined, session),
      currentUser?.is_admin
        ? fetchPolarisJson<AuditLogResponse>("/financial/bi-dashboard/api/audit-logs?limit=24", undefined, session)
        : Promise.resolve({
            items: [],
            summary: {},
            module_options: [],
            status_options: [],
          } satisfies AuditLogResponse),
    ]);

    const auditItems = auditLogs.items || [];
    const reportItems = reports.items || [];

    const payload: OverviewResponse = {
      currentUser,
      metricSummary: metricDictionary.summary,
      masterSummary: masterData.summary,
      taskCenterSummary: {
        ...taskCenter.summary,
        latestItems: taskCenter.items.slice(0, 5),
      },
      refurbSummary: {
        ...refurbCollaboration.summary,
        latestItems: refurbCollaboration.schedule_items.slice(0, 4),
      },
      reconciliationSummary: {
        ...reconciliation.summary,
        latestItems: reconciliation.items.slice(0, 4),
      },
      auditSummary: {
        total: auditItems.length,
        success: auditItems.filter((item) => item.result_status === "success").length,
        failed: auditItems.filter((item) => item.result_status === "failed").length,
        latestItems: auditItems.slice(0, 6),
        moduleBreakdown: countBy(auditItems, (item: AuditLogItem) => item.module_name || item.module_key || "未分类"),
      },
      agentStatus,
      reports: {
        items: reportItems,
        weeklyCount: reportItems.filter((item) => item.report_type === "weekly").length,
        monthlyCount: reportItems.filter((item) => item.report_type === "monthly").length,
        series: countByToSeries(reportItems, (item) => item.period_label || "未命名周期"),
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "总览数据加载失败，请稍后重试";
    return NextResponse.json({ message }, { status: 500 });
  }
}
