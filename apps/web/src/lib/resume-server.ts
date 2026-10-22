import "server-only";

import { cache } from "react";
import { fetchResume } from "@/lib/api";

export const getResumeCached = cache(async () => fetchResume());
