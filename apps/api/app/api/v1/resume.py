"""Resume content routes.

Public reads (GET). Authenticated writes (POST / PATCH / DELETE) use the same
bearer token pattern as the projects router.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.api.v1.auth import AuthRoute
from app.core.auth import TokenClaims, verify_owner_token
from app.db.session import get_db
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
from app.schemas.resume import (
    ContactLinkCreate,
    ContactLinkPatch,
    ContactLinkResponse,
    ContactPatch,
    ContactResponse,
    EducationCreate,
    EducationPatch,
    EducationResponse,
    ExperienceCreate,
    ExperiencePatch,
    ExperienceResponse,
    HighlightCreate,
    HighlightPatch,
    HighlightResponse,
    ProfilePatch,
    ProfileResponse,
    ResumeResponse,
    SkillGroupCreate,
    SkillGroupPatch,
    SkillGroupResponse,
    SkillItemCreate,
    SkillItemPatch,
    SkillItemResponse,
)

router = APIRouter(route_class=AuthRoute, tags=["resume"])


def get_current_owner(authorization: str | None = Header(None)) -> TokenClaims:  # noqa: B008
    return verify_owner_token(authorization)


# ---------------------------------------------------------------------------
# Full resume (read-only)
# ---------------------------------------------------------------------------

@router.get("/resume", response_model=ResumeResponse)
def get_resume(db: Session = Depends(get_db)):  # noqa: B008
    profile = db.query(Profile).first()
    skills = (
        db.query(SkillGroup)
        .options(selectinload(SkillGroup.items))
        .order_by(SkillGroup.display_order)
        .all()
    )
    experience = (
        db.query(Experience)
        .options(selectinload(Experience.highlights))
        .order_by(Experience.display_order)
        .all()
    )
    education = db.query(Education).order_by(Education.display_order).all()
    contact = db.query(Contact).options(selectinload(Contact.links)).first()

    return ResumeResponse(
        profile=profile,
        skills=skills,
        experience=experience,
        education=education,
        contact=contact,
    )


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

@router.get("/resume/profile", response_model=ProfileResponse)
def get_profile(db: Session = Depends(get_db)):  # noqa: B008
    profile = db.query(Profile).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.patch("/resume/profile", response_model=ProfileResponse)
def patch_profile(
    body: ProfilePatch,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    profile = db.query(Profile).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

@router.get("/resume/skills", response_model=list[SkillGroupResponse])
def get_skills(db: Session = Depends(get_db)):  # noqa: B008
    return (
        db.query(SkillGroup)
        .options(selectinload(SkillGroup.items))
        .order_by(SkillGroup.display_order)
        .all()
    )


@router.post("/resume/skills", response_model=SkillGroupResponse, status_code=201)
def create_skill_group(
    body: SkillGroupCreate,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    group = SkillGroup(label=body.label, display_order=body.display_order)
    db.add(group)
    db.flush()
    for i, item_text in enumerate(body.items):
        db.add(SkillItem(group_id=group.id, item=item_text, display_order=i))
    db.commit()
    db.refresh(group)
    return group


@router.patch("/resume/skills/{group_id}", response_model=SkillGroupResponse)
def patch_skill_group(
    group_id: int,
    body: SkillGroupPatch,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    group = db.get(SkillGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Skill group not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    db.commit()
    db.refresh(group)
    return group


@router.delete("/resume/skills/{group_id}", status_code=204)
def delete_skill_group(
    group_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    group = db.get(SkillGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Skill group not found")
    db.delete(group)
    db.commit()


@router.post("/resume/skills/{group_id}/items", response_model=SkillItemResponse, status_code=201)
def add_skill_item(
    group_id: int,
    body: SkillItemCreate,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    group = db.get(SkillGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Skill group not found")
    item = SkillItem(group_id=group_id, item=body.item, display_order=body.display_order)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/resume/skills/items/{item_id}", response_model=SkillItemResponse)
def patch_skill_item(
    item_id: int,
    body: SkillItemPatch,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    item = db.get(SkillItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Skill item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/resume/skills/items/{item_id}", status_code=204)
def delete_skill_item(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    item = db.get(SkillItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Skill item not found")
    db.delete(item)
    db.commit()


# ---------------------------------------------------------------------------
# Experience
# ---------------------------------------------------------------------------

@router.get("/resume/experience", response_model=list[ExperienceResponse])
def get_experience(db: Session = Depends(get_db)):  # noqa: B008
    return (
        db.query(Experience)
        .options(selectinload(Experience.highlights))
        .order_by(Experience.display_order)
        .all()
    )


@router.post("/resume/experience", response_model=ExperienceResponse, status_code=201)
def create_experience(
    body: ExperienceCreate,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    highlights = body.highlights
    exp_data = body.model_dump(exclude={"highlights"})
    exp = Experience(**exp_data)
    db.add(exp)
    db.flush()
    for i, text in enumerate(highlights):
        db.add(ExperienceHighlight(experience_id=exp.id, text=text, display_order=i))
    db.commit()
    db.refresh(exp)
    return exp


@router.patch("/resume/experience/{exp_id}", response_model=ExperienceResponse)
def patch_experience(
    exp_id: int,
    body: ExperiencePatch,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    exp = db.get(Experience, exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experience not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exp, field, value)
    db.commit()
    db.refresh(exp)
    return exp


@router.delete("/resume/experience/{exp_id}", status_code=204)
def delete_experience(
    exp_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    exp = db.get(Experience, exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experience not found")
    db.delete(exp)
    db.commit()


@router.post("/resume/experience/{exp_id}/highlights", response_model=HighlightResponse, status_code=201)
def add_highlight(
    exp_id: int,
    body: HighlightCreate,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    exp = db.get(Experience, exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experience not found")
    h = ExperienceHighlight(experience_id=exp_id, text=body.text, display_order=body.display_order)
    db.add(h)
    db.commit()
    db.refresh(h)
    return h


@router.patch("/resume/experience/highlights/{highlight_id}", response_model=HighlightResponse)
def patch_highlight(
    highlight_id: int,
    body: HighlightPatch,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    h = db.get(ExperienceHighlight, highlight_id)
    if not h:
        raise HTTPException(status_code=404, detail="Highlight not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(h, field, value)
    db.commit()
    db.refresh(h)
    return h


@router.delete("/resume/experience/highlights/{highlight_id}", status_code=204)
def delete_highlight(
    highlight_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    h = db.get(ExperienceHighlight, highlight_id)
    if not h:
        raise HTTPException(status_code=404, detail="Highlight not found")
    db.delete(h)
    db.commit()


# ---------------------------------------------------------------------------
# Education
# ---------------------------------------------------------------------------

@router.get("/resume/education", response_model=list[EducationResponse])
def get_education(db: Session = Depends(get_db)):  # noqa: B008
    return db.query(Education).order_by(Education.display_order).all()


@router.post("/resume/education", response_model=EducationResponse, status_code=201)
def create_education(
    body: EducationCreate,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    edu = Education(**body.model_dump())
    db.add(edu)
    db.commit()
    db.refresh(edu)
    return edu


@router.patch("/resume/education/{edu_id}", response_model=EducationResponse)
def patch_education(
    edu_id: int,
    body: EducationPatch,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    edu = db.get(Education, edu_id)
    if not edu:
        raise HTTPException(status_code=404, detail="Education not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(edu, field, value)
    db.commit()
    db.refresh(edu)
    return edu


@router.delete("/resume/education/{edu_id}", status_code=204)
def delete_education(
    edu_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    edu = db.get(Education, edu_id)
    if not edu:
        raise HTTPException(status_code=404, detail="Education not found")
    db.delete(edu)
    db.commit()


# ---------------------------------------------------------------------------
# Contact
# ---------------------------------------------------------------------------

@router.get("/resume/contact", response_model=ContactResponse)
def get_contact(db: Session = Depends(get_db)):  # noqa: B008
    contact = db.query(Contact).options(selectinload(Contact.links)).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.patch("/resume/contact", response_model=ContactResponse)
def patch_contact(
    body: ContactPatch,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    contact = db.query(Contact).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)
    db.commit()
    db.refresh(contact)
    return contact


@router.post("/resume/contact/links", response_model=ContactLinkResponse, status_code=201)
def add_contact_link(
    body: ContactLinkCreate,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    contact = db.query(Contact).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    link = ContactLink(contact_id=contact.id, **body.model_dump())
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.patch("/resume/contact/links/{link_id}", response_model=ContactLinkResponse)
def patch_contact_link(
    link_id: int,
    body: ContactLinkPatch,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    link = db.get(ContactLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Contact link not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(link, field, value)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/resume/contact/links/{link_id}", status_code=204)
def delete_contact_link(
    link_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    link = db.get(ContactLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Contact link not found")
    db.delete(link)
    db.commit()
