import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RouteLoading({ compact = false }: { compact?: boolean }) {
  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-5 lg:px-6 xl:px-8">
      <div className="mx-auto flex max-w-[1560px] flex-col gap-6">
        {!compact ? (
          <div className="surface-panel p-6">
            <Skeleton className="h-4 w-28 rounded-full" />
            <Skeleton className="mt-4 h-10 w-72 rounded-2xl" />
            <Skeleton className="mt-3 h-5 w-96 max-w-full rounded-full" />
          </div>
        ) : null}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card
              key={index}
              className="rounded-[22px] border-border/80 shadow-[var(--shadow-card)]"
            >
              <CardHeader className="space-y-3 pb-2">
                <Skeleton className="h-4 w-24 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-2xl" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-32 rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="surface-panel p-6">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="mt-4 h-64 w-full rounded-[22px]" />
          </div>
          <div className="surface-panel p-6">
            <Skeleton className="h-5 w-32 rounded-full" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-[20px]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
