"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/project-queries";

export function ProjectsQueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
