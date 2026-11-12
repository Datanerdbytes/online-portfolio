"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FieldAiWriting } from "@/components/ai-writing-assistant";
import { FormMessage } from "@/components/form-message";
import { RecordActionButtons } from "@/components/record-action-buttons";
import type {
  ApiContact,
  ApiContactLink,
  ApiEducation,
  ApiExperience,
  ApiProfile,
  ApiSkillGroup,
} from "@/lib/api";
import {
  useUpdateProfile,
  useAddSkillGroup,
  useUpdateSkillGroup,
  useUpdateSkillItem,
  useDeleteSkillGroup,
  useDeleteSkillItem,
  useAddSkillItem,
  useUpdateExperience,
  useDeleteExperience,
  useAddExperience,
  useAddExperienceHighlight,
  useUpdateExperienceHighlight,
  useDeleteExperienceHighlight,
  useUpdateEducation,
  useDeleteEducation,
  useAddEducation,
  useUpdateContact,
  useAddContactLink,
  useUpdateContactLink,
  useDeleteContactLink,
  useUploadProfileImage,
  useRemoveProfileImage,
} from "@/lib/project-queries";
import { isAbsoluteHttpUrl } from "@/lib/resume";
import { dateProblems, isValidEmail } from "@/lib/resume-review";
import { manualFacts } from "@/lib/resume-import";
import { generateSlug } from "@/lib/slug";
import { isSlug, parseHighlights } from "@/lib/project-management";
import { useStepEdits } from "@/lib/use-step-edits";
import type { StepEditControls } from "@/lib/resume-wizard";
import { ProfileAvatar } from "@/components/profile-avatar";
import {
  AVATAR_ACCEPT,
  AVATAR_PATH,
  BANNER_PATH,
  profileImageUrl,
  validateAvatarFile,
  type ProfileImageKind,
} from "@/lib/avatar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleMutationError(err: unknown): string {
  return err instanceof Error
    ? err.message
    : "Unexpected error. Please try again.";
}

// Append sentinel for new skill items: matches the pre-existing convention
// the backend accepts for unsequenced items.
const APPEND_ORDER = 999;

const inputClassName =
  "w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2";

