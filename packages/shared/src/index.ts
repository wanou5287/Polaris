export const BASE_WARRANTY_DAYS = 365;

export const activationModes = ["mock", "real"] as const;
export type ActivationMode = (typeof activationModes)[number];

export const activationStatusValues = ["ACTIVATED", "NOT_ACTIVATED", "UNKNOWN"] as const;
export type ActivationStatus = (typeof activationStatusValues)[number];

export const activationRecordTypeValues = [
  "CURRENT_CYCLE",
  "HISTORY_CYCLE",
  "UNKNOWN",
] as const;
export type ActivationRecordType = (typeof activationRecordTypeValues)[number];

export const deviceStatusValues = [
  "UNSOLD",
  "SOLD_WAIT_ACTIVATION",
  "IN_USE",
  "RETURN_PENDING",
  "UNBOUND",
  "RESALABLE",
] as const;
export type DeviceStatus = (typeof deviceStatusValues)[number];

export const saleStatusValues = [
  "CREATED",
  "ACTIVATED",
  "RETURN_PENDING",
  "UNBOUND",
  "CLOSED",
] as const;
export type SaleStatus = (typeof saleStatusValues)[number];

export const entitlementTypeValues = ["BASE", "EXTENDED"] as const;
export type EntitlementType = (typeof entitlementTypeValues)[number];

export const sourceChannelValues = [
  "TMALL",
  "DOUYIN",
  "OFFLINE",
  "MANUAL_IMPORT",
  "OTHER",
] as const;
export type SourceChannel = (typeof sourceChannelValues)[number];

export const entitlementStatusValues = ["ACTIVE", "PENDING", "INVALID"] as const;
export type EntitlementStatus = (typeof entitlementStatusValues)[number];

export const decisionStatusValues = [
  "IN_WARRANTY",
  "OUT_OF_WARRANTY",
  "NOT_STARTED",
  "PENDING_MANUAL_REVIEW",
  "UNSOLD_OR_UNDETERMINED",
  "QUERY_ERROR",
  "SN_NOT_FOUND",
] as const;
export type DecisionStatus = (typeof decisionStatusValues)[number];

export const warrantyDecisionModeValues = ["NORMAL", "INHERITED"] as const;
export type WarrantyDecisionMode = (typeof warrantyDecisionModeValues)[number];

export type ActivationRecord = {
  activatedAt: string;
  recordType: ActivationRecordType;
};

export type ActivationQueryResult = {
  success: boolean;
  data?: {
    sn: string;
    activationStatus: ActivationStatus;
    activationRecords: ActivationRecord[];
  };
  errorCode?: string;
  errorMessage?: string;
};

export type WarrantyQueryResponse = {
  sn: string;
  sourceOrderNo: string | null;
  sourceChannel: string | null;
  decisionMode: WarrantyDecisionMode;
  inheritanceHint: string | null;
  originalSn: string | null;
  inheritedWarrantyStartDate: string | null;
  inheritedBaseWarrantyDays: number | null;
  inheritedExtraWarrantyDays: number | null;
  inheritedWarrantyEndDate: string | null;
  model: string | null;
  deviceStatus: DeviceStatus | null;
  saleCycleId: string | null;
  saleCycleStatus: SaleStatus | null;
  activatedAt: string | null;
  baseWarrantyDays: number;
  extraWarrantyDays: number;
  warrantyStartDate: string | null;
  baseWarrantyEndDate: string | null;
  warrantyEndDate: string | null;
  entitlementMatched: boolean;
  entitlementMessage: string;
  matchedEntitlementOrderNo: string | null;
  matchedEntitlementChannel: string | null;
  decisionStatus: DecisionStatus;
  decisionMessage: string;
  basis: string[];
  warnings: string[];
};
