import { ResetPasswordForm } from "@/components/auth-recovery-forms";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Choose a new password",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const query = await searchParams;
  const token =
    typeof query.token === "string" &&
    !query.error &&
    /^[A-Za-z0-9._~-]{16,2048}$/.test(query.token)
      ? query.token
      : null;
  return <ResetPasswordForm token={token} />;
}
