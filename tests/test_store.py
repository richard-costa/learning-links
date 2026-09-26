import os

import pytest
import psycopg

from learning_links.store import DuplicateTopic, InvalidEncounter, Store
from learning_links.visualize import to_dot

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")


class TestStore:
    def setup_method(self):
        self.store = Store(TEST_DATABASE_URL)
        self.store.reset()

    def teardown_method(self):
        self.store.reset()
        self.store.close()

    def test_case_insensitive_topics(self):
        self.store.add_topic("Formal Grammar", status="later")
        assert self.store.get_topic("formal grammar").status == "later"
        with pytest.raises(DuplicateTopic):
            self.store.add_topic("formal grammar")

    def test_reverse_lookup_and_discovery(self):
        for name in ("Classical Mechanics", "Linear Algebra", "Differential Equations"):
            self.store.add_topic(name)
        self.store.flag("Classical Mechanics", "Differential Equations", "need", "Oscillators")
        self.store.flag("Linear Algebra", "Differential Equations", "curious", "Linear systems")

        contexts = [topic.name for topic, _, _ in self.store.came_up_in("Differential Equations")]
        assert set(contexts) == {"Classical Mechanics", "Linear Algebra"}

        scores = {topic.name: count for topic, count in self.store.recurring_topics()}
        assert scores["Differential Equations"] == 2

    def test_encounter_update_and_self_flag(self):
        self.store.add_topic("Classical Mechanics")
        self.store.add_topic("Differential Equations")
        self.store.flag("Classical Mechanics", "Differential Equations", "need", "Oscillators")
        self.store.flag("Classical Mechanics", "Differential Equations", "revisit", "Phase space")
        flagged = self.store.flagged_from("Classical Mechanics")
        assert flagged[0][1:] == ("revisit", "Phase space")
        with pytest.raises(InvalidEncounter):
            self.store.flag("Classical Mechanics", "Classical Mechanics")

    def test_legacy_relationships_are_migrated(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        parsing = self.store.get_topic("Parsing")
        grammar = self.store.get_topic("Formal Grammar")
        self.store.close()

        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
            connection.execute(
                """
                CREATE TABLE relationships (
                    topic_id BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
                    supporting_topic_id BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
                    kind TEXT NOT NULL,
                    PRIMARY KEY(topic_id, supporting_topic_id)
                )
                """
            )
            connection.execute(
                "INSERT INTO relationships(topic_id,supporting_topic_id,kind) VALUES (%s,%s,'helpful')",
                (parsing.id, grammar.id),
            )

        self.store = Store(TEST_DATABASE_URL)
        contexts = self.store.came_up_in("Formal Grammar")
        assert [(topic.name, reason) for topic, reason, _ in contexts] == [("Parsing", "revisit")]
        row = self.store.conn.execute("SELECT to_regclass('relationships') AS name").fetchone()
        assert row["name"] is None

    def test_overview_and_isolated_topics(self):
        self.store.add_topic("Classical Mechanics")
        self.store.add_topic("Differential Equations")
        self.store.add_topic("Orphan")
        self.store.flag("Classical Mechanics", "Differential Equations", "need")

        summaries = {summary.topic.name: summary for summary in self.store.overview()}
        assert summaries["Differential Equations"].came_up_in_count == 1
        assert summaries["Differential Equations"].flagged_count == 0
        assert summaries["Classical Mechanics"].flagged_count == 1
        assert summaries["Orphan"].isolated
        assert [topic.name for topic in self.store.isolated_topics()] == ["Orphan"]

    def test_reset_removes_topics_and_encounters(self):
        self.store.add_topic("Classical Mechanics")
        self.store.add_topic("Differential Equations")
        self.store.flag("Classical Mechanics", "Differential Equations")

        assert self.store.reset() == (2, 1)
        assert self.store.counts() == (0, 0)
        assert self.store.list_topics() == []

    def test_dot_is_local_ego_diagram(self):
        self.store.add_topic("Classical Mechanics")
        self.store.add_topic("Differential Equations")
        self.store.add_topic("Numerical Methods")
        self.store.add_topic("Unrelated")
        self.store.flag("Classical Mechanics", "Differential Equations", "need")
        self.store.flag("Differential Equations", "Numerical Methods", "curious")

        dot = to_dot(self.store, "Differential Equations")
        assert '"Classical Mechanics" -> "Differential Equations"' in dot
        assert '"Differential Equations" -> "Numerical Methods"' in dot
        assert "Unrelated" not in dot
