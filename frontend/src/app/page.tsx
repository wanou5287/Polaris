import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { POLARIS_SESSION_COOKIE } from "@/lib/polaris-server";

export default async function HomePage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(POLARIS_SESSION_COOKIE)?.value;

  redirect(session ? "/workspace" : "/login");
}
