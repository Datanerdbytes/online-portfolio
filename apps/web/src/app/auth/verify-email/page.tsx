import { VerifyEmailForm } from "@/components/auth-recovery-forms";
export const metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};
export default function VerifyEmailPage() {
  return <VerifyEmailForm />;
}
