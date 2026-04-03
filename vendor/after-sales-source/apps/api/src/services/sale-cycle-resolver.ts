type SaleCycleLike = {
  id: string;
  sn: string;
  saleCycleId: string;
  cycleNo: number;
  saleStatus: string;
  sourceOrderNo: string | null;
  sourceChannel: string | null;
  soldAt: Date;
  activatedAt: Date | null;
  returnReceivedAt: Date | null;
  unboundAt: Date | null;
  cycleClosedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SaleCycleResolution =
  | { type: "not_found" }
  | { type: "no_active_cycle" }
  | { type: "multiple_open_cycles"; cycles: SaleCycleLike[] }
  | { type: "resolved"; cycle: SaleCycleLike };

export class SaleCycleResolverService {
  resolve(cycles: SaleCycleLike[]): SaleCycleResolution {
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
