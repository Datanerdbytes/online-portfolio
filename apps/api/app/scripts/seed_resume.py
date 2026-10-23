"""Seed and repair the resume content tables from the canonical resume data.

Run from apps/api with the venv active:
    python -m app.scripts.seed_resume

Safe to re-run. Profile, experience, education, and contact rows are inserted
only when missing. Skill groups are *synchronised*: canonical entries are
inserted when missing, legacy names are normalised, duplicates are removed, and
display order is reset so the canonical entries lead each group. Entries added
through the admin UI are preserved and kept after the canonical ones.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.tenant import TenantSession
from app.models.owner import LEGACY_OWNER_ID
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

# Canonical skill groups, in resume order. This is the single source of truth
# for the skills section and is mirrored by the web fallback generator.
CANONICAL_SKILL_GROUPS: list[tuple[str, list[str]]] = [
    (
        "Data Engineering & Cloud Warehousing",
        [
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
        ],
    ),
    (
        "Programming & Tools",
        [
            "Python (Pandas, SQLAlchemy)",
            "T-SQL",
            "Docker",
            "Google Cloud Run",
            "GitHub Actions (CI/CD)",
            "uv",
            "Git/GitHub",
        ],
    ),
    (
        "Data Visualization & Analytics",
        [
            "Tableau (Desktop & Public)",
            "Plotly Dash",
            "Executive Dashboard Design",
            "Data Storytelling",
            "Advanced Excel (Power Query, Pivot Tables)",
        ],
    ),
    (
        "Core Strengths",
        [
            "Analytical Troubleshooting",
            "Pipeline Observability",
            "Cross-Functional Communication",
        ],
    ),
]

# Names written before the canonical list existed. Each maps to the canonical
# entry it becomes. When the canonical entry already exists in the same group
# the legacy row is a duplicate and is removed instead of renamed.
LEGACY_SKILL_ITEMS: dict[str, str] = {
    "Python": "Python (Pandas, SQLAlchemy)",
    "UV": "uv",
}


def _group_items(session: Session, group_id: int) -> list[SkillItem]:
    return list(
        session.execute(
            select(SkillItem)
            .where(SkillItem.group_id == group_id)
            .order_by(SkillItem.display_order, SkillItem.id)
        )
        .scalars()
        .all()
    )


def sync_skills(session: Session) -> None:
    """Reconcile the skill tables with the canonical list.

    Canonical entries are added when missing, legacy names are normalised,
    duplicate rows are removed, and display order is rewritten so the
    canonical entries lead each group. Entries that are not part of the
    canonical list are preserved and keep their relative order after it.
    """
    groups = {group.label: group for group in session.execute(select(SkillGroup)).scalars().all()}

    for order, (label, canonical_items) in enumerate(CANONICAL_SKILL_GROUPS):
        group = groups.get(label)
        if group is None:
            group = SkillGroup(label=label, display_order=order)
            session.add(group)
            session.flush()
            groups[label] = group
            print(f"  ✓ Skill group '{label}' created")
        elif group.display_order != order:
            group.display_order = order

        items = _group_items(session, group.id)

        # Normalise legacy names; drop rows that duplicate a canonical entry.
        for item in list(items):
            canonical = LEGACY_SKILL_ITEMS.get(item.item)
            if canonical is None:
                continue
            duplicate = next(
                (other for other in items if other.id != item.id and other.item == canonical),
                None,
            )
            if duplicate is not None:
                session.delete(item)
                print(f"  ✓ Removed duplicate skill '{item.item}' from '{label}'")
            else:
                print(f"  ✓ Renamed skill '{item.item}' to '{canonical}' in '{label}'")
                item.item = canonical
        session.flush()

        # Remove exact duplicates of the same name inside one group.
        items = _group_items(session, group.id)
        seen: set[str] = set()
        for item in items:
            if item.item in seen:
                session.delete(item)
                print(f"  ✓ Removed duplicate skill '{item.item}' from '{label}'")
            else:
                seen.add(item.item)
        session.flush()

        # Add canonical entries that are missing.
        items = _group_items(session, group.id)
        present = {item.item for item in items}
        for name in canonical_items:
            if name in present:
                continue
            session.add(SkillItem(group_id=group.id, item=name, display_order=0))
            print(f"  ✓ Skill '{name}' added to '{label}'")
        session.flush()

        # Canonical entries lead the group, extra entries follow in their
        # existing relative order.
        items = _group_items(session, group.id)
        extras = [item for item in items if item.item not in canonical_items]
        for index, name in enumerate(canonical_items):
            for item in items:
                if item.item == name:
                    item.display_order = index
                    break
        for offset, item in enumerate(extras):
            item.display_order = 900 + offset

    session.flush()


def seed():
    with TenantSession(engine, user_id=LEGACY_OWNER_ID) as session:
        # --- Profile ---
        existing = session.execute(select(Profile)).scalar_one_or_none()
        if not existing:
            session.add(
                Profile(
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
                )
            )
            print("  ✓ Profile seeded")
        else:
            print("  - Profile already exists, skipping")

        # --- Skills ---
        sync_skills(session)

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
                    (
                        "Managed insurance claim data and financial reimbursements with "
                        "strict attention to data accuracy."
                    ),
                    (
                        "Resolved complex data discrepancies in customer accounts to "
                        "ensure precise billing."
                    ),
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
                    (
                        "Processed airline booking and transaction data, ensuring "
                        "compliance with global distribution system standards."
                    ),
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
                    (
                        "Analyzed network connectivity data to troubleshoot and resolve "
                        "infrastructure issues for ISP clients."
                    ),
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
                    session.add(
                        ExperienceHighlight(experience_id=exp.id, text=text, display_order=i)
                    )
                print(f"  ✓ Experience '{exp_data['slug']}' seeded")
            else:
                print(f"  - Experience '{exp_data['slug']}' already exists, skipping")

        # --- Education ---
        existing_edu = session.execute(
            select(Education).where(Education.slug == "asian-college-information-technology")
        ).scalar_one_or_none()
        if not existing_edu:
            session.add(
                Education(
                    slug="asian-college-information-technology",
                    qualification="B.S. in Information Technology",
                    institution="Asian College",
                    started="2001-06",
                    ended="2005-05",
                    display_order=0,
                )
            )
            print("  ✓ Education seeded")
        else:
            print("  - Education already exists, skipping")

        # --- Contact ---
        existing_contact = session.execute(select(Contact)).scalar_one_or_none()
        if not existing_contact:
            contact = Contact(phone="+63 923-456-8257", email="roel.somido@icloud.com")
            session.add(contact)
            session.flush()
            session.add(
                ContactLink(
                    contact_id=contact.id,
                    label="GitHub",
                    url="https://github.com/Datanerdbytes",
                    display_order=0,
                )
            )
            session.add(
                ContactLink(
                    contact_id=contact.id,
                    label="Tableau Public",
                    url="https://public.tableau.com/app/profile/roel.somido/vizzes",
                    display_order=1,
                )
            )
            print("  ✓ Contact seeded")
        else:
            print("  - Contact already exists, skipping")

        session.commit()
        print("\nSeed complete.")


if __name__ == "__main__":
    seed()
