"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RecordActionButtons } from "@/components/record-action-buttons";
import type {
  ApiContact,
  ApiEducation,
  ApiExperience,
  ApiProfile,
  ApiResume,
  ApiSkillGroup,
} from "@/lib/api";
import {
  useResume,
  useUpdateProfile,
  useUpdateSkillGroup,
  useUpdateSkillItem,
  useDeleteSkillGroup,
  useDeleteSkillItem,
  useAddSkillItem,
  useUpdateExperience,
  useDeleteExperience,
  useAddExperience,
  useUpdateEducation,
  useDeleteEducation,
  useAddEducation,
  useUpdateContact,
  useUploadProfileImage,
  useRemoveProfileImage,
} from "@/lib/project-queries";
import { ProfileAvatar } from "@/components/profile-avatar";
import {
  AVATAR_ACCEPT,
  AVATAR_PATH,
  BANNER_PATH,
  profileImageUrl,
  validateAvatarFile,
  type ProfileImageKind,
} from "@/lib/avatar";

type Tab = "profile" | "skills" | "experience" | "education" | "contact";

type Props = {
  profile: ApiProfile | null;
  skills: ApiSkillGroup[];
  experience: ApiExperience[];
  education: ApiEducation[];
  contact: ApiContact | null;
};
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleMutationError(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error. Please try again.";
}

