import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/polaris/app-shell";
import {
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

  return <AppShell username={username}>{children}</AppShell>;
}
