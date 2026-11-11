"""Synthetic documents and provider failures; no real personal data or API calls."""

import copy
import io
import json
import zipfile

import httpx
import pytest
from docx import Document
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.services import resume_extraction as extraction
from app.services.resume_extraction import ImportProblem, extract_document, validate_extraction

TEXT = "Alex Example\nData Engineer\nBuilds reliable data pipelines with Python."


def pdf(pages=None, encrypted=False):
    writer = PdfWriter()
    for value in pages or [TEXT]:
        page = writer.add_blank_page(width=612, height=792)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
        )
        stream = DecodedStreamObject()
        stream.set_data(
            (
                "BT /F1 12 Tf 50 700 Td (" + value.replace("\n", ") Tj 0 -18 Td (") + ") Tj ET"
            ).encode()
        )
        page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("test-only")
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def docx(text=TEXT):
    document = Document()
    document.add_paragraph(text)
    row = document.add_table(rows=1, cols=2).rows[0]
    row.cells[0].text = "Python"
    row.cells[1].text = "SQL"
    output = io.BytesIO()
    document.save(output)
    return output.getvalue()


def proposal():
    return {
        "candidates": [
            {
                "section": "profile",
                "values": {"name": "Alex Example"},
                "evidence": {"name": "Alex Example"},
                "generated": [],
                "warnings": [],
            }
        ],
        "not_imported": [],
    }


def txt(text=TEXT, encoding="utf-8", bom=False):
    data = text.encode(encoding)
    if bom and encoding == "utf-8":
        data = b"\xef\xbb\xbf" + data
    return data


def test_reads_pdf_word_and_text_files():
    assert "Alex Example" in extract_document(pdf(), ".pdf")
    assert "Python | SQL" in extract_document(docx(), ".docx")
    assert "Alex Example" in extract_document(txt(), ".txt")
    assert "Alex Example" in extract_document(txt(bom=True), ".txt")


@pytest.mark.parametrize(
    "data,extension,match",
    [
        (b"fake.pdf", ".pdf", "content"),
        (b"%PDF-corrupt", ".pdf", "could not read"),
        (pdf(encrypted=True), ".pdf", "Password"),
        (pdf([TEXT] * 11), ".pdf", "10 pages"),
        (b"x" * (3 * 1024 * 1024 + 1), ".docx", "3 MiB"),
        (b"\x00" * 40, ".txt", "readable"),
        (b"   \n\t  ", ".txt", "readable"),
        (b"\xff\xfe\x00\x00bad", ".txt", "readable"),
    ],
)
def test_rejects_bad_and_incomplete_documents(data, extension, match):
    with pytest.raises(ImportProblem, match=match):
        extract_document(data, extension)


def test_rejects_expanded_word_and_too_much_text():
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", b"x" * (21 * 1024 * 1024))
    with pytest.raises(ImportProblem, match="complex"):
        extract_document(output.getvalue(), ".docx")
    with pytest.raises(ImportProblem, match="50,000"):
        extract_document(docx("x" * 50001), ".docx")


def test_excerpts_and_generated_fields_are_verified():
    assert validate_extraction(proposal(), TEXT).candidates[0].values["name"] == "Alex Example"
    invented = proposal()
    invented["candidates"][0]["evidence"]["name"] = "Invented Person"
    corrected = validate_extraction(invented, TEXT)
    assert corrected.candidates[0].evidence["name"] == "Alex Example"
    invented["candidates"][0]["values"]["name"] = "Unsupported person"
    with pytest.raises(ImportProblem, match="verified"):
        validate_extraction(invented, TEXT)
    generated = proposal()
    generated["candidates"][0]["generated"] = ["name"]
    with pytest.raises(ImportProblem, match="verified"):
        validate_extraction(generated, TEXT)
    generated = proposal()
    generated["candidates"][0]["values"]["headline"] = "Data professional"
    generated["candidates"][0]["generated"] = ["headline"]
    assert validate_extraction(generated, TEXT).candidates[0].generated == ["headline"]


