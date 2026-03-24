import {
  ArrowRight,
  ChartColumnIncreasing,
  Database,
  ShieldCheck,
} from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/polaris/login-form";
import {
  POLARIS_SESSION_COOKIE,
  sanitizeNextPath,
} from "@/lib/polaris-server";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

const highlights = [
  {
    title: "统一治理",
    description: "口径、主数据、审计留痕在一个工作台完成闭环。",
    icon: ShieldCheck,
  },
  {
    title: "经营分析",
    description: "总览和 DataAgent 共用同一套底层能力，不再拼接旧页面外壳。",
    icon: ChartColumnIncreasing,
  },
  {
    title: "能力直连",
    description: "Next.js 前端通过代理层对接 FastAPI 能力，便于团队并行开发。",
    icon: Database,
  },
];

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ next }, cookieStore] = await Promise.all([searchParams, cookies()]);
  const session = cookieStore.get(POLARIS_SESSION_COOKIE)?.value;
  const nextPath = sanitizeNextPath(next);

  if (session) {
    redirect(nextPath);
  }

  return (
    <div className="grid-faint min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-[1440px] items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <section className="surface-panel relative overflow-hidden p-8 sm:p-10 lg:p-12">
          <div className="absolute inset-x-8 top-0 h-32 rounded-b-[40px] bg-[radial-gradient(circle_at_top,rgba(219,234,254,0.75),transparent_70%)]" />
          <div className="relative space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-border/80 bg-white/90 px-4 py-2 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
                <span className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  北
                </span>
                北极星供应链运营协同平台
              </div>
              <div className="space-y-4">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  New Workspace
                </p>
                <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  彻底摆脱旧壳层，
                  <br />
                  用现代 SaaS 工作台重组底层能力。
                </h1>
                <p className="max-w-2xl text-base leading-8 text-muted-foreground">
                  这套新前端使用 React、Next.js、TailwindCSS、TypeScript 与
                  shadcn/ui 构建，只对接能力层接口，不再复刻历史模板结构。
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {highlights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[24px] border border-border/80 bg-white/90 p-5 shadow-[var(--shadow-card)]"
                >
                  <item.icon className="size-5 text-foreground" />
                  <h2 className="mt-4 text-base font-semibold text-foreground">
                    {item.title}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="surface-panel p-7 sm:p-9">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Welcome Back
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                登录北极星工作台
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                进入新的运营工作台后，你会看到按底层能力重新整理的总览、治理与分析入口。
              </p>
            </div>

            <LoginForm nextPath={nextPath} />

            <div className="rounded-[24px] border border-border/70 bg-muted/50 px-4 py-4 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">新前端技术栈</p>
                  <p className="mt-1">
                    Next.js 16 / React 19 / Tailwind v4 / TypeScript / shadcn/ui
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
