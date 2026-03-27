import {
  ChartColumnIncreasing,
  PackageCheck,
  Workflow,
} from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PolarisBrandMark } from "@/components/polaris/brand-mark";
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
    title: "采购供应协同",
    description: "围绕采购订单、采购入库、形态转换与调拨流转，减少逐张做单。",
    icon: PackageCheck,
  },
  {
    title: "业务流自动化",
    description: "通过已发布业务流串联关键单据节点，让常见链路按规则自动推进。",
    icon: Workflow,
  },
  {
    title: "数据分析支持",
    description: "BI 看板与小北-数据分析Agent协同辅助，帮助快速识别经营风险和异常。",
    icon: ChartColumnIncreasing,
  },
];

const modulePills = [
  "采购供应",
  "库存流转",
  "基础数据",
  "BI看板",
  "小北-数据分析Agent",
];

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ next }, cookieStore] = await Promise.all([searchParams, cookies()]);
  const session = cookieStore.get(POLARIS_SESSION_COOKIE)?.value;
  const nextPath = sanitizeNextPath(next);

  if (session) {
    redirect(nextPath);
  }

  return (
    <div className="grid-faint relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(186,230,253,0.3),transparent_34%),radial-gradient(circle_at_86%_18%,rgba(219,234,254,0.42),transparent_30%),radial-gradient(circle_at_78%_82%,rgba(191,219,254,0.24),transparent_28%)]" />
      <div className="grid min-h-screen w-full gap-4 px-3 py-3 sm:px-4 lg:grid-cols-[minmax(0,1.16fr)_minmax(460px,0.84fr)] lg:items-stretch xl:px-6 2xl:px-8">
        <section className="surface-panel relative overflow-hidden p-8 sm:p-10 lg:min-h-[calc(100vh-1.5rem)] lg:p-12 xl:p-14">
          <div className="absolute inset-x-8 top-0 h-44 rounded-b-[56px] bg-[radial-gradient(circle_at_top,rgba(219,234,254,0.95),transparent_74%)]" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-border/80 bg-white/92 px-4 py-2 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
                <PolarisBrandMark className="size-9 rounded-full" />
                <span className="leading-none">北极星供应链运营协同平台</span>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  SUPPLY CHAIN WORKSPACE
                </p>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl xl:text-[3.8rem] xl:leading-[1.05]">
                  把采购供应、库存流转
                  <br />
                  和数据分析放到同一个工作台。
                </h1>
                <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                  从采购入库、形态转换、调拨，到 BI 看板与小北分析助手，
                  常用操作与协同入口都在这里完成。
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {highlights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[24px] border border-border/80 bg-white/90 p-5 shadow-[var(--shadow-card)]"
                >
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                    <item.icon className="size-5" />
                  </div>
                  <h2 className="mt-4 text-base font-semibold text-foreground">
                    {item.title}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-[28px] border border-border/80 bg-white/90 p-5 shadow-[var(--shadow-card)]">
              <p className="text-sm font-semibold text-foreground">登录后可进入</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {modulePills.map((item) => (
                  <div
                    key={item}
                    className="rounded-full border border-border/80 bg-muted/35 px-4 py-2 text-sm text-foreground"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="surface-panel flex min-h-[calc(100vh-1.5rem)] flex-col justify-between p-7 sm:p-9 xl:px-10 xl:py-10">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
                ACCOUNT ACCESS
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                登录北极星工作台
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                登录后可直接进入采购供应、库存流转、基础数据与 BI 看板等业务入口。
              </p>
            </div>

            <LoginForm nextPath={nextPath} />
          </div>

          <div className="rounded-[24px] border border-border/70 bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">登录提示</p>
            <p className="mt-2 leading-7">
              建议使用个人账号登录；如需处理采购链路或业务流编排，请优先确认当前账号已具备对应权限。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