@pytest.mark.parametrize(
    "status,finish,content",
    [(429, "stop", "{}"), (200, "length", "{}"), (200, "stop", "not json"), (200, "stop", "{}")],
)
def test_provider_failures_do_not_return_candidates(monkeypatch, status, finish, content):
    original = httpx.AsyncClient

    def handler(request):
        return httpx.Response(
            status, json={"choices": [{"finish_reason": finish, "message": {"content": content}}]}
        )

    monkeypatch.setattr(
        extraction.httpx,
        "AsyncClient",
        lambda **kw: original(transport=httpx.MockTransport(handler), **kw),
    )
    with pytest.raises(ImportProblem):
        extraction.map_resume(TEXT)


def test_provider_timeout_reports_a_retryable_failure(monkeypatch):
    original = httpx.AsyncClient

    def handler(request):
        raise httpx.ReadTimeout("test-only timeout", request=request)

    monkeypatch.setattr(
        extraction.httpx,
        "AsyncClient",
        lambda **kw: original(transport=httpx.MockTransport(handler), **kw),
    )
    with pytest.raises(ImportProblem, match="took too long"):
        extraction.map_resume(TEXT)


def test_provider_receives_only_source_and_mapping_instructions(monkeypatch):
    original = httpx.AsyncClient

    def handler(request):
        body = json.loads(request.content)
        assert body["messages"][1] == {"role": "user", "content": TEXT}
        assert "tools" not in body and body["stream"] is False
        assert body["response_format"]["type"] == "json_schema"
        assert body["chat_template_kwargs"]["enable_thinking"] is False
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"finish_reason": "stop", "message": {"content": json.dumps(proposal())}}
                ]
            },
        )

    monkeypatch.setattr(
        extraction.httpx,
        "AsyncClient",
        lambda **kw: original(transport=httpx.MockTransport(handler), **kw),
    )
    assert extraction.map_resume(TEXT).candidates


def test_real_isolated_parser_worker():
    assert "Alex Example" in extraction.extract_bounded(docx(), ".docx")
    assert "Alex Example" in extraction.extract_bounded(txt(), ".txt")
    with pytest.raises(ImportProblem, match="content"):
        extraction.extract_bounded(b"not a pdf", ".pdf")


@pytest.fixture
def partial_mapping():
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "projects",
            "values": {"title": "Data Engineer", "summary": "Unsupported project summary"},
            "evidence": {"title": "Data Engineer", "summary": "Unsupported project summary"},
            "generated": [],
            "warnings": [],
        }
    )
    return payload


def test_partial_mapping_preserves_verified_fields_without_mutating_input(partial_mapping):
    original = copy.deepcopy(partial_mapping)
    result = validate_extraction(partial_mapping, TEXT)
    assert len(result.candidates) == 2
    assert result.candidates[0].values == {"name": "Alex Example"}
    project = result.candidates[1]
    assert project.values == {"title": "Data Engineer"}
    assert project.evidence == {"title": "Data Engineer"}
    assert any("summary" in warning and "omitted" in warning for warning in project.warnings)
    assert partial_mapping == original
    assert extraction.Extraction.model_validate(result.model_dump()) == result


def test_provider_partial_mapping_returns_verified_review(monkeypatch, partial_mapping):
    original = httpx.AsyncClient

    def handler(request):
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"finish_reason": "stop", "message": {"content": json.dumps(partial_mapping)}}
                ]
            },
        )

    monkeypatch.setattr(
        extraction.httpx,
        "AsyncClient",
        lambda **kw: original(transport=httpx.MockTransport(handler), **kw),
    )
    result = extraction.map_resume(TEXT)
    assert len(result.candidates) == 2
    assert result.candidates[1].values == {"title": "Data Engineer"}
    assert result.candidates[1].warnings


