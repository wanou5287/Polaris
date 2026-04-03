import { prisma } from "../db.js";

export type SnInheritanceDecision =
  | {
      type: "matched";
      record: {
        id: string;
        originalSn: string;
        newSn: string;
        inheritedWarrantyStart: Date;
        inheritedBaseDays: number;
        inheritedExtraDays: number;
        inheritedWarrantyEnd: Date;
        originalOrderNo: string | null;
        changeReason: string | null;
        effectiveAt: Date | null;
        status: string;
        remark: string | null;
        createdBy: string | null;
      };
    }
  | {
      type: "not_found";
    }
  | {
      type: "manual_review";
      message: string;
    };

export class SnInheritanceService {
  async resolveByNewSn(newSn: string): Promise<SnInheritanceDecision> {
    const records = await prisma.snInheritanceRecord.findMany({
      where: {
        newSn,
        status: "有效",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (records.length === 0) {
      return { type: "not_found" };
    }

    if (records.length > 1) {
      return {
        type: "manual_review",
        message: "该设备存在多条有效改号继承记录，请人工核对",
      };
    }

    const record = records[0];
    if (!record.inheritedWarrantyStart || !record.inheritedWarrantyEnd) {
      return {
        type: "manual_review",
        message: "改号继承记录关键字段缺失，请人工核对",
      };
    }

    return {
      type: "matched",
      record: {
        id: record.id,
        originalSn: record.originalSn,
        newSn: record.newSn,
        inheritedWarrantyStart: record.inheritedWarrantyStart,
        inheritedBaseDays: record.inheritedBaseDays,
        inheritedExtraDays: record.inheritedExtraDays,
        inheritedWarrantyEnd: record.inheritedWarrantyEnd,
        originalOrderNo: record.originalOrderNo,
        changeReason: record.changeReason,
        effectiveAt: record.effectiveAt,
        status: record.status,
        remark: record.remark,
        createdBy: record.createdBy,
      },
    };
  }
}
