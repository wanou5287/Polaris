"use client";

import {
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, cn, formatDateTime, formatNumber } from "@/lib/polaris-client";
import type {
  CurrentUser,
  DashboardUserManagementResponse,
  Option,
} from "@/lib/polaris-types";

type UserDraft = {
  id: number | null;
  username: string;
  email: string;
  display_name: string;
  role_name: string;
  is_enabled: boolean;
  access_granted: boolean;
  note: string;
  password: string;
};

type EditorMode = "create" | "edit";
type StatusFilter = "all" | "enabled" | "disabled" | "admin" | "pending";

function buildEmptyDraft(roleOptions: Option[]): UserDraft {
  const defaultRole =
    roleOptions.find((option) => option.value === "运维")?.value ??
    roleOptions[0]?.value ??
    "运维";

  return {
    id: null,
    username: "",
    email: "",
    display_name: "",
    role_name: defaultRole,
    is_enabled: true,
    access_granted: true,
    note: "",
    password: "",
  };
}

function mapUserToDraft(user: CurrentUser): UserDraft {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
    role_name: user.role_name,
    is_enabled: user.is_enabled,
    access_granted: user.access_granted,
    note: user.note,
    password: "",
  };
}

function StatusBadge({
  isEnabled,
  isAdmin,
  accessGranted = true,
}: {
  isEnabled: boolean;
  isAdmin?: boolean;
  accessGranted?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-[11px] font-medium shadow-none",
          isEnabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-100 text-slate-600",
        )}
      >
        {isEnabled ? "启用中" : "已停用"}
      </Badge>
      {!accessGranted ? (
        <Badge className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 shadow-none">
          待授权
        </Badge>
      ) : null}
      {isAdmin ? (
        <Badge className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 shadow-none">
          管理员
        </Badge>
      ) : null}
    </div>
  );
}

