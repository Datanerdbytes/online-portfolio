"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ApiContact,
  ApiEducation,
  ApiExperience,
  ApiProfile,
  ApiSkillGroup,
} from "@/lib/api";

const TIMEOUT_MS = 10000;
const HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "online-resume-admin",
};

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

async function apiPatch(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`/api/resume${path}`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

function statusMessage(status: number): string {
  if (status === 401 || status === 403)
    return "Session expired. Sign in again in another tab, then retry.";
  if (status === 404)
    return "Record not found. Refresh the page and try again.";
  if (status === 0) return "Request timed out or network error. Try again.";
  return "Unexpected error. Please try again.";
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

  const save = useCallback(async () => {
    setSaving(true);
    setMessage("");
    const result = await apiPatch("/profile", {
      name: values.name,
      headline: values.headline,
      introduction: values.introduction,
      about: values.about,
      location: values.location || null,
    });
    setSaving(false);
    if (result.ok) {
      setIsError(false);
      setMessage("Saved. Reload the public page to see the change.");
    } else {
      setIsError(true);
      setMessage(statusMessage(result.status));
    }
  }, [values]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
  const [editingItem, setEditingItem] = useState<{
    id: number;
    item: string;
  } | null>(null);
  const [itemValue, setItemValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const saveItem = useCallback(async () => {
    if (!editingItem) return;
    setSaving(true);
    setMessage("");
    const result = await apiPatch(`/skills/items/${editingItem.id}`, {
      item: itemValue,
    });
    setSaving(false);
    if (result.ok) {
      setIsError(false);
      setMessage("Saved. Reload the public page to see it.");
      setEditingItem(null);
    } else {
      setIsError(true);
      setMessage(statusMessage(result.status));
    }
  }, [editingItem, itemValue]);

  return (
    <div className="space-y-4">
      {skills.map((group) => (
        <Card key={group.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{group.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  {editingItem?.id === item.id ? (
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingItem(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span>{item.item}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingItem(item);
                          setItemValue(item.item);
                          setMessage("");
                        }}
                      >
                        Edit
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      {message && (
        <p
          className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message}
        </p>
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

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
    setSaving(true);
    const result = await apiPatch(`/experience/${editing.id}`, {
      role: values.role,
      organization: values.organization,
      started: values.started,
      ended: values.ended || null,
      current: values.current,
      description: values.description,
    });
    setSaving(false);
    if (result.ok) {
      setIsError(false);
      setMessage("Saved. Reload the public page to see the change.");
    } else {
      setIsError(true);
      setMessage(statusMessage(result.status));
    }
  }, [editing, values]);

  const saveNew = useCallback(async () => {
    setSaving(true);
    setMessage("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/resume/experience", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          slug: newValues.slug,
          role: newValues.role,
          organization: newValues.organization,
          started: newValues.started,
          ended: newValues.ended || null,
          current: newValues.current,
          description: newValues.description,
          display_order: experience.length,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      setSaving(false);
      if (res.ok) {
        setIsError(false);
        setMessage("Added. Refresh to see the new entry in the list.");
        setAdding(false);
        setNewValues({ slug: "", role: "", organization: "", started: "", ended: "", current: false, description: "" });
      } else {
        setIsError(true);
        setMessage(statusMessage(res.status));
      }
    } catch {
      clearTimeout(timeout);
      setSaving(false);
      setIsError(true);
      setMessage(statusMessage(0));
    }
  }, [newValues, experience.length]);

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
            <Button size="sm" variant="outline" onClick={() => startEdit(exp)}>
              Edit
            </Button>
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const startEdit = (edu: ApiEducation) => {
    setAdding(false);
    setEditing(edu);
    setValues({ qualification: edu.qualification, institution: edu.institution, started: edu.started ?? "", ended: edu.ended ?? "" });
    setMessage("");
  };

  const save = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    const result = await apiPatch(`/education/${editing.id}`, {
      qualification: values.qualification,
      institution: values.institution,
      started: values.started || null,
      ended: values.ended || null,
    });
    setSaving(false);
    if (result.ok) { setIsError(false); setMessage("Saved. Reload the public page to see the change."); }
    else { setIsError(true); setMessage(statusMessage(result.status)); }
  }, [editing, values]);

  const saveNew = useCallback(async () => {
    setSaving(true);
    setMessage("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/resume/education", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          slug: newValues.slug,
          qualification: newValues.qualification,
          institution: newValues.institution,
          started: newValues.started || null,
          ended: newValues.ended || null,
          display_order: education.length,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      setSaving(false);
      if (res.ok) {
        setIsError(false);
        setMessage("Added. Refresh to see it in the list.");
        setAdding(false);
        setNewValues({ slug: "", qualification: "", institution: "", started: "", ended: "" });
      } else {
        setIsError(true);
        setMessage(statusMessage(res.status));
      }
    } catch {
      clearTimeout(timeout);
      setSaving(false);
      setIsError(true);
      setMessage(statusMessage(0));
    }
  }, [newValues, education.length]);

  return (
    <div className="space-y-4">
      {education.map((edu) => (
        <div key={edu.id} className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="font-medium text-sm">{edu.qualification}</p>
            <p className="text-xs text-muted-foreground">{edu.institution} · {edu.started}–{edu.ended}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => startEdit(edu)}>Edit</Button>
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    setMessage("");
    const result = await apiPatch("/contact", {
      phone: values.phone || null,
      email: values.email || null,
    });
    setSaving(false);
    if (result.ok) {
      setIsError(false);
      setMessage("Saved. Reload the public page to see the change.");
    } else {
      setIsError(true);
      setMessage(statusMessage(result.status));
    }
  }, [values]);

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
      {tab === "profile" && <ProfileTab profile={profile} />}
      {tab === "skills" && <SkillsTab skills={skills} />}
      {tab === "experience" && <ExperienceTab experience={experience} />}
      {tab === "education" && <EducationTab education={education} />}
      {tab === "contact" && <ContactTab contact={contact} />}
    </div>
  );
}
