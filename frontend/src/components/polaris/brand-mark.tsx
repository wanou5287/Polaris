"use client";

import { cn } from "@/lib/polaris-client";

export function PolarisBrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border border-black/8 bg-[linear-gradient(145deg,#050505_0%,#111111_58%,#2a2a2a_100%)] shadow-[0_10px_18px_rgba(15,23,42,0.14)]",
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_34%)]" />
      <svg viewBox="0 0 48 48" className="relative z-10 size-[72%]">
        <defs>
          <linearGradient id="polaris-star" x1="12%" y1="8%" x2="84%" y2="92%">
            <stop offset="0%" stopColor="#f5f5f5" />
            <stop offset="52%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e5e5e5" />
          </linearGradient>
        </defs>
        <path
          d="M24 6.5l2.8 11.7L38.5 21l-11.7 2.8L24 35.5l-2.8-11.7L9.5 21l11.7-2.8L24 6.5z"
          fill="url(#polaris-star)"
        />
        <circle cx="35.8" cy="13.6" r="2.1" fill="#f5f5f5" />
        <path
          d="M33.6 9.7c2.7.5 4.7 2.1 5.8 4.5"
          fill="none"
          stroke="rgba(255,255,255,0.76)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
