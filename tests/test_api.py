import os

import pytest

from learning_links.api import (
    GraphPayload,
    RelationshipPayload,
    TopicPayload,
    graph_from_store,
    replace_graph,
)
from learning_links.store import Store

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")


class TestApiGraph:
    def setup_method(self):
        self.store = Store(TEST_DATABASE_URL)
        self.store.reset()

    def teardown_method(self):
        self.store.reset()
        self.store.close()

    def test_graph_round_trip(self):
        graph = GraphPayload(
            topics=[
                TopicPayload(id="grammar", name="Formal Grammar", status="later"),
                TopicPayload(id="parsing", name="Parsing"),
            ],
            relationships=[
                RelationshipPayload(
                    id="grammar--parsing",
                    source="grammar",
                    target="parsing",
                    kind="helpful",
                )
            ],
        )

        replace_graph(self.store, graph)
        stored = graph_from_store(self.store)

        assert [topic.name for topic in stored.topics] == ["Formal Grammar", "Parsing"]
        assert len(stored.relationships) == 1
        assert stored.relationships[0].kind == "helpful"

    def test_rejects_unknown_relationship_topic(self):
        graph = GraphPayload(
            topics=[TopicPayload(id="parsing", name="Parsing")],
            relationships=[
                RelationshipPayload(
                    id="missing--parsing",
                    source="missing",
                    target="parsing",
                    kind="helpful",
                )
            ],
        )

        with pytest.raises(ValueError):
            replace_graph(self.store, graph)
