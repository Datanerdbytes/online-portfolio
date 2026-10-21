import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResume, ApiProfile, ApiSkillGroup, ApiSkillItem, ApiExperience, ApiEducation, ApiContact, Project, ProjectsResponse } from "@/lib/api";
import { isProject, failure } from "@/lib/project-management";

export const PROJECTS_QUERY_KEY = ["projects"];
export const RESUME_QUERY_KEY = ["resume"];

export function resumeFailure(status: number): string {
  switch (status) {
    case 400: return "The resume values were rejected. Check the fields and try again.";
    case 401: case 403: return "Your session could not be verified. Sign in again, then retry.";
    case 404: return "The resume record was not found. It may have been removed.";
    case 429: return "Too many requests. Please try again later.";
    default: return "The resume service is unavailable. Please try again.";
  }
}

export async function fetchResumeData(): Promise<ApiResume> {
  const response = await request("/resume", { method: "GET" });
  if (!response.ok) throw new ApiError(response.status, resumeFailure(response.status));
  return (await response.json()) as ApiResume;
}

type PatchBody = Record<string, unknown>;

async function resumePatch(path: string, body: PatchBody): Promise<unknown> {
  const response = await request(path, { method: "PATCH", body: JSON.stringify(body) });
  if (!response.ok) throw new ApiError(response.status, resumeFailure(response.status));
  return response.json();
}

async function resumeDelete(path: string): Promise<void> {
  const response = await request(path, { method: "DELETE" });
  if (!response.ok) throw new ApiError(response.status, resumeFailure(response.status));
}

async function resumePost(path: string, body: PatchBody, idempotencyKey?: string): Promise<unknown> {
  const response = await request(path, {
    method: "POST",
    body: JSON.stringify(body),
    ...(idempotencyKey ? { headers: { "idempotency-key": idempotencyKey } } : {}),
  });
  if (!response.ok) throw new ApiError(response.status, resumeFailure(response.status));
  return response.json();
}

export async function updateProfile(body: PatchBody): Promise<ApiProfile> {
  const result = await resumePatch("/resume/profile", body);
  return result as ApiProfile;
}

export async function updateSkillGroup(id: number, body: { label: string }): Promise<ApiSkillGroup> {
  const result = await resumePatch(`/resume/skills/${id}`, body);
  return result as ApiSkillGroup;
}

export async function updateSkillItem(id: number, body: { item: string }): Promise<ApiSkillItem> {
  const result = await resumePatch(`/resume/skills/items/${id}`, body);
  return result as ApiSkillItem;
}

export async function deleteSkillGroup(id: number): Promise<void> {
  await resumeDelete(`/resume/skills/${id}`);
}

export async function deleteSkillItem(id: number): Promise<void> {
  await resumeDelete(`/resume/skills/items/${id}`);
}

export async function addSkillItem(groupId: number, body: { item: string; display_order?: number }, idempotencyKey?: string): Promise<ApiSkillItem> {
  const result = await resumePost(`/resume/skills/${groupId}/items`, body, idempotencyKey);
  return result as ApiSkillItem;
}

export async function updateExperience(id: number, body: PatchBody): Promise<ApiExperience> {
  const result = await resumePatch(`/resume/experience/${id}`, body);
  return result as ApiExperience;
}

export async function deleteExperience(id: number): Promise<void> {
  await resumeDelete(`/resume/experience/${id}`);
}

export async function addExperience(body: PatchBody, idempotencyKey?: string): Promise<ApiExperience> {
  const result = await resumePost(`/resume/experience`, body, idempotencyKey);
  return result as ApiExperience;
}

export async function updateEducation(id: number, body: PatchBody): Promise<ApiEducation> {
  const result = await resumePatch(`/resume/education/${id}`, body);
  return result as ApiEducation;
}

export async function deleteEducation(id: number): Promise<void> {
  await resumeDelete(`/resume/education/${id}`);
}

export async function addEducation(body: PatchBody, idempotencyKey?: string): Promise<ApiEducation> {
  const result = await resumePost(`/resume/education`, body, idempotencyKey);
  return result as ApiEducation;
}

export async function updateContact(body: PatchBody): Promise<ApiContact> {
  const result = await resumePatch("/resume/contact", body);
  return result as ApiContact;
}

export function useResume(options?: { initialData?: ApiResume }) {
  return useQuery({
    queryKey: RESUME_QUERY_KEY,
    queryFn: fetchResumeData,
    initialData: options?.initialData,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchBody) => updateProfile(body),
    onSuccess: (data) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => ({ ...old, profile: data }));
    },
  });
}

