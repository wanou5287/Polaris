import path from "node:path";
import fs from "node:fs/promises";
import * as XLSX from "xlsx";
import { prisma } from "../db.js";

const SQLITE_SAFE_BATCH_SIZE = 400;
const MAX_ERROR_ROWS = 200;
const JOB_RETENTION_MS = 6 * 60 * 60 * 1000;

type ImportErrorRow = {
  row: number;
  sn: string;
  message: string;
};

type NormalizedRow = {
  row: number;
  sn: string;
  sourceOrderNo: string;
  sourceChannel: string;
  warrantyDays: number;
  remark: string;
};

export type EntitlementImportJobStatus = "queued" | "processing" | "completed" | "failed";

export type EntitlementImportJobSnapshot = {
  jobId: string;
  fileName: string;
  status: EntitlementImportJobStatus;
  phase: string;
  progressPercent: number;
  total: number;
  processed: number;
  successCount: number;
  failedCount: number;
  truncatedErrorCount: number;
  errors: ImportErrorRow[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number | null;
  errorMessage: string | null;
};

type EntitlementImportJobInternal = {
  jobId: string;
  fileName: string;
  status: EntitlementImportJobStatus;
  phase: string;
  progressPercent: number;
  total: number;
  processed: number;
  successCount: number;
  failedCount: number;
  truncatedErrorCount: number;
  errors: ImportErrorRow[];
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  elapsedMs: number | null;
  errorMessage: string | null;
};

const chineseDigitMap: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildEntitlementKey(sn: string, sourceOrderNo: string) {
  return `${sn}::${sourceOrderNo.trim()}`;
}

function pushError(errors: ImportErrorRow[], row: number, sn: string, message: string) {
  if (errors.length < MAX_ERROR_ROWS) {
    errors.push({ row, sn, message });
  }
}

function parseChineseNumber(raw: string): number | null {
  if (!raw) {
    return null;
  }

  if (raw === "十") {
    return 10;
  }

  if (!raw.includes("十")) {
    return chineseDigitMap[raw] ?? null;
  }

  const [left, right] = raw.split("十");
  const tens = left ? chineseDigitMap[left] : 1;
  const units = right ? chineseDigitMap[right] : 0;

  if (tens === undefined || units === undefined) {
    return null;
  }

  return tens * 10 + units;
}

function parseUnitCount(raw: string): number | null {
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }

  const asNumber = Number(normalized);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }

  return parseChineseNumber(normalized);
}

function parseWarrantyDays(value: unknown): { ok: true; days: number } | { ok: false; message: string } {
  if (value === null || value === undefined) {
    return { ok: true, days: 0 };
  }

  if (typeof value === "number") {
    if (Number.isNaN(value) || value < 0) {
      return {
        ok: false,
        message: "延保必须是大于等于 0 的数字，或类似无延保、延保3个月、延保1年的文本",
      };
    }
    return { ok: true, days: value };
  }

  const normalized = String(value).trim().replace(/\s+/g, "");
  if (!normalized) {
    return { ok: true, days: 0 };
  }

  if (normalized === "无延保") {
    return { ok: true, days: 0 };
  }

  const directNumber = Number(normalized);
  if (!Number.isNaN(directNumber)) {
    return directNumber < 0
      ? { ok: false, message: "延保不能小于 0" }
      : { ok: true, days: directNumber };
  }

  const normalizedWithoutPrefix = normalized.replace(/^延保/, "");
  const monthMatch = normalizedWithoutPrefix.match(
    /^([0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十]+)(个?月)$/,
  );
  if (monthMatch) {
    const count = parseUnitCount(monthMatch[1]);
    if (count === null || count < 0) {
      return { ok: false, message: "无法识别延保月份，请填写如延保3个月、延保六个月" };
    }
    return { ok: true, days: Math.round(count * 30) };
  }

  const yearMatch = normalizedWithoutPrefix.match(
    /^([0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十]+)年$/,
  );
  if (yearMatch) {
    const count = parseUnitCount(yearMatch[1]);
    if (count === null || count < 0) {
      return { ok: false, message: "无法识别延保年数，请填写如延保1年" };
    }
    return { ok: true, days: Math.round(count * 365) };
  }

  return {
    ok: false,
    message: "延保格式不支持，请填写如无延保、延保3个月、延保6个月、延保1年",
  };
}

class EntitlementImportJobService {
  private jobs = new Map<string, EntitlementImportJobInternal>();

