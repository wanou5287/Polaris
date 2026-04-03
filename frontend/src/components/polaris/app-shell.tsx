"use client";

import {
  ChevronDown,
  Loader2,
  LogOut,
  Menu,
  PanelTopOpen,
  Settings2,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PolarisBrandMark } from "@/components/polaris/brand-mark";
import {
  RouteTransitionProvider,
  TransitionLink,
  useRouteTransition,
} from "@/components/polaris/transition-link";
import {
  agentNavItem,
  resolveNavItem,
  sidebarNavSections,
  userManagementNavItem,
} from "@/components/polaris/nav-config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { canAccessPermission } from "@/lib/polaris-access";
import { cn } from "@/lib/polaris-client";
import type { CurrentUser } from "@/lib/polaris-types";

const workspaceContainerClass =
  "mx-auto w-full max-w-[1560px] px-4 sm:px-6 lg:px-6 xl:px-8 2xl:px-10";

function LogoutAction({
  compact = false,
  onDone,
}: {
  compact?: boolean;
  onDone?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleLogout() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("退出失败，请稍后重试。");
      }

      const payload = (await response.json()) as { redirect_to?: string };
      const redirectPath = payload.redirect_to || "/login";
      onDone?.();
      toast.success("已退出当前账号");
      window.location.replace(redirectPath);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "退出失败，请稍后重试。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "default"}
      className="rounded-full border-border/80 bg-white/90 shadow-[var(--shadow-card)]"
      onClick={handleLogout}
      disabled={submitting}
      aria-label="退出登录"
    >
      {submitting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      {compact ? null : "退出登录"}
    </Button>
  );
}

