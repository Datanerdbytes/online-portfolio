"""Rewrite owner-relative media URLs for a public portfolio mount."""

from app.schemas.resume import ProfileResponse

_OWNER_URL_PREFIX = "/api/v1/"


def public_media_url(url: str | None, public_user_id: str) -> str | None:
    if not url:
        return None
    return url.replace(_OWNER_URL_PREFIX, f"/api/v1/public/users/{public_user_id}/")


def rewrite_profile_media(profile: ProfileResponse, public_user_id: str) -> ProfileResponse:
    profile.avatar_url = public_media_url(profile.avatar_url, public_user_id)
    profile.banner_url = public_media_url(profile.banner_url, public_user_id)
    return profile
