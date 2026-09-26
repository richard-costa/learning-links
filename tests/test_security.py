import os

import pytest

from learning_links.api import env_int, signup_enabled
from learning_links.security import RateLimitStore

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


def test_signup_disabled_by_default(monkeypatch):
    monkeypatch.delenv("LEARNING_LINKS_ENABLE_SIGNUP", raising=False)
    assert not signup_enabled()
    monkeypatch.setenv("LEARNING_LINKS_ENABLE_SIGNUP", "1")
    assert signup_enabled()


def test_env_int_rejects_invalid_minimum(monkeypatch):
    monkeypatch.setenv("LEARNING_LINKS_TEST_LIMIT", "0")
    with pytest.raises(RuntimeError):
        env_int("LEARNING_LINKS_TEST_LIMIT", 10)


@pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")
def test_rate_limit_persists_across_instances():
    scope = "pytest-rate-limit"
    key = "same-client"

    with RateLimitStore(TEST_DATABASE_URL) as limits:
        limits.clear(scope, key)
        assert limits.hit(scope, key, limit=2, window_seconds=60).allowed

    with RateLimitStore(TEST_DATABASE_URL) as limits:
        assert limits.hit(scope, key, limit=2, window_seconds=60).allowed
        blocked = limits.hit(scope, key, limit=2, window_seconds=60)
        assert not blocked.allowed
        assert blocked.retry_after >= 1
        limits.clear(scope, key)
