import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./db.js";
import { config } from "./config.js";
import { createActivationQueryService } from "./services/activation-query-service.js";
import { entitlementImportJobService } from "./services/entitlement-import-job-service.js";
import { WarrantyDecisionService } from "./services/warranty-decision-service.js";

const SESSION_EXPIRE_DAYS = 14;
const PASSWORD_SALT = "warranty-console";

const activationQueryService = createActivationQueryService();
const warrantyDecisionService = new WarrantyDecisionService();

const querySchema = z.object({
  sn: z.string().trim().min(1, "SN 不能为空"),
  sourceOrderNo: z.string().trim().optional().default(""),
});

const registerSchema = z.object({
  username: z.string().trim().min(3, "账号至少 3 位").max(50, "账号过长"),
  password: z.string().min(8, "密码至少 8 位"),
  displayName: z.string().trim().min(2, "姓名至少 2 位").max(50, "姓名过长"),
});

const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入账号"),
  password: z.string().min(1, "请输入密码"),
});

const permissionUpdateSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  canQueryWarranty: z.boolean(),
  canTestActivation: z.boolean(),
  canImportEntitlements: z.boolean(),
  canManageInheritance: z.boolean(),
  displayName: z.string().trim().min(2, "姓名至少 2 位").max(50, "姓名过长"),
});

const inheritanceRecordSchema = z.object({
  原序列号: z.string().trim().min(1, "原序列号不能为空"),
  新序列号: z.string().trim().min(1, "新序列号不能为空"),
  继承保修开始日: z.string().trim().min(1, "继承保修开始日不能为空"),
  继承标准保修天数: z.coerce.number().int().min(0, "继承标准保修天数不能小于 0"),
  继承延保天数: z.coerce.number().int().min(0, "继承延保天数不能小于 0"),
  继承保修截止日: z.string().trim().min(1, "继承保修截止日不能为空"),
  原订单号: z.string().trim().optional().nullable(),
  改号原因: z.string().trim().optional().nullable(),
  改号生效时间: z.string().trim().optional().nullable(),
  状态: z.enum(["有效", "已作废"]),
  备注: z.string().trim().optional().nullable(),
  录入人: z.string().trim().optional().nullable(),
});

type PermissionKey =
  | "canQueryWarranty"
  | "canTestActivation"
  | "canImportEntitlements"
  | "canManageInheritance";

type AuthUser = Awaited<ReturnType<typeof getUserBySessionToken>>;

function hashPassword(password: string) {
  return scryptSync(password, PASSWORD_SALT, 64).toString("hex");
}

function verifyPassword(password: string, hashedPassword: string) {
  const passwordBuffer = Buffer.from(hashPassword(password), "hex");
  const hashedBuffer = Buffer.from(hashedPassword, "hex");
  if (passwordBuffer.length !== hashedBuffer.length) {
    return false;
  }

  return timingSafeEqual(passwordBuffer, hashedBuffer);
}

function parseDateOnly(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

function buildUserResponse(user: NonNullable<AuthUser>) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    status: user.status,
    isSuperAdmin: user.isSuperAdmin,
    permissions: {
      canQueryWarranty: user.canQueryWarranty || user.isSuperAdmin,
      canTestActivation: user.canTestActivation || user.isSuperAdmin,
      canImportEntitlements: user.canImportEntitlements || user.isSuperAdmin,
      canManageInheritance: user.canManageInheritance || user.isSuperAdmin,
    },
  };
}

async function getUserBySessionToken(token: string | null) {
  if (!token) {
    return null;
  }

  const session = await prisma.userSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    await prisma.userSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return session.user;
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = await getUserBySessionToken(getBearerToken(request));
  if (!user) {
    await reply.status(401).send({ success: false, error: "请先登录" });
    return null;
  }

  if (user.status !== "APPROVED") {
    await reply.status(403).send({ success: false, error: "账号尚未审批通过" });
    return null;
  }

  return user;
}

