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

export type ResumeContent = {
  isSample: boolean;
  sampleNotice?: string;
  profile: Profile;
  skills: SkillGroup[];
  experience: Experience[];
  education: Education[];
  contact: Contact;
};

// Resume content supplied by the owner in Resume_PDF.pdf.
export const resume: ResumeContent = {
  "isSample": false,
  "profile": {
    "name": "Roel Somido",
    "headline": "Data Analytics & Data Engineering Candidate",
    "introduction": "B.S. Information Technology graduate specializing in end-to-end data architecture, automated pipeline engineering, cloud data warehousing, and executive business intelligence.",
    "about": "Transitioning from technical support to Data Engineering and Analytics with hands-on experience building multi-tier Medallion pipelines, implementing dbt test suites, deploying serverless web apps, and delivering interactive Tableau dashboards.",
    "location": "Claveria, Misamis Oriental"
  },
  "skills": [
    {
      "label": "Data Engineering & Cloud Warehousing",
      "items": [
        "Medallion Architecture (Bronze/Silver/Gold)",
        "Google BigQuery",
        "Snowflake",
        "dbt Core",
        "Microsoft SQL Server",
        "PostgreSQL",
        "Star Schema Design",
        "ETL/ELT Pipelines",
        "Watermarking",
        "Cryptographic Hashing (SHA-256)"
      ]
    },
    {
      "label": "Programming & Tools",
      "items": [
        "Python (Pandas, SQLAlchemy)",
        "T-SQL",
        "Docker",
        "Google Cloud Run",
        "GitHub Actions (CI/CD)",
        "uv",
        "Git/GitHub"
      ]
    },
    {
      "label": "Data Visualization & Analytics",
      "items": [
        "Tableau (Desktop & Public)",
        "Plotly Dash",
        "Executive Dashboard Design",
        "Data Storytelling",
        "Advanced Excel (Power Query, Pivot Tables)"
      ]
    },
    {
      "label": "Core Strengths",
      "items": [
        "Analytical Troubleshooting",
        "Pipeline Observability",
        "Cross-Functional Communication"
      ]
    }
  ],
  "experience": [
    {
      "isSample": false,
      "id": "exl-service-executive",
      "role": "Executive",
      "organization": "EXL Service",
      "started": "2021-10",
      "ended": "2022-10",
      "current": false,
      "description": "",
      "highlights": [
        "Managed insurance claim data and financial reimbursements with strict attention to data accuracy.",
        "Resolved complex data discrepancies in customer accounts to ensure precise billing."
      ]
    },
    {
      "isSample": false,
      "id": "wipro-associate",
      "role": "Associate",
      "organization": "Wipro",
      "started": "2019-06",
      "ended": "2021-02",
      "current": false,
      "description": "",
      "highlights": [
        "Processed airline booking and transaction data, ensuring compliance with global distribution system standards."
      ]
    },
    {
      "isSample": false,
      "id": "concentrix-technical-support-associate",
      "role": "Technical Support Associate",
      "organization": "Concentrix",
      "started": "2017-05",
      "ended": "2017-12",
      "current": false,
      "description": "",
      "highlights": [
        "Analyzed network connectivity data to troubleshoot and resolve infrastructure issues for ISP clients."
      ]
    }
  ],
  "education": [
    {
      "isSample": false,
      "id": "asian-college-information-technology",
      "qualification": "B.S. in Information Technology",
      "institution": "Asian College",
      "started": "2001-06",
      "ended": "2005-05"
    }
  ],
  "contact": {
    "phone": "+63 923-456-8257",
    "email": "roel.somido@icloud.com",
    "links": [
      {
        "label": "GitHub",
        "url": "https://github.com/Datanerdbytes"
      },
      {
        "label": "Tableau Public",
        "url": "https://public.tableau.com/app/profile/roel.somido/vizzes"
      }
    ]
  }
};