export function useUpdateSkillGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: { label: string } }) => updateSkillGroup(id, body),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => {
        const skills = (old?.skills ?? []).map((s) => s.id === variables.id ? data : s);
        return { ...old, skills };
      });
    },
  });
}

export function useUpdateSkillItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: { item: string } }) => updateSkillItem(id, body),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => {
        const skills = (old?.skills ?? []).map((g) => ({
          ...g,
          items: g.items.map((i) => i.id === variables.id ? data : i),
        }));
        return { ...old, skills };
      });
    },
  });
}

export function useDeleteSkillGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSkillGroup(id),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => {
        const skills = (old?.skills ?? []).filter((s) => s.id !== variables);
        return { ...old, skills };
      });
    },
  });
}

export function useDeleteSkillItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSkillItem(id),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => {
        const skills = (old?.skills ?? []).map((g) => ({
          ...g,
          items: g.items.filter((i) => i.id !== variables),
        }));
        return { ...old, skills };
      });
    },
  });
}

export function useAddSkillItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, body }: { groupId: number; body: { item: string; display_order?: number } }) => addSkillItem(groupId, body, crypto.randomUUID()),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => {
        const skills = (old?.skills ?? []).map((g) =>
          g.id === variables.groupId
            ? { ...g, items: [...g.items, data] }
            : g);
        return { ...old, skills };
      });
    },
  });
}

export function useUpdateExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: PatchBody }) => updateExperience(id, body),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => {
        const experience = (old?.experience ?? []).map((e) => e.id === variables.id ? data : e);
        return { ...old, experience };
      });
    },
  });
}

export function useDeleteExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteExperience(id),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => {
        const experience = (old?.experience ?? []).filter((e) => e.id !== variables);
        return { ...old, experience };
      });
    },
  });
}

export function useAddExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchBody) => addExperience(body, crypto.randomUUID()),
    onSuccess: (data) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => ({
        ...old,
        experience: [...(old?.experience ?? []), data],
      }));
    },
  });
}

export function useUpdateEducation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: PatchBody }) => updateEducation(id, body),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => {
        const education = (old?.education ?? []).map((e) => e.id === variables.id ? data : e);
        return { ...old, education };
      });
    },
  });
}

export function useDeleteEducation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteEducation(id),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => {
        const education = (old?.education ?? []).filter((e) => e.id !== variables);
        return { ...old, education };
      });
    },
  });
}

export function useAddEducation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchBody) => addEducation(body, crypto.randomUUID()),
    onSuccess: (data) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => ({
        ...old,
        education: [...(old?.education ?? []), data],
      }));
    },
  });
}
export const queryClient = new QueryClient();

const REQUEST_TIMEOUT_MS = 10000;

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "online-resume-admin",
        ...init.headers,
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(502, failure(502));
  } finally {
    clearTimeout(timeout);
  }
}

type UpdateProjectBody = {
  title?: string;
  summary?: string;
  technologies?: string[];
  repository_url?: string | null;
  demo_url?: string | null;
  display_order?: number;
};

export async function updateProject(slug: string, body: UpdateProjectBody): Promise<Project> {
  const response = await request(`/projects/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, failure(response.status));
  const result: unknown = await response.json();
  if (!isProject(result)) throw new ApiError(502, "Invalid project response");
  return result;
}

export async function deleteProject(slug: string): Promise<void> {
  const response = await request(`/projects/${encodeURIComponent(slug)}`, { method: "DELETE" });
  if (!response.ok) throw new ApiError(response.status, failure(response.status));
  if (response.status !== 204) throw new ApiError(502, "Unexpected deletion response");
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: UpdateProjectBody }) =>
      updateProject(slug, body),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(PROJECTS_QUERY_KEY, (old: ProjectsResponse | undefined) => {
        const projects = (old?.items ?? []).map((p) => p.slug === variables.slug ? data : p);
        return { ...old, items: projects };
      });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => deleteProject(slug),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(PROJECTS_QUERY_KEY, (old: ProjectsResponse | undefined) => {
        const projects = (old?.items ?? []).filter((p) => p.slug !== variables);
        return { ...old, items: projects };
      });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchBody) => updateContact(body),
    onSuccess: (data) => {
      queryClient.setQueryData(RESUME_QUERY_KEY, (old: ApiResume | undefined) => ({ ...old, contact: data }));
    },
  });
}
