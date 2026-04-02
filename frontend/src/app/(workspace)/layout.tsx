import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/polaris/app-shell";
import {
  POLARIS_AFTER_SALES_ENTRY_PATH,
  POLARIS_AFTER_SALES_USERNAME,
  POLARIS_SESSION_COOKIE,
  POLARIS_USERNAME_COOKIE,
} from "@/lib/polaris-server";

export default async function WorkspaceLayout({
  children,
}: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const session = cookieStore.get(POLARIS_SESSION_COOKIE)?.value;
  const username = cookieStore.get(POLARIS_USERNAME_COOKIE)?.value ?? "BI 用户";

  if (!session) {
    redirect("/login");
  }

  if (username === POLARIS_AFTER_SALES_USERNAME) {
    redirect(POLARIS_AFTER_SALES_ENTRY_PATH);
  }

  return <AppShell username={username}>{children}</AppShell>;
}