function ProfileImageControl({
  kind,
  profile,
  name,
}: {
  kind: ProfileImageKind;
  profile: ApiProfile | null;
  name: string;
}) {
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadProfileImage(kind);
  const remove = useRemoveProfileImage(kind);

  const isAvatar = kind === "avatar";
  const label = isAvatar ? "Profile photo" : "Hero banner photo";
  const imageUrl = isAvatar ? profile?.avatar_url : profile?.banner_url;
  const updatedAt = isAvatar
    ? profile?.avatar_updated_at
    : profile?.banner_updated_at;
  const imagePath = isAvatar ? AVATAR_PATH : BANNER_PATH;
  const imageSrc = profileImageUrl(imageUrl, updatedAt, imagePath);
  const busy = upload.isPending || remove.isPending;

  const onFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setMessage("");
      setIsError(false);
      const error = validateAvatarFile(file);
      if (error) {
        setIsError(true);
        setMessage(error);
        event.target.value = "";
        return;
      }
      try {
        await upload.mutateAsync(file);
        setMessage(`${label} updated. Reload the public page to see it.`);
      } catch (err) {
        setIsError(true);
        setMessage(handleMutationError(err));
      } finally {
        event.target.value = "";
      }
    },
    [label, upload],
  );

  const onRemove = useCallback(async () => {
    setMessage("");
    setIsError(false);
    try {
      await remove.mutateAsync();
      setMessage(`${label} removed. Reload the public page to see it.`);
      setConfirmRemove(false);
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [label, remove]);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-4">
        {isAvatar ? (
          <ProfileAvatar
            src={imageSrc}
            alt="Profile photo preview"
            name={name}
            size="sm"
            lazy={false}
          />
        ) : (
          <div className="relative size-40 overflow-hidden rounded-md border bg-muted">
            {imageSrc ? (
              <Image
                src={imageSrc}
                alt="Square hero banner preview"
                fill
                sizes="160px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex size-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                Square banner preview
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {busy ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
            </Button>
            {imageUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
              >
                Remove photo
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, or WebP up to 2 MB.
            {!isAvatar && " Displayed as a square crop."}
          </p>
          {message && (
            <p
              className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}
              role={isError ? "alert" : undefined}
            >
              {message}
            </p>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        onChange={onFileChange}
      />
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${label.toLowerCase()}?`}
        description="This cannot be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={onRemove}
        onCancel={() => setConfirmRemove(false)}
        pending={remove.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile tab
// ---------------------------------------------------------------------------

function ProfileTab({ profile }: { profile: ApiProfile | null }) {
  const [values, setValues] = useState({
    name: profile?.name ?? "",
    headline: profile?.headline ?? "",
    introduction: profile?.introduction ?? "",
    about: profile?.about ?? "",
    location: profile?.location ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const updateProfile = useUpdateProfile();

  const save = useCallback(async () => {
    setSaving(true);
    setMessage("");
    try {
      await updateProfile.mutateAsync({
        name: values.name,
        headline: values.headline,
        introduction: values.introduction,
        about: values.about,
        location: values.location || null,
      });
      setSaving(false);
      setIsError(false);
      setMessage("Saved. Reload the public page to see the change.");
    } catch (err) {
      setSaving(false);
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [values, updateProfile]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ProfileImageControl
          kind="avatar"
          profile={profile}
          name={profile?.name ?? values.name}
        />
        <ProfileImageControl
          kind="banner"
          profile={profile}
          name={profile?.name ?? values.name}
        />
        {(
          [
            ["Name", "name", false],
            ["Headline", "headline", false],
            ["Introduction (hero paragraph)", "introduction", true],
            ["About (skills section paragraph)", "about", true],
            ["Location (optional)", "location", false],
          ] as [string, keyof typeof values, boolean][]
        ).map(([label, key, multiline]) => (
          <div key={key} className="space-y-1">
            <label className="block text-sm font-medium">{label}</label>
            {multiline ? (
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-2 focus-visible:outline-offset-2"
                value={values[key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
                disabled={saving}
              />
            ) : (
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                value={values[key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
                disabled={saving}
              />
            )}
          </div>
        ))}
        {message && (
          <p
            className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}
          >
            {message}
          </p>
        )}
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skills tab
// ---------------------------------------------------------------------------

function SkillsTab({ skills }: { skills: ApiSkillGroup[] }) {
  const [editingItem, setEditingItem] = useState<{ id: number; item: string; groupId: number } | null>(null);
  const [itemValue, setItemValue] = useState("");
  const [addingToGroup, setAddingToGroup] = useState<number | null>(null);
  const [newItemValue, setNewItemValue] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupLabelValue, setGroupLabelValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "group"; id: number; label: string } | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const updateSkillGroup = useUpdateSkillGroup();
  const updateSkillItem = useUpdateSkillItem();
  const deleteSkillGroup = useDeleteSkillGroup();
  const deleteSkillItem = useDeleteSkillItem();
  const addSkillItem = useAddSkillItem();

  const saving =
    updateSkillGroup.isPending ||
    updateSkillItem.isPending ||
    addSkillItem.isPending;
  const deleting = deleteSkillGroup.isPending || deleteSkillItem.isPending;
  const actionDisabled = saving || deleting;

  const saveItem = useCallback(async () => {
    if (!editingItem) return;
    setMessage("");
    try {
      await updateSkillItem.mutateAsync({ id: editingItem.id, body: { item: itemValue } });
      setIsError(false);
      setMessage("Saved. Reload the public page to see it.");
      setEditingItem(null);
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [editingItem, itemValue, updateSkillItem]);

  const saveGroup = useCallback(async () => {
    if (editingGroupId === null) return;
    setMessage("");
    try {
      await updateSkillGroup.mutateAsync({ id: editingGroupId, body: { label: groupLabelValue } });
      setIsError(false);
      setMessage("Saved. Reload the public page to see it.");
      setEditingGroupId(null);
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [editingGroupId, groupLabelValue, updateSkillGroup]);

  const addItem = useCallback(async (groupId: number) => {
    if (!newItemValue.trim()) return;
    setMessage("");
    try {
      await addSkillItem.mutateAsync({
        groupId,
        body: { item: newItemValue.trim(), display_order: 999 },
      });
      setIsError(false);
      setMessage("Added. Reload the public page to see it.");
      setAddingToGroup(null);
      setNewItemValue("");
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [newItemValue, addSkillItem]);

  const handleDeleteGroup = useCallback(async () => {
    if (!deleteTarget) return;
    setMessage("");
    try {
      await deleteSkillGroup.mutateAsync(deleteTarget.id);
      setIsError(false);
      setMessage("Deleted. Reload the public page to see it.");
      setDeleteTarget(null);
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [deleteTarget, deleteSkillGroup]);

  const handleDeleteItem = useCallback(async (id: number) => {
    setMessage("");
    try {
      await deleteSkillItem.mutateAsync(id);
      setIsError(false);
      setMessage("Deleted. Reload the public page to see it.");
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [deleteSkillItem]);

  return (
    <div className="space-y-4">
      {skills.map((group) => (
        <Card key={group.id}>
          <CardHeader className="pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {editingGroupId === group.id ? (
                <input
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  value={groupLabelValue}
                  onChange={(e) => setGroupLabelValue(e.target.value)}
                  disabled={saving}
                  autoFocus
                />
              ) : (
                <CardTitle className="text-base">{group.label}</CardTitle>
              )}
              <RecordActionButtons
                recordTitle={group.label}
                onEdit={() => {
                  setEditingGroupId(group.id);
                  setGroupLabelValue(group.label);
                  setMessage("");
                }}
                onDelete={() => {
                  setDeleteTarget({ kind: "group", id: group.id, label: group.label });
                  setMessage("");
                }}
                disabled={actionDisabled}
              />
            </div>
          </CardHeader>
          <CardContent>
            {editingGroupId === group.id ? (
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" onClick={saveGroup} disabled={saving}>
                  {saving ? "…" : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingGroupId(null)}>
                  Cancel
                </Button>
              </div>
            ) : null}
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  {editingItem?.id === item.id && editingItem?.groupId === group.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        className="flex-1 rounded-md border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                        value={itemValue}
                        onChange={(e) => setItemValue(e.target.value)}
                        disabled={saving}
                        autoFocus
                      />
                      <Button size="sm" onClick={saveItem} disabled={saving}>
                        {saving ? "…" : "Save"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span>{item.item}</span>
                      <RecordActionButtons
                        recordTitle={item.item}
                        onEdit={() => {
                          setEditingItem({ id: item.id, item: item.item, groupId: group.id });
                          setItemValue(item.item);
                          setMessage("");
                        }}
                        onDelete={() => {
                          handleDeleteItem(item.id);
                        }}
                        disabled={actionDisabled}
                      />
                    </>
                  )}
                </li>
              ))}
            </ul>
            {addingToGroup === group.id ? (
              <div className="mt-3 flex items-center gap-2">
                <input
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  placeholder="New skill item…"
                  value={newItemValue}
                  onChange={(e) => setNewItemValue(e.target.value)}
                  disabled={saving}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") addItem(group.id); }}
                />
                <Button size="sm" onClick={() => addItem(group.id)} disabled={saving}>
                  {saving ? "…" : "Add"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAddingToGroup(null); setNewItemValue(""); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="mt-2 text-xs" onClick={() => { setAddingToGroup(group.id); setNewItemValue(""); setMessage(""); }}>
                + Add skill
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete skill group “${deleteTarget.label}”?`}
          description="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDeleteGroup}
          onCancel={() => setDeleteTarget(null)}
          pending={deleting}
        />
      )}
      {message && (
        <p className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Experience tab
// ---------------------------------------------------------------------------

function ExperienceTab({ experience }: { experience: ApiExperience[] }) {
  const [editing, setEditing] = useState<ApiExperience | null>(null);
  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState({
    role: "",
    organization: "",
    started: "",
    ended: "",
    current: false,
    description: "",
  });
  const [newValues, setNewValues] = useState({
    slug: "",
    role: "",
    organization: "",
    started: "",
    ended: "",
    current: false,
    description: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const updateExperience = useUpdateExperience();
  const deleteExperience = useDeleteExperience();
  const addExperience = useAddExperience();

  const saving = updateExperience.isPending || addExperience.isPending;
  const deleting = deleteExperience.isPending;
  const actionDisabled = saving || deleting;

  const startEdit = (exp: ApiExperience) => {
    setAdding(false);
    setEditing(exp);
    setValues({
      role: exp.role,
      organization: exp.organization,
      started: exp.started,
      ended: exp.ended ?? "",
      current: exp.current,
      description: exp.description,
    });
    setMessage("");
  };

  const save = useCallback(async () => {
    if (!editing) return;
    setMessage("");
    try {
      await updateExperience.mutateAsync({
        id: editing.id,
        body: {
          role: values.role,
          organization: values.organization,
          started: values.started,
          ended: values.ended || null,
          current: values.current,
          description: values.description,
        },
      });
      setIsError(false);
      setMessage("Saved. Reload the public page to see the change.");
      setEditing(null);
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [editing, values, updateExperience]);

  const saveNew = useCallback(async () => {
    setMessage("");
    try {
      await addExperience.mutateAsync({
        slug: newValues.slug,
        role: newValues.role,
        organization: newValues.organization,
        started: newValues.started,
        ended: newValues.ended || null,
        current: newValues.current,
        description: newValues.description,
        display_order: experience.length,
      });
      setIsError(false);
      setMessage("Added. Reload the public page to see it.");
      setAdding(false);
      setNewValues({ slug: "", role: "", organization: "", started: "", ended: "", current: false, description: "" });
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [newValues, experience.length, addExperience]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setMessage("");
    try {
      await deleteExperience.mutateAsync(deleteTarget.id);
      setIsError(false);
      setMessage("Deleted. Reload the public page to see it.");
      setDeleteTarget(null);
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [deleteTarget, deleteExperience]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {experience.map((exp) => (
          <div
            key={exp.id}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div>
              <p className="font-medium text-sm">{exp.role}</p>
              <p className="text-xs text-muted-foreground">
                {exp.organization} · {exp.started}–{exp.ended ?? "Present"}
              </p>
            </div>
            <RecordActionButtons
              recordTitle={exp.role}
              onEdit={() => startEdit(exp)}
              onDelete={() => {
                setDeleteTarget({ id: exp.id, label: exp.role });
                setMessage("");
              }}
              disabled={actionDisabled}
            />
          </div>
        ))}
      </div>

      {!adding && (
        <Button variant="outline" size="sm" onClick={() => { setAdding(true); setEditing(null); setMessage(""); }}>
          + Add experience
        </Button>
      )}

      {adding && (
        <Card>
          <CardHeader><CardTitle className="text-base">New experience entry</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ["Slug (URL-safe id, e.g. company-role)", "slug"],
                ["Role", "role"],
                ["Organization", "organization"],
                ["Started (YYYY-MM)", "started"],
                ["Ended (YYYY-MM, leave blank if current)", "ended"],
              ] as [string, keyof typeof newValues][]
            ).map(([label, key]) => (
              <div key={key} className="space-y-1">
                <label className="block text-sm font-medium">{label}</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  value={newValues[key] as string}
                  onChange={(e) => setNewValues((v) => ({ ...v, [key]: e.target.value }))}
                  disabled={saving}
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="new-current" checked={newValues.current}
                onChange={(e) => setNewValues((v) => ({ ...v, current: e.target.checked }))} disabled={saving} />
              <label htmlFor="new-current" className="text-sm">Currently working here</label>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium">Description (optional)</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px] focus-visible:outline-2 focus-visible:outline-offset-2"
                value={newValues.description}
                onChange={(e) => setNewValues((v) => ({ ...v, description: e.target.value }))}
                disabled={saving}
              />
            </div>
            {message && <p className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>}
            <div className="flex gap-2">
              <Button onClick={saveNew} disabled={saving}>{saving ? "Saving…" : "Add entry"}</Button>
              <Button variant="outline" onClick={() => { setAdding(false); setMessage(""); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Editing: {editing.role} @ {editing.organization}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ["Role", "role"],
                ["Organization", "organization"],
                ["Started (YYYY-MM)", "started"],
                ["Ended (YYYY-MM, leave blank if current)", "ended"],
              ] as [string, keyof typeof values][]
            ).map(([label, key]) => (
              <div key={key} className="space-y-1">
                <label className="block text-sm font-medium">{label}</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  value={values[key] as string}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  disabled={saving}
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="exp-current" checked={values.current}
                onChange={(e) => setValues((v) => ({ ...v, current: e.target.checked }))} disabled={saving} />
              <label htmlFor="exp-current" className="text-sm">Currently working here</label>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium">Description (optional)</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px] focus-visible:outline-2 focus-visible:outline-offset-2"
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                disabled={saving}
              />
            </div>
            {message && <p className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>}
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button variant="outline" onClick={() => { setEditing(null); setMessage(""); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete experience “${deleteTarget.label}”?`}
          description="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          pending={deleting}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Education tab
// ---------------------------------------------------------------------------

function EducationTab({ education }: { education: ApiEducation[] }) {
  const [editing, setEditing] = useState<ApiEducation | null>(null);
  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState({ qualification: "", institution: "", started: "", ended: "" });
  const [newValues, setNewValues] = useState({ slug: "", qualification: "", institution: "", started: "", ended: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const updateEducation = useUpdateEducation();
  const deleteEducation = useDeleteEducation();
  const addEducation = useAddEducation();

  const saving = updateEducation.isPending || addEducation.isPending;
  const deleting = deleteEducation.isPending;
  const actionDisabled = saving || deleting;

  const startEdit = (edu: ApiEducation) => {
    setAdding(false);
    setEditing(edu);
    setValues({ qualification: edu.qualification, institution: edu.institution, started: edu.started ?? "", ended: edu.ended ?? "" });
    setMessage("");
  };

  const save = useCallback(async () => {
    if (!editing) return;
    setMessage("");
    try {
      await updateEducation.mutateAsync({
        id: editing.id,
        body: {
          qualification: values.qualification,
          institution: values.institution,
          started: values.started || null,
          ended: values.ended || null,
        },
      });
      setIsError(false);
      setMessage("Saved. Reload the public page to see the change.");
      setEditing(null);
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [editing, values, updateEducation]);

  const saveNew = useCallback(async () => {
    setMessage("");
    try {
      await addEducation.mutateAsync({
        slug: newValues.slug,
        qualification: newValues.qualification,
        institution: newValues.institution,
        started: newValues.started || null,
        ended: newValues.ended || null,
        display_order: education.length,
      });
      setIsError(false);
      setMessage("Added. Reload the public page to see it.");
      setAdding(false);
      setNewValues({ slug: "", qualification: "", institution: "", started: "", ended: "" });
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [newValues, education.length, addEducation]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setMessage("");
    try {
      await deleteEducation.mutateAsync(deleteTarget.id);
      setIsError(false);
      setMessage("Deleted. Reload the public page to see it.");
      setDeleteTarget(null);
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [deleteTarget, deleteEducation]);

  return (
    <div className="space-y-4">
      {education.map((edu) => (
        <div key={edu.id} className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="font-medium text-sm">{edu.qualification}</p>
            <p className="text-xs text-muted-foreground">{edu.institution} · {edu.started}–{edu.ended}</p>
          </div>
          <RecordActionButtons
            recordTitle={edu.qualification}
            onEdit={() => startEdit(edu)}
            onDelete={() => {
              setDeleteTarget({ id: edu.id, label: edu.qualification });
              setMessage("");
            }}
            disabled={actionDisabled}
          />
        </div>
      ))}

      {!adding && (
        <Button variant="outline" size="sm" onClick={() => { setAdding(true); setEditing(null); setMessage(""); }}>
          + Add education
        </Button>
      )}

      {adding && (
        <Card>
          <CardHeader><CardTitle className="text-base">New education entry</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ["Slug (URL-safe id)", "slug"],
                ["Qualification", "qualification"],
                ["Institution", "institution"],
                ["Started (YYYY-MM)", "started"],
                ["Ended (YYYY-MM)", "ended"],
              ] as [string, keyof typeof newValues][]
            ).map(([label, key]) => (
              <div key={key} className="space-y-1">
                <label className="block text-sm font-medium">{label}</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  value={newValues[key]}
                  onChange={(e) => setNewValues((v) => ({ ...v, [key]: e.target.value }))}
                  disabled={saving}
                />
              </div>
            ))}
            {message && <p className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>}
            <div className="flex gap-2">
              <Button onClick={saveNew} disabled={saving}>{saving ? "Saving…" : "Add entry"}</Button>
              <Button variant="outline" onClick={() => { setAdding(false); setMessage(""); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">Editing: {editing.qualification}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(
              [["Qualification", "qualification"], ["Institution", "institution"], ["Started (YYYY-MM)", "started"], ["Ended (YYYY-MM)", "ended"]] as [string, keyof typeof values][]
            ).map(([label, key]) => (
              <div key={key} className="space-y-1">
                <label className="block text-sm font-medium">{label}</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  value={values[key]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  disabled={saving}
                />
              </div>
            ))}
            {message && <p className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>}
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button variant="outline" onClick={() => { setEditing(null); setMessage(""); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete education “${deleteTarget.label}”?`}
          description="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          pending={deleting}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact tab
// ---------------------------------------------------------------------------

function ContactTab({ contact }: { contact: ApiContact | null }) {
  const [values, setValues] = useState({
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
  });
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const updateContact = useUpdateContact();

  const saving = updateContact.isPending;

  const save = useCallback(async () => {
    setMessage("");
    try {
      await updateContact.mutateAsync({
        phone: values.phone || null,
        email: values.email || null,
      });
      setIsError(false);
      setMessage("Saved. Reload the public page to see the change.");
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [values, updateContact]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Email</label>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            disabled={saving}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">Phone</label>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            disabled={saving}
          />
        </div>
        {contact?.links && contact.links.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Social links</p>
            {contact.links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 font-medium">{l.label}</span>
                <span className="truncate text-muted-foreground">{l.url}</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Link editing available via the API directly.
            </p>
          </div>
        )}
        {message && (
          <p
            className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}
          >
            {message}
          </p>
        )}
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save contact"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ResumeManager({
  profile,
  skills,
  experience,
  education,
  contact,
}: Props) {
  const [tab, setTab] = useState<Tab>("profile");

  const resume = useResume({
    initialData: { profile, skills, experience, education, contact } as ApiResume,
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "skills", label: "Skills" },
    { id: "experience", label: "Experience" },
    { id: "education", label: "Education" },
    { id: "contact", label: "Contact" },
  ];

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2" aria-label="Resume sections">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </nav>
      {tab === "profile" && <ProfileTab profile={resume.data?.profile ?? profile} />}
      {tab === "skills" && <SkillsTab skills={resume.data?.skills ?? skills} />}
      {tab === "experience" && <ExperienceTab experience={resume.data?.experience ?? experience} />}
      {tab === "education" && <EducationTab education={resume.data?.education ?? education} />}
      {tab === "contact" && <ContactTab contact={resume.data?.contact ?? contact} />}
    </div>
  );
}
