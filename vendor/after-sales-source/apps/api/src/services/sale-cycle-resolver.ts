import type { SaleCycle } from "@prisma/client";

export type SaleCycleResolution =
  | { type: "not_found" }
  | { type: "no_active_cycle" }
  | { type: "multiple_open_cycles"; cycles: SaleCycle[] }
  | { type: "resolved"; cycle: SaleCycle };

export class SaleCycleResolverService {
  resolve(cycles: SaleCycle[]): SaleCycleResolution {
    if (cycles.length === 0) {
      return { type: "not_found" };
    }

    const openCycles = cycles
      .filter((cycle) => cycle.cycleClosedAt === null)
      .sort((left, right) => right.soldAt.getTime() - left.soldAt.getTime());

    if (openCycles.length === 0) {
      return { type: "no_active_cycle" };
    }

    if (openCycles.length > 1) {
      return { type: "multiple_open_cycles", cycles: openCycles };
    }

    return { type: "resolved", cycle: openCycles[0] };
  }
}