function ProfileImageControl({
  kind,
  profile,
  name,
  disabled = false,
}: {
  kind: ProfileImageKind;
  profile: ApiProfile | null;
  name: string;
  /** True when the saved resume could not be loaded. */
  disabled?: boolean;
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
        setMessage(`${label} saved to your draft.`);
      } catch (err) {
        setIsError(true);
        setMessage(handleMutationError(err));
      } finally {
        event.target.value = "";
      }
    },
    [label, upload]
  );

  const onRemove = useCallback(async () => {
    setMessage("");
    setIsError(false);
    try {
      await remove.mutateAsync();
      setMessage(`${label} removed from your draft.`);
      setConfirmRemove(false);
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
    }
  }, [label, remove]);

  return (
    <div className="min-w-0 space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-col items-start gap-3">
        <div className="flex h-32 items-center">
          {isAvatar ? (
            <ProfileAvatar
              src={imageSrc}
              alt="Profile photo preview"
              name={name}
              size="sm"
              lazy={false}
            />
          ) : (
            <div className="relative size-32 overflow-hidden rounded-md border bg-muted">
              {imageSrc ? (
                <Image
                  src={imageSrc}
                  alt="Square hero banner preview"
                  fill
                  sizes="128px"
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
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || disabled}
            >
              {busy
                ? "Uploading…"
                : imageUrl
                  ? "Replace photo"
                  : "Upload photo"}
            </Button>
            {imageUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmRemove(true)}
                disabled={busy || disabled}
              >
                Remove photo
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, or WebP up to 2 MB. Automatically resized and compressed.
            Photo changes save to your draft immediately.
            {!isAvatar && " Displayed as a square crop."}
          </p>
          <FormMessage message={message} isError={isError} />
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
        pendingLabel="Removing…"
      />
    </div>
  );
}

/**
 * One unavailability notice shared by the manual steps: shown when the saved
 * resume could not be loaded, so a save can never overwrite stored values
 * with blank fields.
 */
export function ResumeUnavailableNotice() {
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/40 bg-card p-4 text-sm"
    >
      Your saved resume could not be loaded, so this step is read-only right
      now. Your saved work is unchanged. Refresh the page to try again.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Profile tab
// ---------------------------------------------------------------------------

type ProfileValues = {
  name: string;
  headline: string;
  introduction: string;
  about: string;
  location: string;
};

export function ProfileTab({
  profile,
  unavailable = false,
  ownerId = null,
  onDirtyChange,
  onControls,
}: {
  profile: ApiProfile | null;
  /** True when the saved resume could not be loaded: saving is disabled. */
  unavailable?: boolean;
  ownerId?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onControls?: (controls: StepEditControls | null) => void;
}) {
  const saved = useMemo<ProfileValues>(
    () => ({
      name: profile?.name ?? "",
      headline: profile?.headline ?? "",
      introduction: profile?.introduction ?? "",
      about: profile?.about ?? "",
      location: profile?.location ?? "",
    }),
    [profile]
  );
  const [values, setValues] = useState<ProfileValues>(saved);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const updateProfile = useUpdateProfile();

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  const save = useCallback(async (): Promise<boolean> => {
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
      setIsError(false);
      setMessage("Saved to your draft.");
      return true;
    } catch (err) {
      setIsError(true);
      setMessage(handleMutationError(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [values, updateProfile]);

  const discard = useCallback(() => {
    setValues(saved);
    setMessage("");
    setIsError(false);
  }, [saved]);

  useStepEdits({
    dirty,
    unavailable,
    save,
    discard,
    onDirtyChange,
    onControls,
  });

  const readOnly = unavailable || saving;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <ProfileImageControl
            kind="avatar"
            profile={profile}
            name={profile?.name ?? values.name}
            disabled={unavailable}
          />
          <ProfileImageControl
            kind="banner"
            profile={profile}
            name={profile?.name ?? values.name}
            disabled={unavailable}
          />
        </div>
        {(
          [
            ["Name", "name", false, "profile-name"],
            ["Headline", "headline", false, "profile-headline"],
            [
              "Introduction (hero paragraph)",
              "introduction",
              true,
              "profile-introduction",
            ],
            [
              "About (skills section paragraph)",
              "about",
              true,
              "profile-about",
            ],
            ["Location (optional)", "location", false, "profile-location"],
          ] as [string, keyof ProfileValues, boolean, string][]
        ).map(([label, key, multiline, id]) => (
          <div key={key} className="space-y-1">
            <label className="block text-sm font-medium" htmlFor={id}>
              {label}
            </label>
            {multiline ? (
              <textarea
                id={id}
                className={`${inputClassName} min-h-[80px]`}
                value={values[key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
                disabled={readOnly}
              />
            ) : (
              <input
                id={id}
                className={inputClassName}
                value={values[key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
                disabled={readOnly}
              />
            )}
            {key === "headline" || key === "introduction" || key === "about" ? (
              <FieldAiWriting
                section="profile"
                field={key}
                ownerId={ownerId}
                currentText={values[key]}
                facts={manualFacts("profile", key, { ...values })}
                disabled={saving}
                onUse={(text) => setValues((v) => ({ ...v, [key]: text }))}
              />
            ) : null}
          </div>
        ))}
        <FormMessage message={message} isError={isError} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skills tab
// ---------------------------------------------------------------------------

type NewGroupDraft = { key: string; label: string; itemsText: string };

export function SkillsTab({
  skills,
  unavailable = false,
  onDirtyChange,
  onControls,
}: {
  skills: ApiSkillGroup[];
  unavailable?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onControls?: (controls: StepEditControls | null) => void;
}) {
  // Local drafts overlay the saved groups; nothing is written until the
  // step-level save replays the per-record mutations.
  const [groupLabelDrafts, setGroupLabelDrafts] = useState<
    Record<number, string>
  >({});
  const [itemDrafts, setItemDrafts] = useState<Record<number, string>>({});
  const [openGroupEdit, setOpenGroupEdit] = useState<number | null>(null);
  const [openItemEdit, setOpenItemEdit] = useState<number | null>(null);
  const [newGroups, setNewGroups] = useState<NewGroupDraft[]>([]);
  const [stagedItems, setStagedItems] = useState<Record<number, string[]>>({});
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [newGroupItemsText, setNewGroupItemsText] = useState("");
  const [addingToGroup, setAddingToGroup] = useState<number | null>(null);
  const [newItemValue, setNewItemValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "group" | "item";
    id: number;
    label: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [messageDetails, setMessageDetails] = useState<string[] | undefined>();
  const [isError, setIsError] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const updateSkillGroup = useUpdateSkillGroup();
  const updateSkillItem = useUpdateSkillItem();
  const deleteSkillGroup = useDeleteSkillGroup();
  const deleteSkillItem = useDeleteSkillItem();
  const addSkillItem = useAddSkillItem();
  const addSkillGroup = useAddSkillGroup();

  const deleting = deleteSkillGroup.isPending || deleteSkillItem.isPending;
  const busy = savingAll || deleting;

  const clearFeedback = useCallback(() => {
    setMessage("");
    setMessageDetails(undefined);
    setIsError(false);
  }, []);

  const dirty =
    Object.keys(groupLabelDrafts).length > 0 ||
    Object.keys(itemDrafts).length > 0 ||
    newGroups.length > 0 ||
    Object.values(stagedItems).some((items) => items.length > 0) ||
    (addingGroup &&
      (newGroupLabel.trim() !== "" || newGroupItemsText.trim() !== "")) ||
    (addingToGroup !== null && newItemValue.trim() !== "");

  const save = useCallback(async (): Promise<boolean> => {
    if (savingAll) return false;
    setSavingAll(true);
    clearFeedback();
    const failures: string[] = [];
    let savedCount = 0;

    const fail = (what: string, err: unknown) =>
      failures.push(`${what}: ${handleMutationError(err)}`);

    // 1. Edited group labels.
    for (const [idStr, label] of Object.entries(groupLabelDrafts)) {
      const id = Number(idStr);
      const original = skills.find((g) => g.id === id);
      if (label === original?.label) {
        setGroupLabelDrafts((drafts) => {
          const next = { ...drafts };
          delete next[id];
          return next;
        });
        continue;
      }
      if (!label.trim()) {
        failures.push(
          `Skill group “${original?.label ?? id}”: the group name cannot be empty.`
        );
        continue;
      }
      try {
        await updateSkillGroup.mutateAsync({ id, body: { label } });
        setGroupLabelDrafts((drafts) => {
          const next = { ...drafts };
          delete next[id];
          return next;
        });
        savedCount += 1;
      } catch (err) {
        fail(`Skill group “${original?.label ?? id}”`, err);
      }
    }

    // 2. Edited skill items.
    for (const [idStr, item] of Object.entries(itemDrafts)) {
      const id = Number(idStr);
      const original = skills.flatMap((g) => g.items).find((i) => i.id === id);
      if (item === original?.item) {
        setItemDrafts((drafts) => {
          const next = { ...drafts };
          delete next[id];
          return next;
        });
        continue;
      }
      if (!item.trim()) {
        failures.push(
          `Skill “${original?.item ?? id}”: the skill cannot be empty.`
        );
        continue;
      }
      try {
        await updateSkillItem.mutateAsync({ id, body: { item } });
        setItemDrafts((drafts) => {
          const next = { ...drafts };
          delete next[id];
          return next;
        });
        savedCount += 1;
      } catch (err) {
        fail(`Skill “${original?.item ?? id}”`, err);
      }
    }

    // 3. New groups with their staged items.
    for (const draft of newGroups) {
      const label = draft.label.trim();
      if (!label) {
        failures.push("A new skill group is missing its name.");
        continue;
      }
      try {
        const created = await addSkillGroup.mutateAsync({
          label,
          display_order: skills.length,
        });
        const items = draft.itemsText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        for (const [index, item] of items.entries()) {
          try {
            await addSkillItem.mutateAsync({
              groupId: created.id,
              body: { item, display_order: index },
            });
          } catch (err) {
            fail(`Skill “${item}” in group “${label}”`, err);
          }
        }
        setNewGroups((groups) => groups.filter((g) => g.key !== draft.key));
        savedCount += 1;
      } catch (err) {
        fail(`Skill group “${label}”`, err);
      }
    }

    // 4. Staged items added to existing groups.
    for (const [groupIdStr, items] of Object.entries(stagedItems)) {
      const groupId = Number(groupIdStr);
      const group = skills.find((g) => g.id === groupId);
      const remaining: string[] = [];
      for (const item of items) {
        try {
          await addSkillItem.mutateAsync({
            groupId,
            body: { item, display_order: APPEND_ORDER },
          });
          savedCount += 1;
        } catch (err) {
          fail(
            `Skill “${item}”${group ? ` in group “${group.label}”` : ""}`,
            err
          );
          remaining.push(item);
        }
      }
      setStagedItems((staged) => {
        const next = { ...staged };
        if (remaining.length > 0) next[groupId] = remaining;
        else delete next[groupId];
        return next;
      });
    }

    setSavingAll(false);
    if (failures.length > 0) {
      setIsError(true);
      setMessage(
        savedCount > 0
          ? `Saved ${savedCount} change${savedCount === 1 ? "" : "s"}. Some changes failed:`
          : "Your changes were not saved:"
      );
      setMessageDetails(failures);
      return false;
    }
    if (savedCount > 0)
      setMessage(
        `Saved ${savedCount} change${savedCount === 1 ? "" : "s"} to your draft.`
      );
    return true;
  }, [
    savingAll,
    groupLabelDrafts,
    itemDrafts,
    newGroups,
    stagedItems,
    skills,
    clearFeedback,
    updateSkillGroup,
    updateSkillItem,
    addSkillGroup,
    addSkillItem,
  ]);

  const discard = useCallback(() => {
    setGroupLabelDrafts({});
    setItemDrafts({});
    setOpenGroupEdit(null);
    setOpenItemEdit(null);
    setNewGroups([]);
    setStagedItems({});
    setAddingGroup(false);
    setNewGroupLabel("");
    setNewGroupItemsText("");
    setAddingToGroup(null);
    setNewItemValue("");
    clearFeedback();
  }, [clearFeedback]);

  useStepEdits({
    dirty,
    unavailable,
    save,
    discard,
    onDirtyChange,
    onControls,
  });

  const removeStagedItem = (groupId: number, index: number) => {
    setStagedItems((staged) => ({
      ...staged,
      [groupId]: (staged[groupId] ?? []).filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-4">
      {skills.map((group) => {
        const draftLabel = groupLabelDrafts[group.id];
        return (
          <Card key={group.id}>
            <CardHeader className="pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {openGroupEdit === group.id ? (
                  <input
                    className="flex-1 rounded-md border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                    value={draftLabel ?? group.label}
                    onChange={(e) =>
                      setGroupLabelDrafts((drafts) => ({
                        ...drafts,
                        [group.id]: e.target.value,
                      }))
                    }
                    disabled={busy || unavailable}
                    autoFocus
                    aria-label={`Edit group name for ${group.label}`}
                  />
                ) : (
                  <CardTitle className="text-base">
                    {draftLabel ?? group.label}
                  </CardTitle>
                )}
                {draftLabel !== undefined && openGroupEdit !== group.id && (
                  <Badge variant="outline">Unsaved edits</Badge>
                )}
                <RecordActionButtons
                  recordTitle={`${group.label} group`}
                  onEdit={() => {
                    clearFeedback();
                    setOpenGroupEdit(group.id);
                    setGroupLabelDrafts((drafts) =>
                      drafts[group.id] !== undefined
                        ? drafts
                        : { ...drafts, [group.id]: group.label }
                    );
                  }}
                  onDelete={() => {
                    setDeleteTarget({
                      kind: "group",
                      id: group.id,
                      label: group.label,
                    });
                    clearFeedback();
                  }}
                  disabled={busy || unavailable}
                />
              </div>
            </CardHeader>
            <CardContent>
              {openGroupEdit === group.id ? (
                <div className="mb-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenGroupEdit(null)}
                    disabled={busy}
                  >
                    Done
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setGroupLabelDrafts((drafts) => {
                        const next = { ...drafts };
                        delete next[group.id];
                        return next;
                      });
                      setOpenGroupEdit(null);
                    }}
                    disabled={busy}
                  >
                    Cancel edit
                  </Button>
                </div>
              ) : null}
              <ul className="divide-y divide-border">
                {group.items.map((item) => {
                  const draft = itemDrafts[item.id];
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      {openItemEdit === item.id ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            className="flex-1 rounded-md border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                            value={draft ?? item.item}
                            onChange={(e) =>
                              setItemDrafts((drafts) => ({
                                ...drafts,
                                [item.id]: e.target.value,
                              }))
                            }
                            disabled={busy || unavailable}
                            autoFocus
                            aria-label={`Edit skill ${item.item}`}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenItemEdit(null)}
                            disabled={busy}
                          >
                            Done
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setItemDrafts((drafts) => {
                                const next = { ...drafts };
                                delete next[item.id];
                                return next;
                              });
                              setOpenItemEdit(null);
                            }}
                            disabled={busy}
                          >
                            Cancel edit
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="flex items-center gap-2">
                            {draft !== undefined ? draft : item.item}
                            {draft !== undefined && (
                              <Badge variant="outline">Unsaved edits</Badge>
                            )}
                          </span>
                          <RecordActionButtons
                            recordTitle={item.item}
                            onEdit={() => {
                              clearFeedback();
                              setOpenItemEdit(item.id);
                              setItemDrafts((drafts) =>
                                drafts[item.id] !== undefined
                                  ? drafts
                                  : { ...drafts, [item.id]: item.item }
                              );
                            }}
                            onDelete={() => {
                              setDeleteTarget({
                                kind: "item",
                                id: item.id,
                                label: item.item,
                              });
                              clearFeedback();
                            }}
                            disabled={busy || unavailable}
                          />
                        </>
                      )}
                    </li>
                  );
                })}
                {(stagedItems[group.id] ?? []).map((item, index) => (
                  <li
                    key={`staged-${index}`}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      {item}
                      <Badge variant="outline">Unsaved</Badge>
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove unsaved skill ${item}`}
                      title={`Remove unsaved skill ${item}`}
                      onClick={() => removeStagedItem(group.id, index)}
                      disabled={busy}
                    >
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </Button>
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
                    disabled={busy || unavailable}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newItemValue.trim()) {
                        setStagedItems((staged) => ({
                          ...staged,
                          [group.id]: [
                            ...(staged[group.id] ?? []),
                            newItemValue.trim(),
                          ],
                        }));
                        setNewItemValue("");
                      }
                    }}
                    aria-label={`New skill for ${group.label}`}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newItemValue.trim()) return;
                      setStagedItems((staged) => ({
                        ...staged,
                        [group.id]: [
                          ...(staged[group.id] ?? []),
                          newItemValue.trim(),
                        ],
                      }));
                      setNewItemValue("");
                    }}
                    disabled={busy || unavailable || !newItemValue.trim()}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAddingToGroup(null);
                      setNewItemValue("");
                    }}
                    disabled={busy}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 text-xs"
                  onClick={() => {
                    clearFeedback();
                    setAddingToGroup(group.id);
                    setNewItemValue("");
                  }}
                  disabled={busy || unavailable}
                >
                  + Add skill
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      {newGroups.map((draft) => (
        <Card key={draft.key}>
          <CardHeader className="pb-2 flex items-center justify-between">
            <CardTitle className="text-base">
              {draft.label.trim() || "New skill group"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Unsaved</Badge>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove unsaved skill group"
                title="Remove unsaved skill group"
                onClick={() =>
                  setNewGroups((groups) =>
                    groups.filter((g) => g.key !== draft.key)
                  )
                }
                disabled={busy}
              >
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {draft.itemsText
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {skills.length === 0 && newGroups.length === 0 && !addingGroup && (
        <p className="text-sm text-muted-foreground">
          No skill groups yet. Add one to describe your strengths and tools.
        </p>
      )}

      {addingGroup ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New skill group</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label
                className="block text-sm font-medium"
                htmlFor="new-skill-group"
              >
                Group name
              </label>
              <input
                id="new-skill-group"
                className={inputClassName}
                placeholder="e.g. Programming languages"
                value={newGroupLabel}
                onChange={(e) => setNewGroupLabel(e.target.value)}
                disabled={busy || unavailable}
                autoFocus
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <label
                className="block text-sm font-medium"
                htmlFor="new-skill-group-items"
              >
                Skills (one per line, optional)
              </label>
              <textarea
                id="new-skill-group-items"
                className={`${inputClassName} min-h-[80px]`}
                placeholder={"React\nTypeScript\nNode.js"}
                value={newGroupItemsText}
                onChange={(e) => setNewGroupItemsText(e.target.value)}
                disabled={busy || unavailable}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (!newGroupLabel.trim()) return;
                  clearFeedback();
                  setNewGroups((groups) => [
                    ...groups,
                    {
                      key: `group-${crypto.randomUUID()}`,
                      label: newGroupLabel.trim(),
                      itemsText: newGroupItemsText,
                    },
                  ]);
                  setAddingGroup(false);
                  setNewGroupLabel("");
                  setNewGroupItemsText("");
                }}
                disabled={busy || unavailable || !newGroupLabel.trim()}
              >
                Stage group
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setAddingGroup(false);
                  setNewGroupLabel("");
                  setNewGroupItemsText("");
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearFeedback();
            setAddingGroup(true);
            setNewGroupLabel("");
            setNewGroupItemsText("");
          }}
          disabled={busy || unavailable}
        >
          + Add skill group
        </Button>
      )}
      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete skill ${deleteTarget.kind} “${deleteTarget.label}”?`}
          description="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={async () => {
            clearFeedback();
            try {
              if (deleteTarget.kind === "group")
                await deleteSkillGroup.mutateAsync(deleteTarget.id);
              else await deleteSkillItem.mutateAsync(deleteTarget.id);
              setIsError(false);
              setMessage("Removed from your draft.");
              setDeleteTarget(null);
            } catch (err) {
              setIsError(true);
              setMessage(handleMutationError(err));
              setDeleteTarget(null);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
          pending={deleting}
        />
      )}
      <FormMessage
        message={message}
        isError={isError}
        details={messageDetails}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Experience tab
// ---------------------------------------------------------------------------

type ExperienceDraft = {
  key: string;
  slug: string;
  slugTouched: boolean;
  role: string;
  organization: string;
  started: string;
  ended: string;
  current: boolean;
  description: string;
  highlightsText: string;
};

function blankExperienceDraft(): ExperienceDraft {
  return {
    key: "new",
    slug: "",
    slugTouched: false,
    role: "",
    organization: "",
    started: "",
    ended: "",
    current: false,
    description: "",
    highlightsText: "",
  };
}

function experienceDraftHasContent(draft: ExperienceDraft): boolean {
  return (
    draft.role.trim() !== "" ||
    draft.organization.trim() !== "" ||
    draft.started !== "" ||
    draft.ended !== "" ||
    draft.current ||
    draft.description.trim() !== "" ||
    draft.highlightsText.trim() !== "" ||
    draft.slugTouched
  );
}

function sortHighlights(exp: Pick<ApiExperience, "highlights">) {
  return [...(exp.highlights ?? [])].sort(
    (a, b) => a.display_order - b.display_order
  );
}

function experienceDraftProblems(
  draft: ExperienceDraft,
  isNew: boolean
): string[] {
  const problems: string[] = [];
  if (!draft.role.trim()) problems.push("Role is required.");
  if (!draft.organization.trim()) problems.push("Organization is required.");
  if (!draft.started) problems.push("Start month is required.");
  problems.push(
    ...dateProblems(
      {
        started: draft.started,
        ended: draft.ended || null,
        current: draft.current,
      },
      "experience"
    )
  );
  if (parseHighlights(draft.highlightsText) === null)
    problems.push(
      "Use 0–20 unique highlights, each 1–500 characters, one per line. Leave blank for none."
    );
  if (isNew && draft.slugTouched && !isSlug(draft.slug))
    problems.push(
      "Link address must use lowercase letters, numbers, and single hyphens (1–100 characters), with no surrounding spaces."
    );
  return problems;
}

export function ExperienceTab({
  experience,
  unavailable = false,
  ownerId = null,
  onDirtyChange,
  onControls,
}: {
  experience: ApiExperience[];
  unavailable?: boolean;
  ownerId?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onControls?: (controls: StepEditControls | null) => void;
}) {
  const [newDraft, setNewDraft] =
    useState<ExperienceDraft>(blankExperienceDraft);
  const [staged, setStaged] = useState<ExperienceDraft[]>([]);
  const [edits, setEdits] = useState<Record<number, ExperienceDraft>>({});
  const [openForm, setOpenForm] = useState<"new" | number | null>(null);
  const [showNewProblems, setShowNewProblems] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [messageDetails, setMessageDetails] = useState<string[] | undefined>();
  const [isError, setIsError] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const updateExperience = useUpdateExperience();
  const deleteExperience = useDeleteExperience();
  const addExperience = useAddExperience();
  const addHighlight = useAddExperienceHighlight();
  const updateHighlight = useUpdateExperienceHighlight();
  const deleteHighlight = useDeleteExperienceHighlight();

  const deleting = deleteExperience.isPending;
  const busy = savingAll || deleting;

  const clearFeedback = useCallback(() => {
    setMessage("");
    setMessageDetails(undefined);
    setIsError(false);
  }, []);

  const dirty =
    staged.length > 0 ||
    Object.keys(edits).length > 0 ||
    (openForm === "new" && experienceDraftHasContent(newDraft));

  const save = useCallback(async (): Promise<boolean> => {
    if (savingAll) return false;
    setSavingAll(true);
    clearFeedback();
    const failures: string[] = [];
    let savedCount = 0;
    let attempted = 0;

    // 1. Edited entries: PATCH the fields, then apply the bullet diff.
    for (const [idStr, draft] of Object.entries(edits)) {
      const id = Number(idStr);
      const original = experience.find((e) => e.id === id);
      attempted += 1;
      const problems = experienceDraftProblems(draft, false);
      if (problems.length > 0) {
        failures.push(
          `Experience “${original?.role ?? id}”: ${problems.join(" ")}`
        );
        continue;
      }
      try {
        await updateExperience.mutateAsync({
          id,
          body: {
            role: draft.role.trim(),
            organization: draft.organization.trim(),
            started: draft.started,
            ended: draft.ended || null,
            current: draft.current,
            description: draft.description,
          },
        });
        const next = parseHighlights(draft.highlightsText) ?? [];
        const current = sortHighlights(original ?? { highlights: [] });
        for (let i = 0; i < Math.min(current.length, next.length); i += 1) {
          if (current[i].text === next[i] && current[i].display_order === i)
            continue;
          try {
            await updateHighlight.mutateAsync({
              id: current[i].id,
              body: { text: next[i], display_order: i },
            });
          } catch (err) {
            failures.push(
              `Experience “${draft.role.trim()}” bullet ${i + 1}: ${handleMutationError(err)}`
            );
          }
        }
        for (let i = current.length; i < next.length; i += 1) {
          try {
            await addHighlight.mutateAsync({
              expId: id,
              body: { text: next[i], display_order: i },
            });
          } catch (err) {
            failures.push(
              `Experience “${draft.role.trim()}” bullet ${i + 1}: ${handleMutationError(err)}`
            );
          }
        }
        for (let i = next.length; i < current.length; i += 1) {
          try {
            await deleteHighlight.mutateAsync(current[i].id);
          } catch (err) {
            failures.push(
              `Experience “${draft.role.trim()}” bullet ${i + 1}: ${handleMutationError(err)}`
            );
          }
        }
        setEdits((draftMap) => {
          const next = { ...draftMap };
          delete next[id];
          return next;
        });
        savedCount += 1;
      } catch (err) {
        failures.push(
          `Experience “${original?.role ?? id}”: ${handleMutationError(err)}`
        );
      }
    }

    // 2. Staged new entries: one create call, highlights included. Slugs must
    // stay unique across the whole batch, not just against saved records.
    const usedSlugs = new Set<string>();
    for (const draft of staged) {
      attempted += 1;
      const problems = experienceDraftProblems(draft, true);
      if (problems.length > 0) {
        failures.push(
          `Experience “${draft.role.trim() || "new entry"}”: ${problems.join(" ")}`
        );
        continue;
      }
      const slug = draft.slugTouched
        ? draft.slug
        : generateSlug(
            [draft.role, draft.organization],
            [...experience.map((e) => e.slug), ...usedSlugs]
          );
      if (!isSlug(slug)) {
        failures.push(
          `Experience “${draft.role.trim() || "new entry"}”: could not create a unique link address.`
        );
        continue;
      }
      try {
        await addExperience.mutateAsync({
          slug,
          role: draft.role.trim(),
          organization: draft.organization.trim(),
          started: draft.started,
          ended: draft.ended || null,
          current: draft.current,
          description: draft.description,
          highlights: parseHighlights(draft.highlightsText) ?? [],
          display_order: experience.length,
        });
        usedSlugs.add(slug);
        setStaged((list) => list.filter((d) => d.key !== draft.key));
        savedCount += 1;
      } catch (err) {
        failures.push(
          `Experience “${draft.role.trim()}”: ${handleMutationError(err)}`
        );
      }
    }

    setSavingAll(false);
    if (failures.length > 0) {
      setIsError(true);
      setMessage(
        savedCount > 0
          ? `Saved ${savedCount} of ${attempted} experience entries. The rest need attention:`
          : "No experience entries were saved:"
      );
      setMessageDetails(failures);
      return false;
    }
    if (savedCount > 0)
      setMessage(
        `Saved ${savedCount} experience ${savedCount === 1 ? "entry" : "entries"} to your draft.`
      );
    return true;
  }, [
    savingAll,
    edits,
    staged,
    experience,
    clearFeedback,
    updateExperience,
    addExperience,
    addHighlight,
    updateHighlight,
    deleteHighlight,
  ]);

  const discard = useCallback(() => {
    setStaged([]);
    setEdits({});
    setNewDraft(blankExperienceDraft());
    setOpenForm(null);
    setShowNewProblems(false);
    clearFeedback();
  }, [clearFeedback]);

  useStepEdits({
    dirty,
    unavailable,
    save,
    discard,
    onDirtyChange,
    onControls,
  });

  const startEdit = (exp: ApiExperience) => {
    clearFeedback();
    setOpenForm(exp.id);
    setNewDraft(blankExperienceDraft());
    setEdits(
      (drafts) =>
        drafts[exp.id] ?? {
          ...drafts,
          [exp.id]: {
            key: String(exp.id),
            slug: exp.slug,
            slugTouched: true,
            role: exp.role,
            organization: exp.organization,
            started: exp.started,
            ended: exp.ended ?? "",
            current: exp.current,
            description: exp.description,
            highlightsText: sortHighlights(exp)
              .map((h) => h.text)
              .join("\n"),
          },
        }
    );
  };

  const openAdd = () => {
    clearFeedback();
    setShowNewProblems(false);
    setOpenForm("new");
    setNewDraft(blankExperienceDraft());
  };

  const stageNew = () => {
    const problems = experienceDraftProblems(newDraft, true);
    if (problems.length > 0) {
      setShowNewProblems(true);
      return;
    }
    setStaged((list) => [
      ...list,
      { ...newDraft, key: `new-${crypto.randomUUID()}` },
    ]);
    setNewDraft(blankExperienceDraft());
    setOpenForm(null);
    setShowNewProblems(false);
  };

  const newProblems = experienceDraftProblems(newDraft, true);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {experience.map((exp) => {
          const draft = edits[exp.id];
          const bullets = sortHighlights(exp);
          return (
            <div
              key={exp.id}
              className="flex items-start justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-sm">
                  {exp.role}
                  {draft && <Badge variant="outline">Unsaved edits</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {exp.organization} · {exp.started}–{exp.ended ?? "Present"}
                </p>
                {bullets.length > 0 && (
                  <details className="mt-1 text-xs">
                    <summary className="w-fit cursor-pointer rounded text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4">
                      View {bullets.length} achievement{" "}
                      {bullets.length === 1 ? "bullet" : "bullets"}
                    </summary>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                      {bullets.map((bullet) => (
                        <li key={bullet.id}>{bullet.text}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <RecordActionButtons
                recordTitle={exp.role}
                onEdit={() => startEdit(exp)}
                onDelete={() => {
                  setDeleteTarget({ id: exp.id, label: exp.role });
                  clearFeedback();
                }}
                disabled={busy || unavailable}
              />
            </div>
          );
        })}

        {staged.map((draft) => (
          <div
            key={draft.key}
            className="flex items-start justify-between gap-3 rounded-md border border-dashed p-3"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium text-sm">
                {draft.role.trim() || "New experience"}
                <Badge variant="outline">Unsaved</Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                {draft.organization || "—"} · {draft.started || "?"}–
                {draft.ended || "Present"}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove unsaved experience entry"
              title="Remove unsaved experience entry"
              onClick={() =>
                setStaged((list) => list.filter((d) => d.key !== draft.key))
              }
              disabled={busy}
            >
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>

      {experience.length === 0 && staged.length === 0 && openForm !== "new" && (
        <p className="text-sm text-muted-foreground">
          No experience yet. Add the roles that shaped your work.
        </p>
      )}

      {openForm === "new" ? (
        <ExperienceDraftCard
          mode="new"
          draft={newDraft}
          problems={showNewProblems ? newProblems : []}
          busy={busy}
          unavailable={unavailable}
          ownerId={ownerId}
          existingSlugs={experience.map((e) => e.slug)}
          onChange={(patch) => setNewDraft((d) => ({ ...d, ...patch }))}
          onPrimary={stageNew}
          onSecondary={() => {
            setOpenForm(null);
            setShowNewProblems(false);
          }}
          primaryLabel="Stage entry"
          secondaryLabel="Cancel"
        />
      ) : null}

      {typeof openForm === "number" && edits[openForm] ? (
        <ExperienceDraftCard
          mode="edit"
          draft={edits[openForm]}
          problems={experienceDraftProblems(edits[openForm], false)}
          busy={busy}
          unavailable={unavailable}
          ownerId={ownerId}
          existingSlugs={[]}
          onChange={(patch) =>
            setEdits((drafts) => ({
              ...drafts,
              [openForm]: { ...drafts[openForm], ...patch },
            }))
          }
          onPrimary={() => setOpenForm(null)}
          onSecondary={() => {
            setEdits((drafts) => {
              const next = { ...drafts };
              delete next[openForm];
              return next;
            });
            setOpenForm(null);
          }}
          primaryLabel="Done"
          secondaryLabel="Revert edits"
        />
      ) : null}

      {openForm === null && (
        <Button
          variant="outline"
          size="sm"
          onClick={openAdd}
          disabled={busy || unavailable}
        >
          + Add experience
        </Button>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete experience “${deleteTarget.label}”?`}
          description="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={async () => {
            clearFeedback();
            try {
              await deleteExperience.mutateAsync(deleteTarget.id);
              setIsError(false);
              setMessage("Removed from your draft.");
              setDeleteTarget(null);
            } catch (err) {
              setIsError(true);
              setMessage(handleMutationError(err));
              setDeleteTarget(null);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
          pending={deleting}
        />
      )}
      <FormMessage
        message={message}
        isError={isError}
        details={messageDetails}
      />
    </div>
  );
}

function ExperienceDraftCard({
  mode,
  draft,
  problems,
  busy,
  unavailable,
  ownerId,
  existingSlugs,
  onChange,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
}: {
  mode: "new" | "edit";
  draft: ExperienceDraft;
  problems: string[];
  busy: boolean;
  unavailable: boolean;
  ownerId: string | null;
  existingSlugs: string[];
  onChange: (patch: Partial<ExperienceDraft>) => void;
  onPrimary: () => void;
  onSecondary: () => void;
  primaryLabel: string;
  secondaryLabel: string;
}) {
  const derivedSlug = draft.slugTouched
    ? draft.slug
    : generateSlug([draft.role, draft.organization], existingSlugs);
  const readOnly = busy || unavailable;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {mode === "new" ? "New experience entry" : "Editing experience"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="exp-role">
              Role
            </label>
            <input
              id="exp-role"
              className={inputClassName}
              value={draft.role}
              onChange={(e) => onChange({ role: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <label
              className="block text-sm font-medium"
              htmlFor="exp-organization"
            >
              Organization
            </label>
            <input
              id="exp-organization"
              className={inputClassName}
              value={draft.organization}
              onChange={(e) => onChange({ organization: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="exp-started">
              Started (month and year)
            </label>
            <input
              id="exp-started"
              type="month"
              placeholder="YYYY-MM"
              className={inputClassName}
              value={draft.started}
              onChange={(e) => onChange({ started: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="exp-ended">
              Ended (month and year)
            </label>
            <input
              id="exp-ended"
              type="month"
              placeholder="YYYY-MM"
              className={inputClassName}
              value={draft.ended}
              onChange={(e) => onChange({ ended: e.target.value })}
              disabled={readOnly || draft.current}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="exp-current"
            checked={draft.current}
            onChange={(e) =>
              onChange({
                current: e.target.checked,
                ...(e.target.checked ? { ended: "" } : {}),
              })
            }
            disabled={readOnly}
          />
          <label htmlFor="exp-current" className="text-sm">
            Currently working here
          </label>
        </div>
        <div className="space-y-1">
          <label
            className="block text-sm font-medium"
            htmlFor="exp-description"
          >
            Description (optional)
          </label>
          <textarea
            id="exp-description"
            className={`${inputClassName} min-h-[60px]`}
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={readOnly}
          />
          <FieldAiWriting
            section="experience"
            field="description"
            ownerId={ownerId}
            currentText={draft.description}
            facts={manualFacts("experience", "description", {
              role: draft.role,
              organization: draft.organization,
              started: draft.started,
              ended: draft.ended,
            })}
            disabled={readOnly}
            onUse={(text) => onChange({ description: text })}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="exp-highlights">
            Highlights (optional)
          </label>
          <textarea
            id="exp-highlights"
            className={`${inputClassName} min-h-[60px]`}
            value={draft.highlightsText}
            onChange={(e) => onChange({ highlightsText: e.target.value })}
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">
            One achievement bullet per line, up to 20. Leave blank for none.
          </p>
        </div>
        {mode === "new" ? (
          <details className="text-sm">
            <summary className="w-fit cursor-pointer rounded text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4">
              Advanced
            </summary>
            <div className="mt-2 space-y-1">
              <label className="block text-sm font-medium" htmlFor="exp-slug">
                Link address (slug)
              </label>
              <input
                id="exp-slug"
                className={inputClassName}
                value={derivedSlug}
                onChange={(e) =>
                  onChange({ slug: e.target.value, slugTouched: true })
                }
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Created for you from the role and organization. Only change it
                if you need an exact address.
              </p>
            </div>
          </details>
        ) : null}
        {problems.length > 0 && (
          <div role="alert" className="space-y-1 text-sm text-destructive">
            <p>Fix these before saving:</p>
            <ul className="list-disc space-y-1 pl-5">
              {problems.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={onPrimary} disabled={busy}>
            {primaryLabel}
          </Button>
          <Button variant="outline" onClick={onSecondary} disabled={busy}>
            {secondaryLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Education tab
// ---------------------------------------------------------------------------

type EducationDraft = {
  key: string;
  slug: string;
  slugTouched: boolean;
  qualification: string;
  institution: string;
  started: string;
  ended: string;
};

function blankEducationDraft(): EducationDraft {
  return {
    key: "new",
    slug: "",
    slugTouched: false,
    qualification: "",
    institution: "",
    started: "",
    ended: "",
  };
}

function educationDraftHasContent(draft: EducationDraft): boolean {
  return (
    draft.qualification.trim() !== "" ||
    draft.institution.trim() !== "" ||
    draft.started !== "" ||
    draft.ended !== "" ||
    draft.slugTouched
  );
}

function educationDraftProblems(
  draft: EducationDraft,
  isNew: boolean
): string[] {
  const problems: string[] = [];
  if (!draft.qualification.trim()) problems.push("Qualification is required.");
  if (!draft.institution.trim()) problems.push("Institution is required.");
  problems.push(
    ...dateProblems(
      { started: draft.started || null, ended: draft.ended || null },
      "education"
    )
  );
  if (isNew && draft.slugTouched && !isSlug(draft.slug))
    problems.push(
      "Link address must use lowercase letters, numbers, and single hyphens (1–100 characters), with no surrounding spaces."
    );
  return problems;
}

export function EducationTab({
  education,
  unavailable = false,
  onDirtyChange,
  onControls,
}: {
  education: ApiEducation[];
  unavailable?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onControls?: (controls: StepEditControls | null) => void;
}) {
  const [newDraft, setNewDraft] = useState<EducationDraft>(blankEducationDraft);
  const [staged, setStaged] = useState<EducationDraft[]>([]);
  const [edits, setEdits] = useState<Record<number, EducationDraft>>({});
  const [openForm, setOpenForm] = useState<"new" | number | null>(null);
  const [showNewProblems, setShowNewProblems] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [messageDetails, setMessageDetails] = useState<string[] | undefined>();
  const [isError, setIsError] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const updateEducation = useUpdateEducation();
  const deleteEducation = useDeleteEducation();
  const addEducation = useAddEducation();

  const deleting = deleteEducation.isPending;
  const busy = savingAll || deleting;

  const clearFeedback = useCallback(() => {
    setMessage("");
    setMessageDetails(undefined);
    setIsError(false);
  }, []);

  const dirty =
    staged.length > 0 ||
    Object.keys(edits).length > 0 ||
    (openForm === "new" && educationDraftHasContent(newDraft));

  const save = useCallback(async (): Promise<boolean> => {
    if (savingAll) return false;
    setSavingAll(true);
    clearFeedback();
    const failures: string[] = [];
    let savedCount = 0;
    let attempted = 0;

    for (const [idStr, draft] of Object.entries(edits)) {
      const id = Number(idStr);
      const original = education.find((e) => e.id === id);
      attempted += 1;
      const problems = educationDraftProblems(draft, false);
      if (problems.length > 0) {
        failures.push(
          `Education “${original?.qualification ?? id}”: ${problems.join(" ")}`
        );
        continue;
      }
      try {
        await updateEducation.mutateAsync({
          id,
          body: {
            qualification: draft.qualification.trim(),
            institution: draft.institution.trim(),
            started: draft.started || null,
            ended: draft.ended || null,
          },
        });
        setEdits((draftMap) => {
          const next = { ...draftMap };
          delete next[id];
          return next;
        });
        savedCount += 1;
      } catch (err) {
        failures.push(
          `Education “${original?.qualification ?? id}”: ${handleMutationError(err)}`
        );
      }
    }

    const usedSlugs = new Set<string>();
    for (const draft of staged) {
      attempted += 1;
      const problems = educationDraftProblems(draft, true);
      if (problems.length > 0) {
        failures.push(
          `Education “${draft.qualification.trim() || "new entry"}”: ${problems.join(" ")}`
        );
        continue;
      }
      const slug = draft.slugTouched
        ? draft.slug
        : generateSlug(
            [draft.qualification, draft.institution],
            [...education.map((e) => e.slug), ...usedSlugs]
          );
      if (!isSlug(slug)) {
        failures.push(
          `Education “${draft.qualification.trim() || "new entry"}”: could not create a unique link address.`
        );
        continue;
      }
      try {
        await addEducation.mutateAsync({
          slug,
          qualification: draft.qualification.trim(),
          institution: draft.institution.trim(),
          started: draft.started || null,
          ended: draft.ended || null,
          display_order: education.length,
        });
        usedSlugs.add(slug);
        setStaged((list) => list.filter((d) => d.key !== draft.key));
        savedCount += 1;
      } catch (err) {
        failures.push(
          `Education “${draft.qualification.trim()}”: ${handleMutationError(err)}`
        );
      }
    }

    setSavingAll(false);
    if (failures.length > 0) {
      setIsError(true);
      setMessage(
        savedCount > 0
          ? `Saved ${savedCount} of ${attempted} education entries. The rest need attention:`
          : "No education entries were saved:"
      );
      setMessageDetails(failures);
      return false;
    }
    if (savedCount > 0)
      setMessage(
        `Saved ${savedCount} education ${savedCount === 1 ? "entry" : "entries"} to your draft.`
      );
    return true;
  }, [
    savingAll,
    edits,
    staged,
    education,
    clearFeedback,
    updateEducation,
    addEducation,
  ]);

  const discard = useCallback(() => {
    setStaged([]);
    setEdits({});
    setNewDraft(blankEducationDraft());
    setOpenForm(null);
    setShowNewProblems(false);
    clearFeedback();
  }, [clearFeedback]);

  useStepEdits({
    dirty,
    unavailable,
    save,
    discard,
    onDirtyChange,
    onControls,
  });

  const startEdit = (edu: ApiEducation) => {
    clearFeedback();
    setOpenForm(edu.id);
    setNewDraft(blankEducationDraft());
    setEdits(
      (drafts) =>
        drafts[edu.id] ?? {
          ...drafts,
          [edu.id]: {
            key: String(edu.id),
            slug: edu.slug,
            slugTouched: true,
            qualification: edu.qualification,
            institution: edu.institution,
            started: edu.started ?? "",
            ended: edu.ended ?? "",
          },
        }
    );
  };

  const stageNew = () => {
    const problems = educationDraftProblems(newDraft, true);
    if (problems.length > 0) {
      setShowNewProblems(true);
      return;
    }
    setStaged((list) => [
      ...list,
      { ...newDraft, key: `new-${crypto.randomUUID()}` },
    ]);
    setNewDraft(blankEducationDraft());
    setOpenForm(null);
    setShowNewProblems(false);
  };

  const newProblems = educationDraftProblems(newDraft, true);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {education.map((edu) => {
          const draft = edits[edu.id];
          return (
            <div
              key={edu.id}
              className="flex items-start justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-sm">
                  {edu.qualification}
                  {draft && <Badge variant="outline">Unsaved edits</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {edu.institution}
                  {edu.started || edu.ended
                    ? ` · ${edu.started ?? "?"}–${edu.ended ?? "Present"}`
                    : ""}
                </p>
              </div>
              <RecordActionButtons
                recordTitle={edu.qualification}
                onEdit={() => startEdit(edu)}
                onDelete={() => {
                  setDeleteTarget({ id: edu.id, label: edu.qualification });
                  clearFeedback();
                }}
                disabled={busy || unavailable}
              />
            </div>
          );
        })}

        {staged.map((draft) => (
          <div
            key={draft.key}
            className="flex items-start justify-between gap-3 rounded-md border border-dashed p-3"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium text-sm">
                {draft.qualification.trim() || "New education"}
                <Badge variant="outline">Unsaved</Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                {draft.institution || "—"}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove unsaved education entry"
              title="Remove unsaved education entry"
              onClick={() =>
                setStaged((list) => list.filter((d) => d.key !== draft.key))
              }
              disabled={busy}
            >
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>

      {education.length === 0 && staged.length === 0 && openForm !== "new" && (
        <p className="text-sm text-muted-foreground">
          No education yet. Add the qualifications you want to show.
        </p>
      )}

      {openForm === "new" ? (
        <EducationDraftCard
          mode="new"
          draft={newDraft}
          problems={showNewProblems ? newProblems : []}
          busy={busy}
          unavailable={unavailable}
          existingSlugs={education.map((e) => e.slug)}
          onChange={(patch) => setNewDraft((d) => ({ ...d, ...patch }))}
          onPrimary={stageNew}
          onSecondary={() => {
            setOpenForm(null);
            setShowNewProblems(false);
          }}
          primaryLabel="Stage entry"
          secondaryLabel="Cancel"
        />
      ) : null}

      {typeof openForm === "number" && edits[openForm] ? (
        <EducationDraftCard
          mode="edit"
          draft={edits[openForm]}
          problems={educationDraftProblems(edits[openForm], false)}
          busy={busy}
          unavailable={unavailable}
          existingSlugs={[]}
          onChange={(patch) =>
            setEdits((drafts) => ({
              ...drafts,
              [openForm]: { ...drafts[openForm], ...patch },
            }))
          }
          onPrimary={() => setOpenForm(null)}
          onSecondary={() => {
            setEdits((drafts) => {
              const next = { ...drafts };
              delete next[openForm];
              return next;
            });
            setOpenForm(null);
          }}
          primaryLabel="Done"
          secondaryLabel="Revert edits"
        />
      ) : null}

      {openForm === null && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearFeedback();
            setShowNewProblems(false);
            setOpenForm("new");
            setNewDraft(blankEducationDraft());
          }}
          disabled={busy || unavailable}
        >
          + Add education
        </Button>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete education “${deleteTarget.label}”?`}
          description="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={async () => {
            clearFeedback();
            try {
              await deleteEducation.mutateAsync(deleteTarget.id);
              setIsError(false);
              setMessage("Removed from your draft.");
              setDeleteTarget(null);
            } catch (err) {
              setIsError(true);
              setMessage(handleMutationError(err));
              setDeleteTarget(null);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
          pending={deleting}
        />
      )}
      <FormMessage
        message={message}
        isError={isError}
        details={messageDetails}
      />
    </div>
  );
}

function EducationDraftCard({
  mode,
  draft,
  problems,
  busy,
  unavailable,
  existingSlugs,
  onChange,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
}: {
  mode: "new" | "edit";
  draft: EducationDraft;
  problems: string[];
  busy: boolean;
  unavailable: boolean;
  existingSlugs: string[];
  onChange: (patch: Partial<EducationDraft>) => void;
  onPrimary: () => void;
  onSecondary: () => void;
  primaryLabel: string;
  secondaryLabel: string;
}) {
  const derivedSlug = draft.slugTouched
    ? draft.slug
    : generateSlug([draft.qualification, draft.institution], existingSlugs);
  const readOnly = busy || unavailable;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {mode === "new" ? "New education entry" : "Editing education"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              className="block text-sm font-medium"
              htmlFor="edu-qualification"
            >
              Qualification
            </label>
            <input
              id="edu-qualification"
              className={inputClassName}
              value={draft.qualification}
              onChange={(e) => onChange({ qualification: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <label
              className="block text-sm font-medium"
              htmlFor="edu-institution"
            >
              Institution
            </label>
            <input
              id="edu-institution"
              className={inputClassName}
              value={draft.institution}
              onChange={(e) => onChange({ institution: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="edu-started">
              Started (month and year, optional)
            </label>
            <input
              id="edu-started"
              type="month"
              placeholder="YYYY-MM"
              className={inputClassName}
              value={draft.started}
              onChange={(e) => onChange({ started: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="edu-ended">
              Ended (month and year, optional)
            </label>
            <input
              id="edu-ended"
              type="month"
              placeholder="YYYY-MM"
              className={inputClassName}
              value={draft.ended}
              onChange={(e) => onChange({ ended: e.target.value })}
              disabled={readOnly}
            />
          </div>
        </div>
        {mode === "new" ? (
          <details className="text-sm">
            <summary className="w-fit cursor-pointer rounded text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4">
              Advanced
            </summary>
            <div className="mt-2 space-y-1">
              <label className="block text-sm font-medium" htmlFor="edu-slug">
                Link address (slug)
              </label>
              <input
                id="edu-slug"
                className={inputClassName}
                value={derivedSlug}
                onChange={(e) =>
                  onChange({ slug: e.target.value, slugTouched: true })
                }
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Created for you from the qualification and institution. Only
                change it if you need an exact address.
              </p>
            </div>
          </details>
        ) : null}
        {problems.length > 0 && (
          <div role="alert" className="space-y-1 text-sm text-destructive">
            <p>Fix these before saving:</p>
            <ul className="list-disc space-y-1 pl-5">
              {problems.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={onPrimary} disabled={busy}>
            {primaryLabel}
          </Button>
          <Button variant="outline" onClick={onSecondary} disabled={busy}>
            {secondaryLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Contact tab
// ---------------------------------------------------------------------------

export function ContactTab({
  contact,
  unavailable = false,
  onDirtyChange,
  onControls,
}: {
  contact: ApiContact | null;
  unavailable?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onControls?: (controls: StepEditControls | null) => void;
}) {
  const saved = useMemo(
    () => ({
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
    }),
    [contact]
  );
  const [values, setValues] = useState(saved);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState({ label: "", url: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState({ label: "", url: "" });
  const [pendingRemoval, setPendingRemoval] = useState<ApiContactLink | null>(
    null
  );

  const updateContact = useUpdateContact();
  const addLink = useAddContactLink();
  const updateLink = useUpdateContactLink();
  const deleteLink = useDeleteContactLink();

  const links = useMemo(() => contact?.links ?? [], [contact]);
  const linksBusy =
    addLink.isPending || updateLink.isPending || deleteLink.isPending;

  const dirty = values.phone !== saved.phone || values.email !== saved.email;

  const save = useCallback(async (): Promise<boolean> => {
    const email = values.email.trim();
    if (email && !isValidEmail(email)) {
      setIsError(true);
      setMessage("Check this email address.");
      return false;
    }
    setSaving(true);
    setMessage("");
    try {
      await updateContact.mutateAsync({
        phone: values.phone || null,
        email: values.email || null,
      });
      setIsError(false);
      setMessage("Saved to your draft.");
      return true;
    } catch (err) {
      setIsError(true);
      setMessage(
        err instanceof Error
          ? err.message
          : "Saving the contact failed. Check the API and try again."
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [values, updateContact]);

  const discard = useCallback(() => {
    setValues(saved);
    setMessage("");
    setIsError(false);
  }, [saved]);

  useStepEdits({
    dirty,
    unavailable,
    save,
    discard,
    onDirtyChange,
    onControls,
  });

  const report = useCallback((err: unknown, fallback: string) => {
    setIsError(true);
    setMessage(err instanceof Error && err.message ? err.message : fallback);
  }, []);

  const addNewLink = useCallback(async () => {
    const label = draft.label.trim();
    const url = draft.url.trim();
    if (!label || !isAbsoluteHttpUrl(url)) {
      setIsError(true);
      setMessage("Add a label and a full https:// or http:// URL.");
      return;
    }
    const displayOrder = links.reduce(
      (max, link) => Math.max(max, link.display_order),
      -1
    );
    setMessage("");
    try {
      await addLink.mutateAsync({
        label,
        url,
        display_order: displayOrder + 1,
      });
      setIsError(false);
      setMessage("Link added to your draft.");
      setDraft({ label: "", url: "" });
    } catch (err) {
      report(err, "Adding the link failed. Check the API and try again.");
    }
  }, [draft, links, addLink, report]);

  const startEdit = useCallback((link: ApiContactLink) => {
    setEditingId(link.id);
    setEditValues({ label: link.label, url: link.url });
    setMessage("");
    setIsError(false);
  }, []);

  const saveEdit = useCallback(async () => {
    if (editingId === null) return;
    const label = editValues.label.trim();
    const url = editValues.url.trim();
    if (!label || !isAbsoluteHttpUrl(url)) {
      setIsError(true);
      setMessage("Add a label and a full https:// or http:// URL.");
      return;
    }
    setMessage("");
    try {
      await updateLink.mutateAsync({ id: editingId, body: { label, url } });
      setIsError(false);
      setMessage("Link updated in your draft.");
      setEditingId(null);
    } catch (err) {
      report(err, "Saving the link failed. Check the API and try again.");
    }
  }, [editingId, editValues, updateLink, report]);

  const confirmRemoval = useCallback(async () => {
    if (!pendingRemoval) return;
    const target = pendingRemoval;
    setMessage("");
    try {
      await deleteLink.mutateAsync(target.id);
      setIsError(false);
      setMessage("Link removed from your draft.");
      setPendingRemoval(null);
      if (editingId === target.id) setEditingId(null);
    } catch (err) {
      report(err, "Removing the link failed. Check the API and try again.");
    }
  }, [pendingRemoval, deleteLink, editingId, report]);

  const linkField = (
    value: string,
    onChange: (v: string) => void,
    extra: Record<string, string>
  ) => (
    <input
      className={inputClassName}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={linksBusy}
      {...extra}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="contact-email">
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            className={inputClassName}
            value={values.email}
            onChange={(e) =>
              setValues((v) => ({ ...v, email: e.target.value }))
            }
            disabled={unavailable || saving}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="contact-phone">
            Phone
          </label>
          <input
            id="contact-phone"
            type="tel"
            className={inputClassName}
            value={values.phone}
            onChange={(e) =>
              setValues((v) => ({ ...v, phone: e.target.value }))
            }
            disabled={unavailable || saving}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Social links</p>
          <p className="text-xs text-muted-foreground">
            Social link changes save immediately; email and phone save with the
            step.
          </p>
          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No social links yet. Add the profiles you want visitors to reach.
            </p>
          )}
          <ul className="space-y-2">
            {links.map((link) =>
              editingId === link.id ? (
                <li
                  key={link.id}
                  className="space-y-2 rounded-md border bg-muted/40 p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
                    <div className="space-y-1">
                      <label
                        className="block text-xs font-medium"
                        htmlFor={`link-label-${link.id}`}
                      >
                        Label
                      </label>
                      {linkField(
                        editValues.label,
                        (v) => setEditValues((e) => ({ ...e, label: v })),
                        {
                          id: `link-label-${link.id}`,
                        }
                      )}
                    </div>
                    <div className="space-y-1">
                      <label
                        className="block text-xs font-medium"
                        htmlFor={`link-url-${link.id}`}
                      >
                        URL
                      </label>
                      {linkField(
                        editValues.url,
                        (v) => setEditValues((e) => ({ ...e, url: v })),
                        {
                          id: `link-url-${link.id}`,
                          inputMode: "url",
                        }
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={saveEdit}
                      disabled={
                        linksBusy ||
                        !editValues.label.trim() ||
                        !editValues.url.trim()
                      }
                    >
                      {updateLink.isPending ? "Saving…" : "Save link"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      disabled={linksBusy}
                    >
                      Cancel
                    </Button>
                  </div>
                </li>
              ) : (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                >
                  <span className="min-w-24 font-medium">{link.label}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {link.url}
                  </span>
                  <RecordActionButtons
                    recordTitle={`${link.label} link`}
                    onEdit={() => startEdit(link)}
                    onDelete={() => setPendingRemoval(link)}
                    disabled={linksBusy || unavailable}
                  />
                </li>
              )
            )}
          </ul>
          <div className="grid gap-2 rounded-md border bg-muted/40 p-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="space-y-1">
              <label
                className="block text-xs font-medium"
                htmlFor="new-link-label"
              >
                Label
              </label>
              {linkField(
                draft.label,
                (v) => setDraft((d) => ({ ...d, label: v })),
                {
                  id: "new-link-label",
                  placeholder: "Facebook",
                }
              )}
            </div>
            <div className="space-y-1">
              <label
                className="block text-xs font-medium"
                htmlFor="new-link-url"
              >
                URL
              </label>
              {linkField(
                draft.url,
                (v) => setDraft((d) => ({ ...d, url: v })),
                {
                  id: "new-link-url",
                  inputMode: "url",
                  placeholder: "https://www.instagram.com/username/",
                }
              )}
            </div>
            <div className="sm:col-span-2">
              <Button
                size="sm"
                onClick={addNewLink}
                disabled={
                  linksBusy ||
                  unavailable ||
                  !draft.label.trim() ||
                  !draft.url.trim()
                }
              >
                {addLink.isPending ? "Adding…" : "Add link"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Saved links appear as icons on the live site once published.
          </p>
        </div>
        <FormMessage message={message} isError={isError} />
      </CardContent>
      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Remove ${pendingRemoval?.label ?? "link"}?`}
        description="The link stops appearing on the live site after you publish."
        confirmLabel="Remove link"
        cancelLabel="Keep link"
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
        pending={deleteLink.isPending}
        pendingLabel="Removing…"
      />
    </Card>
  );
}
