type WarrantyEntitlementLike = {
  sn: string;
  sourceOrderNo: string;
  warrantyDays: number;
};

type EntitlementMatchInput = {
  sn: string;
  sourceOrderNo: string;
};

export type EntitlementMatchResult =
  | {
      type: "matched";
      extraWarrantyDays: number;
      orderNo: string;
      basis: string[];
      warnings: string[];
    }
  | {
      type: "not_matched";
      extraWarrantyDays: 0;
      basis: string[];
      warnings: string[];
    }
  | {
      type: "matched_no_extension";
      extraWarrantyDays: 0;
      orderNo: string;
      basis: string[];
      warnings: string[];
    }
  | {
      type: "manual_review";
      message: string;
      basis: string[];
      warnings: string[];
    };

export class WarrantyEntitlementService {
  resolveMatch(
    entitlements: WarrantyEntitlementLike[],
    input: EntitlementMatchInput,
  ): EntitlementMatchResult {
    if (!input.sourceOrderNo.trim()) {
      return {
        type: "manual_review",
        message: "订单号缺失，无法匹配延保",
        basis: ["查询时必须同时提供 SN 和订单号，才能判断是否存在有效延保"],
        warnings: [],
      };
    }

    const sameOrder = entitlements.filter(
      (item) => item.sn === input.sn && item.sourceOrderNo.trim() === input.sourceOrderNo.trim(),
    );

    if (sameOrder.some((item) => !item.sourceOrderNo || item.warrantyDays === null)) {
      return {
        type: "manual_review",
        message: "延保记录关键字段缺失，需要人工审核",
        basis: ["匹配到的延保记录存在订单号或延保天数字段缺失"],
        warnings: [],
      };
    }

    const activeCandidates = sameOrder.filter((item) => item.warrantyDays > 0);

    if (sameOrder.length > 0 && activeCandidates.length === 0) {
      return {
        type: "matched_no_extension",
        extraWarrantyDays: 0,
        orderNo: input.sourceOrderNo,
        basis: [
          `已匹配到 ${input.sn} + ${input.sourceOrderNo} 的离线包记录`,
          "该订单在离线包中标记为无延保，或延保天数为 0",
        ],
        warnings: [],
      };
    }

    if (activeCandidates.length === 0) {
      return {
        type: "not_matched",
        extraWarrantyDays: 0,
        basis: [`未匹配到 ${input.sn} + ${input.sourceOrderNo} 的有效延保记录`],
        warnings: ["请核对离线包中的 SN 和订单号是否与当前查询一致"],
      };
    }

    if (activeCandidates.length > 1) {
      return {
        type: "manual_review",
        message: "同一个 SN + 订单号匹配到多条延保记录，需要人工审核",
        basis: ["同一匹配键存在多条大于 0 的延保记录，无法唯一确定应叠加哪一条"],
        warnings: [],
      };
    }

    const matched = activeCandidates[0];
    return {
      type: "matched",
      extraWarrantyDays: matched.warrantyDays,
      orderNo: matched.sourceOrderNo,
      basis: [
        `延保按 ${input.sn} + ${input.sourceOrderNo} 匹配成功`,
        `已将延保自动换算为 ${matched.warrantyDays} 天`,
      ],
      warnings: [],
    };
  }
}
