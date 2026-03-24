"use client";

import Link, { type LinkProps } from "next/link";
import { createContext, use, useRef, useState } from "react";

import { cn } from "@/lib/polaris-client";

type RouteTransitionContextValue = {
  start: () => void;
  stop: () => void;
  pending: boolean;
};

const RouteTransitionContext = createContext<RouteTransitionContextValue | null>(
  null,
);

export function RouteTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<number | null>(null);

  return (
    <RouteTransitionContext.Provider
      value={{
        start: () => {
          if (timerRef.current) {
            window.clearTimeout(timerRef.current);
          }
          setPending(true);
          timerRef.current = window.setTimeout(() => {
            setPending(false);
            timerRef.current = null;
          }, 900);
        },
        stop: () => {
          if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          setPending(false);
        },
        pending,
      }}
    >
      {children}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-50 transition duration-300",
          pending ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="absolute inset-0 bg-white/30 backdrop-blur-[3px]" />
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-transparent">
          <div className="h-full w-1/3 animate-[loading-slide_1.1s_ease-in-out_infinite] rounded-full bg-sky-300" />
        </div>
        <div className="absolute top-6 right-6 rounded-full border border-border/80 bg-white/92 px-4 py-2 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          页面切换中...
        </div>
      </div>
    </RouteTransitionContext.Provider>
  );
}

export function useRouteTransition() {
  const context = use(RouteTransitionContext);

  if (!context) {
    throw new Error("useRouteTransition must be used within RouteTransitionProvider");
  }

  return context;
}

type TransitionLinkProps = LinkProps &
  Omit<React.ComponentProps<typeof Link>, "href">;

export function TransitionLink({
  className,
  onClick,
  children,
  ...props
}: TransitionLinkProps) {
  const { start } = useRouteTransition();

  return (
    <Link
      {...props}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          start();
        }
      }}
    >
      {children}
    </Link>
  );
}
