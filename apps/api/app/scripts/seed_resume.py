"""Seed the resume content tables from the existing resume.ts data.

Run from apps/api with the venv active:
    python -m app.scripts.seed_resume

Safe to re-run — skips rows that already exist (idempotent via slug/id checks).
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.core.config import settings
from app.db.base import Base
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models.resume import (
    Contact,
    ContactLink,
    Education,
    Experience,
    ExperienceHighlight,
    Profile,
    SkillGroup,
    SkillItem,
)

engine = create_engine(settings.DATABASE_URL)


def seed():
    with Session(engine) as session:
        # --- Profile ---
        existing = session.execute(select(Profile)).scalar_one_or_none()
        if not existing:
            session.add(Profile(
                name="Roel Somido",
                headline="Data Analytics & Data Engineering Candidate",
                introduction=(
                    "B.S. Information Technology graduate specializing in end-to-end "
                    "data architecture, automated pipeline engineering, cloud data "
                    "warehousing, and executive business intelligence."
                ),
                about=(
                    "Transitioning from technical support to Data Engineering and Analytics "
                    "with hands-on experience building multi-tier Medallion pipelines, "
                    "implementing dbt test suites, deploying serverless web apps, and "
                    "delivering interactive Tableau dashboards."
                ),
                location="Claveria, Misamis Oriental",
            ))
            print("  ✓ Profile seeded")
        else:
            print("  - Profile already exists, skipping")

        # --- Skills ---
        skills_data = [
            ("Data Engineering & Cloud Warehousing", [
                "Medallion Architecture (Bronze/Silver/Gold)",
                "Google BigQuery", "Snowflake", "dbt Core",
                "Microsoft SQL Server", "PostgreSQL", "Star Schema Design",
                "ETL/ELT Pipelines", "Watermarking", "Cryptographic Hashing (SHA-256)",
            ]),
            ("Programming & Tools", [
                "Python (Pandas, SQLAlchemy)", "T-SQL", "Docker",
                "Google Cloud Run", "GitHub Actions (CI/CD)", "uv", "Git/GitHub",
            ]),
            ("Data Visualization & Analytics", [
                "Tableau (Desktop & Public)", "Plotly Dash",
                "Executive Dashboard Design", "Data Storytelling",
                "Advanced Excel (Power Query, Pivot Tables)",
            ]),
            ("Core Strengths", [
                "Analytical Troubleshooting", "Pipeline Observability",
                "Cross-Functional Communication",
            ]),
        ]
        existing_groups = session.execute(select(SkillGroup)).scalars().all()
        if not existing_groups:
            for order, (label, items) in enumerate(skills_data):
                group = SkillGroup(label=label, display_order=order)
                session.add(group)
                session.flush()  # get group.id
                for i, item in enumerate(items):
                    session.add(SkillItem(group_id=group.id, item=item, display_order=i))
            print("  ✓ Skills seeded")
        else:
            print("  - Skills already exist, skipping")

        # --- Experience ---
        experience_data = [
            {
                "slug": "exl-service-executive",
                "role": "Executive",
                "organization": "EXL Service",
                "started": "2021-10",
                "ended": "2022-10",
                "current": False,
                "description": "",
                "display_order": 0,
                "highlights": [
                    "Managed insurance claim data and financial reimbursements with strict attention to data accuracy.",
                    "Resolved complex data discrepancies in customer accounts to ensure precise billing.",
                ],
            },
            {
                "slug": "wipro-associate",
                "role": "Associate",
                "organization": "Wipro",
                "started": "2019-06",
                "ended": "2021-02",
                "current": False,
                "description": "",
                "display_order": 1,
                "highlights": [
                    "Processed airline booking and transaction data, ensuring compliance with global distribution system standards.",
                ],
            },
            {
                "slug": "concentrix-technical-support-associate",
                "role": "Technical Support Associate",
                "organization": "Concentrix",
                "started": "2017-05",
                "ended": "2017-12",
                "current": False,
                "description": "",
                "display_order": 2,
                "highlights": [
                    "Analyzed network connectivity data to troubleshoot and resolve infrastructure issues for ISP clients.",
                ],
            },
        ]
        for exp_data in experience_data:
            existing_exp = session.execute(
                select(Experience).where(Experience.slug == exp_data["slug"])
            ).scalar_one_or_none()
            if not existing_exp:
                highlights = exp_data.pop("highlights")
                exp = Experience(**exp_data)
                session.add(exp)
                session.flush()
                for i, text in enumerate(highlights):
                    session.add(ExperienceHighlight(experience_id=exp.id, text=text, display_order=i))
                print(f"  ✓ Experience '{exp_data['slug']}' seeded")
            else:
                print(f"  - Experience '{exp_data['slug']}' already exists, skipping")

        # --- Education ---
        existing_edu = session.execute(
            select(Education).where(Education.slug == "asian-college-information-technology")
        ).scalar_one_or_none()
        if not existing_edu:
            session.add(Education(
                slug="asian-college-information-technology",
                qualification="B.S. in Information Technology",
                institution="Asian College",
                started="2001-06",
                ended="2005-05",
                display_order=0,
            ))
            print("  ✓ Education seeded")
        else:
            print("  - Education already exists, skipping")

        # --- Contact ---
        existing_contact = session.execute(select(Contact)).scalar_one_or_none()
        if not existing_contact:
            contact = Contact(phone="+63 923-456-8257", email="roel.somido@icloud.com")
            session.add(contact)
            session.flush()
            session.add(ContactLink(
                contact_id=contact.id, label="GitHub",
                url="https://github.com/Datanerdbytes", display_order=0,
            ))
            session.add(ContactLink(
                contact_id=contact.id, label="Tableau Public",
                url="https://public.tableau.com/app/profile/roel.somido/vizzes", display_order=1,
            ))
            print("  ✓ Contact seeded")
        else:
            print("  - Contact already exists, skipping")

        session.commit()
        print("\nSeed complete.")


if __name__ == "__main__":
    seed()
