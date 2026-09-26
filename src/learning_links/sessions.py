from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.rows import dict_row

from .store import User


@dataclass(frozen=True)
class Session:
    user: User
    csrf_token: str
    expires_at: datetime


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class SessionStore:
    def __init__(self, database_url: str):
        self.conn = psycopg.connect(database_url, row_factory=dict_row)
        self._create_schema()

    def _create_schema(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash CHAR(64) PRIMARY KEY,
                user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                csrf_token TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                expires_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)"
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)"
        )
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def create(self, user_id: int, *, ttl_days: int = 7) -> tuple[str, Session]:
        token = secrets.token_urlsafe(32)
        csrf_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)
        self.conn.execute(
            """
            INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at)
            VALUES (%s,%s,%s,%s)
            """,
            (_token_hash(token), user_id, csrf_token, expires_at),
        )
        self.conn.commit()
        session = self.get(token)
        if session is None:
            raise RuntimeError("failed to create session")
        return token, session

    def get(self, token: str) -> Session | None:
        if not token:
            return None
        row = self.conn.execute(
            """
            SELECT
                s.csrf_token,s.expires_at,
                u.id,u.email,u.password_hash,u.active
            FROM sessions s
            JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=%s
              AND s.expires_at > now()
              AND u.active=TRUE
            """,
            (_token_hash(token),),
        ).fetchone()
        if row is None:
            return None
        self.conn.execute(
            "UPDATE sessions SET last_seen_at=now() WHERE token_hash=%s",
            (_token_hash(token),),
        )
        self.conn.commit()
        return Session(
            user=User(row["id"], row["email"], row["password_hash"], row["active"]),
            csrf_token=row["csrf_token"],
            expires_at=row["expires_at"],
        )

    def delete(self, token: str) -> None:
        if not token:
            return
        self.conn.execute("DELETE FROM sessions WHERE token_hash=%s", (_token_hash(token),))
        self.conn.commit()

    def delete_user_sessions(self, user_id: int) -> None:
        self.conn.execute("DELETE FROM sessions WHERE user_id=%s", (user_id,))
        self.conn.commit()

    def cleanup_expired(self) -> int:
        cursor = self.conn.execute("DELETE FROM sessions WHERE expires_at <= now()")
        self.conn.commit()
        return cursor.rowcount
