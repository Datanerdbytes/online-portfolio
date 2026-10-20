export type SkillGroup = {
  label: string;
  items: string[];
};

export type Experience = {
  isSample: boolean;
  id: string;
  role: string;
  organization: string;
  started: string;
  ended?: string;
  current: boolean;
  description: string;
  highlights?: string[];
};

export type Education = {
  isSample: boolean;
  id: string;
  qualification: string;
  institution: string;
  started?: string;
  ended?: string;
  details?: string[];
};

export type ContactLink = {
  label: string;
  url: string;
};

export type Contact = {
  email?: string;
  links?: ContactLink[];
};

export type Profile = {
  name: string;
  headline: string;
  introduction: string;
  about: string;
  location?: string;
};

export type ResumeContent = {
  isSample: boolean;
  sampleNotice?: string;
  profile: Profile;
  skills: SkillGroup[];
  experience: Experience[];
  education: Education[];
  contact: Contact;
};

// Illustrative sample content. Every entry below is a fictional example and
// must be replaced with real resume details supplied by the owner.
// Do not treat any name, employer, degree, date, or highlight as factual.
// Set isSample to false for the profile and each entry when replacing examples
// with real content. Sample labels and the page notice follow these flags.
export const resume: ResumeContent = {
  isSample: true,
  sampleNotice: "Illustrative sample resume — placeholder content",
  profile: {
    name: "Example Person",
    headline: "Example professional headline (placeholder)",
    introduction:
      "Illustrative introduction. Replace this with a real summary supplied by the owner.",
    about:
      "This page uses clearly labeled placeholder content. It contains no real " +
      "personal information, employers, institutions, or achievements.",
    location: undefined,
  },
  skills: [
    {
      label: "Example skill group A",
      items: ["Example skill 1", "Example skill 2", "Example skill 3"],
    },
    {
      label: "Example skill group B",
      items: ["Example skill 4", "Example skill 5"],
    },
  ],
  experience: [
    {
      isSample: true,
      id: "sample-experience-prior",
      role: "Example prior role",
      organization: "Example Technology Co.",
      started: "2022-03",
      ended: "2024-06",
      current: false,
      description:
        "Illustrative role description. Replace with real details supplied by the owner.",
      highlights: ["Example highlight one", "Example highlight two"],
    },
    {
      isSample: true,
      id: "sample-experience-current",
      role: "Example current role",
      organization: "Example Systems Ltd.",
      started: "2024-07",
      ended: undefined,
      current: true,
      description: "Illustrative current role description.",
      highlights: ["Example highlight three"],
    },
  ],
  education: [
    {
      isSample: true,
      id: "sample-education-degree",
      qualification: "Example degree",
      institution: "Example University",
      started: "2018-09",
      ended: "2022-05",
      details: ["Example detail one"],
    },
  ],
  contact: {
    email: undefined,
    links: [],
  },
};
