import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Bot,
  BookCheck,
  Boxes,
  ChartColumnIncreasing,
  Factory,
  LayoutGrid,
  ListTodo,
  Package,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    title: "工作台",
    items: [
      {
        title: "总览",
        href: "/workspace",
        icon: LayoutGrid,
        description: "跨模块态势、待办与关键风险入口",
      },
    ],
  },
  {
    title: "治理",
    items: [
      {
        title: "指标口径",
        href: "/governance/metrics",
        icon: BookCheck,
        description: "统一经营口径、责任人与版本信息",
      },
      {
        title: "主数据",
        href: "/governance/master-data",
        icon: Boxes,
        description: "SKU、仓库、状态和渠道店铺的主数据治理",
      },
      {
        title: "审计日志",
        href: "/governance/audit-logs",
        icon: ShieldCheck,
        description: "关键动作留痕、回溯与排查入口",
      },
    ],
  },
  {
    title: "执行",
    items: [
      {
        title: "任务中心",
        href: "/operations/task-center",
        icon: ListTodo,
        description: "统一承接采购、库存执行和异常待办",
      },
      {
        title: "对账补偿",
        href: "/operations/reconciliation-center",
        icon: ShieldAlert,
        description: "定位单据差异、任务缺口和失败补偿动作",
      },
      {
        title: "采购到货",
        href: "/operations/procurement-arrivals",
        icon: Package,
        description: "到货录入、草稿管理与单据编排状态",
      },
      {
        title: "库存流转",
        href: "/operations/inventory-flows",
        icon: ArrowLeftRight,
        description: "状态流转、仓间调拨与自动触发任务",
      },
      {
        title: "翻新协同",
        href: "/operations/refurb-production",
        icon: Factory,
        description: "产能配置、排产日历和产线风险协同",
      },
    ],
  },
  {
    title: "分析",
    items: [
      {
        title: "DataAgent",
        href: "/analysis/data-agent",
        icon: Bot,
        description: "问答、诊断与周月报生成",
      },
    ],
  },
];

export const allNavItems = navSections.flatMap((section) => section.items);

export function resolveNavItem(pathname: string) {
  return (
    allNavItems.find((item) =>
      item.href === "/workspace" ? pathname === item.href : pathname.startsWith(item.href),
    ) ?? allNavItems[0]
  );
}

export function resolveBreadcrumbs(pathname: string) {
  const activeItem = resolveNavItem(pathname);
  const section =
    navSections.find((entry) => entry.items.some((item) => item.href === activeItem.href)) ?? navSections[0];

  return [section.title, activeItem.title];
}

export const overviewQuickLinks = [
  {
    title: "查看指标口径",
    href: "/governance/metrics",
    icon: BookCheck,
  },
  {
    title: "打开主数据",
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
    title: "录入采购到货",
    href: "/operations/procurement-arrivals",
    icon: Package,
  },
  {
    title: "处理库存流转",
    href: "/operations/inventory-flows",
    icon: ArrowLeftRight,
  },
  {
    title: "进入翻新协同",
    href: "/operations/refurb-production",
    icon: Factory,
  },
  {
    title: "进入 DataAgent",
    href: "/analysis/data-agent",
    icon: ChartColumnIncreasing,
  },
];
