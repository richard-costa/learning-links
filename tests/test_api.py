import os
import unittest

from learning_links.api import (
    GraphPayload,
    RelationshipPayload,
    TopicPayload,
    graph_from_store,
    replace_graph,
)
from learning_links.store import Store

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DATABASE_URL, "TEST_DATABASE_URL is not set")
class ApiGraphTests(unittest.TestCase):
    def setUp(self):
        self.store = Store(TEST_DATABASE_URL)
        self.store.reset()

    def tearDown(self):
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

        self.assertEqual([topic.name for topic in stored.topics], ["Formal Grammar", "Parsing"])
        self.assertEqual(len(stored.relationships), 1)
        self.assertEqual(stored.relationships[0].kind, "helpful")

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

        with self.assertRaises(ValueError):
            replace_graph(self.store, graph)


if __name__ == "__main__":
    unittest.main()