@pytest.mark.parametrize("evidence", [None, "", "Unsupported quote", ["Data Engineer", "Wrong"]])
def test_partial_mapping_omits_unverified_field_with_missing_or_bad_evidence(
    partial_mapping, evidence
):
    partial_mapping["candidates"][1]["evidence"]["summary"] = evidence
    result = validate_extraction(partial_mapping, TEXT)
    assert result.candidates[1].values == {"title": "Data Engineer"}
    assert result.candidates[1].evidence == {"title": "Data Engineer"}


def test_partial_mapping_preserves_allowed_generated_suggestions(partial_mapping):
    profile = partial_mapping["candidates"][0]
    profile["values"]["headline"] = "Data professional"
    profile["generated"] = ["headline"]
    result = validate_extraction(partial_mapping, TEXT)
    assert result.candidates[0].values["headline"] == "Data professional"
    assert result.candidates[0].generated == ["headline"]
    assert "headline" not in result.candidates[0].evidence


def test_partial_mapping_drops_empty_candidates_and_reports_omission(partial_mapping):
    project = partial_mapping["candidates"][1]
    project["values"]["title"] = "Unsupported title"
    project["evidence"]["title"] = "Unsupported title"
    result = validate_extraction(partial_mapping, TEXT)
    assert len(result.candidates) == 1
    assert result.candidates[0].section == "profile"
    assert any("omitted" in note for note in result.not_imported)


@pytest.mark.parametrize("values", [{}, {"name": ""}, {"name": None}, {"name": "Unsupported"}])
def test_mapping_rejects_results_without_usable_fields(values):
    payload = proposal()
    payload["candidates"][0]["values"] = values
    payload["candidates"][0]["evidence"] = {}
    with pytest.raises(ImportProblem, match="verified"):
        validate_extraction(payload, TEXT)


def test_mapping_rejects_lists_with_no_verified_items():
    payload = {
        "candidates": [
            {
                "section": "skills",
                "values": {"items": ["Unsupported tool"]},
                "evidence": {"items": ["Unsupported tool"]},
            }
        ]
    }
    with pytest.raises(ImportProblem, match="verified"):
        validate_extraction(payload, TEXT)


def test_partial_mapping_preserves_verified_false_values(partial_mapping):
    partial_mapping["candidates"].append(
        {
            "section": "experience",
            "values": {"current": False},
            "evidence": {"current": "Role ended"},
        }
    )
    result = validate_extraction(partial_mapping, TEXT + "\nRole ended")
    assert result.candidates[2].values == {"current": False}
    assert result.candidates[2].evidence == {"current": "Role ended"}


def test_partial_mapping_removes_generated_marker_with_unsupported_quote(partial_mapping):
    profile = partial_mapping["candidates"][0]
    profile["values"]["headline"] = "Data professional"
    profile["evidence"]["headline"] = "Unsupported quote"
    profile["generated"] = ["headline"]
    result = validate_extraction(partial_mapping, TEXT)
    assert result.candidates[0].values == {"name": "Alex Example"}
    assert result.candidates[0].generated == []
    assert "headline" not in result.candidates[0].evidence
    assert extraction.Extraction.model_validate(result.model_dump()) == result


def test_partial_mapping_keeps_warnings_and_notes_within_schema_limits(partial_mapping):
    project = partial_mapping["candidates"][1]
    project["warnings"] = [f"Existing warning {i}" for i in range(20)]
    result = validate_extraction(partial_mapping, TEXT)
    assert len(result.candidates[1].warnings) <= 20
    assert any("summary" in warning for warning in result.candidates[1].warnings)
    project["values"]["title"] = "Unsupported title"
    project["evidence"]["title"] = "Unsupported title"
    partial_mapping["not_imported"] = [f"Existing note {i}" for i in range(30)]
    result = validate_extraction(partial_mapping, TEXT)
    assert len(result.not_imported) <= 30
    assert any("omitted" in note for note in result.not_imported)
    assert extraction.Extraction.model_validate(result.model_dump()) == result


