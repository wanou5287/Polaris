import { useEffect, useState } from "react";
import "./index.css";

type PermissionSet = {
  canQueryWarranty: boolean;
  canTestActivation: boolean;
  canImportEntitlements: boolean;
  canManageInheritance: boolean;
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

type WarrantyQueryResponse = {
  sn: string;
  sourceOrderNo: string | null;
  decisionMode: "NORMAL" | "INHERITED";
  inheritanceHint: string | null;
  originalSn: string | null;
  inheritedWarrantyStartDate: string | null;
  inheritedBaseWarrantyDays: number | null;
  inheritedExtraWarrantyDays: number | null;
  inheritedWarrantyEndDate: string | null;
  model: string | null;
  deviceStatus: string | null;
  activatedAt: string | null;
  baseWarrantyDays: number;
  extraWarrantyDays: number;
  warrantyStartDate: string | null;
  baseWarrantyEndDate: string | null;
  warrantyEndDate: string | null;
  entitlementMatched: boolean;
  entitlementMessage: string;
  matchedEntitlementOrderNo: string | null;
  decisionStatus: string;
  decisionMessage: string;
  basis: string[];
  warnings: string[];
};

type ActivationTestResponse = {
  mode: string;
  requestSn: string;
  result: {
    success: boolean;
    data?: {
      sn: string;
      activationStatus: string;
      activationRecords: Array<{ activatedAt: string; recordType: string }>;
    };
    errorMessage?: string;
  };
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
  errors: Array<{ row: number; sn: string; message: string }>;
  elapsedMs: number | null;
  errorMessage: string | null;
};

type InheritanceRecord = {
  id: string;
  originalSn: string;
  newSn: string;
  inheritedWarrantyStart: string;
  inheritedBaseDays: number;
  inheritedExtraDays: number;
  inheritedWarrantyEnd: string;
  originalOrderNo: string | null;
  changeReason: string | null;
  effectiveAt: string | null;
  status: "有效" | "已作废";
  remark: string | null;
  createdBy: string | null;
};

type InheritanceForm = {
  原序列号: string;
  新序列号: string;
  继承保修开始日: string;
  继承标准保修天数: string;
  继承延保天数: string;
  继承保修截止日: string;
  原订单号: string;
  改号原因: string;
  改号生效时间: string;
  状态: "有效" | "已作废";
  备注: string;
  录入人: string;
};

type Feedback = { type: "success" | "error" | "info"; text: string };

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  `${window.location.protocol}//${window.location.hostname}:3210`;
const TOKEN_KEY = "warranty-console-token";

const emptyInheritanceForm: InheritanceForm = {
  原序列号: "",
  新序列号: "",
  继承保修开始日: "",
  继承标准保修天数: "365",
  继承延保天数: "0",
  继承保修截止日: "",
  原订单号: "",
  改号原因: "",
  改号生效时间: "",
  状态: "有效",
  备注: "",
  录入人: "",
};

const sampleQueries = [
  { label: "普通设备", sn: "SN001", sourceOrderNo: "ORDER001" },
  { label: "继承设备", sn: "SN100-NEW", sourceOrderNo: "" },
  { label: "继承冲突", sn: "SN101-NEW", sourceOrderNo: "" },
];

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDateOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatElapsedMs(value: number | null) {
  if (value === null) return "-";
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} 秒`;
}

function feedbackClassName(feedback: Feedback | null) {
  if (!feedback) return "";
  if (feedback.type === "error") return "error-box";
  if (feedback.type === "success") return "success-box";
  return "info-box";
}

function statusPriority(status: UserAdminRow["status"]) {
  switch (status) {
    case "PENDING":
      return 0;
    case "APPROVED":
      return 1;
    case "REJECTED":
      return 2;
    default:
      return 9;
  }
}

function statusLabel(status: UserAdminRow["status"]) {
  switch (status) {
    case "PENDING":
      return "待审批";
    case "APPROVED":
      return "已批准";
    case "REJECTED":
      return "已停用";
    default:
      return status;
  }
}

function statusBadgeClass(status: UserAdminRow["status"]) {
  switch (status) {
    case "PENDING":
      return "status-badge pending";
    case "APPROVED":
      return "status-badge approved";
    case "REJECTED":
      return "status-badge rejected";
    default:
      return "status-badge";
  }
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authFeedback, setAuthFeedback] = useState<Feedback | null>(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "", displayName: "" });

  const [sn, setSn] = useState("");
  const [sourceOrderNo, setSourceOrderNo] = useState("");
  const [result, setResult] = useState<WarrantyQueryResponse | null>(null);
  const [queryFeedback, setQueryFeedback] = useState<Feedback | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [showOrderInput, setShowOrderInput] = useState(false);
  const [queryHint, setQueryHint] = useState("先输入序列号。系统会优先判断是否命中售后改号继承记录。");

  const [activationSn, setActivationSn] = useState("B507005EDT10CH");
  const [activationResult, setActivationResult] = useState<ActivationTestResponse | null>(null);
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationFeedback, setActivationFeedback] = useState<Feedback | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [importUploading, setImportUploading] = useState(false);
  const [importFeedback, setImportFeedback] = useState<Feedback | null>(null);

  const [inheritanceKeyword, setInheritanceKeyword] = useState("");
  const [inheritanceRecords, setInheritanceRecords] = useState<InheritanceRecord[]>([]);
  const [inheritanceLoading, setInheritanceLoading] = useState(false);
  const [inheritanceFeedback, setInheritanceFeedback] = useState<Feedback | null>(null);
  const [inheritanceForm, setInheritanceForm] = useState<InheritanceForm>(emptyInheritanceForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [adminUsers, setAdminUsers] = useState<UserAdminRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<Feedback | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [dirtyUserIds, setDirtyUserIds] = useState<string[]>([]);

  const importInProgress =
    importUploading || importJob?.status === "queued" || importJob?.status === "processing";

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    const payload = (await response.json()) as T & { success?: boolean; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "请求失败");
    return payload;
  }

  async function loadCurrentUser(currentToken: string) {
    if (!currentToken) {
      setAuthUser(null);
      return;
    }
    setAuthLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const payload = (await response.json()) as { success?: boolean; data?: AuthUser; error?: string };
      if (!response.ok || !payload.success || !payload.data) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
        setAuthUser(null);
        setAuthFeedback({ type: "info", text: payload.error ?? "登录状态已失效，请重新登录" });
        return;
      }
      setAuthUser(payload.data);
    } catch {
      setAuthUser(null);
      setAuthFeedback({ type: "error", text: "无法读取当前登录信息，请稍后重试" });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin() {
    setAuthLoading(true);
    setAuthFeedback(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: { token: string; user: AuthUser };
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.data) {
        setAuthFeedback({ type: "error", text: payload.error ?? "登录失败" });
        return;
      }
      localStorage.setItem(TOKEN_KEY, payload.data.token);
      setToken(payload.data.token);
      setAuthUser(payload.data.user);
      setAuthFeedback({ type: "success", text: "登录成功" });
    } catch {
      setAuthFeedback({ type: "error", text: "登录请求失败，请稍后重试" });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister() {
    setAuthLoading(true);
    setAuthFeedback(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string; error?: string };
      if (!response.ok || !payload.success) {
        setAuthFeedback({ type: "error", text: payload.error ?? "注册失败" });
        return;
      }
      setRegisterForm({ username: "", password: "", displayName: "" });
      setAuthMode("login");
      setAuthFeedback({ type: "success", text: payload.message ?? "注册成功，请等待管理员审批" });
    } catch {
      setAuthFeedback({ type: "error", text: "注册请求失败，请稍后重试" });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setAuthUser(null);
    setResult(null);
    setShowOrderInput(false);
  }

  function handleQueryResult(data: WarrantyQueryResponse, currentOrderNo: string) {
    setResult(data);
    setQueryFeedback(null);

    if (data.decisionMode === "INHERITED") {
      setShowOrderInput(false);
      setQueryHint("已命中售后改号继承记录，本次无需订单号，直接返回继承后的保修结果。");
      return;
    }

    if (data.decisionMessage === "普通设备查询需要订单号") {
      setShowOrderInput(true);
      setQueryHint("该序列号未命中继承记录，请继续输入订单号后再查询。");
      if (currentOrderNo) {
        setQueryFeedback({ type: "error", text: "请核对订单号后重新查询" });
      }
      return;
    }

    setShowOrderInput(true);
    setQueryHint("当前结果已按普通设备规则返回。");
  }

  async function queryWarranty(next?: { sn: string; sourceOrderNo?: string }) {
    const currentSn = (next?.sn ?? sn).trim();
    const currentOrderNo = (next?.sourceOrderNo ?? sourceOrderNo).trim();
    if (!currentSn) {
      setQueryFeedback({ type: "error", text: "请先输入序列号" });
      return;
    }

    setQueryLoading(true);
    setQueryFeedback(null);
    try {
      const params = new URLSearchParams({ sn: currentSn });
      if (currentOrderNo) params.set("sourceOrderNo", currentOrderNo);
      const payload = await apiFetch<{ success: boolean; data: WarrantyQueryResponse }>(
        `/api/warranty/query?${params.toString()}`,
      );
      handleQueryResult(payload.data, currentOrderNo);
    } catch (error) {
      setResult(null);
      setQueryFeedback({ type: "error", text: error instanceof Error ? error.message : "查询失败" });
    } finally {
      setQueryLoading(false);
    }
  }

  async function testActivation(nextSn?: string) {
    const currentSn = (nextSn ?? activationSn).trim();
    if (!currentSn) {
      setActivationFeedback({ type: "error", text: "请输入要测试的序列号" });
      return;
    }

    setActivationLoading(true);
    setActivationFeedback(null);
    try {
      const payload = await apiFetch<{ success: boolean; data: ActivationTestResponse }>(
        `/api/activation/test?sn=${encodeURIComponent(currentSn)}`,
      );
      setActivationResult(payload.data);
    } catch (error) {
      setActivationResult(null);
      setActivationFeedback({ type: "error", text: error instanceof Error ? error.message : "激活接口测试失败" });
    } finally {
      setActivationLoading(false);
    }
  }

  async function uploadEntitlements() {
    if (!importFile) {
      setImportFeedback({ type: "error", text: "请先选择订单与延保数据文件" });
      return;
    }

    setImportUploading(true);
    setImportJob(null);
    setImportFeedback(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const payload = await apiFetch<{ success: boolean; data: ImportJob }>("/api/entitlements/import", {
        method: "POST",
        body: formData,
      });
      setImportJob(payload.data);
      setImportFeedback({ type: "info", text: "文件已上传，后台正在处理" });
    } catch (error) {
      setImportFeedback({ type: "error", text: error instanceof Error ? error.message : "订单与延保数据录入失败" });
    } finally {
      setImportUploading(false);
    }
  }

  async function loadInheritanceRecords(keyword = inheritanceKeyword) {
    setInheritanceLoading(true);
    setInheritanceFeedback(null);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("keyword", keyword.trim());
      const payload = await apiFetch<{ success: boolean; data: InheritanceRecord[] }>(
        `/api/inheritance-records?${params.toString()}`,
      );
      setInheritanceRecords(payload.data);
    } catch (error) {
      setInheritanceFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "加载售后改号继承记录失败",
      });
    } finally {
      setInheritanceLoading(false);
    }
  }

  async function saveInheritanceRecord() {
    setInheritanceFeedback(null);
    try {
      const payload = await apiFetch<{ success: boolean; message?: string }>(
        editingId ? `/api/inheritance-records/${editingId}` : "/api/inheritance-records",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...inheritanceForm, 录入人: inheritanceForm.录入人 || authUser?.displayName || "" }),
        },
      );
      setInheritanceFeedback({
        type: "success",
        text: payload.message ?? (editingId ? "继承记录更新成功" : "继承记录新增成功"),
      });
      setInheritanceForm({ ...emptyInheritanceForm, 录入人: authUser?.displayName ?? "" });
      setEditingId(null);
      await loadInheritanceRecords();
    } catch (error) {
      setInheritanceFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "保存继承记录失败",
      });
    }
  }

  async function voidInheritanceRecord(id: string) {
    setInheritanceFeedback(null);
    try {
      const payload = await apiFetch<{ success: boolean; message?: string }>(
        `/api/inheritance-records/${id}/void`,
        { method: "POST" },
      );
      setInheritanceFeedback({ type: "success", text: payload.message ?? "继承记录已作废" });
      await loadInheritanceRecords();
    } catch (error) {
      setInheritanceFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "作废继承记录失败",
      });
    }
  }

  async function loadAdminUsers() {
    setAdminLoading(true);
    setAdminFeedback(null);
    try {
      const payload = await apiFetch<{ success: boolean; data: UserAdminRow[] }>("/api/admin/users");
      setAdminUsers(
        [...payload.data].sort((left, right) => {
          const statusCompare = statusPriority(left.status) - statusPriority(right.status);
          if (statusCompare !== 0) {
            return statusCompare;
          }

          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        }),
      );
    } catch (error) {
      setAdminFeedback({ type: "error", text: error instanceof Error ? error.message : "加载账号列表失败" });
    } finally {
      setAdminLoading(false);
    }
  }

  async function updateUserPermissions(user: UserAdminRow) {
    setAdminFeedback(null);
    setSavingUserId(user.id);
    try {
      const requestInit: RequestInit = {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: user.displayName,
          status: user.status,
          canQueryWarranty: user.permissions.canQueryWarranty,
          canTestActivation: user.permissions.canTestActivation,
          canImportEntitlements: user.permissions.canImportEntitlements,
          canManageInheritance: user.permissions.canManageInheritance,
        }),
      };

      try {
        await apiFetch<{ success: boolean }>(`/api/admin/users/${user.id}`, requestInit);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "Failed to fetch") {
          throw error;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 600));
        await apiFetch<{ success: boolean }>(`/api/admin/users/${user.id}`, requestInit);
      }

      setAdminFeedback({ type: "success", text: `账号 ${user.username} 已更新权限` });
      setDirtyUserIds((current) => current.filter((item) => item !== user.id));
      await loadAdminUsers();
    } catch (error) {
      setAdminFeedback({ type: "error", text: error instanceof Error ? error.message : "更新权限失败" });
    } finally {
      setSavingUserId(null);
    }
  }

  function updateAdminUser(id: string, updater: (current: UserAdminRow) => UserAdminRow) {
    setAdminUsers((current) => current.map((item) => (item.id === id ? updater(item) : item)));
    setDirtyUserIds((current) => (current.includes(id) ? current : [...current, id]));
    setAdminFeedback({ type: "info", text: "当前修改尚未保存，请点击“保存权限”后生效" });
  }

  useEffect(() => {
    void loadCurrentUser(token);
  }, [token]);

  useEffect(() => {
    if (!authUser) return;
    if (authUser.permissions.canTestActivation || authUser.isSuperAdmin) {
      void testActivation("B507005EDT10CH");
    }
    if (authUser.permissions.canManageInheritance || authUser.isSuperAdmin) {
      setInheritanceForm((current) => ({ ...current, 录入人: authUser.displayName }));
      void loadInheritanceRecords("");
    }
    if (authUser.isSuperAdmin) {
      void loadAdminUsers();
    }
  }, [authUser]);

  useEffect(() => {
    if (!token || !importJob || (importJob.status !== "queued" && importJob.status !== "processing")) return;
    const timer = window.setInterval(async () => {
      try {
        const payload = await apiFetch<{ success: boolean; data: ImportJob }>(
          `/api/entitlements/import/${importJob.jobId}`,
        );
        setImportJob(payload.data);
        if (payload.data.status === "completed") {
          setImportFeedback({ type: "success", text: "导入完成，延保台账已更新" });
        }
        if (payload.data.status === "failed") {
          setImportFeedback({ type: "error", text: payload.data.errorMessage ?? "导入失败" });
        }
      } catch (error) {
        setImportFeedback({ type: "error", text: error instanceof Error ? error.message : "导入任务查询失败" });
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [importJob?.jobId, importJob?.status, token]);

  if (!authUser) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <span className="auth-badge">售后管理后台</span>
            <h1>{authMode === "login" ? "账号登录" : "账号注册"}</h1>
            <p className="auth-subtitle">
              {authMode === "login"
                ? "请输入账号和密码进入系统。"
                : "新账号提交后需由管理员审批并分配模块权限后才可使用。"}
            </p>
          </div>
          {authMode === "login" ? (
            <div className="auth-form">
              <label className="field-stack">
                <span>账号</span>
                <input value={loginForm.username} onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} />
              </label>
              <label className="field-stack">
                <span>密码</span>
                <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} />
              </label>
              <button type="button" className="auth-submit" disabled={authLoading} onClick={() => void handleLogin()}>
                {authLoading ? "登录中..." : "登录"}
              </button>
              <div className="auth-meta">
                <p className="auth-help">管理员初始账号：admin，初始密码：Admin@123456</p>
                <button type="button" className="auth-switch" onClick={() => setAuthMode("register")}>
                  没有账号？去注册
                </button>
              </div>
            </div>
          ) : (
            <div className="auth-form">
              <label className="field-stack">
                <span>姓名</span>
                <input value={registerForm.displayName} onChange={(event) => setRegisterForm((current) => ({ ...current, displayName: event.target.value }))} />
              </label>
              <label className="field-stack">
                <span>账号</span>
                <input value={registerForm.username} onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value }))} />
              </label>
              <label className="field-stack">
                <span>密码</span>
                <input type="password" value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} />
              </label>
              <button type="button" className="auth-submit" disabled={authLoading} onClick={() => void handleRegister()}>
                {authLoading ? "提交中..." : "注册并等待审批"}
              </button>
              <div className="auth-meta">
                <p className="auth-help">提交后不会立即生效，需管理员审批后才能登录。</p>
                <button type="button" className="auth-switch" onClick={() => setAuthMode("login")}>
                  已有账号？返回登录
                </button>
              </div>
            </div>
          )}
          {authFeedback ? <div className={feedbackClassName(authFeedback)}>{authFeedback.text}</div> : null}
        </div>
      </div>
    );
  }

  const canQueryWarranty = authUser.isSuperAdmin || authUser.permissions.canQueryWarranty;
  const canTestActivation = authUser.isSuperAdmin || authUser.permissions.canTestActivation;
  const canImportEntitlements = authUser.isSuperAdmin || authUser.permissions.canImportEntitlements;
  const canManageInheritance = authUser.isSuperAdmin || authUser.permissions.canManageInheritance;

  return (
    <div className="app-shell">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">Internal Warranty Console</p>
          <h1>平板 TOC 售后保修查询系统</h1>
          <p className="hero-copy">查询入口统一成单流程：先输入序列号。命中售后改号继承记录时直接返回继承结果，未命中时再继续输入订单号。</p>
        </div>
        <div className="hero-side">
          <span className="mode-badge">{authUser.displayName}</span>
          <p>
            当前账号：{authUser.username}
            <br />
            权限：{[
              canQueryWarranty && "完整保修查询",
              canTestActivation && "真实激活接口测试",
              canImportEntitlements && "订单与延保数据录入",
              canManageInheritance && "售后改号继承管理",
            ].filter(Boolean).join("、") || "暂无模块权限"}
          </p>
          <button type="button" className="hero-logout" onClick={() => void handleLogout()}>
            退出登录
          </button>
        </div>
      </header>

      <main className="content-grid">
        {canQueryWarranty ? (
          <>
            <section className="card query-card">
              <div className="section-head">
                <h2>完整保修查询</h2>
                <p>{queryHint}</p>
              </div>
              <form
                className={showOrderInput ? "query-form" : "query-form single-query-form"}
                onSubmit={(event) => {
                  event.preventDefault();
                  void queryWarranty();
                }}
              >
                <input value={sn} onChange={(event) => setSn(event.target.value)} placeholder="请输入序列号" />
                {showOrderInput ? (
                  <input value={sourceOrderNo} onChange={(event) => setSourceOrderNo(event.target.value)} placeholder="请输入订单号" />
                ) : (
                  <div className="activation-placeholder" />
                )}
                <button type="submit" disabled={queryLoading}>
                  {queryLoading ? "查询中..." : showOrderInput ? "继续查询" : "先查序列号"}
                </button>
              </form>
              <div className="chips">
                {sampleQueries.map((item) => (
                  <button
                    key={`${item.sn}-${item.sourceOrderNo}`}
                    className="chip"
                    type="button"
                    onClick={() => {
                      setSn(item.sn);
                      setSourceOrderNo(item.sourceOrderNo);
                      setShowOrderInput(Boolean(item.sourceOrderNo));
                      void queryWarranty(item);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {queryFeedback ? <div className={feedbackClassName(queryFeedback)}>{queryFeedback.text}</div> : null}
            </section>

            <section className="card result-card">
              <div className="section-head">
                <h2>保修结论</h2>
                <p>系统会自动判断当前是普通设备结果，还是售后改号继承结果。</p>
              </div>
              {result ? (
                <>
                  <div className="status-strip">
                    <div><span className="label">当前序列号</span><strong>{result.sn}</strong></div>
                    <div><span className="label">判定模式</span><strong>{result.decisionMode === "INHERITED" ? "继承" : "普通"}</strong></div>
                    <div><span className="label">结论</span><strong>{result.decisionMessage}</strong></div>
                  </div>
                  {result.decisionMode === "INHERITED" ? (
                    <div className="list-block warning-block">
                      <h3>继承保修结果</h3>
                      <div className="metric-grid">
                        <article><span>原序列号</span><strong>{result.originalSn ?? "-"}</strong></article>
                        <article><span>继承保修开始日</span><strong>{result.inheritedWarrantyStartDate ?? "-"}</strong></article>
                        <article><span>继承标准保修天数</span><strong>{result.inheritedBaseWarrantyDays ?? "-"}</strong></article>
                        <article><span>继承延保天数</span><strong>{result.inheritedExtraWarrantyDays ?? "-"}</strong></article>
                        <article><span>继承保修截止日</span><strong>{result.inheritedWarrantyEndDate ?? "-"}</strong></article>
                        <article><span>提示说明</span><strong>{result.inheritanceHint ?? "-"}</strong></article>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="list-block">
                        <h3>标准保修</h3>
                        <div className="metric-grid">
                          <article><span>激活时间</span><strong>{formatDateTime(result.activatedAt)}</strong></article>
                          <article><span>标准保修</span><strong>{result.baseWarrantyDays} 天</strong></article>
                          <article><span>标准到期时间</span><strong>{result.baseWarrantyEndDate ?? "-"}</strong></article>
                          <article><span>设备状态</span><strong>{result.deviceStatus ?? "-"}</strong></article>
                        </div>
                      </div>
                      <div className="list-block warning-block">
                        <h3>延保匹配结果</h3>
                        <div className="metric-grid">
                          <article><span>匹配状态</span><strong>{result.entitlementMessage}</strong></article>
                          <article><span>匹配订单号</span><strong>{result.matchedEntitlementOrderNo ?? "-"}</strong></article>
                          <article><span>延保天数</span><strong>{result.extraWarrantyDays} 天</strong></article>
                          <article><span>最终到期时间</span><strong>{result.warrantyEndDate ?? "-"}</strong></article>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="list-block">
                    <h3>判定依据</h3>
                    <ul>{result.basis.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  {result.warnings.length > 0 ? (
                    <div className="list-block warning-block">
                      <h3>提示</h3>
                      <ul>{result.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="empty-state">先输入序列号开始查询。</p>
              )}
            </section>
          </>
        ) : null}

        {canTestActivation ? (
          <section className="card detail-card">
            <div className="section-head">
              <h2>真实激活接口测试</h2>
              <p>用于单独验证激活接口是否正常返回。</p>
            </div>
            <form className="query-form" onSubmit={(event) => { event.preventDefault(); void testActivation(); }}>
              <input value={activationSn} onChange={(event) => setActivationSn(event.target.value)} placeholder="请输入要测试的序列号" />
              <div className="activation-placeholder" />
              <button type="submit" disabled={activationLoading}>{activationLoading ? "测试中..." : "测试激活接口"}</button>
            </form>
            {activationFeedback ? <div className={feedbackClassName(activationFeedback)}>{activationFeedback.text}</div> : null}
            {activationResult ? (
              <div className="detail-layout">
                <div className="detail-summary">
                  <article><span>当前模式</span><strong>{activationResult.mode}</strong></article>
                  <article><span>请求 SN</span><strong>{activationResult.requestSn}</strong></article>
                  <article><span>调用结果</span><strong>{activationResult.result.success ? "成功" : "失败"}</strong></article>
                  <article><span>激活状态</span><strong>{activationResult.result.data?.activationStatus ?? "-"}</strong></article>
                </div>
                <div className="table-block">
                  <h3>激活记录</h3>
                  {activationResult.result.data?.activationRecords?.length ? (
                    <table>
                      <thead><tr><th>SN</th><th>记录类型</th><th>激活时间</th></tr></thead>
                      <tbody>
                        {activationResult.result.data.activationRecords.map((item, index) => (
                          <tr key={`${item.recordType}-${index}`}>
                            <td>{activationResult.result.data?.sn}</td>
                            <td>{item.recordType}</td>
                            <td>{item.activatedAt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p>当前没有可展示的激活记录。</p>}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
        {canImportEntitlements ? (
          <section className="card import-card">
            <div className="section-head">
              <h2>订单与延保数据录入</h2>
              <p>上传后将以异步任务处理，并显示导入进度。</p>
            </div>
            <div className="import-toolbar">
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => void uploadEntitlements()} disabled={importInProgress}>
                {importInProgress ? "录入中..." : "上传并录入"}
              </button>
              <a className="ghost-button" href="/entitlement-template-channel.xlsx" download>下载模板</a>
            </div>
            <div className="import-hint"><span>当前文件：</span><strong>{importFile?.name ?? "未选择文件"}</strong></div>
            {importFeedback ? <div className={feedbackClassName(importFeedback)}>{importFeedback.text}</div> : null}
            {importJob ? (
              <div className="table-block">
                <h3>导入任务</h3>
                <div className="progress-panel">
                  <div className="progress-meta">
                    <span>当前阶段：{importJob.phase}</span>
                    <span>进度：{importJob.progressPercent}%</span>
                  </div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${importJob.progressPercent}%` }} /></div>
                </div>
                <div className="metric-grid import-metrics">
                  <article><span>总数</span><strong>{importJob.total}</strong></article>
                  <article><span>已处理</span><strong>{importJob.processed}</strong></article>
                  <article><span>成功</span><strong>{importJob.successCount}</strong></article>
                  <article><span>失败</span><strong>{importJob.failedCount}</strong></article>
                  <article><span>耗时</span><strong>{formatElapsedMs(importJob.elapsedMs)}</strong></article>
                  <article><span>状态</span><strong>{importJob.status}</strong></article>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {canManageInheritance ? (
          <section className="card detail-card">
            <div className="section-head">
              <h2>售后改号继承管理</h2>
              <p>用于登记和维护少量售后改号设备的继承关系。</p>
            </div>
            <div className="admin-form-grid">
              {Object.entries(inheritanceForm).map(([key, value]) => (
                <label key={key} className="field-stack">
                  <span>{key}</span>
                  {key === "状态" ? (
                    <select value={value} onChange={(event) => setInheritanceForm((current) => ({ ...current, [key]: event.target.value as "有效" | "已作废" }))}>
                      <option value="有效">有效</option>
                      <option value="已作废">已作废</option>
                    </select>
                  ) : (
                    <input value={value} onChange={(event) => setInheritanceForm((current) => ({ ...current, [key]: event.target.value }))} />
                  )}
                </label>
              ))}
            </div>
            <div className="chips">
              <button className="chip" type="button" onClick={() => void saveInheritanceRecord()}>{editingId ? "保存修改" : "新增登记"}</button>
              <button className="chip" type="button" onClick={() => { setEditingId(null); setInheritanceForm({ ...emptyInheritanceForm, 录入人: authUser.displayName }); }}>清空表单</button>
            </div>
            <div className="query-form admin-search-bar">
              <input value={inheritanceKeyword} onChange={(event) => setInheritanceKeyword(event.target.value)} placeholder="按新序列号或原序列号搜索" />
              <div className="activation-placeholder" />
              <button type="button" onClick={() => void loadInheritanceRecords()}>{inheritanceLoading ? "加载中..." : "查询继承记录"}</button>
            </div>
            {inheritanceFeedback ? <div className={feedbackClassName(inheritanceFeedback)}>{inheritanceFeedback.text}</div> : null}
            <div className="table-block">
              <h3>继承记录列表</h3>
              {inheritanceRecords.length ? (
                <table>
                  <thead>
                    <tr><th>原序列号</th><th>新序列号</th><th>继承保修开始日</th><th>继承标准保修天数</th><th>继承延保天数</th><th>继承保修截止日</th><th>状态</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {inheritanceRecords.map((item) => (
                      <tr key={item.id}>
                        <td>{item.originalSn}</td>
                        <td>{item.newSn}</td>
                        <td>{formatDateOnly(item.inheritedWarrantyStart)}</td>
                        <td>{item.inheritedBaseDays}</td>
                        <td>{item.inheritedExtraDays}</td>
                        <td>{formatDateOnly(item.inheritedWarrantyEnd)}</td>
                        <td>{item.status}</td>
                        <td>
                          <button type="button" onClick={() => {
                            setEditingId(item.id);
                            setInheritanceForm({
                              原序列号: item.originalSn,
                              新序列号: item.newSn,
                              继承保修开始日: formatDateOnly(item.inheritedWarrantyStart),
                              继承标准保修天数: String(item.inheritedBaseDays),
                              继承延保天数: String(item.inheritedExtraDays),
                              继承保修截止日: formatDateOnly(item.inheritedWarrantyEnd),
                              原订单号: item.originalOrderNo ?? "",
                              改号原因: item.changeReason ?? "",
                              改号生效时间: formatDateOnly(item.effectiveAt),
                              状态: item.status,
                              备注: item.remark ?? "",
                              录入人: item.createdBy ?? authUser.displayName,
                            });
                          }}>编辑</button>
                          <button type="button" onClick={() => void voidInheritanceRecord(item.id)}>作废</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p>当前没有查到继承记录。</p>}
            </div>
          </section>
        ) : null}

        {authUser.isSuperAdmin ? (
          <section className="card detail-card">
            <div className="section-head">
              <h2>账号审批与权限分配</h2>
              <p>管理员审批新注册账号，并给账号分配四个模块权限。</p>
            </div>
            {adminFeedback ? <div className={feedbackClassName(adminFeedback)}>{adminFeedback.text}</div> : null}
            <div className="table-block">
              <h3>账号列表</h3>
              {adminLoading ? <p>加载中...</p> : (
                <table>
                  <thead>
                    <tr><th>姓名</th><th>账号</th><th>当前状态</th><th>审批设置</th><th>完整保修查询</th><th>真实激活接口测试</th><th>订单与延保数据录入</th><th>售后改号继承管理</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr key={user.id} className={dirtyUserIds.includes(user.id) ? "table-row-dirty" : ""}>
                        <td>{user.displayName}</td>
                        <td>{user.username}</td>
                        <td>
                          <span className={statusBadgeClass(user.status)}>{statusLabel(user.status)}</span>
                        </td>
                        <td>
                          <select value={user.status} onChange={(event) => updateAdminUser(user.id, (current) => ({ ...current, status: event.target.value as UserAdminRow["status"] }))} disabled={user.isSuperAdmin}>
                            <option value="PENDING">待审批</option>
                            <option value="APPROVED">已批准</option>
                            <option value="REJECTED">已停用</option>
                          </select>
                        </td>
                        <td><input type="checkbox" checked={user.permissions.canQueryWarranty || user.isSuperAdmin} onChange={(event) => updateAdminUser(user.id, (current) => ({ ...current, permissions: { ...current.permissions, canQueryWarranty: event.target.checked } }))} disabled={user.isSuperAdmin} /></td>
                        <td><input type="checkbox" checked={user.permissions.canTestActivation || user.isSuperAdmin} onChange={(event) => updateAdminUser(user.id, (current) => ({ ...current, permissions: { ...current.permissions, canTestActivation: event.target.checked } }))} disabled={user.isSuperAdmin} /></td>
                        <td><input type="checkbox" checked={user.permissions.canImportEntitlements || user.isSuperAdmin} onChange={(event) => updateAdminUser(user.id, (current) => ({ ...current, permissions: { ...current.permissions, canImportEntitlements: event.target.checked } }))} disabled={user.isSuperAdmin} /></td>
                        <td><input type="checkbox" checked={user.permissions.canManageInheritance || user.isSuperAdmin} onChange={(event) => updateAdminUser(user.id, (current) => ({ ...current, permissions: { ...current.permissions, canManageInheritance: event.target.checked } }))} disabled={user.isSuperAdmin} /></td>
                        <td>
                          {!user.isSuperAdmin ? (
                            <button type="button" onClick={() => void updateUserPermissions(user)} disabled={savingUserId === user.id}>
                              {savingUserId === user.id
                                ? "保存中..."
                                : dirtyUserIds.includes(user.id)
                                  ? "保存权限*"
                                  : "保存权限"}
                            </button>
                          ) : (
                            <span>系统管理员</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
