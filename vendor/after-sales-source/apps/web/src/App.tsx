import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ActivationQueryResult, WarrantyQueryResponse } from "../../../packages/shared/src/index.ts";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  `${window.location.protocol}//${window.location.hostname}:3210`;

const TOKEN_KEY = "warranty-console-token";

type ModuleKey = "warranty" | "activation" | "entitlements" | "inheritance" | "admin";

type PermissionSet = {
  canQueryWarranty: boolean;
  canTestActivation: boolean;
  canImportEntitlements: boolean;
  canManageInheritance: boolean;
  canApproveInheritance: boolean;
};

type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  isSuperAdmin: boolean;
  permissions: PermissionSet;
};

type UserAdminRow = AuthUser & {
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

type AuthSuccessResponse = {
  success: true;
  data: {
    token: string;
    expiresAt: string;
    user: AuthUser;
  };
};

type AuthMeResponse = {
  success: true;
  data: AuthUser;
};

type BasicResponse = {
  success: boolean;
  error?: string | { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  message?: string;
};

type ActivationTestResponse = {
  success: true;
  data: {
    mode: string;
    requestSn: string;
    result: ActivationQueryResult;
  };
};

type ImportErrorRow = {
  row: number;
  sn: string;
  message: string;
};

type ImportJob = {
  jobId: string;
  fileName: string;
  status: "queued" | "processing" | "completed" | "failed";
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

type ImportJobResponse = {
  success: true;
  data: ImportJob;
};

type InheritanceRecord = {
  id: string;
  originalSn: string;
  newSn: string;
  inheritedWarrantyStart: string;
  inheritedBaseDays: number;
  inheritedExtraDays: number;
  inheritedWarrantyEnd: string;
  previewActivatedAt?: string | null;
  originalOrderNo: string | null;
  changeReason: string | null;
  effectiveAt: string | null;
  status: string;
  remark: string | null;
  createdBy: string | null;
  pendingApproverUsername?: string | null;
  pendingApproverName?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type InheritanceRecordResponse = {
  success: true;
  data: InheritanceRecord[];
};

type UsersResponse = {
  success: true;
  data: UserAdminRow[];
};

type InheritanceApproverOption = {
  id: string;
  username: string;
  displayName: string;
};

type InheritanceApproversResponse = {
  success: true;
  data: InheritanceApproverOption[];
};

type InheritancePreviewResponse = {
  success: true;
  data: {
    sn: string;
    sourceOrderNo: string;
    activatedAt: string | null;
    warrantyStartDate: string | null;
    baseWarrantyDays: number;
    extraWarrantyDays: number;
    warrantyEndDate: string | null;
    decisionStatus: string;
    decisionMessage: string;
    entitlementMessage: string;
  };
};

type FeedbackTone = "success" | "error" | "info";

type Feedback = {
  tone: FeedbackTone;
  message: string;
} | null;

type InheritanceFormState = {
  id: string | null;
  originalSn: string;
  newSn: string;
  inheritedWarrantyStart: string;
  inheritedBaseDays: string;
  inheritedExtraDays: string;
  inheritedWarrantyEnd: string;
  originalOrderNo: string;
  changeReason: string;
  effectiveAt: string;
  status: "待批准" | "有效" | "已作废";
  remark: string;
  createdBy: string;
  previewActivatedAt: string;
  pendingApproverUsername: string;
};

const emptyInheritanceForm: InheritanceFormState = {
  id: null,
  originalSn: "",
  newSn: "",
  inheritedWarrantyStart: "",
  inheritedBaseDays: "365",
  inheritedExtraDays: "0",
  inheritedWarrantyEnd: "",
  originalOrderNo: "",
  changeReason: "",
  effectiveAt: "",
  status: "待批准",
  remark: "",
  createdBy: "",
  previewActivatedAt: "",
  pendingApproverUsername: "",
};

const moduleMeta: Record<ModuleKey, { title: string; hint: string }> = {
  warranty: {
    title: "完整保修查询",
    hint: "输入序列号，命中继承记录时直接返回；否则再补订单号查询。",
  },
  activation: {
    title: "真实激活接口测试",
    hint: "直接验证真实接口是否返回激活状态和激活时间。",
  },
  entitlements: {
    title: "订单与延保数据录入",
    hint: "上传订单与延保文件，系统异步入库并实时显示处理进度。",
  },
  inheritance: {
    title: "售后改号继承管理",
    hint: "维护原序列号与新序列号之间的继承保修关系。",
  },
  admin: {
    title: "账号审批与权限分配",
    hint: "管理员审批新账号，并分配各模块可见权限。",
  },
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0",
  )}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试";
}

function normalizeApiError(payload: BasicResponse) {
  if (typeof payload.error === "string") {
    return payload.error;
  }
  if (payload.error?.formErrors?.length) {
    return payload.error.formErrors.join("；");
  }
  if (payload.error?.fieldErrors) {
    const message = Object.values(payload.error.fieldErrors)
      .flat()
      .filter(Boolean)
      .join("；");
    if (message) {
      return message;
    }
  }
  return payload.message ?? "请求失败，请稍后重试";
}

function getStatusClass(status: string) {
  if (status === "APPROVED") {
    return "approved";
  }
  if (status === "REJECTED") {
    return "rejected";
  }
  return "pending";
}

function getStatusLabel(status: string) {
  if (status === "APPROVED") {
    return "已批准";
  }
  if (status === "REJECTED") {
    return "已停用";
  }
  return "待审批";
}

function toApiInheritancePayload(form: InheritanceFormState, currentUser: AuthUser | null) {
  return {
    原序列号: form.originalSn.trim(),
    新序列号: form.newSn.trim(),
    继承保修开始日: form.inheritedWarrantyStart.trim(),
    继承标准保修天数: Number(form.inheritedBaseDays || 0),
    继承延保天数: Number(form.inheritedExtraDays || 0),
    继承保修截止日: form.inheritedWarrantyEnd.trim(),
    原订单号: form.originalOrderNo.trim() || null,
    改号原因: form.changeReason.trim() || null,
    改号生效时间: form.effectiveAt.trim() || null,
    状态: form.status,
    备注: form.remark.trim() || null,
    录入人: currentUser?.displayName || form.createdBy.trim() || null,
    审批账号: form.pendingApproverUsername,
  };
}

function downloadCsv(fileName: string, rows: string[][]) {
  const content = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? "");
          return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function requestJson<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as BasicResponse | T | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === "object" && "success" in payload ? normalizeApiError(payload) : "请求失败");
  }

  return payload as T;
}