@pytest.mark.parametrize("value", [42, "x" * 1001])
def test_partial_mapping_does_not_hide_schema_violations(partial_mapping, value):
    partial_mapping["candidates"][1]["values"]["summary"] = value
    with pytest.raises(ImportProblem, match="verified"):
        validate_extraction(partial_mapping, TEXT)


def test_partial_mapping_combines_verified_singleton_fields(partial_mapping):
    partial_mapping["candidates"].extend(
        [
            {
                "section": "profile",
                "values": {"headline": "Data Engineer"},
                "evidence": {"headline": "Data Engineer"},
            },
            {
                "section": "profile",
                "values": {"introduction": "Data professional"},
                "evidence": {},
                "generated": ["introduction"],
            },
        ]
    )
    result = validate_extraction(partial_mapping, TEXT)
    profiles = [c for c in result.candidates if c.section == "profile"]
    assert len(profiles) == 1
    assert profiles[0].values == {
        "name": "Alex Example",
        "headline": "Data Engineer",
        "introduction": "Data professional",
    }
    assert profiles[0].evidence == {"name": "Alex Example", "headline": "Data Engineer"}
    assert profiles[0].generated == ["introduction"]
    assert any("combined" in warning for warning in profiles[0].warnings)
    assert result.not_imported == []
    assert extraction.Extraction.model_validate(result.model_dump()) == result


@pytest.mark.parametrize("section,key", [("profile", "name"), ("contact", "email")])
def test_duplicate_singletons_keep_first_verified_value_and_warn_on_conflict(section, key):
    payload = {
        "candidates": [
            {"section": section, "values": {key: value}, "evidence": {key: value}}
            for value in ["first@example.test", "second@example.test"]
        ]
    }
    result = validate_extraction(payload, "first@example.test second@example.test")
    assert len(result.candidates) == 1
    assert result.candidates[0].values == {key: "first@example.test"}
    assert result.candidates[0].evidence == {key: "first@example.test"}
    assert any(
        "Conflicting" in warning and key in warning for warning in result.candidates[0].warnings
    )


def test_duplicate_singletons_do_not_hide_bad_fields_or_relax_final_schema(partial_mapping):
    partial_mapping["candidates"].append(copy.deepcopy(partial_mapping["candidates"][0]))
    with pytest.raises(ValueError, match="Only one"):
        extraction.Extraction.model_validate(partial_mapping)
    partial_mapping["candidates"][-1]["values"]["name"] = 42
    with pytest.raises(ImportProblem, match="verified"):
        validate_extraction(partial_mapping, TEXT)


def test_duplicate_singletons_ignore_unsupported_first_value(partial_mapping):
    partial_mapping["candidates"].append(copy.deepcopy(partial_mapping["candidates"][0]))
    partial_mapping["candidates"][0]["values"]["name"] = "Unsupported name"
    partial_mapping["candidates"][0]["evidence"]["name"] = "Unsupported name"
    result = validate_extraction(partial_mapping, TEXT)
    profiles = [c for c in result.candidates if c.section == "profile"]
    assert len(profiles) == 1
    assert profiles[0].values == {"name": "Alex Example"}


def test_normalizes_document_ligatures_without_generating_words():
    text = extract_document(
        docx("Alex Example uses Snowﬂake for reliable analytics pipelines."), ".docx"
    )
    assert "Snowflake" in text
    assert "Alex Example" in text


def test_absent_evidence_null_is_not_accepted_as_proof():
    payload = proposal()
    payload["candidates"][0]["values"]["location"] = None
    payload["candidates"][0]["evidence"]["location"] = None
    assert "location" not in validate_extraction(payload, TEXT).candidates[0].evidence
    payload["candidates"][0]["evidence"]["name"] = None
    payload["candidates"][0]["values"]["name"] = "Unsupported person"
    with pytest.raises(ImportProblem, match="verified"):
        validate_extraction(payload, TEXT)