  async createJob(fileName: string, buffer: Buffer) {
    this.cleanupExpiredJobs();

    const jobId = `imp-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const uploadsDir = path.resolve(process.cwd(), "mock", "entitlement-import-samples", "jobs");
    await fs.mkdir(uploadsDir, { recursive: true });

    const sourceFilePath = path.join(uploadsDir, `${jobId}-${fileName}`);
    await fs.writeFile(sourceFilePath, buffer);

    const job: EntitlementImportJobInternal = {
      jobId,
      fileName,
      status: "queued",
      phase: "等待开始",
      progressPercent: 0,
      total: 0,
      processed: 0,
      successCount: 0,
      failedCount: 0,
      truncatedErrorCount: 0,
      errors: [],
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      elapsedMs: null,
      errorMessage: null,
    };

    this.jobs.set(jobId, job);
    setImmediate(() => {
      void this.processJob(jobId, sourceFilePath);
    });

    return this.toSnapshot(job);
  }

  getJob(jobId: string) {
    const job = this.jobs.get(jobId);
    return job ? this.toSnapshot(job) : null;
  }

  private async processJob(jobId: string, sourceFilePath: string) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = "processing";
    job.phase = "读取文件";
    job.progressPercent = 2;
    job.startedAt = new Date();

    try {
      const buffer = await fs.readFile(sourceFilePath);
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const firstSheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
        defval: "",
      });

      job.total = rows.length;
      job.phase = "校验数据";
      job.progressPercent = rows.length > 0 ? 5 : 100;

      const errors: ImportErrorRow[] = [];
      const normalizedRows: NormalizedRow[] = [];
      const importId = Date.now();
      const validationTick = Math.max(500, Math.floor(rows.length / 100) || 1);

      for (const [index, row] of rows.entries()) {
        const rowNo = index + 2;
        const sn = String(row.sn ?? row.SN ?? row["设备序列号"] ?? "").trim();
        const sourceOrderNo = String(
          row.sourceOrderNo ?? row.source_order_no ?? row["订单号"] ?? "",
        ).trim();
        const sourceChannel = String(
          row.sourceChannel ?? row.source_channel ?? row["渠道"] ?? "",
        ).trim();
        const parsedWarranty = parseWarrantyDays(
          row.warrantyDays ?? row.warranty_days ?? row["延保"] ?? row["延保天数"] ?? "",
        );
        const remark = String(row.remark ?? row["备注"] ?? "").trim();

        if (!sn || !sourceOrderNo) {
          pushError(errors, rowNo, sn, "缺少设备序列号或订单号");
        } else if (!parsedWarranty.ok) {
          pushError(errors, rowNo, sn, parsedWarranty.message);
        } else {
          normalizedRows.push({
            row: rowNo,
            sn,
            sourceOrderNo,
            sourceChannel: sourceChannel || "未填写",
            warrantyDays: parsedWarranty.days,
            remark,
          });
        }

        job.processed = index + 1;
        job.successCount = normalizedRows.length;
        job.failedCount = job.processed - job.successCount;
        if ((index + 1) % validationTick === 0 || index === rows.length - 1) {
          job.progressPercent = rows.length === 0 ? 35 : 5 + Math.round(((index + 1) / rows.length) * 30);
        }
      }

      const dedupedRowsMap = new Map<string, NormalizedRow>();
      for (const item of normalizedRows) {
        dedupedRowsMap.set(buildEntitlementKey(item.sn, item.sourceOrderNo), item);
      }

      const dedupedRows = [...dedupedRowsMap.values()];
      const uniqueSnList = [...new Set(dedupedRows.map((item) => item.sn))];
      const deviceLookupChunks = chunkArray(uniqueSnList, SQLITE_SAFE_BATCH_SIZE);
      const existingSnSet = new Set<string>();

      job.phase = "检查设备主记录";
      for (const [index, snChunk] of deviceLookupChunks.entries()) {
        const existingDevices = await prisma.device.findMany({
          where: {
            sn: {
              in: snChunk,
            },
          },
          select: {
            sn: true,
          },
        });

        for (const item of existingDevices) {
          existingSnSet.add(item.sn);
        }

        if (deviceLookupChunks.length > 0) {
          job.progressPercent = 35 + Math.round(((index + 1) / deviceLookupChunks.length) * 15);
        }
      }

      const missingDevices = uniqueSnList
        .filter((sn) => !existingSnSet.has(sn))
        .map((sn) => ({
          id: `auto-dev-${sn}`,
          sn,
          model: "待补充",
          factoryDate: new Date(),
          currentDeviceStatus: "IMPORTED_PENDING_ENRICHMENT",
        }));

      const missingDeviceChunks = chunkArray(missingDevices, SQLITE_SAFE_BATCH_SIZE);
      job.phase = "补齐设备占位记录";
      for (const [index, deviceChunk] of missingDeviceChunks.entries()) {
        if (deviceChunk.length > 0) {
          await prisma.device.createMany({
            data: deviceChunk,
          });
        }

        if (missingDeviceChunks.length > 0) {
          job.progressPercent = 50 + Math.round(((index + 1) / missingDeviceChunks.length) * 15);
        }
      }

      const deleteKeys = dedupedRows.map((item) => ({
        sn: item.sn,
        sourceOrderNo: item.sourceOrderNo,
      }));
      const deleteChunks = chunkArray(deleteKeys, SQLITE_SAFE_BATCH_SIZE);
      job.phase = "覆盖旧延保记录";
      for (const [index, deleteChunk] of deleteChunks.entries()) {
        if (deleteChunk.length > 0) {
          await prisma.warrantyEntitlement.deleteMany({
            where: {
              OR: deleteChunk.map((item) => ({
                sn: item.sn,
                sourceOrderNo: item.sourceOrderNo,
              })),
            },
          });
        }

        if (deleteChunks.length > 0) {
          job.progressPercent = 65 + Math.round(((index + 1) / deleteChunks.length) * 10);
        }
      }

      const entitlementRows = dedupedRows.map((item, index) => ({
        id: `imp-${importId}-${index}`,
        entitlementId: `IMP-${importId}-${index}`,
        saleCycleId: null,
        sn: item.sn,
        entitlementType: "EXTENDED",
        sourceChannel: item.sourceChannel,
        sourceOrderNo: item.sourceOrderNo,
        warrantyDays: item.warrantyDays,
        status: item.warrantyDays > 0 ? "ACTIVE" : "INVALID",
        remark: item.remark || "导入创建",
      }));

      const entitlementChunks = chunkArray(entitlementRows, SQLITE_SAFE_BATCH_SIZE);
      job.phase = "写入延保台账";
      for (const [index, entitlementChunk] of entitlementChunks.entries()) {
        if (entitlementChunk.length > 0) {
          await prisma.warrantyEntitlement.createMany({
            data: entitlementChunk,
          });
        }

        if (entitlementChunks.length > 0) {
          job.progressPercent = 75 + Math.round(((index + 1) / entitlementChunks.length) * 20);
        }
      }

      const archiveDir = path.resolve(process.cwd(), "mock", "entitlement-import-samples");
      await fs.mkdir(archiveDir, { recursive: true });
      await fs.copyFile(sourceFilePath, path.join(archiveDir, `import-${Date.now()}.xlsx`));
      await fs.unlink(sourceFilePath).catch(() => {});

      job.status = "completed";
      job.phase = "导入完成";
      job.progressPercent = 100;
      job.processed = rows.length;
      job.successCount = dedupedRows.length;
      job.failedCount = rows.length - dedupedRows.length;
      job.errors = errors;
      job.truncatedErrorCount =
        job.failedCount > errors.length ? job.failedCount - errors.length : 0;
      job.finishedAt = new Date();
      job.elapsedMs = job.startedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null;
    } catch (error) {
      job.status = "failed";
      job.phase = "导入失败";
      job.finishedAt = new Date();
      job.elapsedMs = job.startedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null;
      job.errorMessage = error instanceof Error ? error.message : "导入任务执行失败";
      await fs.unlink(sourceFilePath).catch(() => {});
    }
  }

  private cleanupExpiredJobs() {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      const finishedAt = job.finishedAt?.getTime() ?? job.createdAt.getTime();
      if (now - finishedAt > JOB_RETENTION_MS) {
        this.jobs.delete(jobId);
      }
    }
  }

  private toSnapshot(job: EntitlementImportJobInternal): EntitlementImportJobSnapshot {
    return {
      jobId: job.jobId,
      fileName: job.fileName,
      status: job.status,
      phase: job.phase,
      progressPercent: job.progressPercent,
      total: job.total,
      processed: job.processed,
      successCount: job.successCount,
      failedCount: job.failedCount,
      truncatedErrorCount: job.truncatedErrorCount,
      errors: job.errors,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      elapsedMs: job.elapsedMs,
      errorMessage: job.errorMessage,
    };
  }
}

export const entitlementImportJobService = new EntitlementImportJobService();
