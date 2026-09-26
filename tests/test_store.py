import os

import pytest

from learning_links.store import DuplicateTopic, InvalidEncounter, Store
from learning_links.visualize import to_dot

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")


class TestStore:
    def setup_method(self):
        self.admin = Store(TEST_DATABASE_URL)
        self.admin.conn.execute("DELETE FROM users")
        self.admin.conn.commit()
        self.user = self.admin.add_user("alice@example.com", "test-hash")
        self.store = Store(TEST_DATABASE_URL, user_id=self.user.id)

    def teardown_method(self):
        self.store.close()
        self.admin.conn.execute("DELETE FROM users")
        self.admin.conn.commit()
        self.admin.close()

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

    def test_reset_removes_only_current_users_workspace(self):
        bob = self.admin.add_user("bob@example.com", "test-hash")
        bob_store = Store(TEST_DATABASE_URL, user_id=bob.id)
        try:
            self.store.add_topic("Shared Name")
            self.store.add_topic("Alice Only")
            bob_store.add_topic("Shared Name")
            bob_store.add_topic("Bob Only")

            assert self.store.reset() == (2, 0)
            assert self.store.list_topics() == []
            assert [topic.name for topic in bob_store.list_topics()] == ["Bob Only", "Shared Name"]
        finally:
            bob_store.close()

    def test_users_have_independent_encounters(self):
        bob = self.admin.add_user("bob@example.com", "test-hash")
        bob_store = Store(TEST_DATABASE_URL, user_id=bob.id)
        try:
            for store in (self.store, bob_store):
                store.add_topic("Mechanics")
                store.add_topic("Differential Equations")
            self.store.flag("Mechanics", "Differential Equations", "need", "Alice note")
            bob_store.flag("Mechanics", "Differential Equations", "curious", "Bob note")

            assert self.store.encounters()[0].note == "Alice note"
            assert bob_store.encounters()[0].note == "Bob note"
        finally:
            bob_store.close()

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
