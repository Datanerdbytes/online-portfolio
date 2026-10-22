import { createProfileImageHandlers } from "@/lib/profile-image-proxy";

const handlers = createProfileImageHandlers("/api/v1/resume/profile/avatar", "Avatar");

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
