export type ResumeContent = {
  label: string;
  intro: string;
  about: string;
  skills: {
    label: string;
    items: string[];
  }[];
  experience: {
    label: string;
    items: Experience[];
  }[];
  contact: {
    label: string;
    note: string;
  };
};

export type Experience = {
  role: string;
  organization: string;
  period: string;
  summary: string;
};

// Placeholder resume content. Every entry below is an example placeholder
// and must be replaced with real resume details supplied by the owner.
// Do not treat any name, employer, degree, date, or project as factual.
export const resume: ResumeContent = {
  label: "Placeholder resume content — replace with real details",
  intro: "Online resume and portfolio (starter).",
  about:
    "This is a starter landing page. All resume entries below are clearly " +
    "labeled placeholders and contain no real personal information.",
  skills: [
    {
      label: "Example skill area (placeholder)",
      items: ["Example skill 1", "Example skill 2", "Example skill 3"],
    },
  ],
  experience: [
    {
      label: "Experience (placeholder)",
      items: [
        {
          role: "Example role",
          organization: "Example organization",
          period: "Example period",
          summary:
            "This experience entry is a placeholder. Replace with real details.",
        },
      ],
    },
  ],
  contact: {
    label: "Contact (placeholder)",
    note:
      "No real contact details are provided. This is a starter placeholder.",
  },
};