def test_evidence_for_a_missing_value_is_dropped_instead_of_failing_the_import():
    text = "Alex Example\nSales dashboard: cut reporting time from 3 days to 4 hours."
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "projects",
            "values": {"title": "Sales dashboard", "summary": None},
            "evidence": {
                "title": "Sales dashboard",
                "summary": "cut reporting time",
                "highlights": ["cut reporting time from 3 days to 4 hours"],
            },
            "generated": [],
            "warnings": [],
        }
    )
    result = validate_extraction(payload, text)
    project = result.candidates[1]
    assert project.values == {"title": "Sales dashboard"}
    assert project.evidence == {"title": "Sales dashboard"}


def test_missing_list_null_is_absence_not_a_factual_value():
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "experience",
            "values": {"role": "Data Engineer", "highlights": None},
            "evidence": {"role": "Data Engineer", "highlights": None},
            "generated": [],
            "warnings": [],
        }
    )
    result = validate_extraction(payload, TEXT)
    assert "highlights" not in result.candidates[1].values


def test_missing_scalar_citation_requires_the_value_to_exist_in_source():
    payload = proposal()
    payload["candidates"][0]["evidence"] = {}
    assert validate_extraction(payload, TEXT).candidates[0].evidence["name"] == "Alex Example"
    payload["candidates"][0]["values"]["name"] = "Invented Name"
    with pytest.raises(ImportProblem, match="verified"):
        validate_extraction(payload, TEXT)


def test_reflowed_quote_is_replaced_with_actual_source_span():
    payload = proposal()
    payload["candidates"][0]["evidence"]["name"] = "Alex Example"
    result = validate_extraction(payload, "Alex\nExample: Data Engineer")
    assert result.candidates[0].evidence["name"] == "Alex\nExample"


def test_empty_suggestion_is_omitted_instead_of_inventing_content():
    payload = proposal()
    payload["candidates"][0]["values"]["headline"] = None
    payload["candidates"][0]["generated"] = ["headline"]
    candidate = validate_extraction(payload, TEXT).candidates[0]
    assert "headline" not in candidate.values
    assert candidate.generated == []


def test_list_items_are_grounded_individually_and_unverified_items_omitted():
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "skills",
            "values": {"label": "Data Engineer", "items": ["Data Engineer", "Unsupported tool"]},
            "evidence": {"label": "Data Engineer", "items": "invented joined quote"},
            "generated": [],
            "warnings": [],
        }
    )
    candidate = validate_extraction(payload, TEXT).candidates[1]
    assert candidate.values["items"] == ["Data Engineer"]
    assert candidate.evidence["items"] == ["Data Engineer"]
    assert candidate.warnings


def test_wrapped_url_is_verified_without_following_it():
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "links",
            "values": {"label": "GitHub", "url": "https://github.com/example"},
            "evidence": {"label": "GitHub", "url": "https://github.com/example"},
            "generated": [],
            "warnings": [],
        }
    )
    result = validate_extraction(payload, TEXT + "\nGitHub: https://github.com/\nexample")
    assert result.candidates[1].evidence["url"] == "https://github.com/\nexample"


def test_letter_spaced_source_text_grounds_a_normalized_item():
    text = "Alex Example\nSkills\nM e d a l l i o n  A r c h i t e c t u r e\nGoogle BigQuery"
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "skills",
            "values": {
                "label": "Skills",
                "items": ["Medallion Architecture", "Google BigQuery"],
            },
            "evidence": {
                "label": "Skills",
                "items": ["Medallion Architecture", "Google BigQuery"],
            },
            "generated": [],
            "warnings": [],
        }
    )
    candidate = validate_extraction(payload, text).candidates[1]
    assert candidate.values["items"] == ["Medallion Architecture", "Google BigQuery"]
    assert all(item in text for item in candidate.evidence["items"])


