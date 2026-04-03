import type { CurrentUser } from "@/lib/polaris-types";

export const MODULE_PERMISSION_KEYS = {
  metrics: "metrics",
  procurementArrivals: "procurement-arrivals",
  afterSalesRepair: "after-sales-repair",
  inventoryFlows: "inventory-flows",
  masterData: "master-data",
  taskCenter: "task-center",
  reconciliationCenter: "reconciliation-center",
  auditLogs: "audit-logs",
  refurbProduction: "refurb-production",
  dataAgent: "data-agent",
  userManagement: "user-management",
} as const;

export type ModulePermissionKey =
  (typeof MODULE_PERMISSION_KEYS)[keyof typeof MODULE_PERMISSION_KEYS];

type RouteMatcher = {
  prefix: string;
  permissionKey?: ModulePermissionKey;
  adminOnly?: boolean;
};

const appRouteMatchers: RouteMatcher[] = [
  { prefix: "/settings/users", permissionKey: MODULE_PERMISSION_KEYS.userManagement, adminOnly: true },
  { prefix: "/governance/audit-logs", permissionKey: MODULE_PERMISSION_KEYS.auditLogs, adminOnly: true },
  { prefix: "/analysis/data-agent", permissionKey: MODULE_PERMISSION_KEYS.dataAgent },
  { prefix: "/operations/procurement-arrivals", permissionKey: MODULE_PERMISSION_KEYS.procurementArrivals },
  { prefix: "/operations/after-sales-repair", permissionKey: MODULE_PERMISSION_KEYS.afterSalesRepair },
  { prefix: "/operations/inventory-flows", permissionKey: MODULE_PERMISSION_KEYS.inventoryFlows },
  { prefix: "/operations/task-center", permissionKey: MODULE_PERMISSION_KEYS.taskCenter },
  { prefix: "/operations/reconciliation-center", permissionKey: MODULE_PERMISSION_KEYS.reconciliationCenter },
  { prefix: "/operations/refurb-production", permissionKey: MODULE_PERMISSION_KEYS.refurbProduction },
  { prefix: "/governance/master-data", permissionKey: MODULE_PERMISSION_KEYS.masterData },
  { prefix: "/governance/metric-dictionary", permissionKey: MODULE_PERMISSION_KEYS.metrics },
  { prefix: "/governance/metrics", permissionKey: MODULE_PERMISSION_KEYS.metrics },
];

const backendRouteMatchers: RouteMatcher[] = [
  { prefix: "/financial/bi-dashboard/api/user-management", permissionKey: MODULE_PERMISSION_KEYS.userManagement, adminOnly: true },
  { prefix: "/financial/bi-dashboard/api/audit-logs", permissionKey: MODULE_PERMISSION_KEYS.auditLogs, adminOnly: true },
  { prefix: "/financial/bi-dashboard/api/data-agent", permissionKey: MODULE_PERMISSION_KEYS.dataAgent },
  { prefix: "/financial/bi-dashboard/api/procurement-arrivals", permissionKey: MODULE_PERMISSION_KEYS.procurementArrivals },
  { prefix: "/financial/bi-dashboard/api/procurement-supply", permissionKey: MODULE_PERMISSION_KEYS.procurementArrivals },
  { prefix: "/financial/bi-dashboard/api/inventory-flows", permissionKey: MODULE_PERMISSION_KEYS.inventoryFlows },
  { prefix: "/financial/bi-dashboard/api/task-center", permissionKey: MODULE_PERMISSION_KEYS.taskCenter },
  { prefix: "/financial/bi-dashboard/api/reconciliation-center", permissionKey: MODULE_PERMISSION_KEYS.reconciliationCenter },
  { prefix: "/financial/bi-dashboard/api/refurb-collaboration", permissionKey: MODULE_PERMISSION_KEYS.refurbProduction },
  { prefix: "/financial/bi-dashboard/api/master-data", permissionKey: MODULE_PERMISSION_KEYS.masterData },
  { prefix: "/financial/bi-dashboard/api/metric-dictionary", permissionKey: MODULE_PERMISSION_KEYS.metrics },
];

function sanitizePath(path: string | null | undefined) {
  const candidate = String(path ?? "").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/workspace";
  }
  return candidate;
}

export function normalizeModulePermissions(value: unknown) {
  if (!value) {
    return [] as string[];
  }

  const raw =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return value.split(",");
          }
        })()
      : value;

  if (!Array.isArray(raw)) {
    return [] as string[];
  }

  return raw
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .filter((item, index, collection) => collection.indexOf(item) === index);
}

export function hasExplicitModuleRestrictions(user: CurrentUser | null | undefined) {
  return normalizeModulePermissions(user?.module_permissions).length > 0;
}

export function resolveHomePath(user: CurrentUser | null | undefined) {
  return sanitizePath(user?.default_home_path || "/workspace");
}

export function canAccessPermission(
  user: CurrentUser | null | undefined,
  permissionKey?: ModulePermissionKey,
  adminOnly = false,
) {
  if (!user?.access_granted) {
    return false;
  }
  if (adminOnly) {
    return Boolean(user.is_admin);
  }
  if (!permissionKey) {
    return true;
  }
  if (user.is_admin) {
    return true;
  }
  const permissions = normalizeModulePermissions(user.module_permissions);
  if (!permissions.length) {
    return true;
  }
  return permissions.includes(permissionKey);
}

function resolveRouteMatcher(pathname: string, matchers: RouteMatcher[]) {
  const target = sanitizePath(pathname);
  return matchers.find((matcher) => target.startsWith(matcher.prefix));
}

export function canAccessAppPath(
  user: CurrentUser | null | undefined,
  pathname: string,
) {
  const target = sanitizePath(pathname);
  if (target === "/workspace") {
    if (!user?.access_granted) {
      return false;
    }
    if (user.is_admin) {
      return true;
    }
    if (hasExplicitModuleRestrictions(user) && resolveHomePath(user) !== "/workspace") {
      return false;
    }
    return true;
  }

  const matcher = resolveRouteMatcher(target, appRouteMatchers);
  if (!matcher) {
    return true;
  }
  return canAccessPermission(user, matcher.permissionKey, matcher.adminOnly);
}

export function canAccessBackendPath(
  user: CurrentUser | null | undefined,
  backendPath: string,
) {
  const target = sanitizePath(backendPath);
  if (
    target.startsWith("/financial/bi-dashboard/api/session/me") ||
    target.startsWith("/financial/bi-dashboard/api/session/password")
  ) {
    return Boolean(user?.access_granted);
  }

  const matcher = resolveRouteMatcher(target, backendRouteMatchers);
  if (!matcher) {
    return Boolean(user?.access_granted);
  }
  return canAccessPermission(user, matcher.permissionKey, matcher.adminOnly);
}