function UserRoleBadge({ roleName }: { roleName: string }) {
  return (
    <Badge className="rounded-full border border-border/70 bg-white px-2.5 py-0.5 text-[11px] font-medium text-foreground shadow-none">
      {roleName || "待分配"}
    </Badge>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function UserManagementPage({
  initialCurrentUser,
}: {
  initialCurrentUser?: CurrentUser;
}) {
  const [data, setData] = useState<DashboardUserManagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [mode, setMode] = useState<EditorMode>("create");
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const deferredKeyword = useDeferredValue(keyword);

  const currentUser = data?.current_user ?? initialCurrentUser ?? null;

  async function loadUsers(nextSelectedId?: number | null) {
    setLoading(true);
    try {
      const response = await apiFetch<DashboardUserManagementResponse>(
        "/api/backend/user-management",
      );
      setData(response);

      const desiredSelectedId =
        nextSelectedId === undefined ? selectedId : nextSelectedId;

      startTransition(() => {
        if (
          desiredSelectedId !== null &&
          !response.items.some((item) => item.id === desiredSelectedId)
        ) {
          setSelectedId(null);
        } else if (desiredSelectedId !== undefined) {
          setSelectedId(desiredSelectedId ?? null);
        }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "用户列表加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreateEditor() {
    if (!data) {
      return;
    }

    startTransition(() => {
      setMode("create");
      setSelectedId(null);
      setDraft(buildEmptyDraft(data.role_options));
      setEditorOpen(true);
    });
  }

  function openEditEditor(user: CurrentUser) {
    startTransition(() => {
      setMode("edit");
      setSelectedId(user.id);
      setDraft(mapUserToDraft(user));
      setEditorOpen(true);
    });
  }

  function resetDraft() {
    if (!data) {
      return;
    }

    if (mode === "create") {
      setDraft(buildEmptyDraft(data.role_options));
      return;
    }

    const current = data.items.find((item) => item.id === selectedId);
    if (current) {
      setDraft(mapUserToDraft(current));
    }
  }

  function updateDraft<K extends keyof UserDraft>(key: K, value: UserDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveDraft() {
    if (!draft) {
      return;
    }

    const username = draft.username.trim();
    const email = draft.email.trim().toLowerCase();
    const displayName = draft.display_name.trim();
    const password = draft.password.trim();

    if (mode === "create" && !username) {
      toast.error("请输入用户名");
      return;
    }

    if (mode === "create" && !password) {
      toast.error("新建账号时需要设置登录密码");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...(mode === "create" ? { username } : {}),
        email,
        display_name: displayName || username,
        role_name: draft.role_name,
        is_enabled: draft.is_enabled,
        access_granted: draft.access_granted,
        note: draft.note.trim(),
        ...(password ? { password } : {}),
      };

      const response = await apiFetch<{ ok: boolean; item: CurrentUser }>(
        mode === "create"
          ? "/api/backend/user-management"
          : `/api/backend/user-management/${draft.id}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          body: JSON.stringify(payload),
        },
      );

      toast.success(mode === "create" ? "用户已创建" : "账号已更新");
      setEditorOpen(false);
      setDraft(null);
      await loadUsers(response.item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const normalizedKeyword = deferredKeyword.trim().toLowerCase();
  const filteredUsers = (data?.items ?? []).filter((user) => {
    const matchesKeyword =
      !normalizedKeyword ||
      [
        user.username,
        user.email,
        user.display_name,
        user.role_name,
        user.note,
      ].some((value) => value.toLowerCase().includes(normalizedKeyword));

    const matchesRole =
      roleFilter === "all" ? true : user.role_name === roleFilter;

    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "enabled"
          ? user.is_enabled
        : statusFilter === "disabled"
          ? !user.is_enabled
          : statusFilter === "admin"
            ? user.is_admin
            : !user.access_granted;

    return matchesKeyword && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6" data-page="user-management">
      <Card className="rounded-[28px] border-border/80 bg-white/96 shadow-[var(--shadow-panel)]">
        <CardHeader className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-2xl tracking-tight">系统账号</CardTitle>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                账号不会出现在左侧导航里，只能从右上角管理员入口进入。这里专门维护登录账号、角色和启停状态，页面尽量保持轻量，方便快速查找和编辑。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => void loadUsers()}
              >
                <RefreshCcw className="size-4" />
                刷新
              </Button>
              <Button
                className="rounded-full bg-sky-500 text-white hover:bg-sky-600"
                onClick={openCreateEditor}
              >
                <Plus className="size-4" />
                添加用户
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full border border-border/70 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
              <Users className="mr-1 size-3.5" />
              共 {formatNumber(data?.summary.total_count ?? 0)} 个账号
            </Badge>
            <Badge className="rounded-full border border-border/70 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
              启用 {formatNumber(data?.summary.enabled_count ?? 0)}
            </Badge>
            <Badge className="rounded-full border border-border/70 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
              待授权 {formatNumber(data?.summary.pending_count ?? 0)}
            </Badge>
            <Badge className="rounded-full border border-border/70 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
              <ShieldCheck className="mr-1 size-3.5" />
              管理员 {formatNumber(data?.summary.admin_count ?? 0)}
            </Badge>
            <Badge className="rounded-full border border-border/70 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
              <UserCog className="mr-1 size-3.5" />
              角色 {formatNumber(data?.summary.role_count ?? 0)}
            </Badge>
            {currentUser ? (
              <Badge className="rounded-full border border-border/70 bg-white px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
                当前管理员：{currentUser.display_name || currentUser.username}
              </Badge>
            ) : null}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索登录账号、显示名称、角色或备注"
                className="h-11 rounded-2xl border-border/80 bg-white pl-11"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                <SelectValue placeholder="全部角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部角色</SelectItem>
                {(data?.role_options ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="enabled">仅启用</SelectItem>
                <SelectItem value="disabled">仅停用</SelectItem>
                <SelectItem value="admin">仅管理员</SelectItem>
                <SelectItem value="pending">待授权</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {loading && !data ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 rounded-2xl border border-border/70 bg-muted/30"
                />
              ))}
            </div>
          ) : filteredUsers.length ? (
            <div className="overflow-hidden rounded-[24px] border border-border/70 bg-white">
              <ScrollArea className="h-[680px]">
                <Table className="min-w-[920px]">
                  <TableHeader className="sticky top-0 z-10 bg-muted/25 backdrop-blur">
                    <TableRow className="border-border/70 hover:bg-transparent">
                      <TableHead className="px-4">账号信息</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>最近登录</TableHead>
                      <TableHead className="min-w-[240px]">备注</TableHead>
                      <TableHead className="w-[120px] px-4 text-right">
                        操作
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => {
                      const isCurrent = currentUser?.username === user.username;
                      const isSelected = selectedId === user.id;

                      return (
                        <TableRow
                          key={user.id}
                          className={cn(
                            "cursor-pointer border-border/60",
                            isSelected && "bg-slate-50/80",
                          )}
                          onClick={() => openEditEditor(user)}
                        >
                          <TableCell className="px-4 py-3 whitespace-normal">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-foreground">
                                {user.display_name || user.username}
                              </span>
                              {isCurrent ? (
                                <Badge className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 shadow-none">
                                  当前账号
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              @{user.username}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {user.email || "未绑定邮箱"}
                            </p>
                          </TableCell>
                          <TableCell className="py-3">
                            <UserRoleBadge roleName={user.access_granted ? user.role_name : ""} />
                          </TableCell>
                          <TableCell className="py-3 whitespace-normal">
                            <StatusBadge
                              isEnabled={user.is_enabled}
                              isAdmin={user.is_admin}
                              accessGranted={user.access_granted}
                            />
                          </TableCell>
                          <TableCell className="py-3 text-sm text-muted-foreground">
                            {formatDateTime(user.last_login_at)}
                          </TableCell>
                          <TableCell className="py-3 whitespace-normal">
                            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {user.note || "暂无备注"}
                            </p>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              className="rounded-full"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditEditor(user);
                              }}
                            >
                              编辑
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          ) : (
            <Empty className="border border-dashed border-border/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users className="size-4" />
                </EmptyMedia>
                <EmptyTitle>没有匹配到账号</EmptyTitle>
                <EmptyDescription>
                  可以放宽筛选条件，或者直接新建一个用户。
                </EmptyDescription>
              </EmptyHeader>
              <Button
                className="rounded-full bg-sky-500 text-white hover:bg-sky-600"
                onClick={openCreateEditor}
              >
                创建新用户
              </Button>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) {
            setDraft(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-none gap-0 overflow-hidden p-0 sm:w-[min(100vw-2rem,860px)] sm:max-w-[860px] lg:w-[min(100vw-4rem,920px)] lg:max-w-[920px]">
          <DialogHeader className="border-b border-border/70 px-6 pt-6 pb-5">
            <div className="space-y-2 pr-8">
              <DialogTitle className="text-xl tracking-tight">
                {mode === "create" ? "新增账号" : "编辑账号"}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6">
                只保留账号维护最必要的信息。保存后会立即回到列表，避免账号管理页面堆太多并列内容。
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="max-h-[min(78vh,760px)] overflow-y-auto px-6 py-6">
            {draft ? (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="登录账号"
                    description={
                      mode === "create"
                        ? "创建后不支持修改。"
                        : "已创建账号保持固定。"
                    }
                  >
                    <Input
                      value={draft.username}
                      onChange={(event) =>
                        updateDraft("username", event.target.value)
                      }
                      disabled={mode === "edit"}
                      placeholder="例如 zhangsan.procurement"
                      className="h-11 rounded-2xl border-border/80 bg-white disabled:cursor-not-allowed disabled:bg-muted/40"
                    />
                  </Field>

                  <Field
                    label="显示名称"
                    description="用于右上角登录态、审计日志和任务归属展示。"
                  >
                    <Input
                      value={draft.display_name}
                      onChange={(event) =>
                        updateDraft("display_name", event.target.value)
                      }
                      placeholder="例如 张三"
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="邮箱"
                    description="首次自助注册账号默认通过邮箱登录，管理员也可以补充或修改邮箱。"
                  >
                    <Input
                      type="email"
                      value={draft.email}
                      onChange={(event) =>
                        updateDraft("email", event.target.value)
                      }
                      placeholder="name@company.com"
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </Field>

                  <Field
                    label="访问权限"
                    description="关闭后用户登录后看不到任何业务信息，只会看到联系管理员提示。"
                  >
                    <div className="flex h-11 items-center justify-between rounded-2xl border border-border/80 bg-white px-4">
                      <span className="text-sm text-foreground">
                        {draft.access_granted ? "已授权访问" : "待管理员授权"}
                      </span>
                      <Switch
                        checked={draft.access_granted}
                        onCheckedChange={(checked) =>
                          updateDraft("access_granted", checked)
                        }
                      />
                    </div>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="角色" description="角色决定可见页面和可执行动作。">
                    <Select
                      value={draft.role_name || "__pending__"}
                      onValueChange={(value) =>
                        updateDraft("role_name", value === "__pending__" ? "" : value)
                      }
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-border/80 bg-white">
                        <SelectValue placeholder="选择角色" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__pending__">待授权（未分配角色）</SelectItem>
                        {(data?.role_options ?? []).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    label={mode === "create" ? "登录密码" : "重置密码"}
                    description={
                      mode === "create"
                        ? "新建账号时必填。"
                        : "留空则保持原密码不变。"
                    }
                  >
                    <Input
                      type="password"
                      value={draft.password}
                      onChange={(event) =>
                        updateDraft("password", event.target.value)
                      }
                      placeholder={
                        mode === "create" ? "设置初始密码" : "输入新密码"
                      }
                      className="h-11 rounded-2xl border-border/80 bg-white"
                    />
                  </Field>
                </div>

                <div className="rounded-[24px] border border-border/80 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        账号状态
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        关闭后无法继续登录，但保留历史审计记录。
                      </p>
                    </div>
                    <Switch
                      checked={draft.is_enabled}
                      onCheckedChange={(checked) =>
                        updateDraft("is_enabled", checked)
                      }
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge
                      isEnabled={draft.is_enabled}
                      isAdmin={draft.role_name === "管理员"}
                      accessGranted={draft.access_granted}
                    />
                    <UserRoleBadge roleName={draft.access_granted ? draft.role_name : ""} />
                  </div>
                </div>

                <Field label="备注" description="可选，用于补充岗位、部门或职责说明。">
                  <Textarea
                    value={draft.note}
                    onChange={(event) => updateDraft("note", event.target.value)}
                    placeholder="例如：负责采购协同与供应单据审核。"
                    className="min-h-[140px] rounded-[24px] border-border/80 bg-white"
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 border-t border-border/70 bg-white px-6 py-4">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {mode === "edit" && draft?.id
                  ? `账号 ID：${draft.id}`
                  : "保存后会自动返回账号列表。"}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={resetDraft}
                  disabled={!draft}
                >
                  重置
                </Button>
                <Button
                  className="rounded-full bg-sky-500 text-white hover:bg-sky-600"
                  onClick={() => void saveDraft()}
                  disabled={saving || !draft}
                >
                  {saving ? (
                    <>
                      <RefreshCcw className="size-4 animate-spin" />
                      保存中
                    </>
                  ) : (
                    <>
                      <Save className="size-4" />
                      {mode === "create" ? "创建账号" : "保存修改"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
