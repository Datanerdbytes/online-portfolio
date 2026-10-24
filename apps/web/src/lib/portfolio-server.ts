import "server-only";
import { fetchBackend } from "@/lib/auth";
import { isPortfolioStatus } from "@/lib/portfolio";

export async function loadPortfolioStatus(token: string) {
  const result = await fetchBackend("/api/v1/portfolio", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return !result.error && isPortfolioStatus(result.body) ? result.body : null;
}