function SidebarContent({
  currentUser,
  pathname,
  onNavigate,
}: {
  currentUser: CurrentUser;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = resolveNavItem(pathname);
  const visibleSections = sidebarNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        canAccessPermission(currentUser, item.permissionKey, item.adminOnly),
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5">
        <div className="surface-card grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-3.5 px-4 py-4">
          <PolarisBrandMark className="size-10" />
          <div className="flex h-10 min-w-0 flex-col items-center justify-center text-center">
            <p className="text-base font-semibold leading-[1.05] text-foreground">
              北极星
            </p>
            <p className="mt-1 whitespace-nowrap text-[11px] leading-none text-muted-foreground">
              Polaris Workspace
            </p>
          </div>
          <div className="size-10" aria-hidden="true" />
        </div>
      </div>
      <ScrollArea className="mt-4 flex-1 px-4 pb-6">
        <div className="space-y-6">
          {visibleSections.map((section) => (
            <div key={section.title} className="space-y-2">
              <p className="px-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {section.title}
              </p>
              <div className="space-y-1.5">
                {section.items.map((item) => {
                  const isActive = pathname.startsWith(item.href);

                  return (
                    <TransitionLink
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "group flex rounded-[22px] border px-3.5 py-3 transition-all duration-200",
                        isActive
                          ? "border-slate-200 bg-white text-foreground shadow-[var(--shadow-card)]"
                          : "border-transparent bg-transparent text-muted-foreground hover:border-border/80 hover:bg-white/70 hover:text-foreground",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          isActive ? "text-foreground" : "text-muted-foreground",
                        )}
                      />
                      <div className="ml-3 min-w-0">
                        <div className="text-sm font-medium">{item.title}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </div>
                      </div>
                    </TransitionLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="px-5 pb-5">
        <div className="surface-card flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{active.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {active.description}
            </p>
          </div>
          <PanelTopOpen className="size-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function UserManagementMenu({
  currentUser,
  compact = false,
}: {
  currentUser: CurrentUser;
  compact?: boolean;
}) {
  const router = useRouter();
  const { start } = useRouteTransition();
  const displayName = currentUser.display_name || currentUser.username;

  function openUserManagement() {
    start();
    router.push(userManagementNavItem.href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="flex items-center rounded-full border border-border/80 bg-white/90 p-2 shadow-[var(--shadow-card)] transition hover:border-slate-300 hover:bg-white"
            aria-label="打开管理员入口"
          >
            <ShieldCheck className="size-4 text-sky-600" />
          </button>
        ) : (
          <button
            type="button"
            className="flex items-center gap-3 rounded-full border border-border/80 bg-white/90 px-3.5 py-2 text-left shadow-[var(--shadow-card)] transition hover:border-slate-300 hover:bg-white"
            aria-label="打开管理员菜单"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{displayName}</span>
                <span className="text-border">/</span>
                <span className="text-muted-foreground">当前在线</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{currentUser.role_name}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700">
                  <ShieldCheck className="size-3" />
                  用户管理
                </span>
              </div>
            </div>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 min-w-[18rem] rounded-2xl border border-border/80 bg-white/96 p-2 shadow-[var(--shadow-panel)]"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {currentUser.username} · {currentUser.role_name}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="rounded-xl px-3 py-2.5"
          onSelect={openUserManagement}
        >
          <Settings2 className="size-4 text-slate-500" />
          <span>用户管理</span>
          <span className="ml-auto rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
            仅管理员
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopBar({ currentUser }: { currentUser: CurrentUser }) {
  const pathname = usePathname();
  const active = resolveNavItem(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = currentUser.display_name || currentUser.username;

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-white/72 backdrop-blur-xl">
      <div className={cn("flex items-center gap-4 py-4", workspaceContainerClass)}>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="outline" size="icon" className="rounded-2xl">
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[320px] border-border/80 bg-sidebar p-0"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>导航</SheetTitle>
            </SheetHeader>
            <SidebarContent
              currentUser={currentUser}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            {active.headerEyebrow ?? "WORKSPACE"}
          </div>
          <div className="mt-1.5 min-w-0">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <p className="text-[1.7rem] font-semibold tracking-tight text-foreground">
                {active.title}
              </p>
              {active.headerBadge ? (
                <div className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-muted-foreground">
                  {active.headerBadge}
                </div>
              ) : null}
              <p className="min-w-[320px] max-w-5xl flex-1 pb-0.5 text-sm leading-6 text-muted-foreground">
                {active.headerDescription ?? active.description}
              </p>
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          {currentUser.is_admin ? (
            <UserManagementMenu currentUser={currentUser} />
          ) : (
            <div className="rounded-full border border-border/80 bg-white/90 px-3.5 py-2 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
              <span className="font-medium text-foreground">{displayName}</span>
              <span className="mx-2 text-border">/</span>
              当前在线
            </div>
          )}
          <LogoutAction />
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          {currentUser.is_admin ? (
            <UserManagementMenu currentUser={currentUser} compact />
          ) : (
            <div className="flex items-center rounded-full border border-border/80 bg-white/90 p-2 shadow-[var(--shadow-card)]">
              <UserCircle2 className="size-4 text-muted-foreground" />
            </div>
          )}
          <LogoutAction compact />
        </div>
      </div>
    </header>
  );
}

function FloatingAssistantButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { start } = useRouteTransition();
  const isActive = pathname.startsWith(agentNavItem.href);
  const containerRef = useRef<HTMLButtonElement | null>(null);
  const dragStateRef = useRef({
    pointerId: -1,
    startPointerX: 0,
    startPointerY: 0,
    startX: 0,
    startY: 0,
    moved: false,
  });
  const storageKey = "polaris.agent-fab.position.v1";
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  useEffect(() => {
    function clampPosition(nextX: number, nextY: number) {
      const width = containerRef.current?.offsetWidth ?? 256;
      const height = containerRef.current?.offsetHeight ?? 72;
      const maxX = Math.max(12, window.innerWidth - width - 12);
      const maxY = Math.max(12, window.innerHeight - height - 12);
      return {
        x: Math.min(Math.max(12, nextX), maxX),
        y: Math.min(Math.max(12, nextY), maxY),
      };
    }

    function loadInitialPosition() {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { x?: number; y?: number };
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            setPosition(clampPosition(parsed.x, parsed.y));
            return;
          }
        }
      } catch {
        // Ignore malformed local storage and fall back to default placement.
      }

      const width = containerRef.current?.offsetWidth ?? 256;
      const height = containerRef.current?.offsetHeight ?? 72;
      setPosition(
        clampPosition(
          window.innerWidth - width - 24,
          window.innerHeight - height - 24,
        ),
      );
    }

    function handleResize() {
      setPosition((current) => {
        if (!current) {
          return current;
        }
        return clampPosition(current.x, current.y);
      });
    }

    loadInitialPosition();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function persistPosition(nextPosition: { x: number; y: number }) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextPosition));
    } catch {
      // Ignore persistence failures so dragging still works.
    }
  }

  function clampPosition(nextX: number, nextY: number) {
    const width = containerRef.current?.offsetWidth ?? 256;
    const height = containerRef.current?.offsetHeight ?? 72;
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);
    return {
      x: Math.min(Math.max(12, nextX), maxX),
      y: Math.min(Math.max(12, nextY), maxY),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }
    const currentPosition = position ?? {
      x: window.innerWidth - (containerRef.current?.offsetWidth ?? 256) - 24,
      y: window.innerHeight - (containerRef.current?.offsetHeight ?? 72) - 24,
    };
    dragStateRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: currentPosition.x,
      startY: currentPosition.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startPointerX;
    const deltaY = event.clientY - dragState.startPointerY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) > 6) {
      dragState.moved = true;
    }
    if (!dragState.moved) {
      return;
    }

    setPosition(clampPosition(dragState.startX + deltaX, dragState.startY + deltaY));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (dragState.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    const nextPosition = position;
    const wasDragged = dragState.moved;
    dragStateRef.current.pointerId = -1;
    dragStateRef.current.moved = false;

    if (wasDragged) {
      if (nextPosition) {
        persistPosition(nextPosition);
      }
      return;
    }

    start();
    router.push(agentNavItem.href);
  }

  return (
    <button
      ref={containerRef}
      type="button"
      aria-label="打开数据分析 Agent"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="fixed z-40 touch-none select-none"
      style={{
        left: position ? `${position.x}px` : undefined,
        top: position ? `${position.y}px` : undefined,
        right: position ? "auto" : "1rem",
        bottom: position ? "auto" : "1.25rem",
      }}
    >
      <div
        className={cn(
          "group flex items-center gap-3 rounded-full border px-3 py-3 shadow-[var(--shadow-panel)] transition-all duration-200 sm:px-4",
          isActive
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-border/80 bg-white/92 text-foreground backdrop-blur-xl hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]",
        )}
      >
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-full",
            isActive ? "bg-white/12" : "bg-slate-900 text-white",
          )}
        >
          <span className="text-xs font-semibold tracking-[0.08em]">小北</span>
        </div>
        <div className="hidden pr-1 sm:block">
          <p
            className={cn(
              "text-sm font-semibold",
              isActive ? "text-white" : "text-foreground",
            )}
          >
            数据分析 Agent
          </p>
          <p
            className={cn(
              "text-xs",
              isActive ? "text-white/70" : "text-muted-foreground",
            )}
          >
            可随意拖拽摆放
          </p>
        </div>
      </div>
    </button>
  );
}

export function AppShell({
  currentUser,
  children,
}: {
  currentUser: CurrentUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <RouteTransitionProvider>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-[280px] border-r border-border/60 bg-sidebar/70 backdrop-blur-xl lg:block">
          <SidebarContent currentUser={currentUser} pathname={pathname} />
        </aside>
        <div className="lg:pl-[280px]">
          <TopBar currentUser={currentUser} />
          <main className={cn("py-6", workspaceContainerClass)}>{children}</main>
        </div>
        {canAccessPermission(currentUser, agentNavItem.permissionKey, agentNavItem.adminOnly) ? (
          <FloatingAssistantButton />
        ) : null}
      </div>
    </RouteTransitionProvider>
  );
}
