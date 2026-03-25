"use client";

import { Menu, PanelTopOpen, Sparkles, UserCircle2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  navSections,
  resolveBreadcrumbs,
  resolveNavItem,
} from "@/components/polaris/nav-config";
import {
  RouteTransitionProvider,
  TransitionLink,
  useRouteTransition,
} from "@/components/polaris/transition-link";
import { cn } from "@/lib/polaris-client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = resolveNavItem(pathname);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5">
        <div className="surface-card flex items-center gap-3 px-4 py-4">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
            北
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">北极星</p>
            <p className="text-xs text-muted-foreground">Polaris Workspace</p>
          </div>
        </div>
      </div>
      <ScrollArea className="mt-4 flex-1 px-4 pb-6">
        <div className="space-y-6">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-2">
              <p className="px-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {section.title}
              </p>
              <div className="space-y-1.5">
                {section.items.map((item) => {
                  const isActive =
                    item.href === "/workspace"
                      ? pathname === item.href
                      : pathname.startsWith(item.href);

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

function TopBar({ username }: { username: string }) {
  const pathname = usePathname();
  const breadcrumbs = resolveBreadcrumbs(pathname);
  const { start } = useRouteTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-white/72 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1560px] items-center gap-4 px-4 py-4 sm:px-5 lg:px-6 xl:px-8">
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
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <div key={`${crumb}-${index}`} className="flex items-center gap-2">
                {index > 0 ? <span className="text-border">/</span> : null}
                <span>{crumb}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-lg font-semibold tracking-tight text-foreground">
              北极星新工作台
            </p>
            <div className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs text-muted-foreground">
              Next.js + shadcn/ui
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <div className="rounded-full border border-border/80 bg-white/90 px-3.5 py-2 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
            <span className="font-medium text-foreground">{username}</span>
            <span className="mx-2 text-border">/</span>
            当前在线
          </div>
          <TransitionLink href="/analysis/data-agent" onClick={() => start()}>
            <Button className="cta-button rounded-full px-5">
              <Sparkles className="size-4" />
              打开 DataAgent
            </Button>
          </TransitionLink>
        </div>
        <div className="flex items-center rounded-full border border-border/80 bg-white/90 p-2 shadow-[var(--shadow-card)] sm:hidden">
          <UserCircle2 className="size-4 text-muted-foreground" />
        </div>
      </div>
    </header>
  );
}

export function AppShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <RouteTransitionProvider>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-[280px] border-r border-border/60 bg-sidebar/70 backdrop-blur-xl lg:block">
          <SidebarContent pathname={pathname} />
        </aside>
        <div className="lg:pl-[280px]">
          <TopBar username={username} />
          <main className="mx-auto max-w-[1560px] px-4 py-6 sm:px-5 lg:px-6 xl:px-8">
            {children}
          </main>
        </div>
      </div>
    </RouteTransitionProvider>
  );
}
