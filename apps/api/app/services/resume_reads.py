"""Read-only resume section queries shared by owner and public routes.

Owner scoping comes from the request session (``TenantSession``); these helpers
only fix projection, eager loading, and ordering so the two read paths cannot
drift.
"""

from sqlalchemy.orm import Session, selectinload

from app.models.resume import Contact, Education, Experience, Profile, SkillGroup


def read_profile(db: Session) -> Profile | None:
    return db.query(Profile).first()


def read_skill_groups(db: Session) -> list[SkillGroup]:
    return (
        db.query(SkillGroup)
        .options(selectinload(SkillGroup.items))
        .order_by(SkillGroup.display_order)
        .all()
    )


def read_experience(db: Session) -> list[Experience]:
    return (
        db.query(Experience)
        .options(selectinload(Experience.highlights))
        .order_by(Experience.display_order)
        .all()
    )


def read_education(db: Session) -> list[Education]:
    return db.query(Education).order_by(Education.display_order).all()


def read_contact(db: Session) -> Contact | None:
    return db.query(Contact).options(selectinload(Contact.links)).first()
