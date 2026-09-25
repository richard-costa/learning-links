from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

VALID_STATUSES = ("planned", "learning", "learned", "later")
VALID_KINDS = ("prerequisite", "helpful")


@dataclass(frozen=True)
class Topic:
    id: int
    name: str
    url: str | None
    status: str


@dataclass(frozen=True)
class Relationship:
    topic: Topic
    supporting_topic: Topic
    kind: str


@dataclass(frozen=True)
class TopicSummary:
    topic: Topic
    supported_by_count: int
    supports_count: int

    @property
    def isolated(self) -> bool:
        return self.supported_by_count == 0 and self.supports_count == 0


class StoreError(Exception):
    pass


class TopicNotFound(StoreError):
    pass


class DuplicateTopic(StoreError):
    pass


class InvalidRelationship(StoreError):
    pass


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        if self.path.parent != Path("."):
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript("""
        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            url TEXT,
            status TEXT NOT NULL DEFAULT 'planned'
                CHECK(status IN ('planned','learning','learned','later'))
        );
        CREATE TABLE IF NOT EXISTS relationships (
            topic_id INTEGER NOT NULL,
            supporting_topic_id INTEGER NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('prerequisite','helpful')),
            PRIMARY KEY(topic_id, supporting_topic_id),
            CHECK(topic_id <> supporting_topic_id),
            FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE,
            FOREIGN KEY(supporting_topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );
        """)
        self.conn.commit()

    def close(self):
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    @staticmethod
    def _topic(row):
        return Topic(row["id"], row["name"], row["url"], row["status"])

    def get_topic(self, name: str) -> Topic:
        row = self.conn.execute(
            "SELECT id,name,url,status FROM topics WHERE name=? COLLATE NOCASE", (name,)
        ).fetchone()
        if row is None:
            raise TopicNotFound(f"topic not found: {name}")
        return self._topic(row)

    def add_topic(self, name: str, url: str | None = None, status: str = "planned") -> Topic:
        name = name.strip()
        if not name:
            raise StoreError("topic name cannot be empty")
        if status not in VALID_STATUSES:
            raise StoreError(f"invalid status: {status}")
        try:
            self.conn.execute("INSERT INTO topics(name,url,status) VALUES (?,?,?)", (name,url,status))
            self.conn.commit()
        except sqlite3.IntegrityError as exc:
            raise DuplicateTopic(f"topic already exists: {name}") from exc
        return self.get_topic(name)

    def list_topics(self):
        rows = self.conn.execute(
            "SELECT id,name,url,status FROM topics ORDER BY name COLLATE NOCASE"
        ).fetchall()
        return [self._topic(r) for r in rows]

    def edit_topic(self, name: str, *, new_name=None, url=None, status=None, set_url=False) -> Topic:
        topic = self.get_topic(name)
        final_name = new_name.strip() if new_name is not None else topic.name
        final_url = url if set_url else topic.url
        final_status = status if status is not None else topic.status
        if not final_name:
            raise StoreError("topic name cannot be empty")
        if final_status not in VALID_STATUSES:
            raise StoreError(f"invalid status: {final_status}")
        try:
            self.conn.execute(
                "UPDATE topics SET name=?, url=?, status=? WHERE id=?",
                (final_name, final_url, final_status, topic.id),
            )
            self.conn.commit()
        except sqlite3.IntegrityError as exc:
            raise DuplicateTopic(f"topic already exists: {final_name}") from exc
        return self.get_topic(final_name)

    def remove_topic(self, name: str):
        topic = self.get_topic(name)
        self.conn.execute("DELETE FROM topics WHERE id=?", (topic.id,))
        self.conn.commit()

    def link(self, topic_name: str, supporting_name: str, kind: str) -> Relationship:
        if kind not in VALID_KINDS:
            raise InvalidRelationship(f"invalid relationship kind: {kind}")
        topic = self.get_topic(topic_name)
        supporting = self.get_topic(supporting_name)
        if topic.id == supporting.id:
            raise InvalidRelationship("a topic cannot support itself")
        self.conn.execute(
            """
            INSERT INTO relationships(topic_id,supporting_topic_id,kind) VALUES (?,?,?)
            ON CONFLICT(topic_id,supporting_topic_id) DO UPDATE SET kind=excluded.kind
            """,
            (topic.id, supporting.id, kind),
        )
        self.conn.commit()
        return Relationship(topic, supporting, kind)

    def unlink(self, topic_name: str, supporting_name: str) -> bool:
        topic = self.get_topic(topic_name)
        supporting = self.get_topic(supporting_name)
        cur = self.conn.execute(
            "DELETE FROM relationships WHERE topic_id=? AND supporting_topic_id=?",
            (topic.id, supporting.id),
        )
        self.conn.commit()
        return cur.rowcount > 0

    def supported_by(self, name: str):
        topic = self.get_topic(name)
        rows = self.conn.execute(
            """
            SELECT t.id,t.name,t.url,t.status,r.kind
            FROM relationships r JOIN topics t ON t.id=r.supporting_topic_id
            WHERE r.topic_id=? ORDER BY r.kind,t.name COLLATE NOCASE
            """,
            (topic.id,),
        ).fetchall()
        return [(self._topic(r), r["kind"]) for r in rows]

    def supports(self, name: str):
        topic = self.get_topic(name)
        rows = self.conn.execute(
            """
            SELECT t.id,t.name,t.url,t.status,r.kind
            FROM relationships r JOIN topics t ON t.id=r.topic_id
            WHERE r.supporting_topic_id=? ORDER BY r.kind,t.name COLLATE NOCASE
            """,
            (topic.id,),
        ).fetchall()
        return [(self._topic(r), r["kind"]) for r in rows]

    def importance(self):
        rows = self.conn.execute(
            """
            SELECT t.id,t.name,t.url,t.status,COUNT(r.topic_id) AS n
            FROM topics t LEFT JOIN relationships r ON r.supporting_topic_id=t.id
            GROUP BY t.id ORDER BY n DESC,t.name COLLATE NOCASE
            """
        ).fetchall()
        return [(self._topic(r), int(r["n"])) for r in rows]

    def overview(self) -> list[TopicSummary]:
        rows = self.conn.execute(
            """
            SELECT
                t.id,t.name,t.url,t.status,
                (SELECT COUNT(*) FROM relationships r WHERE r.topic_id=t.id) AS supported_by_count,
                (SELECT COUNT(*) FROM relationships r WHERE r.supporting_topic_id=t.id) AS supports_count
            FROM topics t
            ORDER BY t.name COLLATE NOCASE
            """
        ).fetchall()
        return [
            TopicSummary(
                topic=self._topic(r),
                supported_by_count=int(r["supported_by_count"]),
                supports_count=int(r["supports_count"]),
            )
            for r in rows
        ]

    def isolated_topics(self) -> list[Topic]:
        return [summary.topic for summary in self.overview() if summary.isolated]

    def counts(self) -> tuple[int, int]:
        topics = int(self.conn.execute("SELECT COUNT(*) FROM topics").fetchone()[0])
        relationships = int(self.conn.execute("SELECT COUNT(*) FROM relationships").fetchone()[0])
        return topics, relationships

    def reset(self) -> tuple[int, int]:
        counts = self.counts()
        self.conn.execute("DELETE FROM topics")
        self.conn.commit()
        return counts

    def relationships(self):
        rows = self.conn.execute(
            """
            SELECT r.kind,
                   d.id d_id,d.name d_name,d.url d_url,d.status d_status,
                   s.id s_id,s.name s_name,s.url s_url,s.status s_status
            FROM relationships r
            JOIN topics d ON d.id=r.topic_id
            JOIN topics s ON s.id=r.supporting_topic_id
            ORDER BY s.name COLLATE NOCASE,d.name COLLATE NOCASE
            """
        ).fetchall()
        return [
            Relationship(
                Topic(r["d_id"],r["d_name"],r["d_url"],r["d_status"]),
                Topic(r["s_id"],r["s_name"],r["s_url"],r["s_status"]),
                r["kind"],
            )
            for r in rows
        ]
