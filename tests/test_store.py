import os

import pytest

from learning_links.store import DuplicateTopic, InvalidRelationship, Store
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

    def test_reverse_lookup_and_importance(self):
        for name in ("Parsing", "Compilers", "Formal Grammar"):
            self.store.add_topic(name)
        self.store.link("Parsing", "Formal Grammar", "helpful")
        self.store.link("Compilers", "Formal Grammar", "prerequisite")

        supported = [topic.name for topic, _ in self.store.supports("Formal Grammar")]
        assert set(supported) == {"Compilers", "Parsing"}

        scores = {topic.name: count for topic, count in self.store.importance()}
        assert scores["Formal Grammar"] == 2

    def test_relationship_update_and_self_link(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.link("Parsing", "Formal Grammar", "helpful")
        self.store.link("Parsing", "Formal Grammar", "prerequisite")
        assert self.store.supported_by("Parsing")[0][1] == "prerequisite"
        with pytest.raises(InvalidRelationship):
            self.store.link("Parsing", "Parsing", "helpful")

    def test_overview_and_isolated_topics(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.add_topic("Orphan")
        self.store.link("Parsing", "Formal Grammar", "helpful")

        summaries = {summary.topic.name: summary for summary in self.store.overview()}
        assert summaries["Formal Grammar"].supports_count == 1
        assert summaries["Formal Grammar"].supported_by_count == 0
        assert summaries["Parsing"].supported_by_count == 1
        assert summaries["Orphan"].isolated
        assert [topic.name for topic in self.store.isolated_topics()] == ["Orphan"]

    def test_reset_removes_topics_and_relationships(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.link("Parsing", "Formal Grammar", "helpful")

        assert self.store.reset() == (2, 1)
        assert self.store.counts() == (0, 0)
        assert self.store.list_topics() == []

    def test_dot_direction(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.link("Parsing", "Formal Grammar", "helpful")
        assert '"Formal Grammar" -> "Parsing"' in to_dot(self.store)
