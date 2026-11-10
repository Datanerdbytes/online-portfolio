import os

import httpx

from app.core.config import normalize_no_proxy_env

MALFORMED = "localhost,.localhost,127.0.0.1,127.0.0.0/8,[::1],::1"
NORMALIZED = "localhost,.localhost,127.0.0.1,127.0.0.0/8,::1"


def test_bracketed_ipv6_no_proxy_entries_are_normalized(monkeypatch):
    monkeypatch.setenv("NO_PROXY", MALFORMED)
    monkeypatch.setenv("no_proxy", MALFORMED)
    normalize_no_proxy_env()
    assert os.environ["NO_PROXY"] == NORMALIZED
    assert os.environ["no_proxy"] == NORMALIZED
    with httpx.Client():
        pass


def test_valid_no_proxy_is_preserved(monkeypatch):
    monkeypatch.setenv("NO_PROXY", NORMALIZED)
    monkeypatch.setenv("no_proxy", NORMALIZED)
    normalize_no_proxy_env()
    assert os.environ["NO_PROXY"] == NORMALIZED
    assert os.environ["no_proxy"] == NORMALIZED


def test_absent_no_proxy_stays_absent(monkeypatch):
    monkeypatch.delenv("NO_PROXY", raising=False)
    monkeypatch.delenv("no_proxy", raising=False)
    normalize_no_proxy_env()
    assert "NO_PROXY" not in os.environ
    assert "no_proxy" not in os.environ
