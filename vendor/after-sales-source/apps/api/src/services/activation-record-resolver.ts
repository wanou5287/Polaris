import type { ActivationRecord } from "@warranty/shared";
type SaleCycleLike = {
  activatedAt: Date | null;
  unboundAt: Date | null;
};

export type ActivationResolution =
  | { type: "not_started" }
  | { type: "resolved"; activatedAt: Date; basis: string[] }
  | { type: "manual_review"; message: string };

export class ActivationRecordResolverService {
  resolve(currentCycle: SaleCycleLike, records: ActivationRecord[]): ActivationResolution {
    if (currentCycle.activatedAt) {
      return {
        type: "resolved",
        activatedAt: currentCycle.activatedAt,
        basis: ["当前销售周期存在明确 activated_at，直接作为保修起点"],
      };
    }

    if (records.length === 0) {
      return { type: "not_started" };
    }

    const candidates = records.filter((record) => {
      const activatedAt = new Date(record.activatedAt);
      if (Number.isNaN(activatedAt.getTime())) {
        return false;
      }

      if (currentCycle.unboundAt && activatedAt <= currentCycle.unboundAt) {
        return false;
      }

      if (record.recordType === "HISTORY_CYCLE") {
        return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      return { type: "not_started" };
    }

    const currentCycleRecords = candidates.filter(
      (record) => record.recordType === "CURRENT_CYCLE",
    );

    if (currentCycleRecords.length === 1) {
      return {
        type: "resolved",
        activatedAt: new Date(currentCycleRecords[0].activatedAt),
        basis: ["激活服务返回单条 CURRENT_CYCLE 记录，作为当前周期首次激活时间"],
      };
    }

    if (currentCycleRecords.length > 1) {
      return {
        type: "manual_review",
        message: "存在多条 CURRENT_CYCLE 激活记录，无法唯一确定当前周期首次激活时间",
      };
    }

    if (candidates.length === 1) {
      return {
        type: "resolved",
        activatedAt: new Date(candidates[0].activatedAt),
        basis: ["结合解绑时间过滤后仅剩一条候选激活记录，作为当前周期首次激活时间"],
      };
    }

    return {
      type: "manual_review",
      message: "存在多条候选激活记录，无法判断属于当前有效销售周期",
    };
  }
}
