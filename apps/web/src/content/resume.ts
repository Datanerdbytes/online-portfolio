// AUTO-GENERATED FILE — do not edit by hand.
//
// Regenerate with:
//   npm run sync:resume-content
//
// Source: GET /api/v1/resume and GET /api/v1/projects from the API base URL
// configured in API_BASE_URL.

import type { ResumeContent } from "@/content/resume-types";

export const resume: ResumeContent = {
  isSample: false,
  profile: {
    name: "Roel Somido",
    headline: "Data Analytics & Data Engineering Candidate",
    introduction:
      "B.S. Information Technology graduate specializing in end-to-end data architecture, automated pipeline engineering, cloud data warehousing, and executive business intelligence.",
    about:
      "Transitioning from technical support to Data Engineering and Analytics with hands-on experience building multi-tier Medallion pipelines, implementing dbt test suites, deploying serverless web apps, and delivering interactive Tableau dashboards.",
    location: "Claveria, Misamis Oriental",
  },
  skills: [
    {
      label: "Data Engineering & Cloud Warehousing",
      items: [
        "Medallion Architecture (Bronze/Silver/Gold)",
        "Google BigQuery",
        "Snowflake",
        "dbt Core",
        "Microsoft SQL Server",
        "PostgreSQL",
        "Star Schema Design",
        "ETL/ELT Pipelines",
        "Watermarking",
        "Cryptographic Hashing (SHA-256)",
        "Google Cloud Run",
        "Google Cloud Platform",
        "Airbyte",
        "DBeaver",
      ],
    },
    {
      label: "Programming & Tools",
      items: [
        "Python (Pandas, SQLAlchemy)",
        "T-SQL",
        "Docker",
        "Google Cloud Run",
        "GitHub Actions (CI/CD)",
        "uv",
        "Git/GitHub",
        "Jupyter Notebook",
        "SQLAlchemy",
        "Next.js",
        "FastAPI",
        "Flask",
        "HTML",
        "CSS",
        "JavaScript",
        "Langflow",
        "Shell Scripting",
        "Cron",
      ],
    },
    {
      label: "Data Visualization & Analytics",
      items: [
        "Tableau (Desktop & Public)",
        "Plotly Dash",
        "Executive Dashboard Design",
        "Data Storytelling",
        "Advanced Excel (Power Query, Pivot Tables)",
        "Matplotlib",
        "Data Studio (Looker)",
        "Plotly",
        "Power BI",
        "Pandas",
      ],
    },
    {
      label: "Core Strengths",
      items: [
        "Analytical Troubleshooting",
        "Pipeline Observability",
        "Cross-Functional Communication",
      ],
    },
  ],
  experience: [
    {
      isSample: false,
      id: "exl-service-executive",
      role: "Executive",
      organization: "EXL Service",
      started: "2021-10",
      ended: "2022-10",
      current: false,
      description: "",
      highlights: [
        "Managed insurance claim data and financial reimbursements with strict attention to data accuracy.",
        "Resolved complex data discrepancies in customer accounts to ensure precise billing.",
      ],
    },
    {
      isSample: false,
      id: "wipro-associate",
      role: "Associate",
      organization: "Wipro",
      started: "2019-06",
      ended: "2021-02",
      current: false,
      description: "",
      highlights: [
        "Processed airline booking and transaction data, ensuring compliance with global distribution system standards.",
      ],
    },
    {
      isSample: false,
      id: "concentrix-technical-support-associate",
      role: "Technical Support Associate",
      organization: "Concentrix",
      started: "2017-05",
      ended: "2017-12",
      current: false,
      description: "",
      highlights: [
        "Analyzed network connectivity data to troubleshoot and resolve infrastructure issues for ISP clients.",
      ],
    },
  ],
  education: [
    {
      isSample: false,
      id: "asian-college-information-technology",
      qualification: "B.S. in Information Technology",
      institution: "Asian College",
      started: "2001-06",
      ended: "2005-05",
    },
  ],
  contact: {
    phone: "+63 923-456-8257",
    email: "roel.somido@icloud.com",
    links: [
      {
        label: "GitHub",
        url: "https://github.com/Datanerdbytes",
      },
      {
        label: "Tableau Public",
        url: "https://public.tableau.com/app/profile/roel.somido/vizzes",
      },
    ],
  },
  projects: [
    {
      isSample: false,
      id: "resume-site",
      title: "Resume site",
      summary: "Portfolio application.",
      technologies: [],
    },
    {
      isSample: true,
      id: "sample-task-board",
      title: "Sample: Task Board",
      summary:
        "Illustrative project entry for development; not a completed portfolio project.",
      technologies: ["Next.js", "FastAPI", "PostgreSQL"],
    },
    {
      isSample: true,
      id: "sample-api-gateway",
      title: "Sample: API Gateway",
      summary:
        "Illustrative project entry for development; not a completed portfolio project.",
      technologies: ["FastAPI", "PostgreSQL", "Docker"],
    },
    {
      isSample: true,
      id: "sample-portfolio-frontend",
      title: "Sample: Portfolio Frontend",
      summary:
        "Illustrative project entry for development; not a completed portfolio project.",
      technologies: ["Next.js", "Tailwind CSS", "shadcn/ui"],
    },
    {
      isSample: false,
      id: "enterprise-edw-pipeline-observability-analytics",
      title: "Enterprise EDW, Pipeline Observability & Analytics Platform",
      summary:
        "Architected a Medallion warehouse in Google BigQuery with dbt Core, transforming CRM/ERP data into customer and product dimensions and sales facts. Parsed manifest.json and run_results.json to track column-level test coverage, execution durations, and pipeline health. Built a containerized, multi-page Plotly Dash application deployed to Google Cloud Run with GitHub Actions CI/CD.",
      technologies: [
        "Google BigQuery",
        "dbt Core",
        "Python",
        "Plotly Dash",
        "Docker",
        "Google Cloud Run",
        "GitHub Actions",
      ],
      repositoryUrl: "https://tinyurl.com/ytn738y4",
      demoUrl: "https://tinyurl.com/ytmmwpe8",
    },
    {
      isSample: false,
      id: "snowflake-dbt-ecommerce-analytics",
      title: "Snowflake DBT E-Commerce Analytics",
      summary:
        "Built a data engineering and analytics platform with dbt, Snowflake, and Python to turn raw e-commerce data into business intelligence. Automated ELT, modeled a star schema, implemented data quality tests and validation, and created interactive customer and product analytics dashboards.",
      technologies: [
        "Snowflake",
        "dbt",
        "Python",
        "ELT",
        "Dimensional Modeling",
      ],
      repositoryUrl: "https://tinyurl.com/28bjm2c3",
    },
    {
      isSample: false,
      id: "data-warehouse-incremental-etl-bi-platform",
      title: "Data Warehouse Incremental ETL Project & BI Platform",
      summary:
        "Engineered a full-stack BI solution around AdventureWorksDW2022. Deployed isolated Bronze-layer staging tables, used cryptographic hashing to track dimension changes, and applied dynamic watermarks to identify fact-table deltas. Built a Tableau executive hub covering $16.3M in sales, $6.8M in net profits, AOV, and 17.4K customers, with trend tracking, Pareto analysis, and YoY bullet graphs.",
      technologies: [
        "Microsoft SQL Server",
        "T-SQL",
        "ETL",
        "Medallion Architecture",
        "SHA-256",
        "Watermarking",
        "Tableau",
      ],
      repositoryUrl: "https://tinyurl.com/4mbrwau7",
    },
    {
      isSample: false,
      id: "adventureworks-global-sales-executive-hub",
      title: "Global Sales & Performance Executive Hub (AdventureWorks BI)",
      summary:
        "Built a Tableau executive dashboard for the AdventureWorks dataset, tracking $16.3M in sales, $6.8M in net profits, Average Order Value, and 17.4K customers. Implemented multi-metric trend charts, an 80/20 Pareto Sales Analysis curve, and dynamic bullet graphs comparing year-over-year growth with prior-year benchmarks.",
      technologies: [
        "Tableau",
        "AdventureWorks",
        "Executive Dashboards",
        "Pareto Analysis",
        "YoY Analytics",
      ],
      demoUrl: "https://tinyurl.com/ymf655uy",
    },
    {
      isSample: false,
      id: "sales-customer-tableau-dashboard",
      title: "Sales & Customer Dashboard",
      summary:
        "Created an interactive Tableau dashboard to track revenue trends, regional performance, and customer segmentation. Combined sales datasets to visualize year-over-year growth and identify underperforming market regions.",
      technologies: [
        "Tableau",
        "Data Visualization",
        "Customer Segmentation",
        "YoY Analytics",
      ],
      demoUrl: "https://tinyurl.com/ytrkm73u",
    },
    {
      isSample: false,
      id: "hr-analytics-tableau-dashboard",
      title: "HR Analytics Dashboard",
      summary:
        "Developed an executive overview of employee turnover, departmental headcount, and retention metrics. Turned complex workforce metrics into clear dashboards highlighting primary drivers of employee attrition.",
      technologies: ["Tableau", "HR Analytics", "Data Visualization"],
      demoUrl: "https://tinyurl.com/547sd8ur",
    },
  ],
};

export type {
  Contact,
  ContactLink,
  Education,
  Experience,
  Profile,
  ResumeContent,
  ResumeProject,
  SkillGroup,
} from "@/content/resume-types";
