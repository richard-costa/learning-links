import hashlib
import os

import pytest

from learning_links.auth import hash_password
from learning_links.sessions import SessionStore
from learning_links.store import Store

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")


def test_session_token_is_hashed_and_revocable():
    with Store(TEST_DATABASE_URL) as store:
        try:
            user = store.add_user("session-test@example.com", hash_password("temporary-password"))
        except Exception:
            user = store.get_user("session-test@example.com")

    with SessionStore(TEST_DATABASE_URL) as sessions:
        sessions.delete_user_sessions(user.id)
        token, session = sessions.create(user.id)
        assert session.user.id == user.id
        assert session.csrf_token
        assert sessions.get(token) is not None

        row = sessions.conn.execute(
            "SELECT token_hash FROM sessions WHERE user_id=%s",
            (user.id,),
        ).fetchone()
        assert row["token_hash"] == hashlib.sha256(token.encode("utf-8")).hexdigest()
        assert row["token_hash"] != token

        sessions.delete(token)
        assert sessions.get(token) is None


def test_session_cap_removes_oldest_sessions():
    with Store(TEST_DATABASE_URL) as store:
        try:
            user = store.add_user("session-cap@example.com", hash_password("temporary-password"))
        except Exception:
            user = store.get_user("session-cap@example.com")

    with SessionStore(TEST_DATABASE_URL) as sessions:
        sessions.delete_user_sessions(user.id)
        first, _ = sessions.create(user.id, max_sessions_per_user=2)
        second, _ = sessions.create(user.id, max_sessions_per_user=2)
        third, _ = sessions.create(user.id, max_sessions_per_user=2)

        count = sessions.conn.execute(
            "SELECT COUNT(*) AS n FROM sessions WHERE user_id=%s",
            (user.id,),
        ).fetchone()["n"]
        assert count == 2
        assert sessions.get(first) is None
        assert sessions.get(second) is not None
        assert sessions.get(third) is not None
        sessions.delete_user_sessions(user.id)


def test_deleting_user_removes_sessions():
    with Store(TEST_DATABASE_URL) as store:
        try:
            user = store.add_user("session-cascade@example.com", hash_password("temporary-password"))
        except Exception:
            user = store.get_user("session-cascade@example.com")

    with SessionStore(TEST_DATABASE_URL) as sessions:
        sessions.delete_user_sessions(user.id)
        token, _ = sessions.create(user.id)

    with Store(TEST_DATABASE_URL) as store:
        store.conn.execute("DELETE FROM users WHERE id=%s", (user.id,))
        store.conn.commit()

    with SessionStore(TEST_DATABASE_URL) as sessions:
        assert sessions.get(token) is None