def test_hyphen_line_break_grounds_a_joined_item():
    text = (
        "Alex Example\nCore Strengths: Analytical Troubleshooting, Cross-\nFunctional Communication"
    )
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "skills",
            "values": {"label": "Core Strengths", "items": ["Cross-Functional Communication"]},
            "evidence": {"label": "Core Strengths", "items": ["Cross-Functional Communication"]},
            "generated": [],
            "warnings": [],
        }
    )
    candidate = validate_extraction(payload, text).candidates[1]
    assert candidate.values["items"] == ["Cross-Functional Communication"]
    assert candidate.evidence["items"] == ["Cross-\nFunctional Communication"]


def test_month_year_date_normalizes_to_yyyy_mm_with_original_evidence():
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "experience",
            "values": {"role": "Data Engineer", "started": "2021-10"},
            "evidence": {"role": "Data Engineer", "started": "Oct 2021"},
            "generated": [],
            "warnings": [],
        }
    )
    result = validate_extraction(payload, TEXT + "\nAcme Corp, Oct 2021 - Present")
    candidate = result.candidates[1]
    assert candidate.values["started"] == "2021-10"
    assert candidate.evidence["started"] == "Oct 2021"


def test_year_only_date_is_not_forced_into_a_month():
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "experience",
            "values": {"role": "Data Engineer", "started": "2021"},
            "evidence": {"role": "Data Engineer", "started": "2021"},
            "generated": [],
            "warnings": [],
        }
    )
    result = validate_extraction(payload, TEXT + "\nAcme Corp, 2021 - Present")
    assert result.candidates[1].values["started"] == "2021"


@pytest.mark.parametrize("evidence", ["https://github.com/example", "github.com/example"])
def test_scheme_less_source_url_grounds_with_https_value(evidence):
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "links",
            "values": {"label": "GitHub", "url": "https://github.com/example"},
            "evidence": {"label": "GitHub", "url": evidence},
            "generated": [],
            "warnings": [],
        }
    )
    result = validate_extraction(payload, TEXT + "\nGitHub: github.com/example")
    candidate = result.candidates[1]
    assert candidate.values["url"] == "https://github.com/example"
    assert candidate.evidence["url"] == "github.com/example"


def test_scheme_less_fallback_does_not_ground_an_invented_url():
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "links",
            "values": {"label": "GitHub", "url": "https://evil.example.com/x"},
            "evidence": {"label": "GitHub", "url": "https://evil.example.com/x"},
            "generated": [],
            "warnings": [],
        }
    )
    result = validate_extraction(payload, TEXT + "\nGitHub: github.com/example")
    assert "url" not in result.candidates[1].values


def test_project_highlights_are_grounded_individually():
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "projects",
            "values": {
                "title": "Data Engineer",
                "summary": "Builds reliable data pipelines with Python.",
                "highlights": ["Builds reliable data pipelines with Python.", "Unsupported claim"],
            },
            "evidence": {
                "title": "Data Engineer",
                "summary": "Builds reliable data pipelines with Python.",
                "highlights": ["Builds reliable data pipelines with Python.", "Unsupported claim"],
            },
            "generated": [],
            "warnings": [],
        }
    )
    candidate = validate_extraction(payload, TEXT).candidates[1]
    assert candidate.values["highlights"] == ["Builds reliable data pipelines with Python."]
    assert candidate.evidence["highlights"] == ["Builds reliable data pipelines with Python."]
    assert candidate.warnings


@pytest.mark.parametrize("items", [[42], ["Data Engineer"] * 101])
def test_malformed_lists_are_rejected_before_source_filtering(items):
    payload = proposal()
    payload["candidates"].append(
        {
            "section": "skills",
            "values": {"label": "Data Engineer", "items": items},
            "evidence": {"label": "Data Engineer", "items": ["Data Engineer"]},
            "generated": [],
            "warnings": [],
        }
    )
    with pytest.raises(ImportProblem, match="verified"):
        validate_extraction(payload, TEXT)
