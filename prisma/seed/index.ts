import { PrismaClient } from "@prisma/client";
import { scryptSync } from "node:crypto";

const prisma = new PrismaClient();
const hashPassword = (password: string) => scryptSync(password, "warranty-console", 64).toString("hex");

async function main() {
  await prisma.userSession.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.snInheritanceRecord.deleteMany();
  await prisma.deviceEvent.deleteMany();
  await prisma.warrantyEntitlement.deleteMany();
  await prisma.saleCycle.deleteMany();
  await prisma.device.deleteMany();

  await prisma.device.createMany({
    data: [
      { id: "dev-sn001", sn: "SN001", model: "Pad-X1", factoryDate: new Date("2025-12-18T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn002", sn: "SN002", model: "Pad-X1", factoryDate: new Date("2025-12-20T09:00:00+08:00"), currentDeviceStatus: "SOLD_WAIT_ACTIVATION" },
      { id: "dev-sn003", sn: "SN003", model: "Pad-X2", factoryDate: new Date("2025-10-02T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn004", sn: "SN004", model: "Pad-X2", factoryDate: new Date("2025-10-12T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn005", sn: "SN005", model: "Pad-X3", factoryDate: new Date("2025-11-01T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn006", sn: "SN006", model: "Pad-Pro", factoryDate: new Date("2025-11-01T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn007", sn: "SN007", model: "Pad-Pro", factoryDate: new Date("2025-11-01T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn008", sn: "SN008", model: "Pad-Lite", factoryDate: new Date("2025-11-01T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn009", sn: "SN009", model: "Pad-Lite", factoryDate: new Date("2025-12-01T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn100-old", sn: "SN100-OLD", model: "Pad-Repair", factoryDate: new Date("2025-05-01T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn100-new", sn: "SN100-NEW", model: "Pad-Repair", factoryDate: new Date("2025-12-01T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn101-old", sn: "SN101-OLD", model: "Pad-Repair", factoryDate: new Date("2025-04-01T09:00:00+08:00"), currentDeviceStatus: "IN_USE" },
      { id: "dev-sn101-new", sn: "SN101-NEW", model: "Pad-Repair", factoryDate: new Date("2025-12-15T09:00:00+08:00"), currentDeviceStatus: "IN_USE" }
    ],
  });

  await prisma.saleCycle.createMany({
    data: [
      { id: "cycle-sn001", saleCycleId: "SC202601010001", sn: "SN001", cycleNo: 1, saleStatus: "ACTIVATED", sourceOrderNo: "ORDER001", sourceChannel: "TMALL", soldAt: new Date("2026-01-01T10:00:00+08:00"), activatedAt: new Date("2026-01-10T10:00:00+08:00") },
      { id: "cycle-sn002", saleCycleId: "SC202601020001", sn: "SN002", cycleNo: 1, saleStatus: "CREATED", sourceOrderNo: "ORDER010", sourceChannel: "OFFLINE", soldAt: new Date("2026-01-02T10:00:00+08:00") },
      { id: "cycle-sn003-1", saleCycleId: "SC202511100001", sn: "SN003", cycleNo: 1, saleStatus: "CLOSED", sourceOrderNo: "ORDER020", sourceChannel: "TMALL", soldAt: new Date("2025-11-10T10:00:00+08:00"), activatedAt: new Date("2025-11-12T09:00:00+08:00"), returnReceivedAt: new Date("2025-11-15T16:00:00+08:00"), unboundAt: new Date("2025-11-16T12:00:00+08:00"), cycleClosedAt: new Date("2025-11-16T12:00:00+08:00") },
      { id: "cycle-sn003-2", saleCycleId: "SC202602010001", sn: "SN003", cycleNo: 2, saleStatus: "ACTIVATED", sourceOrderNo: "ORDER021", sourceChannel: "DOUYIN", soldAt: new Date("2026-02-01T09:00:00+08:00") },
      { id: "cycle-sn004", saleCycleId: "SC202601150001", sn: "SN004", cycleNo: 1, saleStatus: "ACTIVATED", sourceOrderNo: "ORDER030", sourceChannel: "OFFLINE", soldAt: new Date("2026-01-15T09:00:00+08:00") },
      { id: "cycle-sn005", saleCycleId: "SC202601200001", sn: "SN005", cycleNo: 1, saleStatus: "ACTIVATED", sourceOrderNo: "ORDER040", sourceChannel: "TMALL", soldAt: new Date("2026-01-20T09:00:00+08:00") },
      { id: "cycle-sn006", saleCycleId: "SC202601220001", sn: "SN006", cycleNo: 1, saleStatus: "ACTIVATED", sourceOrderNo: "ORDER050", sourceChannel: "TMALL", soldAt: new Date("2026-01-22T09:00:00+08:00") },
      { id: "cycle-sn007", saleCycleId: "SC202601250001", sn: "SN007", cycleNo: 1, saleStatus: "ACTIVATED", sourceOrderNo: "ORDER060", sourceChannel: "DOUYIN", soldAt: new Date("2026-01-25T09:00:00+08:00") },
      { id: "cycle-sn009", saleCycleId: "SC202601260009", sn: "SN009", cycleNo: 1, saleStatus: "ACTIVATED", sourceOrderNo: "ORDER_CONFLICT", sourceChannel: "TMALL", soldAt: new Date("2026-01-26T09:00:00+08:00"), activatedAt: new Date("2026-01-27T09:00:00+08:00") }
    ],
  });

  await prisma.warrantyEntitlement.createMany({
    data: [
      { id: "ent-sn001-order001", entitlementId: "ENT-SN001-ORDER001", saleCycleId: "SC202601010001", sn: "SN001", entitlementType: "EXTENDED", sourceChannel: "TMALL", sourceOrderNo: "ORDER001", warrantyDays: 180, status: "ACTIVE", remark: "SN001 + ORDER001 匹配成功样例" },
      { id: "ent-sn006-order050", entitlementId: "ENT-SN006-ORDER050", saleCycleId: "SC202601220001", sn: "SN006", entitlementType: "EXTENDED", sourceChannel: "TMALL", sourceOrderNo: "ORDER050", warrantyDays: 180, status: "ACTIVE", remark: "标准延保 180 天" },
      { id: "ent-sn007-order060", entitlementId: "ENT-SN007-ORDER060", saleCycleId: "SC202601250001", sn: "SN007", entitlementType: "EXTENDED", sourceChannel: "DOUYIN", sourceOrderNo: "ORDER060", warrantyDays: 365, status: "ACTIVE", remark: "标准延保 365 天" },
      { id: "ent-sn009-conflict-a", entitlementId: "ENT-SN009-CONFLICT-A", saleCycleId: "SC202601260009", sn: "SN009", entitlementType: "EXTENDED", sourceChannel: "TMALL", sourceOrderNo: "ORDER_CONFLICT", warrantyDays: 180, status: "ACTIVE", remark: "冲突样例 A" },
      { id: "ent-sn009-conflict-b", entitlementId: "ENT-SN009-CONFLICT-B", saleCycleId: "SC202601260009", sn: "SN009", entitlementType: "EXTENDED", sourceChannel: "TMALL", sourceOrderNo: "ORDER_CONFLICT", warrantyDays: 365, status: "ACTIVE", remark: "冲突样例 B" }
    ],
  });

  await prisma.deviceEvent.createMany({
    data: [
      { id: "evt-sn001-1", eventId: "EVT-SN001-1", sn: "SN001", saleCycleId: "SC202601010001", eventType: "SOLD", eventTime: new Date("2026-01-01T10:00:00+08:00"), rawPayload: JSON.stringify({ sourceOrderNo: "ORDER001" }) },
      { id: "evt-sn001-2", eventId: "EVT-SN001-2", sn: "SN001", saleCycleId: "SC202601010001", eventType: "ACTIVATED", eventTime: new Date("2026-01-10T10:00:00+08:00"), rawPayload: JSON.stringify({ source: "mock-activation" }) },
      { id: "evt-sn003-1", eventId: "EVT-SN003-1", sn: "SN003", saleCycleId: "SC202511100001", eventType: "UNBOUND", eventTime: new Date("2025-11-16T12:00:00+08:00"), rawPayload: JSON.stringify({ sourceOrderNo: "ORDER020" }) },
      { id: "evt-sn003-2", eventId: "EVT-SN003-2", sn: "SN003", saleCycleId: "SC202602010001", eventType: "SOLD", eventTime: new Date("2026-02-01T09:00:00+08:00"), rawPayload: JSON.stringify({ sourceOrderNo: "ORDER021" }) },
      { id: "evt-sn006-1", eventId: "EVT-SN006-1", sn: "SN006", saleCycleId: "SC202601220001", eventType: "ENTITLEMENT_IMPORTED", eventTime: new Date("2026-01-23T14:00:00+08:00"), rawPayload: JSON.stringify({ sourceOrderNo: "ORDER050", warrantyDays: 180 }) },
      { id: "evt-sn007-1", eventId: "EVT-SN007-1", sn: "SN007", saleCycleId: "SC202601250001", eventType: "ENTITLEMENT_IMPORTED", eventTime: new Date("2026-01-26T14:00:00+08:00"), rawPayload: JSON.stringify({ sourceOrderNo: "ORDER060", warrantyDays: 365 }) },
      { id: "evt-sn009-1", eventId: "EVT-SN009-1", sn: "SN009", saleCycleId: "SC202601260009", eventType: "ENTITLEMENT_IMPORTED", eventTime: new Date("2026-01-27T14:00:00+08:00"), rawPayload: JSON.stringify({ sourceOrderNo: "ORDER_CONFLICT" }) }
    ],
  });

  await prisma.snInheritanceRecord.createMany({
    data: [
      {
        id: "inherit-sn100",
        originalSn: "SN100-OLD",
        newSn: "SN100-NEW",
        inheritedWarrantyStart: new Date("2025-06-01T00:00:00+08:00"),
        inheritedBaseDays: 365,
        inheritedExtraDays: 180,
        inheritedWarrantyEnd: new Date("2026-11-28T00:00:00+08:00"),
        originalOrderNo: "ORDER100",
        changeReason: "更换主板",
        effectiveAt: new Date("2025-12-20T10:00:00+08:00"),
        status: "有效",
        remark: "售后改号继承示例",
        createdBy: "system-seed",
      },
      {
        id: "inherit-sn101-a",
        originalSn: "SN101-OLD",
        newSn: "SN101-NEW",
        inheritedWarrantyStart: new Date("2025-07-01T00:00:00+08:00"),
        inheritedBaseDays: 365,
        inheritedExtraDays: 0,
        inheritedWarrantyEnd: new Date("2026-07-01T00:00:00+08:00"),
        originalOrderNo: "ORDER101",
        changeReason: "更换主板",
        effectiveAt: new Date("2026-01-01T10:00:00+08:00"),
        status: "有效",
        remark: "冲突示例 A",
        createdBy: "system-seed",
      },
      {
        id: "inherit-sn101-b",
        originalSn: "SN101-OLD",
        newSn: "SN101-NEW",
        inheritedWarrantyStart: new Date("2025-07-15T00:00:00+08:00"),
        inheritedBaseDays: 365,
        inheritedExtraDays: 90,
        inheritedWarrantyEnd: new Date("2026-10-13T00:00:00+08:00"),
        originalOrderNo: "ORDER101",
        changeReason: "更换主板",
        effectiveAt: new Date("2026-01-02T10:00:00+08:00"),
        status: "有效",
        remark: "冲突示例 B",
        createdBy: "system-seed",
      },
    ],
  });

  await prisma.appUser.create({
    data: {
      id: "user-admin",
      username: "admin",
      passwordHash: hashPassword("Admin@123456"),
      displayName: "系统管理员",
      status: "APPROVED",
      isSuperAdmin: true,
      canQueryWarranty: true,
      canTestActivation: true,
      canImportEntitlements: true,
      canManageInheritance: true,
      approvedBy: "system-seed",
      approvedAt: new Date("2026-03-25T09:00:00+08:00"),
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
