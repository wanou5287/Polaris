"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { canAccessAppPath, resolveHomePath } from "@/lib/polaris-access";
import type { CurrentUser } from "@/lib/polaris-types";

export function WorkspaceAccessGuard({
  currentUser,
}: {
  currentUser: CurrentUser;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const targetHomePath = resolveHomePath(currentUser);
    if (pathname === "/workspace" && targetHomePath !== "/workspace") {
      router.replace(targetHomePath);
      return;
    }
    if (!canAccessAppPath(currentUser, pathname) && pathname !== targetHomePath) {
      router.replace(targetHomePath);
    }
  }, [currentUser, pathname, router]);

  return null;
}
