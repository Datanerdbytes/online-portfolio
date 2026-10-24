import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { adminConfigurationError, verifyIdentityViaBackend } from "@/lib/auth";
import { getNeonAuth } from "@/lib/auth/server";

export const workspaceSession = cache(async () => {
  if (adminConfigurationError()) return null;
  let result;
  try {
    result = await getNeonAuth().token();
  } catch {
    return null;
  }
  if (result.error) {
    if ([401, 403].includes(result.error.status))
      redirect("/auth/signin?next=%2Fadmin");
    return null;
  }
  if (!result.data?.token) redirect("/auth/signin?next=%2Fadmin");
  const identity = await verifyIdentityViaBackend(result.data.token);
  if (identity.error) {
    if ([401, 403].includes(identity.error.status))
      redirect("/auth/signin?next=%2Fadmin");
    return null;
  }
  return { token: result.data.token, identity: identity.identity };
});
