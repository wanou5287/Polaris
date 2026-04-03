import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Eye, RefreshCw, TrendingUp, Users } from "lucide-react";

import { PolarisBrandMark } from "@/components/polaris/brand-mark";
import { LoginForm } from "@/components/polaris/login-form";
import {
  POLARIS_SESSION_COOKIE,
  sanitizeNextPath,
} from "@/lib/polaris-server";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

const featureCards = [
  {
    title: "透明",
    description: "关键数据统一可见，业务状态一眼看清。",
    icon: Eye,
    glow: "bg-sky-200/40",
  },
  {
    title: "协同",
    description: "采购、仓储、财务与售后共用同一入口。",
    icon: Users,
    glow: "bg-slate-200/55",
  },
  {
    title: "闭环",
    description: "从单据、任务到审计形成完整执行链路。",
    icon: RefreshCw,
    glow: "bg-sky-100/42",
  },
  {
    title: "决策",
    description: "让分析结果直接转化为可执行的运营动作。",
    icon: TrendingUp,
    glow: "bg-slate-100/70",
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
    <div className="relative h-screen overflow-hidden bg-white text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.24),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(219,234,254,0.34),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(241,245,249,0.88),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(15,23,42,0.04)_0.7px,transparent_0.7px)] [background-position:0_0] [background-size:28px_28px]" />

      <main className="relative z-10 h-screen px-3 py-3 sm:px-5 sm:py-5">
        <section className="mx-auto grid h-full w-full max-w-[1360px] overflow-hidden rounded-[32px] border border-white/80 bg-white/44 shadow-[0_28px_90px_rgba(15,23,42,0.08)] backdrop-blur-3xl lg:grid-cols-[1.14fr_0.86fr]">
          <div className="relative flex min-h-0 items-stretch px-6 py-8 sm:px-8 sm:py-9 lg:px-10 lg:py-11">
            <div className="flex h-full w-full max-w-[820px] flex-col">
              <div className="space-y-10 lg:space-y-12">
                <div className="flex items-center gap-3 pt-1">
                  <PolarisBrandMark className="size-11 rounded-2xl border-white/70 bg-[linear-gradient(145deg,#060606_0%,#171717_58%,#2d2d2d_100%)] shadow-[0_14px_32px_rgba(15,23,42,0.12)]" />
                  <p className="text-base font-semibold text-slate-950 sm:text-lg">
                    北极星-供应链运营协同平台
                  </p>
                </div>

                <div className="max-w-[820px] space-y-4 pt-3 lg:pt-4">
                  <h1 className="text-[clamp(2.2rem,3.2vw,3.45rem)] font-semibold leading-[1.04] tracking-tight text-slate-950 xl:whitespace-nowrap">
                    从数据可见，到运营可控
                  </h1>
                  <p className="max-w-[500px] text-base leading-7 text-slate-500">
                    用统一入口承接供应链协同、执行闭环与经营决策。
                  </p>
                </div>
              </div>

              <div className="relative mt-14 max-w-[760px] pb-2 lg:mt-16">
                <div className="pointer-events-none absolute -inset-x-8 top-10 h-48 bg-[radial-gradient(circle_at_center,rgba(186,230,253,0.2),transparent_68%)] blur-3xl" />
                <div className="grid items-stretch gap-4 sm:grid-cols-2">
                  {featureCards.map((card) => {
                    const Icon = card.icon;

                    return (
                      <div
                        key={card.title}
                        className="group relative flex h-full min-h-[186px] overflow-hidden rounded-[26px] border border-white/80 bg-white/36 px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)] backdrop-blur-2xl transition-transform duration-300 hover:-translate-y-1"
                      >
                        <div
                          className={`pointer-events-none absolute -right-5 top-3 h-24 w-24 rounded-full ${card.glow} blur-3xl`}
                        />
                        <div className="relative flex h-full flex-col">
                          <div className="flex items-center gap-3">
                            <div className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/80 bg-white/56 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
                              <Icon className="size-4 text-slate-500" />
                            </div>
                            <h2 className="text-[1.55rem] font-semibold tracking-tight text-slate-950">
                              {card.title}
                            </h2>
                          </div>
                          <p className="mt-5 text-[13px] leading-6 tracking-[0.01em] text-slate-600">
                            {card.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex min-h-0 items-center justify-center border-t border-white/60 bg-white/26 px-5 py-6 sm:px-7 lg:border-l lg:border-t-0 lg:px-8 lg:py-8 backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.72),transparent_18%),radial-gradient(circle_at_85%_85%,rgba(186,230,253,0.22),transparent_22%)]" />

            <div className="relative w-full max-w-[430px] rounded-[30px] border border-white/80 bg-white/36 p-3 shadow-[0_26px_70px_rgba(15,23,42,0.08)] backdrop-blur-[28px]">
              <div className="rounded-[26px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(248,250,252,0.6))] px-5 py-6 sm:px-6 sm:py-6 backdrop-blur-[24px]">
                <LoginForm nextPath={nextPath} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
