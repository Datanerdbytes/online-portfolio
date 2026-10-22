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
  phone?: string;
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

export type ResumeProject = {
  isSample: boolean;
  id: string;
  title: string;
  summary: string;
  technologies: string[];
  repositoryUrl?: string;
  demoUrl?: string;
};

export type ResumeContent = {
  isSample: boolean;
  sampleNotice?: string;
  profile: Profile;
  skills: SkillGroup[];
  experience: Experience[];
  education: Education[];
  contact: Contact;
  projects: ResumeProject[];
};
