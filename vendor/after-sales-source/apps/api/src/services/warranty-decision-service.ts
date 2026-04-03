import { BASE_WARRANTY_DAYS, type WarrantyQueryResponse } from "@warranty/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { createActivationQueryService } from "./activation-query-service.js";
import { SnInheritanceService } from "./sn-inheritance-service.js";
import { WarrantyEntitlementService } from "./warranty-entitlement-service.js";

type DeviceWithRelations = Prisma.DeviceGetPayload<{
  include: {
    saleCycles: true;
    entitlements: true;
    events: true;
  };
}>;

type WarrantyQueryInput = {
  sn: string;
  sourceOrderNo?: string;
};

const EXTENDED_WARRANTY_CUTOFF = new Date("2025-09-01T00:00:00+08:00");

function toDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export class WarrantyDecisionService {
  private activationQueryService = createActivationQueryService();
  private entitlementService = new WarrantyEntitlementService();
  private inheritanceService = new SnInheritanceService();

  async queryWarranty(input: WarrantyQueryInput): Promise<WarrantyQueryResponse> {
    const sourceOrderNo = input.sourceOrderNo?.trim() ?? "";

    const inheritanceDecision = await this.inheritanceService.resolveByNewSn(input.sn);
    if (inheritanceDecision.type === "matched") {
      const record = inheritanceDecision.record;
      const finalEnd = record.inheritedWarrantyEnd;
      const decisionStatus = finalEnd >= new Date() ? "IN_WARRANTY" : "OUT_OF_WARRANTY";

      return {
        sn: input.sn,
        sourceOrderNo: sourceOrderNo || null,
        sourceChannel: null,
        decisionMode: "INHERITED",
        inheritanceHint: "该设备存在售后改号继承关系，本次结果沿用原设备历史保修口径，不按当前新激活时间重新计算保修。",
        originalSn: record.originalSn,
        inheritedWarrantyStartDate: toDateOnly(record.inheritedWarrantyStart),
        inheritedBaseWarrantyDays: record.inheritedBaseDays,
        inheritedExtraWarrantyDays: record.inheritedExtraDays,
        inheritedWarrantyEndDate: toDateOnly(record.inheritedWarrantyEnd),
        model: null,
        deviceStatus: null,
        saleCycleId: null,
        saleCycleStatus: null,
        activatedAt: null,
        baseWarrantyDays: record.inheritedBaseDays,
        extraWarrantyDays: record.inheritedExtraDays,
        warrantyStartDate: toDateOnly(record.inheritedWarrantyStart),
        baseWarrantyEndDate: toDateOnly(addDays(record.inheritedWarrantyStart, record.inheritedBaseDays)),
        warrantyEndDate: toDateOnly(record.inheritedWarrantyEnd),
        entitlementMatched: record.inheritedExtraDays > 0,
        entitlementMessage:
          record.inheritedExtraDays > 0 ? "继承记录已包含延保" : "继承记录未包含延保",
        matchedEntitlementOrderNo: record.originalOrderNo,
        matchedEntitlementChannel: null,
        decisionStatus,
        decisionMessage: decisionStatus === "IN_WARRANTY" ? "设备在保修期内" : "设备已过保",
        basis: [
          `新序列号 ${input.sn} 命中有效售后改号继承记录`,
          `保修起始日沿用 ${toDateOnly(record.inheritedWarrantyStart)}`,
          `标准保修 ${record.inheritedBaseDays} 天，延保 ${record.inheritedExtraDays} 天`,
        ],
        warnings: [],
      };
    }

    if (inheritanceDecision.type === "manual_review") {
      return this.createEmptyResponse(input, {
        decisionStatus: "PENDING_MANUAL_REVIEW",
        decisionMessage: "改号继承记录异常，需要人工审核",
        entitlementMatched: false,
        entitlementMessage: inheritanceDecision.message,
        basis: [inheritanceDecision.message],
        warnings: [],
      });
    }

    if (!sourceOrderNo) {
      return this.createEmptyResponse(input, {
        decisionStatus: "PENDING_MANUAL_REVIEW",
        decisionMessage: "普通设备查询需要订单号",
        entitlementMatched: false,
        entitlementMessage: "未命中改号继承记录，普通设备仍需提供订单号参与校验",
        basis: ["系统未找到该 SN 的有效改号继承记录，已回退到普通设备查询逻辑"],
        warnings: ["请补充订单号后重试"],
      });
    }

    return this.queryNormalWarranty({
      sn: input.sn,
      sourceOrderNo,
    });
  }

  async getSaleCycleDetail(saleCycleId: string) {
    return prisma.saleCycle.findUnique({
      where: { saleCycleId },
      include: {
        device: {
          include: {
            saleCycles: {
              orderBy: { cycleNo: "asc" },
            },
            entitlements: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
        entitlements: true,
        events: {
          orderBy: { eventTime: "asc" },
        },
      },
    });
  }

  private async queryNormalWarranty(input: { sn: string; sourceOrderNo: string }): Promise<WarrantyQueryResponse> {
    const device = await this.loadDevice(input.sn);
    const activation = await this.activationQueryService.queryBySn(input.sn);

    if (!activation.success || !activation.data) {
      if (!device) {
        return this.createEmptyResponse(input, {
          decisionStatus: "QUERY_ERROR",
          decisionMessage: "激活信息查询异常",
          entitlementMatched: false,
          entitlementMessage: "本地没有设备主记录，且激活接口也未返回有效结果",
          basis: [activation.errorMessage ?? "激活查询服务返回失败"],
          warnings: ["请稍后重试，或先补充设备主记录"],
        });
      }

      return this.createBaseResponse(device, input, {
        decisionStatus: "QUERY_ERROR",
        decisionMessage: "激活信息查询异常",
        entitlementMatched: false,
        entitlementMessage: "激活信息异常，暂未叠加延保",
        basis: [activation.errorMessage ?? "激活查询服务返回失败"],
        warnings: ["请稍后重试，或转人工审核"],
      });
    }

    const currentRecord = activation.data.activationRecords[0];
    if (!currentRecord?.activatedAt) {
      if (!device) {
        return this.createEmptyResponse(input, {
          decisionStatus: "NOT_STARTED",
          decisionMessage: "保修尚未开始",
          entitlementMatched: false,
          entitlementMessage: "设备尚未激活，标准保修和延保都尚未开始",
          basis: ["未获取到有效激活时间"],
          warnings: [],
        });
      }

      return this.createBaseResponse(device, input, {
        decisionStatus: "NOT_STARTED",
        decisionMessage: "保修尚未开始",
        entitlementMatched: false,
        entitlementMessage: "设备尚未激活，标准保修和延保都尚未开始",
        basis: ["未获取到有效激活时间"],
        warnings: [],
      });
    }

    const warrantyStart = new Date(currentRecord.activatedAt);
    if (Number.isNaN(warrantyStart.getTime())) {
      return this.createResponseFromMaybeDevice(device, input, {
        activatedAt: null,
        extraWarrantyDays: 0,
        entitlementMatched: false,
        entitlementMessage: "激活时间无法解析，延保未参与计算",
        matchedEntitlementOrderNo: null,
        decisionStatus: "PENDING_MANUAL_REVIEW",
        decisionMessage: "激活时间格式异常，需要人工审核",
        basis: [`激活接口返回了无法解析的时间：${currentRecord.activatedAt}`],
        warnings: [],
      });
    }

    const baseWarrantyEnd = addDays(warrantyStart, BASE_WARRANTY_DAYS);

    if (warrantyStart < EXTENDED_WARRANTY_CUTOFF) {
      const decisionStatus = baseWarrantyEnd >= new Date() ? "IN_WARRANTY" : "OUT_OF_WARRANTY";
      return this.createResponseFromMaybeDevice(device, input, {
        activatedAt: warrantyStart,
        extraWarrantyDays: 0,
        entitlementMatched: false,
        entitlementMessage: "激活时间早于 2025-09-01，按标准保修 365 天处理",
        matchedEntitlementOrderNo: null,
        decisionStatus,
        decisionMessage: decisionStatus === "IN_WARRANTY" ? "设备在保修期内" : "设备已过保",
        basis: [
          "激活时间早于 2025-09-01",
          `因此本次不叠加离线包延保，只按 ${BASE_WARRANTY_DAYS} 天标准保修计算`,
        ],
        warnings: device ? [] : ["本次结果基于真实激活接口返回计算，本地设备主记录暂未补齐"],
      });
    }

    const entitlements = device
      ? device.entitlements
      : await prisma.warrantyEntitlement.findMany({
          where: { sn: input.sn },
          orderBy: { createdAt: "desc" },
        });
    const entitlementMatch = this.entitlementService.resolveMatch(entitlements, input);

    if (entitlementMatch.type === "manual_review") {
      return this.createResponseFromMaybeDevice(device, input, {
        activatedAt: warrantyStart,
        extraWarrantyDays: 0,
        entitlementMatched: false,
        matchedEntitlementOrderNo: null,
        entitlementMessage: entitlementMatch.message,
        decisionStatus: "PENDING_MANUAL_REVIEW",
        decisionMessage: "延保匹配异常，需要人工审核",
        basis: [
          "激活时间不早于 2025-09-01，必须按离线包订单维度核对延保",
          ...entitlementMatch.basis,
        ],
        warnings: entitlementMatch.warnings,
        suppressWarrantyDates: true,
      });
    }

    if (entitlementMatch.type === "not_matched") {
      return this.createResponseFromMaybeDevice(device, input, {
        activatedAt: warrantyStart,
        extraWarrantyDays: 0,
        entitlementMatched: false,
        matchedEntitlementOrderNo: null,
        entitlementMessage: "未匹配到离线包中的 SN + 订单号，请先核对后再判断保修",
        decisionStatus: "PENDING_MANUAL_REVIEW",
        decisionMessage: "SN 与订单号未匹配到离线包记录",
        basis: [
          "激活时间不早于 2025-09-01，必须先匹配离线包中的 SN + 订单号",
          ...entitlementMatch.basis,
        ],
        warnings: entitlementMatch.warnings,
        suppressWarrantyDates: true,
      });
    }

    if (entitlementMatch.type === "matched_no_extension") {
      const decisionStatus = baseWarrantyEnd >= new Date() ? "IN_WARRANTY" : "OUT_OF_WARRANTY";
      return this.createResponseFromMaybeDevice(device, input, {
        activatedAt: warrantyStart,
        extraWarrantyDays: 0,
        entitlementMatched: true,
        matchedEntitlementOrderNo: entitlementMatch.orderNo,
        entitlementMessage: "已匹配到离线包记录，本单无延保",
        decisionStatus,
        decisionMessage: decisionStatus === "IN_WARRANTY" ? "设备在保修期内" : "设备已过保",
        basis: [
          "激活时间不早于 2025-09-01，已按离线包中的 SN + 订单号核对",
          `标准保修固定 ${BASE_WARRANTY_DAYS} 天`,
          ...entitlementMatch.basis,
        ],
        warnings: device ? entitlementMatch.warnings : [...entitlementMatch.warnings, "本次结果基于真实激活接口返回计算，本地设备主记录暂未补齐"],
      });
    }

    const finalWarrantyEnd = addDays(
      warrantyStart,
      BASE_WARRANTY_DAYS + entitlementMatch.extraWarrantyDays,
    );
    const decisionStatus = finalWarrantyEnd >= new Date() ? "IN_WARRANTY" : "OUT_OF_WARRANTY";

    return this.createResponseFromMaybeDevice(device, input, {
      activatedAt: warrantyStart,
      extraWarrantyDays: entitlementMatch.extraWarrantyDays,
      entitlementMatched: true,
      entitlementMessage: "已匹配到延保权益",
      matchedEntitlementOrderNo: entitlementMatch.orderNo,
      decisionStatus,
      decisionMessage: decisionStatus === "IN_WARRANTY" ? "设备在保修期内" : "设备已过保",
      basis: [
        "激活时间不早于 2025-09-01，已按离线包中的 SN + 订单号匹配延保",
        `标准保修固定 ${BASE_WARRANTY_DAYS} 天`,
        ...entitlementMatch.basis,
      ],
      warnings: device ? entitlementMatch.warnings : [...entitlementMatch.warnings, "本次结果基于真实激活接口返回计算，本地设备主记录暂未补齐"],
    });
  }

  private async loadDevice(sn: string): Promise<DeviceWithRelations | null> {
    return prisma.device.findUnique({
      where: { sn },
      include: {
        saleCycles: {
          orderBy: { cycleNo: "asc" },
        },
        entitlements: {
          orderBy: { createdAt: "desc" },
        },
        events: true,
      },
    });
  }

  private createEmptyResponse(
    input: WarrantyQueryInput,
    response: Pick<
      WarrantyQueryResponse,
      | "decisionStatus"
      | "decisionMessage"
      | "entitlementMatched"
      | "entitlementMessage"
      | "basis"
      | "warnings"
    >,
  ): WarrantyQueryResponse {
    return {
      sn: input.sn,
      sourceOrderNo: input.sourceOrderNo?.trim() || null,
      sourceChannel: null,
      decisionMode: "NORMAL",
      inheritanceHint: null,
      originalSn: null,
      inheritedWarrantyStartDate: null,
      inheritedBaseWarrantyDays: null,
      inheritedExtraWarrantyDays: null,
      inheritedWarrantyEndDate: null,
      model: null,
      deviceStatus: null,
      saleCycleId: null,
      saleCycleStatus: null,
      activatedAt: null,
      baseWarrantyDays: BASE_WARRANTY_DAYS,
      extraWarrantyDays: 0,
      warrantyStartDate: null,
      baseWarrantyEndDate: null,
      warrantyEndDate: null,
      matchedEntitlementOrderNo: null,
      matchedEntitlementChannel: null,
      ...response,
    };
  }

  private createBaseResponse(
    device: DeviceWithRelations,
    input: WarrantyQueryInput,
    response: Pick<
      WarrantyQueryResponse,
      | "decisionStatus"
      | "decisionMessage"
      | "entitlementMatched"
      | "entitlementMessage"
      | "basis"
      | "warnings"
    >,
  ): WarrantyQueryResponse {
    return {
      sn: device.sn,
      sourceOrderNo: input.sourceOrderNo?.trim() || null,
      sourceChannel: null,
      decisionMode: "NORMAL",
      inheritanceHint: null,
      originalSn: null,
      inheritedWarrantyStartDate: null,
      inheritedBaseWarrantyDays: null,
      inheritedExtraWarrantyDays: null,
      inheritedWarrantyEndDate: null,
      model: device.model,
      deviceStatus: device.currentDeviceStatus as WarrantyQueryResponse["deviceStatus"],
      saleCycleId: null,
      saleCycleStatus: null,
      activatedAt: null,
      baseWarrantyDays: BASE_WARRANTY_DAYS,
      extraWarrantyDays: 0,
      warrantyStartDate: null,
      baseWarrantyEndDate: null,
      warrantyEndDate: null,
      matchedEntitlementOrderNo: null,
      matchedEntitlementChannel: null,
      ...response,
    };
  }

  private createResponseFromMaybeDevice(
    device: DeviceWithRelations | null,
    input: WarrantyQueryInput,
    options: {
      activatedAt: Date | null;
      extraWarrantyDays: number;
      entitlementMatched: boolean;
      entitlementMessage: string;
      matchedEntitlementOrderNo: string | null;
      decisionStatus: WarrantyQueryResponse["decisionStatus"];
      decisionMessage: string;
      basis: string[];
      warnings: string[];
      suppressWarrantyDates?: boolean;
    },
  ): WarrantyQueryResponse {
    const baseWarrantyEnd =
      !options.suppressWarrantyDates && options.activatedAt
        ? addDays(options.activatedAt, BASE_WARRANTY_DAYS)
        : null;
    const finalWarrantyEnd =
      !options.suppressWarrantyDates && options.activatedAt
        ? addDays(options.activatedAt, BASE_WARRANTY_DAYS + options.extraWarrantyDays)
        : null;
    const latestCycle = device?.saleCycles[device.saleCycles.length - 1] ?? null;

    return {
      sn: input.sn,
      sourceOrderNo: input.sourceOrderNo?.trim() || null,
      sourceChannel: null,
      decisionMode: "NORMAL",
      inheritanceHint: null,
      originalSn: null,
      inheritedWarrantyStartDate: null,
      inheritedBaseWarrantyDays: null,
      inheritedExtraWarrantyDays: null,
      inheritedWarrantyEndDate: null,
      model: device?.model ?? null,
      deviceStatus: (device?.currentDeviceStatus as WarrantyQueryResponse["deviceStatus"] | undefined) ?? null,
      saleCycleId: latestCycle?.saleCycleId ?? null,
      saleCycleStatus:
        (latestCycle?.saleStatus as WarrantyQueryResponse["saleCycleStatus"] | undefined) ?? null,
      activatedAt: options.activatedAt ? options.activatedAt.toISOString() : null,
      baseWarrantyDays: BASE_WARRANTY_DAYS,
      extraWarrantyDays: options.extraWarrantyDays,
      warrantyStartDate:
        !options.suppressWarrantyDates && options.activatedAt ? toDateOnly(options.activatedAt) : null,
      baseWarrantyEndDate: baseWarrantyEnd ? toDateOnly(baseWarrantyEnd) : null,
      warrantyEndDate: finalWarrantyEnd ? toDateOnly(finalWarrantyEnd) : null,
      entitlementMatched: options.entitlementMatched,
      entitlementMessage: options.entitlementMessage,
      matchedEntitlementOrderNo: options.matchedEntitlementOrderNo,
      matchedEntitlementChannel: null,
      decisionStatus: options.decisionStatus,
      decisionMessage: options.decisionMessage,
      basis: options.basis,
      warnings: options.warnings,
    };
  }
}