async function requirePermission(request: FastifyRequest, reply: FastifyReply, permission: PermissionKey) {
  const user = await requireAuth(request, reply);
  if (!user) {
    return null;
  }

  if (user.isSuperAdmin || user[permission]) {
    return user;
  }

  await reply.status(403).send({ success: false, error: "当前账号没有此模块权限" });
  return null;
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireAuth(request, reply);
  if (!user) {
    return null;
  }

  if (!user.isSuperAdmin) {
    await reply.status(403).send({ success: false, error: "只有管理员可以执行该操作" });
    return null;
  }

  return user;
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_EXPIRE_DAYS * 24 * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      token,
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

async function validateOriginalSnExists(originalSn: string) {
  const [device, entitlement] = await Promise.all([
    prisma.device.findUnique({
      where: { sn: originalSn },
      select: { sn: true },
    }),
    prisma.warrantyEntitlement.findFirst({
      where: { sn: originalSn },
      select: { id: true },
    }),
  ]);

  return Boolean(device || entitlement);
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ success: true }));

  app.post("/api/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten() });
    }

    const { username, password, displayName } = parsed.data;
    const exists = await prisma.appUser.findUnique({ where: { username } });
    if (exists) {
      return reply.status(400).send({ success: false, error: "该账号已存在，请更换后重试" });
    }

    await prisma.appUser.create({
      data: {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        username,
        passwordHash: hashPassword(password),
        displayName,
        status: "PENDING",
      },
    });

    return reply.send({
      success: true,
      message: "注册成功，等待管理员审批后才能登录",
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten() });
    }

    const user = await prisma.appUser.findUnique({
      where: { username: parsed.data.username },
    });

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.status(401).send({ success: false, error: "账号或密码错误" });
    }

    if (user.status === "PENDING") {
      return reply.status(403).send({ success: false, error: "账号已注册，正在等待管理员审批" });
    }

    if (user.status === "REJECTED") {
      return reply.status(403).send({ success: false, error: "账号已被停用，请联系管理员" });
    }

    const session = await createSession(user.id);
    return reply.send({
      success: true,
      data: {
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
        user: buildUserResponse(user),
      },
    });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = getBearerToken(request);
    if (token) {
      await prisma.userSession.deleteMany({ where: { token } });
    }

    return reply.send({ success: true });
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) {
      return;
    }

    return reply.send({ success: true, data: buildUserResponse(user) });
  });

  app.get("/api/admin/users", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) {
      return;
    }

    const users = await prisma.appUser.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return reply.send({
      success: true,
      data: users.map((user) => ({
        ...buildUserResponse(user),
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      })),
    });
  });

  app.put("/api/admin/users/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: params.error.flatten() });
    }

    const parsed = permissionUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten() });
    }

    const existing = await prisma.appUser.findUnique({ where: { id: params.data.id } });
    if (!existing) {
      return reply.status(404).send({ success: false, error: "账号不存在" });
    }

    const data = await prisma.appUser.update({
      where: { id: params.data.id },
      data: {
        displayName: parsed.data.displayName,
        status: parsed.data.status,
        canQueryWarranty: parsed.data.canQueryWarranty,
        canTestActivation: parsed.data.canTestActivation,
        canImportEntitlements: parsed.data.canImportEntitlements,
        canManageInheritance: parsed.data.canManageInheritance,
        approvedBy: admin.username,
        approvedAt: parsed.data.status === "APPROVED" ? new Date() : null,
      },
    });

    if (parsed.data.status !== "APPROVED") {
      await prisma.userSession.deleteMany({ where: { userId: data.id } });
    }

    return reply.send({ success: true, data: buildUserResponse(data) });
  });

  app.get("/api/activation/test", async (request, reply) => {
    const user = await requirePermission(request, reply, "canTestActivation");
    if (!user) {
      return;
    }

    const params = z.object({ sn: z.string().trim().min(1, "SN 不能为空") }).safeParse(request.query);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: params.error.flatten() });
    }

    const result = await activationQueryService.queryBySn(params.data.sn);
    return reply.send({
      success: true,
      data: {
        mode: config.activationMode,
        requestSn: params.data.sn,
        result,
      },
    });
  });

  app.get("/api/warranty/query", async (request, reply) => {
    const user = await requirePermission(request, reply, "canQueryWarranty");
    if (!user) {
      return;
    }

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten() });
    }

    const data = await warrantyDecisionService.queryWarranty(parsed.data);
    return reply.send({ success: true, data });
  });

  app.get("/api/sale-cycles/:saleCycleId", async (request, reply) => {
    const user = await requirePermission(request, reply, "canQueryWarranty");
    if (!user) {
      return;
    }

    const params = z.object({ saleCycleId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: params.error.flatten() });
    }

    const data = await warrantyDecisionService.getSaleCycleDetail(params.data.saleCycleId);
    if (!data) {
      return reply.status(404).send({ success: false, error: "销售周期不存在" });
    }

    return reply.send({ success: true, data });
  });

  app.get("/api/inheritance-records", async (request, reply) => {
    const user = await requirePermission(request, reply, "canManageInheritance");
    if (!user) {
      return;
    }

    const params = z.object({ keyword: z.string().trim().optional().default("") }).parse(request.query);
    const where = params.keyword
      ? {
          OR: [{ newSn: { contains: params.keyword } }, { originalSn: { contains: params.keyword } }],
        }
      : {};

    const data = await prisma.snInheritanceRecord.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return reply.send({ success: true, data });
  });

  app.post("/api/inheritance-records", async (request, reply) => {
    const user = await requirePermission(request, reply, "canManageInheritance");
    if (!user) {
      return;
    }

    const parsed = inheritanceRecordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten() });
    }

    const body = parsed.data;
    const startDate = parseDateOnly(body.继承保修开始日);
    const endDate = parseDateOnly(body.继承保修截止日);
    const effectiveAt = body.改号生效时间 ? parseDateOnly(body.改号生效时间) : null;

    if (!startDate || !endDate) {
      return reply.status(400).send({ success: false, error: "继承保修开始日或继承保修截止日格式不正确" });
    }

    if (endDate < startDate) {
      return reply.status(400).send({ success: false, error: "继承保修截止日不能早于继承保修开始日" });
    }

    if (!(await validateOriginalSnExists(body.原序列号))) {
      return reply.status(400).send({
        success: false,
        error: "原序列号必须先存在于设备表或已导入的离线包台账中，才能登记继承关系",
      });
    }

    const activeCount = await prisma.snInheritanceRecord.count({
      where: { newSn: body.新序列号, status: "有效" },
    });

    if (body.状态 === "有效" && activeCount > 0) {
      return reply.status(400).send({ success: false, error: "同一个新序列号只能存在一条有效记录" });
    }

    const data = await prisma.snInheritanceRecord.create({
      data: {
        id: `inherit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        originalSn: body.原序列号,
        newSn: body.新序列号,
        inheritedWarrantyStart: startDate,
        inheritedBaseDays: body.继承标准保修天数,
        inheritedExtraDays: body.继承延保天数,
        inheritedWarrantyEnd: endDate,
        originalOrderNo: body.原订单号 || null,
        changeReason: body.改号原因 || null,
        effectiveAt,
        status: body.状态,
        remark: body.备注 || null,
        createdBy: body.录入人 || user.displayName,
      },
    });

    return reply.send({ success: true, message: "继承记录新增成功", data });
  });

  app.put("/api/inheritance-records/:id", async (request, reply) => {
    const user = await requirePermission(request, reply, "canManageInheritance");
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: params.error.flatten() });
    }

    const parsed = inheritanceRecordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten() });
    }

    const body = parsed.data;
    const startDate = parseDateOnly(body.继承保修开始日);
    const endDate = parseDateOnly(body.继承保修截止日);
    const effectiveAt = body.改号生效时间 ? parseDateOnly(body.改号生效时间) : null;

    if (!startDate || !endDate) {
      return reply.status(400).send({ success: false, error: "继承保修开始日或继承保修截止日格式不正确" });
    }

    if (endDate < startDate) {
      return reply.status(400).send({ success: false, error: "继承保修截止日不能早于继承保修开始日" });
    }

    if (!(await validateOriginalSnExists(body.原序列号))) {
      return reply.status(400).send({
        success: false,
        error: "原序列号必须先存在于设备表或已导入的离线包台账中，才能保存继承关系",
      });
    }

    const activeCount = await prisma.snInheritanceRecord.count({
      where: {
        newSn: body.新序列号,
        status: "有效",
        id: { not: params.data.id },
      },
    });

    if (body.状态 === "有效" && activeCount > 0) {
      return reply.status(400).send({ success: false, error: "同一个新序列号只能存在一条有效记录" });
    }

    const data = await prisma.snInheritanceRecord.update({
      where: { id: params.data.id },
      data: {
        originalSn: body.原序列号,
        newSn: body.新序列号,
        inheritedWarrantyStart: startDate,
        inheritedBaseDays: body.继承标准保修天数,
        inheritedExtraDays: body.继承延保天数,
        inheritedWarrantyEnd: endDate,
        originalOrderNo: body.原订单号 || null,
        changeReason: body.改号原因 || null,
        effectiveAt,
        status: body.状态,
        remark: body.备注 || null,
        createdBy: body.录入人 || user.displayName,
      },
    });

    return reply.send({ success: true, message: "继承记录更新成功", data });
  });

  app.post("/api/inheritance-records/:id/void", async (request, reply) => {
    const user = await requirePermission(request, reply, "canManageInheritance");
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: params.error.flatten() });
    }

    const data = await prisma.snInheritanceRecord.update({
      where: { id: params.data.id },
      data: { status: "已作废" },
    });

    return reply.send({ success: true, message: "继承记录已作废", data });
  });

  app.post("/api/entitlements/import", async (request, reply) => {
    const user = await requirePermission(request, reply, "canImportEntitlements");
    if (!user) {
      return;
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ success: false, error: "请上传 CSV 或 Excel 文件" });
    }

    const buffer = await file.toBuffer();
    const job = await entitlementImportJobService.createJob(file.filename, buffer);
    return reply.status(202).send({ success: true, data: job });
  });

  app.get("/api/entitlements/import/:jobId", async (request, reply) => {
    const user = await requirePermission(request, reply, "canImportEntitlements");
    if (!user) {
      return;
    }

    const params = z.object({ jobId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: params.error.flatten() });
    }

    const job = entitlementImportJobService.getJob(params.data.jobId);
    if (!job) {
      return reply.status(404).send({ success: false, error: "导入任务不存在，可能已过期，请重新上传文件" });
    }

    return reply.send({ success: true, data: job });
  });
}
