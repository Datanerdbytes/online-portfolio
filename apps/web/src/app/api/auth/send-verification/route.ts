import { handleRecovery } from "@/lib/auth/recovery";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleRecovery(request, "send-verification");
}
