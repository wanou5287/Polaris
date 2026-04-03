import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BookCheck,
  Bot,
  Boxes,
  ChartColumnIncreasing,
  Factory,
  Hammer,
  LayoutGrid,
  ListTodo,
  Package,
  PencilLine,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";

import { MODULE_PERMISSION_KEYS, type ModulePermissionKey } from "@/lib/polaris-access";

export type NavPlacement = "sidebar" | "floating" | "hidden";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  headerEyebrow?: string;
  headerDescription?: string;
  headerBadge?: string;
  placement?: NavPlacement;
  breadcrumbSection?: string;
  permissionKey?: ModulePermissionKey;
  adminOnly?: boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const workspaceHomeItem: NavItem = {
  title: "北极星工作台",
  href: "/workspace",
  icon: LayoutGrid,
  description: "把采购、库存、售后、任务与分析放进同一个工作台。",
  headerEyebrow: "WORKSPACE",
  headerDescription:
    "统一承接供应链协同、执行闭环与经营决策，减少在多个系统之间来回切换的成本。",
  placement: "hidden",
  breadcrumbSection: "工作台",
};

export const agentNavItem: NavItem = {
  title: "小北·数据分析 Agent",
  href: "/analysis/data-agent",
  icon: Bot,
  description: "像智能助手一样随时发起分析、问答与报告生成。",
  headerEyebrow: "ANALYSIS",
  headerDescription:
    "围绕经营数据问答、周报月报和分析辅助提供统一入口，让分析动作直接收口到工作台内完成。",
  placement: "floating",
  breadcrumbSection: "智能助手",
  permissionKey: MODULE_PERMISSION_KEYS.dataAgent,
};

export const userManagementNavItem: NavItem = {
  title: "用户管理",
  href: "/settings/users",
  icon: Users,
  description: "仅管理员可进入，用于维护账号、角色、模块权限与启停状态。",
  headerEyebrow: "SETTINGS",
  headerDescription:
    "通过右上角管理员入口统一维护系统账号、角色归属、模块权限和启停状态，左侧导航不新增独立入口。",
  placement: "hidden",
  breadcrumbSection: "系统设置",
  permissionKey: MODULE_PERMISSION_KEYS.userManagement,
  adminOnly: true,
};

export const navSections: NavSection[] = [
  {
    title: "核心模块",
    items: [
      {
        title: "BI 看板",
        href: "/governance/metrics",
        icon: ChartColumnIncreasing,
        description: "经营驾驶舱、可自定义看板与图表分析入口。",
        headerEyebrow: "GOVERNANCE",
        headerDescription:
          "支持围绕经营指标卡、图表组件和布局模版快速搭建驾驶舱页面，让 BI 看板回到经营协同的核心位置。",
        permissionKey: MODULE_PERMISSION_KEYS.metrics,
      },
      {
        title: "指标口径",
        href: "/governance/metric-dictionary",
        icon: BookCheck,
        description: "统一维护核心指标定义、责任人和口径版本。",
        headerEyebrow: "GOVERNANCE",
        headerDescription:
          "集中维护指标定义、计算公式、来源表与责任角色，为看板和经营分析提供统一口径。",
        placement: "hidden",
        breadcrumbSection: "治理",
        permissionKey: MODULE_PERMISSION_KEYS.metrics,
      },
      {
        title: "采购供应",
        href: "/operations/procurement-arrivals",
        icon: Package,
        description: "采购单据、到货录入与业务流编排的一体化控制台。",
        headerEyebrow: "OPERATIONS",
        headerBadge: "在线数据",
        headerDescription:
          "通过 API 打通用友采购链路，统一处理到货录入、单据状态和业务流编排，减少人工逐张跟进。",
        permissionKey: MODULE_PERMISSION_KEYS.procurementArrivals,
      },
      {
        title: "售后维修",
        href: "/operations/after-sales-repair",
        icon: Hammer,
        description: "维修接单、处理进度、复检与返还闭环的专属工作台。",
        headerEyebrow: "OPERATIONS",
        headerDescription:
          "面向售后维修角色集中查看待接收、维修中、待复检和已完结工单，统一承接维修闭环。",
        permissionKey: MODULE_PERMISSION_KEYS.afterSalesRepair,
      },
      {
        title: "库存流转",
        href: "/operations/inventory-flows",
        icon: ArrowLeftRight,
        description: "状态流转、仓间调拨与自动触发任务。",
        headerEyebrow: "OPERATIONS",
        headerDescription:
          "统一承接库存状态流转、仓间调拨和执行任务，让库存动作从人工跟进转成可追踪流程。",
        permissionKey: MODULE_PERMISSION_KEYS.inventoryFlows,
      },
      {
        title: "基础数据",
        href: "/governance/master-data",
        icon: Boxes,
        description: "SKU、仓库、状态和渠道店铺的基础数据维护。",
        headerEyebrow: "GOVERNANCE",
        headerDescription:
          "集中维护物料、仓库、库存状态和渠道店铺，为采购、库存和协同链路提供统一底层数据。",
        permissionKey: MODULE_PERMISSION_KEYS.masterData,
      },
    ],
  },
  {
    title: "其他模块",
    items: [
      {
        title: "任务中心",
        href: "/operations/task-center",
        icon: ListTodo,
        description: "统一承接采购、库存执行和异常待办。",
        headerEyebrow: "OPERATIONS",
        headerDescription:
          "把采购跟进、库存执行任务和异常待办收进同一块操作面板里，方便团队统一节奏和闭环。",
        permissionKey: MODULE_PERMISSION_KEYS.taskCenter,
      },
      {
        title: "对账补偿",
        href: "/operations/reconciliation-center",
        icon: ShieldAlert,
        description: "定位单据差异、任务缺口和失败补偿动作。",
        headerEyebrow: "OPERATIONS",
        headerDescription:
          "统一定位单据差异、任务缺口和失败补偿动作，让问题发现后能直接执行补偿。",
        permissionKey: MODULE_PERMISSION_KEYS.reconciliationCenter,
      },
      {
        title: "审计日志",
        href: "/governance/audit-logs",
        icon: ShieldCheck,
        description: "关键动作留痕、回溯与排查入口。",
        headerEyebrow: "GOVERNANCE",
        headerDescription:
          "统一查看关键变更动作、接口来源、触发人和执行结果，便于快速回溯问题和定位责任链路。",
        permissionKey: MODULE_PERMISSION_KEYS.auditLogs,
        adminOnly: true,
      },
      {
        title: "翻新协同",
        href: "/operations/refurb-production",
        icon: Factory,
        description: "产能配置、排产日历和产线风险协同。",
        headerEyebrow: "OPERATIONS",
        headerDescription:
          "把翻新产能、每日排产、阻塞原因和近期实际产出收口到统一工作台内，便于提前暴露风险。",
        permissionKey: MODULE_PERMISSION_KEYS.refurbProduction,
      },
    ],
  },
];

