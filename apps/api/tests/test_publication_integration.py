"""Publication boundaries against a disposable PostgreSQL database."""
# ruff: noqa: F811 -- pytest fixtures are imported for test parameter injection

from io import BytesIO

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.storage import LocalProfileImageStore, get_image_store
from app.main import app
from app.models.owner import PortfolioPublication
from tests.test_neon_ownership_integration import accounts  # noqa: F401


def prepare(client, headers):
    assert (
        client.patch(
            "/api/v1/resume/profile",
            headers=headers,
            json={"name": "Original", "headline": "Engineer", "introduction": "An introduction."},
        ).status_code
        == 200
    )
    return client.get("/api/v1/portfolio", headers=headers).json()


def publish(client, headers, state=None):
    state = state or client.get("/api/v1/portfolio", headers=headers).json()
    return client.post(
        "/api/v1/portfolio/publish", headers=headers, json={"revision": state["revision"]}
    )


def test_new_drafts_are_private_on_all_public_paths(accounts):
    client, _, ids, (a, b) = accounts
    prepare(client, a)
    for path in (
        f"/api/v1/public/users/{ids[0]}/resume",
        f"/api/v1/public/users/{ids[0]}/projects",
        f"/api/v1/resume?user_id={ids[0]}",
        f"/api/v1/projects?user_id={ids[0]}",
    ):
        assert client.get(path).status_code == 404
        assert client.get(path, headers=b).status_code == 404
    assert client.get("/api/v1/portfolio").status_code == 401
    assert client.post("/api/v1/portfolio/publish", json={"revision": 0}).status_code == 401
    assert publish(client, b).status_code == 400
    assert client.get("/api/v1/portfolio", headers=b).json()["is_published"] is False


def test_publish_update_conflict_unpublish_and_owner_isolation(accounts):
    client, engine, ids, (a, b) = accounts
    state = prepare(client, a)
    group = client.post(
        "/api/v1/resume/skills", headers=a, json={"label": "Languages", "items": ["Python"]}
    ).json()
    client.post(
        "/api/v1/projects",
        headers=a,
        json={"slug": "example", "title": "Original", "summary": "Description", "technologies": []},
    )
    assert publish(client, a, state).status_code == 409
    response = publish(client, a)
    assert response.status_code == 200
    assert response.json()["has_unpublished_changes"] is False
    public = f"/api/v1/public/users/{ids[0]}"
    assert client.get(public + "/resume").json()["skills"][0]["items"][0]["item"] == "Python"
    assert client.get(public + "/resume").json()["skills"][0]["id"] != group["id"]
    client.patch("/api/v1/resume/profile", headers=a, json={"name": "Draft"})
    client.delete("/api/v1/projects/example", headers=a)
    assert client.get(public + "/resume").json()["profile"]["name"] == "Original"
    assert len(client.get(public + "/projects").json()["items"]) == 1
    assert client.get("/api/v1/portfolio", headers=a).json()["has_unpublished_changes"]
    assert client.get("/api/v1/resume", headers=b).json()["profile"]["name"] == ""
    assert (
        client.post(
            "/api/v1/portfolio/publish", headers=b, json={"revision": 0, "owner_id": ids[0]}
        ).status_code
        == 400
    )
    assert publish(client, a).status_code == 200
    assert client.get(public + "/resume").json()["profile"]["name"] == "Draft"
    assert client.get(public + "/projects").json()["items"] == []
    state = client.get("/api/v1/portfolio", headers=a).json()
    assert (
        client.post(
            "/api/v1/portfolio/unpublish", headers=a, json={"revision": state["revision"]}
        ).status_code
        == 200
    )
    assert client.get(public + "/resume").status_code == 404
    assert client.get("/api/v1/resume", headers=a).json()["profile"]["name"] == "Draft"
    assert publish(client, a).status_code == 200
    with Session(engine) as db:
        snapshot = db.scalar(
            select(PortfolioPublication.snapshot_owner_id).where(
                PortfolioPublication.owner_id == ids[0]
            )
        )
    assert client.get(f"/api/v1/public/users/{snapshot}/resume").status_code == 404


def test_published_images_survive_draft_replacement_and_removal(accounts, tmp_path):
    client, _, ids, (a, _) = accounts
    store = LocalProfileImageStore(tmp_path)
    app.dependency_overrides[get_image_store] = lambda: store
    try:
        prepare(client, a)

        def upload(color):
            stream = BytesIO()
            Image.new("RGB", (20, 20), color).save(stream, format="PNG")
            return client.put(
                "/api/v1/resume/profile/avatar",
                headers=a,
                files={"file": ("portrait.png", stream.getvalue(), "image/png")},
            )

        assert upload("red").status_code == 200
        client.post(
            "/api/v1/projects",
            headers=a,
            json={
                "slug": "with-image",
                "title": "Screenshot project",
                "summary": "Description",
                "technologies": [],
            },
        )
        stream = BytesIO()
        Image.new("RGB", (20, 20), "green").save(stream, format="PNG")
        assert (
            client.put(
                "/api/v1/projects/with-image/screenshot",
                headers=a,
                files={"file": ("project.png", stream.getvalue(), "image/png")},
            ).status_code
            == 200
        )
        assert publish(client, a).status_code == 200
        screenshot_url = f"/api/v1/public/users/{ids[0]}/projects/with-image/screenshot"
        screenshot = client.get(screenshot_url).content
        assert client.delete("/api/v1/projects/with-image", headers=a).status_code == 204
        assert client.get(screenshot_url).content == screenshot
        url = f"/api/v1/public/users/{ids[0]}/resume/profile/avatar"
        original = client.get(url).content
        assert upload("blue").status_code == 200
        assert client.get(url).content == original
        assert client.delete("/api/v1/resume/profile/avatar", headers=a).status_code == 204
        assert client.get(url).content == original
        assert publish(client, a).status_code == 200
        assert client.get(url).status_code == 404
        assert client.get(screenshot_url).status_code == 404
    finally:
        app.dependency_overrides.pop(get_image_store, None)


def test_failed_publish_keeps_previous_publication_intact(accounts, monkeypatch):
    from sqlalchemy import delete
    from sqlalchemy.exc import SQLAlchemyError

    from app.api.v1 import portfolio
    from app.models.resume import Profile

    client, _, ids, (a, _) = accounts
    prepare(client, a)
    assert publish(client, a).status_code == 200
    client.patch("/api/v1/resume/profile", headers=a, json={"name": "Private revision"})

    def fail_after_deletion(connection, source, destination):
        connection.execute(delete(Profile).where(Profile.user_id == destination))
        raise SQLAlchemyError("private database details")

    monkeypatch.setattr(portfolio, "copy_content", fail_after_deletion)
    failed = publish(client, a)
    assert failed.status_code == 503
    assert "private database details" not in failed.text
    public = client.get(f"/api/v1/public/users/{ids[0]}/resume")
    assert public.status_code == 200
    assert public.json()["profile"]["name"] == "Original"
    assert client.get("/api/v1/portfolio", headers=a).json()["has_unpublished_changes"]