export default function App() {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<Feedback>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [activeModule, setActiveModule] = useState<ModuleKey>("warranty");

  const [querySn, setQuerySn] = useState("");
  const [queryOrderNo, setQueryOrderNo] = useState("");
  const [showOrderInput, setShowOrderInput] = useState(false);
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [queryFeedback, setQueryFeedback] = useState<Feedback>(null);
  const [warrantyResult, setWarrantyResult] = useState<WarrantyQueryResponse | null>(null);

  const [activationSn, setActivationSn] = useState("");
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationFeedback, setActivationFeedback] = useState<Feedback>(null);
  const [activationResult, setActivationResult] = useState<ActivationTestResponse["data"] | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importFeedback, setImportFeedback] = useState<Feedback>(null);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);

  const [inheritanceForm, setInheritanceForm] = useState<InheritanceFormState>(emptyInheritanceForm);
  const [inheritanceSaving, setInheritanceSaving] = useState(false);
  const [inheritanceFeedback, setInheritanceFeedback] = useState<Feedback>(null);
  const [inheritanceRecords, setInheritanceRecords] = useState<InheritanceRecord[]>([]);
  const [inheritancePreviewLoading, setInheritancePreviewLoading] = useState(false);
  const [inheritanceApprovers, setInheritanceApprovers] = useState<InheritanceApproverOption[]>([]);
  const [approvalReminderOpen, setApprovalReminderOpen] = useState(false);
  const [myPendingApprovals, setMyPendingApprovals] = useState<InheritanceRecord[]>([]);

  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSavingId, setAdminSavingId] = useState<string | null>(null);
  const [adminFeedback, setAdminFeedback] = useState<Feedback>(null);
  const [adminUsers, setAdminUsers] = useState<UserAdminRow[]>([]);
  const [adminDrafts, setAdminDrafts] = useState<Record<string, UserAdminRow>>({});

  const availableModules = useMemo(() => {
    if (!authUser) {
      return [] as ModuleKey[];
    }

    const modules: ModuleKey[] = [];
    if (authUser.permissions.canQueryWarranty) {
      modules.push("warranty");
    }
    if (authUser.permissions.canTestActivation) {
      modules.push("activation");
    }
    if (authUser.permissions.canImportEntitlements) {
      modules.push("entitlements");
    }
    if (authUser.permissions.canManageInheritance || authUser.permissions.canApproveInheritance) {
      modules.push("inheritance");
    }
    if (authUser.isSuperAdmin) {
      modules.push("admin");
    }
    return modules;
  }, [authUser]);

  const canManageInheritanceModule = Boolean(
    authUser?.isSuperAdmin || authUser?.permissions.canManageInheritance,
  );
  const canApproveInheritanceModule = Boolean(
    authUser?.isSuperAdmin || authUser?.permissions.canApproveInheritance,
  );
  useEffect(() => {
    if (!token) {
      setAuthLoading(false);
      setAuthUser(null);
      return;
    }

    setAuthLoading(true);
    void requestJson<AuthMeResponse>("/api/auth/me", undefined, token)
      .then((payload) => {
        setAuthUser(payload.data);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setAuthUser(null);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, [token]);

  useEffect(() => {
    if (!availableModules.length) {
      return;
    }
    if (!availableModules.includes(activeModule)) {
      setActiveModule(availableModules[0]);
    }
  }, [activeModule, availableModules]);

  useEffect(() => {
    if (!authUser?.displayName) {
      return;
    }
    setInheritanceForm((prev) => ({
      ...prev,
      createdBy: authUser.displayName,
    }));
  }, [authUser?.displayName]);

  useEffect(() => {
    if (!token || !canManageInheritanceModule) {
      return;
    }
    void requestJson<InheritanceApproversResponse>("/api/inheritance-approvers", undefined, token)
      .then((payload) => {
        setInheritanceApprovers(payload.data);
        setInheritanceForm((prev) => ({
          ...prev,
          pendingApproverUsername:
            prev.pendingApproverUsername || payload.data[0]?.username || "",
        }));
      })
      .catch(() => {
        setInheritanceApprovers([]);
      });
  }, [token, canManageInheritanceModule]);

  useEffect(() => {
    if (!token || !canApproveInheritanceModule) {
      setMyPendingApprovals([]);
      setApprovalReminderOpen(false);
      return;
    }

    void requestJson<InheritanceRecordResponse>("/api/inheritance-records/my-pending-approvals", undefined, token)
      .then((payload) => {
        setMyPendingApprovals(payload.data);
        setApprovalReminderOpen(payload.data.length > 0);
      })
      .catch(() => {
        setMyPendingApprovals([]);
      });
  }, [token, canApproveInheritanceModule]);

  useEffect(() => {
    if (!importJob || !token) {
      return;
    }
    if (importJob.status === "completed" || importJob.status === "failed") {
      return;
    }

    const timer = window.setInterval(() => {
      void requestJson<ImportJobResponse>(`/api/entitlements/import/${importJob.jobId}`, undefined, token)
        .then((payload) => {
          setImportJob(payload.data);
          if (payload.data.status === "completed") {
            setImportFeedback({
              tone: "success",
              message: `录入完成：成功 ${payload.data.successCount} 条，失败 ${payload.data.failedCount} 条`,
            });
          }
          if (payload.data.status === "failed") {
            setImportFeedback({
              tone: "error",
              message: payload.data.errorMessage ?? "录入任务失败，请稍后重试",
            });
          }
        })
        .catch((error) => {
          setImportFeedback({ tone: "error", message: getErrorMessage(error) });
        });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [importJob, token]);

  useEffect(() => {
    if (
      !token ||
      (!authUser?.permissions.canManageInheritance && !authUser?.permissions.canApproveInheritance)
    ) {
      return;
    }
    void loadInheritanceRecords();
  }, [token, authUser?.permissions.canManageInheritance, authUser?.permissions.canApproveInheritance]);

  useEffect(() => {
    if (!token || !authUser?.isSuperAdmin) {
      return;
    }
    void loadAdminUsers();
  }, [token, authUser?.isSuperAdmin]);

  async function loadInheritanceRecords() {
    if (!token) {
      return;
    }
    try {
      const payload = await requestJson<InheritanceRecordResponse>(`/api/inheritance-records`, undefined, token);
      setInheritanceRecords(payload.data);
    } catch (error) {
      setInheritanceFeedback({ tone: "error", message: getErrorMessage(error) });
    }
  }

  async function handleInheritancePreview() {
    if (!token) {
      return;
    }
    if (!inheritanceForm.originalSn.trim() || !inheritanceForm.originalOrderNo.trim()) {
      setInheritanceFeedback({ tone: "error", message: "请先输入原序列号和原订单号，再查询原保修信息。" });
      return;
    }

    setInheritancePreviewLoading(true);
    setInheritanceFeedback(null);
    try {
      const params = new URLSearchParams({
        sn: inheritanceForm.originalSn.trim(),
        sourceOrderNo: inheritanceForm.originalOrderNo.trim(),
      });
      const payload = await requestJson<InheritancePreviewResponse>(
        `/api/inheritance-records/preview?${params.toString()}`,
        undefined,
        token,
      );

      setInheritanceForm((prev) => ({
        ...prev,
        inheritedWarrantyStart: payload.data.warrantyStartDate ?? "",
        inheritedBaseDays: String(payload.data.baseWarrantyDays ?? 0),
        inheritedExtraDays: String(payload.data.extraWarrantyDays ?? 0),
        inheritedWarrantyEnd: payload.data.warrantyEndDate ?? "",
        previewActivatedAt: formatDateTime(payload.data.activatedAt),
        status: "待批准",
        pendingApproverUsername: prev.pendingApproverUsername || inheritanceApprovers[0]?.username || "",
      }));

      setInheritanceFeedback({
        tone: "info",
        message: `已带出原保修信息：${payload.data.decisionMessage}。${payload.data.entitlementMessage}`,
      });
    } catch (error) {
      setInheritanceFeedback({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setInheritancePreviewLoading(false);
    }
  }

  async function loadAdminUsers() {
    if (!token) {
      return;
    }
    setAdminLoading(true);
    try {
      const payload = await requestJson<UsersResponse>("/api/admin/users", undefined, token);
      setAdminUsers(payload.data);
      setAdminDrafts(
        Object.fromEntries(payload.data.map((user) => [user.id, { ...user } satisfies UserAdminRow])),
      );
    } catch (error) {
      setAdminFeedback({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthFeedback(null);

    try {
      if (authMode === "register") {
        const payload = await requestJson<BasicResponse>("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, displayName }),
        });
        setAuthFeedback({ tone: "success", message: payload.message ?? "注册成功，请等待管理员审批" });
        setAuthMode("login");
        setPassword("");
      } else {
        const payload = await requestJson<AuthSuccessResponse>("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        localStorage.setItem(TOKEN_KEY, payload.data.token);
        setToken(payload.data.token);
        setAuthUser(payload.data.user);
        setAuthFeedback({ tone: "success", message: "登录成功" });
      }
    } catch (error) {
      setAuthFeedback({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await requestJson<BasicResponse>("/api/auth/logout", { method: "POST" }, token);
    } catch {
      // ignore
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setAuthUser(null);
      setWarrantyResult(null);
      setActivationResult(null);
      setImportJob(null);
    }
  }

  async function handleWarrantyQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setQuerySubmitting(true);
    setQueryFeedback(null);

    try {
      const params = new URLSearchParams({ sn: querySn.trim() });
      if (queryOrderNo.trim()) {
        params.set("sourceOrderNo", queryOrderNo.trim());
      }
      const payload = await requestJson<{ success: true; data: WarrantyQueryResponse }>(
        `/api/warranty/query?${params.toString()}`,
        undefined,
        token,
      );
      setWarrantyResult(payload.data);
      const needOrder =
        payload.data.decisionMode === "NORMAL" && payload.data.decisionMessage.includes("订单号");
      setShowOrderInput(needOrder);
      if (needOrder) {
        setQueryFeedback({ tone: "info", message: "未命中继承记录，请补充订单号后继续查询。" });
      }
    } catch (error) {
      setQueryFeedback({ tone: "error", message: getErrorMessage(error) });
      setWarrantyResult(null);
    } finally {
      setQuerySubmitting(false);
    }
  }

  async function handleActivationTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setActivationLoading(true);
    setActivationFeedback(null);

    try {
      const payload = await requestJson<ActivationTestResponse>(
        `/api/activation/test?sn=${encodeURIComponent(activationSn.trim())}`,
        undefined,
        token,
      );
      setActivationResult(payload.data);
    } catch (error) {
      setActivationFeedback({ tone: "error", message: getErrorMessage(error) });
      setActivationResult(null);
    } finally {
      setActivationLoading(false);
    }
  }

  async function handleImportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedFile) {
      setImportFeedback({ tone: "error", message: "请先选择要录入的文件。" });
      return;
    }

    setImportLoading(true);
    setImportFeedback(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const payload = await requestJson<ImportJobResponse>(
        "/api/entitlements/import",
        { method: "POST", body: formData },
        token,
      );
      setImportJob(payload.data);
      setImportFeedback({ tone: "info", message: "录入任务已创建，正在后台处理。" });
    } catch (error) {
      setImportFeedback({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setImportLoading(false);
    }
  }

  async function handleSaveInheritance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setInheritanceSaving(true);
    setInheritanceFeedback(null);

    try {
      const path = inheritanceForm.id
        ? `/api/inheritance-records/${inheritanceForm.id}`
        : "/api/inheritance-records";
      const method = inheritanceForm.id ? "PUT" : "POST";
      const payload = await requestJson<BasicResponse>(
        path,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toApiInheritancePayload(inheritanceForm, authUser)),
        },
        token,
      );
      setInheritanceFeedback({
        tone: "success",
        message: payload.message ?? (inheritanceForm.id ? "继承记录更新成功" : "继承记录新增成功"),
      });
      setInheritanceForm({
        ...emptyInheritanceForm,
        createdBy: authUser?.displayName ?? "",
        pendingApproverUsername: inheritanceApprovers[0]?.username ?? "",
      });
      await loadInheritanceRecords();
    } catch (error) {
      setInheritanceFeedback({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setInheritanceSaving(false);
    }
  }

  async function handleApproveInheritance(id: string) {
    if (!token) {
      return;
    }

    try {
      const payload = await requestJson<BasicResponse>(
        `/api/inheritance-records/${id}/approve`,
        { method: "POST" },
        token,
      );
      setInheritanceFeedback({ tone: "success", message: payload.message ?? "继承记录已批准并生效" });
      const [listPayload, pendingPayload] = await Promise.all([
        requestJson<InheritanceRecordResponse>("/api/inheritance-records", undefined, token),
        requestJson<InheritanceRecordResponse>("/api/inheritance-records/my-pending-approvals", undefined, token),
      ]);
      setInheritanceRecords(listPayload.data);
      setMyPendingApprovals(pendingPayload.data);
      setApprovalReminderOpen(pendingPayload.data.length > 0);
    } catch (error) {
      setInheritanceFeedback({ tone: "error", message: getErrorMessage(error) });
    }
  }

  async function handleRejectInheritance(id: string) {
    if (!token) {
      return;
    }

    try {
      const payload = await requestJson<BasicResponse>(
        `/api/inheritance-records/${id}/reject`,
        { method: "POST" },
        token,
      );
      setInheritanceFeedback({ tone: "success", message: payload.message ?? "继承记录已驳回" });
      const [listPayload, pendingPayload] = await Promise.all([
        requestJson<InheritanceRecordResponse>("/api/inheritance-records", undefined, token),
        requestJson<InheritanceRecordResponse>("/api/inheritance-records/my-pending-approvals", undefined, token),
      ]);
      setInheritanceRecords(listPayload.data);
      setMyPendingApprovals(pendingPayload.data);
      setApprovalReminderOpen(pendingPayload.data.length > 0);
    } catch (error) {
      setInheritanceFeedback({ tone: "error", message: getErrorMessage(error) });
    }
  }

  async function handleSaveAdminUser(userId: string) {
    if (!token) {
      return;
    }
    const draft = adminDrafts[userId];
    if (!draft) {
      return;
    }

    setAdminSavingId(userId);
    setAdminFeedback(null);
    try {
      await requestJson<{ success: true; data: AuthUser }>(
        `/api/admin/users/${userId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: draft.displayName,
            status: draft.status,
            canQueryWarranty: draft.permissions.canQueryWarranty,
            canTestActivation: draft.permissions.canTestActivation,
            canImportEntitlements: draft.permissions.canImportEntitlements,
            canManageInheritance: draft.permissions.canManageInheritance,
            canApproveInheritance: draft.permissions.canApproveInheritance,
          }),
        },
        token,
      );
      setAdminFeedback({ tone: "success", message: `账号 ${draft.username} 已更新权限。` });
      await loadAdminUsers();
    } catch (error) {
      setAdminFeedback({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setAdminSavingId(null);
    }
  }

  function handleDownloadInheritanceHistory() {
    const rows = [
      [
        "原序列号",
        "新序列号",
        "继承保修开始日",
        "继承标准保修天数",
        "继承延保天数",
        "继承保修截止日",
        "原订单号",
        "改号原因",
        "改号生效时间",
        "状态",
        "备注",
        "录入人",
        "指定审批账号",
        "指定审批人",
        "录入时间",
        "最近操作时间",
        "批准人",
        "批准时间",
      ],
      ...inheritanceRecords.map((record) => [
        record.originalSn,
        record.newSn,
        formatDateOnly(record.inheritedWarrantyStart),
        String(record.inheritedBaseDays),
        String(record.inheritedExtraDays),
        formatDateOnly(record.inheritedWarrantyEnd),
        record.originalOrderNo ?? "",
        record.changeReason ?? "",
        formatDateOnly(record.effectiveAt),
        record.status,
        record.remark ?? "",
        record.createdBy ?? "",
        record.pendingApproverUsername ?? "",
        record.pendingApproverName ?? "",
        formatDateTime(record.createdAt),
        formatDateTime(record.updatedAt),
        record.approvedBy ?? "",
        formatDateTime(record.approvedAt),
      ]),
    ];
    downloadCsv(`继承记录历史-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function renderFeedback(feedback: Feedback) {
    if (!feedback) {
      return null;
    }
    const className =
      feedback.tone === "error" ? "error-box" : feedback.tone === "success" ? "success-box" : "info-box";
    return <div className={className}>{feedback.message}</div>;
  }

  if (authLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="auth-subtitle">正在检查登录状态，请稍候...</p>
        </section>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-header">
            <span className="auth-badge">售后管理后台</span>
            <h1>{authMode === "login" ? "账号登录" : "注册账号"}</h1>
            <p className="auth-subtitle">
              {authMode === "login"
                ? "请输入账号和密码进入系统。"
                : "注册后需管理员审批并分配模块权限，审批通过后才能登录使用。"}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === "register" ? (
              <label className="field-stack">
                <span>姓名</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
            ) : null}

            <label className="field-stack">
              <span>账号</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>

            <label className="field-stack">
              <span>密码</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>

            <button className="auth-submit" type="submit" disabled={authSubmitting}>
              {authSubmitting ? "提交中..." : authMode === "login" ? "登录" : "提交注册"}
            </button>
          </form>

          <div className="auth-meta">
            <button
              className="auth-switch"
              type="button"
              onClick={() => {
                setAuthMode((prev) => (prev === "login" ? "register" : "login"));
                setAuthFeedback(null);
              }}
            >
              {authMode === "login" ? "没有账号？去注册" : "已有账号？返回登录"}
            </button>
            {renderFeedback(authFeedback)}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell app-shell-with-sidebar">
      <aside className="sidebar-panel">
        <div className="sidebar-head">
          <span className="auth-badge">售后模块</span>
          <p className="sidebar-user">{authUser.displayName}</p>
          <span className="sidebar-account">{authUser.username}</span>
        </div>

        <nav className="sidebar-nav">
          {availableModules.map((moduleKey) => (
            <button
              key={moduleKey}
              type="button"
              className={`sidebar-link ${activeModule === moduleKey ? "active" : ""}`}
              onClick={() => setActiveModule(moduleKey)}
            >
              <strong>{moduleMeta[moduleKey].title}</strong>
              <span>{moduleMeta[moduleKey].hint}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="hero-logout sidebar-logout" type="button" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </aside>

      <section className="module-shell">
        {activeModule === "warranty" ? (
          <div className="warranty-stack">
            <section className="card warranty-query-card">
              <div className="section-head">
                <h2>查询条件</h2>
                <p>先输入序列号。命中继承记录时直接返回结果；未命中时再补充订单号。</p>
              </div>
              <form className="query-form single-query-form" onSubmit={handleWarrantyQuery}>
                <input placeholder="请输入序列号" value={querySn} onChange={(event) => setQuerySn(event.target.value)} />
                <input
                  placeholder={showOrderInput ? "请输入订单号" : "订单号（未命中继承时再填写）"}
                  value={queryOrderNo}
                  onChange={(event) => setQueryOrderNo(event.target.value)}
                />
                <button type="submit" disabled={querySubmitting || !querySn.trim()}>
                  {querySubmitting ? "查询中..." : "立即查询"}
                </button>
              </form>
              {renderFeedback(queryFeedback)}
            </section>

            <section className="card warranty-result-card">
              <div className="section-head">
                <h2>保修结果</h2>
                <p>按当前规则返回标准保修、延保匹配或继承保修结果。</p>
              </div>
              {warrantyResult ? (
                <div className="detail-layout">
                  <div className="detail-summary">
                    <article><span>当前序列号</span><strong>{warrantyResult.sn}</strong></article>
                    <article><span>订单号</span><strong>{warrantyResult.sourceOrderNo ?? "-"}</strong></article>
                    <article><span>判定模式</span><strong>{warrantyResult.decisionMode === "INHERITED" ? "继承" : "普通"}</strong></article>
                    <article><span>结论</span><strong>{warrantyResult.decisionMessage}</strong></article>
                  </div>

                  {warrantyResult.decisionMode === "INHERITED" ? (
                    <div className="list-block">
                      <h3>继承保修结果</h3>
                      <div className="metric-grid">
                        <article><span>原序列号</span><strong>{warrantyResult.originalSn ?? "-"}</strong></article>
                        <article><span>继承保修开始日</span><strong>{warrantyResult.inheritedWarrantyStartDate ?? "-"}</strong></article>
                        <article><span>继承标准保修天数</span><strong>{warrantyResult.inheritedBaseWarrantyDays ?? 0} 天</strong></article>
                        <article><span>继承延保天数</span><strong>{warrantyResult.inheritedExtraWarrantyDays ?? 0} 天</strong></article>
                        <article><span>继承保修截止日</span><strong>{warrantyResult.inheritedWarrantyEndDate ?? "-"}</strong></article>
                        <article><span>提示说明</span><strong>{warrantyResult.inheritanceHint ?? "-"}</strong></article>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="list-block">
                        <h3>标准保修</h3>
                        <div className="metric-grid">
                          <article><span>激活时间</span><strong>{formatDateTime(warrantyResult.activatedAt)}</strong></article>
                          <article><span>标准保修</span><strong>{warrantyResult.baseWarrantyDays} 天</strong></article>
                          <article><span>标准到期时间</span><strong>{warrantyResult.baseWarrantyEndDate ?? "-"}</strong></article>
                          <article><span>设备状态</span><strong>{warrantyResult.deviceStatus ?? "-"}</strong></article>
                        </div>
                      </div>
                      <div className="list-block">
                        <h3>延保匹配结果</h3>
                        <div className="metric-grid">
                          <article><span>匹配状态</span><strong>{warrantyResult.entitlementMatched ? "已匹配" : "未匹配"}</strong></article>
                          <article><span>匹配说明</span><strong>{warrantyResult.entitlementMessage}</strong></article>
                          <article><span>延保天数</span><strong>{warrantyResult.extraWarrantyDays} 天</strong></article>
                          <article><span>最终到期时间</span><strong>{warrantyResult.warrantyEndDate ?? "-"}</strong></article>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="list-block">
                    <h3>判定依据</h3>
                    <ul>{warrantyResult.basis.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  {warrantyResult.warnings.length ? (
                    <div className="list-block warning-block">
                      <h3>风险提示</h3>
                      <ul>{warrantyResult.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="empty-state">还没有查询结果。请先输入序列号开始查询。</p>
              )}
            </section>
          </div>
        ) : null}

        {activeModule === "activation" ? (
          <section className="card">
            <div className="section-head">
              <h2>真实激活接口测试</h2>
              <p>直接验证外部接口返回的激活状态和激活时间，不依赖本地订单台账。</p>
            </div>
            <form className="query-form single-query-form" onSubmit={handleActivationTest}>
              <input placeholder="请输入序列号" value={activationSn} onChange={(event) => setActivationSn(event.target.value)} />
              <input disabled value={activationResult?.mode ?? "real / mock"} />
              <button type="submit" disabled={activationLoading || !activationSn.trim()}>
                {activationLoading ? "测试中..." : "测试激活接口"}
              </button>
            </form>
            {renderFeedback(activationFeedback)}
            {activationResult ? (
              <>
                <div className="detail-summary">
                  <article><span>当前模式</span><strong>{activationResult.mode}</strong></article>
                  <article><span>请求 SN</span><strong>{activationResult.requestSn}</strong></article>
                  <article><span>调用结果</span><strong>{activationResult.result.success ? "成功" : "失败"}</strong></article>
                  <article><span>激活状态</span><strong>{activationResult.result.data?.activationStatus ?? "-"}</strong></article>
                </div>
                <div className="table-block">
                  <h3>激活记录</h3>
                  <table>
                    <thead><tr><th>SN</th><th>记录类型</th><th>激活时间</th></tr></thead>
                    <tbody>
                      {(activationResult.result.data?.activationRecords ?? []).map((record) => (
                        <tr key={`${record.recordType}-${record.activatedAt}`}>
                          <td>{activationResult.requestSn}</td>
                          <td>{record.recordType}</td>
                          <td>{formatDateTime(record.activatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <pre className="json-block">{JSON.stringify(activationResult.result, null, 2)}</pre>
              </>
            ) : null}
          </section>
        ) : null}

        {activeModule === "entitlements" ? (
          <section className="card">
            <div className="section-head">
              <h2>订单与延保数据录入</h2>
              <p>模板表头请使用：设备序列号、订单号、渠道、延保。系统会异步处理并展示进度。</p>
            </div>
            <form className="import-toolbar" onSubmit={handleImportSubmit}>
              <input
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                }}
              />
              <button type="submit" disabled={importLoading}>{importLoading ? "录入中..." : "上传并录入"}</button>
              <a className="ghost-button" href="/entitlement-template-channel.xlsx" download>下载模板</a>
            </form>
            <p className="import-hint">当前文件：{selectedFile?.name ?? "未选择文件"}</p>
            {renderFeedback(importFeedback)}
            {importJob ? (
              <div className="progress-panel">
                <div className="progress-meta"><span>{importJob.phase}</span><strong>{importJob.progressPercent}%</strong></div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${importJob.progressPercent}%` }} /></div>
                <div className="metric-grid import-metrics">
                  <article><span>总数</span><strong>{importJob.total}</strong></article>
                  <article><span>成功</span><strong>{importJob.successCount}</strong></article>
                  <article><span>失败</span><strong>{importJob.failedCount}</strong></article>
                </div>
              </div>
            ) : null}
            {importJob?.errors.length ? (
              <div className="table-block">
                <h3>失败明细</h3>
                <table>
                  <thead><tr><th>行号</th><th>SN</th><th>原因</th></tr></thead>
                  <tbody>
                    {importJob.errors.map((item) => (
                      <tr key={`${item.row}-${item.sn}`}>
                        <td>{item.row}</td><td>{item.sn}</td><td>{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeModule === "inheritance" ? (
          <div className="inheritance-stack">
            <section className="card inheritance-source-card">
              <div className="section-head">
                <h2>原始查询信息</h2>
                <p>先输入原序列号和原订单号，系统会自动带出激活时间、原保修开始日、原保修截止日和权益时间。</p>
              </div>
              <div className="admin-form-grid inheritance-source-grid">
                <label className="field-stack"><span>原序列号</span><input disabled={!canManageInheritanceModule} value={inheritanceForm.originalSn} onChange={(event) => setInheritanceForm((prev) => ({ ...prev, originalSn: event.target.value }))} /></label>
                <label className="field-stack"><span>原订单号</span><input disabled={!canManageInheritanceModule} value={inheritanceForm.originalOrderNo} onChange={(event) => setInheritanceForm((prev) => ({ ...prev, originalOrderNo: event.target.value }))} /></label>
                <div className="form-inline-action">
                  <button className="ghost-button" type="button" onClick={() => void handleInheritancePreview()} disabled={inheritancePreviewLoading || !canManageInheritanceModule}>
                    {inheritancePreviewLoading ? "查询中..." : "查询原保修"}
                  </button>
                </div>
                <label className="field-stack"><span>激活时间</span><input value={inheritanceForm.previewActivatedAt} disabled /></label>
                <label className="field-stack"><span>继承保修开始日</span><input value={inheritanceForm.inheritedWarrantyStart} disabled /></label>
                <label className="field-stack"><span>继承标准保修天数</span><input value={inheritanceForm.inheritedBaseDays} disabled /></label>
                <label className="field-stack"><span>继承延保天数</span><input value={inheritanceForm.inheritedExtraDays} disabled /></label>
                <label className="field-stack"><span>继承保修截止日</span><input value={inheritanceForm.inheritedWarrantyEnd} disabled /></label>
              </div>
              {renderFeedback(inheritanceFeedback)}
            </section>

            <section className="card inheritance-form-card inheritance-form-card-wide">
              <div className="section-head">
                <h2>继承录入信息</h2>
                <p>确认原始信息无误后，再录入新序列号、改号原因和生效时间。提交后状态会进入待批准。</p>
              </div>
              <form className="admin-form-grid inheritance-submit-grid" onSubmit={handleSaveInheritance}>
                <label className="field-stack"><span>新序列号</span><input disabled={!canManageInheritanceModule} value={inheritanceForm.newSn} onChange={(event) => setInheritanceForm((prev) => ({ ...prev, newSn: event.target.value }))} /></label>
                <label className="field-stack"><span>改号原因</span><input disabled={!canManageInheritanceModule} value={inheritanceForm.changeReason} onChange={(event) => setInheritanceForm((prev) => ({ ...prev, changeReason: event.target.value }))} /></label>
                <label className="field-stack"><span>改号生效时间</span><input disabled={!canManageInheritanceModule} value={inheritanceForm.effectiveAt} onChange={(event) => setInheritanceForm((prev) => ({ ...prev, effectiveAt: event.target.value }))} /></label>
                <label className="field-stack">
                  <span>指定审批人</span>
                  <select
                    disabled={!canManageInheritanceModule}
                    value={inheritanceForm.pendingApproverUsername}
                    onChange={(event) =>
                      setInheritanceForm((prev) => ({
                        ...prev,
                        pendingApproverUsername: event.target.value,
                      }))
                    }
                  >
                    <option value="">请选择审批人</option>
                    {inheritanceApprovers.map((approver) => (
                      <option key={approver.id} value={approver.username}>
                        {approver.displayName}（{approver.username}）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-stack"><span>提交状态</span><input value={inheritanceForm.status} disabled /></label>
                <label className="field-stack"><span>备注</span><input disabled={!canManageInheritanceModule} value={inheritanceForm.remark} onChange={(event) => setInheritanceForm((prev) => ({ ...prev, remark: event.target.value }))} /></label>
                <label className="field-stack"><span>录入人</span><input disabled value={inheritanceForm.createdBy || authUser.displayName} /></label>
                <button className="ghost-button" type="submit" disabled={inheritanceSaving || !canManageInheritanceModule}>{inheritanceSaving ? "提交中..." : inheritanceForm.id ? "更新并重新提交" : "提交继承记录"}</button>
                <button className="ghost-button" type="button" disabled={!canManageInheritanceModule} onClick={() => setInheritanceForm({ ...emptyInheritanceForm, createdBy: authUser.displayName })}>清空表单</button>
              </form>
            </section>

            <section className="card inheritance-download-card">
              <div className="section-head section-head-actions">
                <div>
                  <h2>继承记录下载</h2>
                  <p>下载历史继承记录，查看录入人、批准人、生效时间和保修继承信息。</p>
                </div>
                <button type="button" className="ghost-button section-action" onClick={handleDownloadInheritanceHistory}>
                  下载历史记录
                </button>
              </div>
              <div className="download-entry-grid">
                <article className="download-entry-card">
                  <span>当前记录数</span>
                  <strong>{inheritanceRecords.length}</strong>
                  <p>导出的文件会包含原序列号、新序列号、原订单号、激活时间、继承起止时间、录入人与批准人等字段。</p>
                </article>
                <article className="download-entry-card">
                  <span>适用场景</span>
                  <strong>历史追溯 / 审核留档</strong>
                  <p>如需最新记录，请先在本页完成提交或批准操作后再下载，系统会导出当前库中的最新数据。</p>
                </article>
              </div>
              <div className="table-block pending-table-block">
                <h3>待审批序列号目录</h3>
                <table>
                  <thead>
                    <tr>
                      <th>原序列号</th>
                      <th>原订单号</th>
                      <th>新序列号</th>
                      <th>修改前保修</th>
                      <th>修改后保修</th>
                      <th>录入人</th>
                      <th>指定审批人</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inheritanceRecords.filter((record) => record.status === "待批准").length ? (
                      inheritanceRecords
                        .filter((record) => record.status === "待批准")
                        .map((record) => (
                          <tr key={record.id}>
                            <td>{record.originalSn}</td>
                            <td>{record.originalOrderNo ?? "-"}</td>
                            <td>{record.newSn}</td>
                            <td>{`${formatDateOnly(record.inheritedWarrantyStart)} 至 ${formatDateOnly(record.inheritedWarrantyEnd)}`}</td>
                            <td>{`${record.newSn} 继承原保修至 ${formatDateOnly(record.inheritedWarrantyEnd)}`}</td>
                            <td>{record.createdBy ?? "-"}</td>
                            <td>{record.pendingApproverName ?? record.pendingApproverUsername ?? "-"}</td>
                            <td>{record.status}</td>
                            <td>
                              {canApproveInheritanceModule ? (
                                <div className="table-actions">
                                  <button className="chip" type="button" onClick={() => void handleApproveInheritance(record.id)}>
                                    批准
                                  </button>
                                  <button className="chip chip-muted" type="button" onClick={() => void handleRejectInheritance(record.id)}>
                                    驳回
                                  </button>
                                </div>
                              ) : (
                                <span className="muted-text">等待审批人处理</span>
                              )}
                            </td>
                          </tr>
                        ))
                    ) : (
                      <tr>
                        <td colSpan={9}>当前没有待审批的继承记录。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        {activeModule === "admin" ? (
          <section className="card">
            <div className="section-head">
              <h2>账号审批与权限分配</h2>
              <p>待审批账号会优先展示。修改审批状态或权限后，点击保存即可生效。</p>
            </div>
            {renderFeedback(adminFeedback)}
            <div className="table-block">
              <table>
                <thead>
                  <tr>
                    <th>姓名</th><th>账号</th><th>当前状态</th><th>审批设置</th><th>完整保修查询</th><th>真实激活接口测试</th><th>订单与延保数据录入</th><th>售后改号继承管理</th><th>批准继承</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {adminLoading ? (
                    <tr><td colSpan={10}>正在加载账号列表...</td></tr>
                  ) : (
                    adminUsers.map((user) => {
                      const draft = adminDrafts[user.id] ?? user;
                      const dirty =
                        JSON.stringify(draft.permissions) !== JSON.stringify(user.permissions) ||
                        draft.status !== user.status ||
                        draft.displayName !== user.displayName;

                      return (
                        <tr key={user.id} className={dirty ? "table-row-dirty" : ""}>
                          <td>{draft.displayName}</td>
                          <td>{draft.username}</td>
                          <td><span className={`status-badge ${getStatusClass(user.status)}`}>{getStatusLabel(user.status)}</span></td>
                          <td>
                            <select value={draft.status} onChange={(event) => setAdminDrafts((prev) => ({ ...prev, [user.id]: { ...draft, status: event.target.value as UserAdminRow["status"] } }))}>
                              <option value="PENDING">待审批</option>
                              <option value="APPROVED">已批准</option>
                              <option value="REJECTED">已停用</option>
                            </select>
                          </td>
                          <td><input type="checkbox" checked={draft.permissions.canQueryWarranty} onChange={(event) => setAdminDrafts((prev) => ({ ...prev, [user.id]: { ...draft, permissions: { ...draft.permissions, canQueryWarranty: event.target.checked } } }))} /></td>
                          <td><input type="checkbox" checked={draft.permissions.canTestActivation} onChange={(event) => setAdminDrafts((prev) => ({ ...prev, [user.id]: { ...draft, permissions: { ...draft.permissions, canTestActivation: event.target.checked } } }))} /></td>
                          <td><input type="checkbox" checked={draft.permissions.canImportEntitlements} onChange={(event) => setAdminDrafts((prev) => ({ ...prev, [user.id]: { ...draft, permissions: { ...draft.permissions, canImportEntitlements: event.target.checked } } }))} /></td>
                          <td><input type="checkbox" checked={draft.permissions.canManageInheritance} onChange={(event) => setAdminDrafts((prev) => ({ ...prev, [user.id]: { ...draft, permissions: { ...draft.permissions, canManageInheritance: event.target.checked } } }))} /></td>
                          <td><input type="checkbox" checked={draft.permissions.canApproveInheritance} onChange={(event) => setAdminDrafts((prev) => ({ ...prev, [user.id]: { ...draft, permissions: { ...draft.permissions, canApproveInheritance: event.target.checked } } }))} /></td>
                          <td>
                            {user.isSuperAdmin ? (
                              "系统管理员"
                            ) : (
                              <button type="button" onClick={() => void handleSaveAdminUser(user.id)} disabled={adminSavingId === user.id}>
                                {adminSavingId === user.id ? "保存中..." : dirty ? "保存权限*" : "保存权限"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>

      {approvalReminderOpen ? (
        <div className="modal-backdrop" onClick={() => setApprovalReminderOpen(false)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head section-head-actions">
              <div>
                <h2>继承审批提醒</h2>
                <p>当前有 {myPendingApprovals.length} 条继承记录已指派给你审批，请前往“售后改号继承管理”中的待审批目录确认后再执行批准或驳回。</p>
              </div>
              <button type="button" className="ghost-button section-action" onClick={() => setApprovalReminderOpen(false)}>
                我知道了
              </button>
            </div>
            <div className="table-block modal-table-block">
              <table>
                <thead>
                  <tr>
                    <th>原序列号</th>
                    <th>原订单号</th>
                    <th>新序列号</th>
                    <th>录入人</th>
                    <th>修改前保修</th>
                    <th>修改后保修</th>
                  </tr>
                </thead>
                <tbody>
                  {myPendingApprovals.map((record) => (
                    <tr key={record.id}>
                      <td>{record.originalSn}</td>
                      <td>{record.originalOrderNo ?? "-"}</td>
                      <td>{record.newSn}</td>
                      <td>{record.createdBy ?? "-"}</td>
                      <td>{`${formatDateOnly(record.inheritedWarrantyStart)} 至 ${formatDateOnly(record.inheritedWarrantyEnd)}`}</td>
                      <td>{`${record.newSn} 继承原保修至 ${formatDateOnly(record.inheritedWarrantyEnd)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setActiveModule("inheritance");
                  setApprovalReminderOpen(false);
                }}
              >
                前往售后改号继承管理确认
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