export const sidebarNavSections = navSections
  .map((section) => ({
    ...section,
    items: section.items.filter((item) => (item.placement ?? "sidebar") === "sidebar"),
  }))
  .filter((section) => section.items.length > 0);

const hiddenNavItems: NavItem[] = [
  {
    title: "看板编辑",
    href: "/governance/metrics/editor",
    icon: PencilLine,
    description: "配置 BI 看板中的视图、指标卡与图表布局。",
    headerEyebrow: "GOVERNANCE",
    headerDescription:
      "围绕单个 BI 看板视图调整指标卡、图表组件和布局结构，让编辑页与运行页保持同一套体验。",
    placement: "hidden",
    breadcrumbSection: "治理",
    permissionKey: MODULE_PERMISSION_KEYS.metrics,
  },
  userManagementNavItem,
];

export const allNavItems = [
  workspaceHomeItem,
  ...navSections.flatMap((section) => section.items),
  ...hiddenNavItems,
  agentNavItem,
];

export function resolveNavItem(pathname: string) {
  const matchableItems = [...allNavItems].sort(
    (left, right) => right.href.length - left.href.length,
  );
  return (
    matchableItems.find((item) =>
      item.href === "/workspace"
        ? pathname === item.href
        : pathname.startsWith(item.href),
    ) ?? workspaceHomeItem
  );
}

export function resolveBreadcrumbs(pathname: string) {
  const activeItem = resolveNavItem(pathname);

  if (activeItem.href === workspaceHomeItem.href) {
    return ["工作台", workspaceHomeItem.title];
  }

  if (activeItem.href === agentNavItem.href) {
    return ["智能助手", agentNavItem.title];
  }

  if (activeItem.breadcrumbSection) {
    return [activeItem.breadcrumbSection, activeItem.title];
  }

  const section =
    navSections.find((entry) =>
      entry.items.some((item) => item.href === activeItem.href),
    ) ?? navSections[0];

  return [section.title, activeItem.title];
}

export const overviewQuickLinks: NavItem[] = [
  {
    title: "打开 BI 看板",
    href: "/governance/metrics",
    icon: ChartColumnIncreasing,
    description: "进入 BI 看板工作台。",
    permissionKey: MODULE_PERMISSION_KEYS.metrics,
  },
  {
    title: "进入采购供应",
    href: "/operations/procurement-arrivals",
    icon: Package,
    description: "进入采购供应协同。",
    permissionKey: MODULE_PERMISSION_KEYS.procurementArrivals,
  },
  {
    title: "进入售后维修",
    href: "/operations/after-sales-repair",
    icon: Hammer,
    description: "进入售后维修工作台。",
    permissionKey: MODULE_PERMISSION_KEYS.afterSalesRepair,
  },
  {
    title: "处理库存流转",
    href: "/operations/inventory-flows",
    icon: ArrowLeftRight,
    description: "进入库存流转工作台。",
    permissionKey: MODULE_PERMISSION_KEYS.inventoryFlows,
  },
  {
    title: "打开基础数据",
    href: "/governance/master-data",
    icon: Boxes,
    description: "进入基础数据治理。",
    permissionKey: MODULE_PERMISSION_KEYS.masterData,
  },
  {
    title: "进入任务中心",
    href: "/operations/task-center",
    icon: ListTodo,
    description: "进入统一待办中心。",
    permissionKey: MODULE_PERMISSION_KEYS.taskCenter,
  },
  {
    title: "打开对账补偿",
    href: "/operations/reconciliation-center",
    icon: ShieldAlert,
    description: "进入对账补偿中心。",
    permissionKey: MODULE_PERMISSION_KEYS.reconciliationCenter,
  },
  {
    title: "进入审计日志",
    href: "/governance/audit-logs",
    icon: ShieldCheck,
    description: "查看平台关键动作留痕。",
    permissionKey: MODULE_PERMISSION_KEYS.auditLogs,
    adminOnly: true,
  },
  {
    title: "进入翻新协同",
    href: "/operations/refurb-production",
    icon: Factory,
    description: "进入翻新协同工作台。",
    permissionKey: MODULE_PERMISSION_KEYS.refurbProduction,
  },
  {
    title: "唤起小北·数据分析 Agent",
    href: "/analysis/data-agent",
    icon: Bot,
    description: "打开智能分析助手。",
    permissionKey: MODULE_PERMISSION_KEYS.dataAgent,
  },
];
