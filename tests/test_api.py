import tempfile
import unittest
from pathlib import Path

from learning_links.api import (
    GraphPayload,
    RelationshipPayload,
    TopicPayload,
    graph_from_store,
    replace_graph,
)
from learning_links.store import Store


class ApiGraphTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "api.db")

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

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
