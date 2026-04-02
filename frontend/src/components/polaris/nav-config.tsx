import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BookCheck,
  Bot,
  Boxes,
  ChartColumnIncreasing,
  Factory,
  LayoutGrid,
  ListTodo,
  Package,
  PencilLine,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

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
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const workspaceHomeItem: NavItem = {
  title: "北极星工作台",
  href: "/workspace",
  icon: LayoutGrid,
  description: "面向运营协同的统一入口与落地页。",
  headerEyebrow: "WORKSPACE",
  headerDescription:
    "把采购供应、库存流转、基础数据、任务协同和数据分析放到同一个运营工作台，减少来回切换页面的操作成本。",
  placement: "hidden",
};

export const agentNavItem: NavItem = {
  title: "数据分析agent",
  href: "/analysis/data-agent",
  icon: Bot,
  description: "像智能助手一样随时发起经营分析、问答与报告生成。",
  headerEyebrow: "ANALYSIS",
  headerDescription:
    "围绕经营数据问答、自动周报和分析辅助提供统一入口，让团队把分析动作直接收口到工作台内完成。",
  placement: "floating",
};

export const navSections: NavSection[] = [
  {
    title: "核心模块",
    items: [
      {
        title: "BI看板",
        href: "/governance/metrics",
        icon: ChartColumnIncreasing,
        description: "经营驾驶舱，可自定义看板与图表分析入口。",
        headerEyebrow: "GOVERNANCE",
        headerDescription:
          "支持按业务视图自由配置指标卡、图表组件、布局模板和看板编辑能力，让 BI 看板真正回到经营驾驶舱的核心入口。",
      },
      {
        title: "指标口径",
        href: "/governance/metric-dictionary",
        icon: BookCheck,
        description: "维护指标定义、公式、来源和责任归属。",
        headerEyebrow: "GOVERNANCE",
        headerDescription:
          "集中维护指标口径、计算公式、来源表和责任角色，给 BI 看板与业务分析提供统一的定义基础。",
        placement: "hidden",
      },
      {
        title: "采购供应",
        href: "/operations/procurement-arrivals",
        icon: Package,
        description: "单据入口、工作流编排与用友执行链路的统一控制台。",
        headerEyebrow: "OPERATIONS",
        headerBadge: "在线数据",
        headerDescription:
          "通过API打通用友采购模块，简化做单与流转操作，并支持业务流编排实现单据自动化，减少人工逐张创建和提交的工作量。",
      },
      {
        title: "库存流转",
        href: "/operations/inventory-flows",
        icon: ArrowLeftRight,
        description: "状态流转、仓间调拨与自动触发任务。",
        headerEyebrow: "OPERATIONS",
        headerDescription:
          "统一承接库存状态流转、仓间调拨和触发任务，让库存执行从人工跟进转为可追踪的规则化流程。",
      },
      {
        title: "售后库存",
        href: "/after-sales-entry",
        icon: ShieldCheck,
        description: "售后库存、保修查询与改号继承的独立后台入口。",
        headerEyebrow: "OPERATIONS",
        headerBadge: "独立登录",
        headerDescription:
          "进入售后库存与保修查询独立系统，使用该系统自己的账号登录，不依赖当前北极星工作台登录态。",
      },
      {
        title: "基础数据",
        href: "/governance/master-data",
        icon: Boxes,
        description: "SKU、仓库、状态和渠道店铺的基础数据维护。",
        headerEyebrow: "GOVERNANCE",
        headerDescription:
          "集中维护物料、BOM、仓库、库存状态和渠道店铺，为采购供应和库存流转提供统一的底层数据基础。",
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
          "把采购跟进、库存执行任务和异常待办收进同一块操作面板里，方便团队统一节奏和闭环跟进。",
      },
      {
        title: "对账补偿",
        href: "/operations/reconciliation-center",
        icon: ShieldAlert,
        description: "定位单据差异、任务缺口和失败补偿动作。",
        headerEyebrow: "OPERATIONS",
        headerDescription:
          "统一定位单据差异、任务缺口和失败补偿动作，让问题发现后能直接执行补偿，而不是反复切换系统排查。",
      },
      {
        title: "审计日志",
        href: "/governance/audit-logs",
        icon: ShieldCheck,
        description: "关键动作留痕、回溯与排查入口。",
        headerEyebrow: "GOVERNANCE",
        headerDescription:
          "统一查看关键变更动作、接口来源、触发人和执行结果，便于快速回溯问题和定位责任链路。",
      },
      {
        title: "翻新协同",
        href: "/operations/refurb-production",
        icon: Factory,
        description: "产能配置、排产日历和产线风险协同。",
        headerEyebrow: "OPERATIONS",
        headerDescription:
          "把翻新产能、每日排产、阻塞原因和近期实际收进同一块工作台里，让排产风险更早暴露和协同处理。",
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
      "围绕单个 BI 看板视图调整指标卡、图表组件和布局结构，让编辑页与运行页保持同一套工作台体验。",
    placement: "hidden",
  },
];

export const allNavItems = [
  workspaceHomeItem,
  ...navSections.flatMap((section) => section.items),
  ...hiddenNavItems,
  agentNavItem,
];

export function resolveNavItem(pathname: string) {
  const matchableItems = [...allNavItems].sort((left, right) => right.href.length - left.href.length);
  return (
    matchableItems.find((item) =>
      item.href === "/workspace" ? pathname === item.href : pathname.startsWith(item.href),
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

  const section =
    navSections.find((entry) => entry.items.some((item) => item.href === activeItem.href)) ?? navSections[0];

  return [section.title, activeItem.title];
}

export const overviewQuickLinks = [
  {
    title: "打开 BI看板",
    href: "/governance/metrics",
    icon: ChartColumnIncreasing,
  },
  {
    title: "进入采购供应",
    href: "/operations/procurement-arrivals",
    icon: Package,
  },
  {
    title: "处理库存流转",
    href: "/operations/inventory-flows",
    icon: ArrowLeftRight,
  },
  {
    title: "进入售后库存",
    href: "/after-sales-entry",
    icon: ShieldCheck,
  },
  {
    title: "打开基础数据",
    href: "/governance/master-data",
    icon: Boxes,
  },
  {
    title: "进入任务中心",
    href: "/operations/task-center",
    icon: ListTodo,
  },
  {
    title: "打开对账补偿",
    href: "/operations/reconciliation-center",
    icon: ShieldAlert,
  },
  {
    title: "进入审计日志",
    href: "/governance/audit-logs",
    icon: ShieldCheck,
  },
  {
    title: "进入翻新协同",
    href: "/operations/refurb-production",
    icon: Factory,
  },
  {
    title: "唤起数据分析agent",
    href: "/analysis/data-agent",
    icon: Bot,
  },
];
