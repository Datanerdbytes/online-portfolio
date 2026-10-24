"""Narrative writing drafts are bounded and never treated as saved content."""

import json

import httpx
import pytest
from pydantic import ValidationError

from app.schemas.resume_import import WritingRequest
from app.services import resume_writing as writing
from app.services.resume_extraction import ImportProblem


def request(**changes):
    return WritingRequest(
        **{
            "consent": True,
            "expected_owner_id": "owner",
            "section": "profile",
            "field": "headline",
            "facts": "Data engineering candidate. Builds Python pipelines.",
            **changes,
        }
    )


def mock_provider(
    monkeypatch,
    text="Data engineering candidate | Python pipelines",
    status=200,
    finish="stop",
    limit=300,
):
    original = httpx.AsyncClient

    def respond(req):
        payload = json.loads(req.content)
        assert payload["chat_template_kwargs"]["enable_thinking"] is False
        assert (
            payload["response_format"]["json_schema"]["schema"]["properties"]["text"]["maxLength"]
            == limit
        )
        assert "tools" not in payload
        assert "expected_owner_id" not in payload["messages"][1]["content"]
        return httpx.Response(
            status,
            json={
                "choices": [
                    {"finish_reason": finish, "message": {"content": json.dumps({"text": text})}}
                ]
            },
        )

    monkeypatch.setattr(
        writing.httpx,
        "AsyncClient",
        lambda **kw: original(transport=httpx.MockTransport(respond), **kw),
    )


def test_writing_returns_separate_plain_text_draft(monkeypatch):
    mock_provider(monkeypatch)
    result = writing.write_field(request())
    assert "candidate" in result.text


def test_introduction_accepts_only_requested_prose(monkeypatch):
    text = "I build Python pipelines and validate transformed data with SQL tests."
    mock_provider(monkeypatch, text=text, limit=2000)
    assert writing.write_field(request(field="introduction")).text == text


@pytest.mark.parametrize(
    "text",
    [
        "HEADLINE: Data candidate. INTRODUCTION: I build pipelines. "
        "ABOUT: My background is support.",
        "I build pipelines.\n\n**About:** My background is support.",
    ],
)
def test_introduction_rejects_multiple_profile_sections(monkeypatch, text):
    mock_provider(monkeypatch, text=text, limit=2000)
    with pytest.raises(ImportProblem, match="requested field"):
        writing.write_field(request(field="introduction"))


@pytest.mark.parametrize("field", ["name", "email", "started", "role", "institution"])
def test_factual_identity_fields_cannot_be_written_with_ai(field):
    with pytest.raises(ValidationError):
        WritingRequest(
            consent=True, expected_owner_id="owner", section="profile", field=field, facts="Facts"
        )


@pytest.mark.parametrize(
    "text,status,finish",
    [
        ("9 years of experience", 200, "stop"),
        ("x" * 301, 200, "stop"),
        ("Draft", 429, "stop"),
        ("Draft", 200, "length"),
        ("", 200, "stop"),
    ],
)
def test_invalid_or_unavailable_writing_does_not_return_a_draft(monkeypatch, text, status, finish):
    mock_provider(monkeypatch, text, status, finish)
    with pytest.raises(ImportProblem):
        writing.write_field(request())


def test_writing_requires_explicit_consent():
    with pytest.raises(ValidationError):
        WritingRequest(
            consent=False,
            expected_owner_id="owner",
            section="profile",
            field="headline",
            facts="Python pipelines",
        )
