import tempfile
import unittest
from pathlib import Path

from learning_links.store import DuplicateTopic, InvalidRelationship, Store
from learning_links.visualize import to_dot


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "test.db")

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_case_insensitive_topics(self):
        self.store.add_topic("Formal Grammar", status="later")
        self.assertEqual(self.store.get_topic("formal grammar").status, "later")
        with self.assertRaises(DuplicateTopic):
            self.store.add_topic("formal grammar")

    def test_reverse_lookup_and_importance(self):
        for name in ("Parsing", "Compilers", "Formal Grammar"):
            self.store.add_topic(name)
        self.store.link("Parsing", "Formal Grammar", "helpful")
        self.store.link("Compilers", "Formal Grammar", "prerequisite")

        supported = [t.name for t, _ in self.store.supports("Formal Grammar")]
        self.assertCountEqual(supported, ["Compilers", "Parsing"])

        scores = {t.name: n for t, n in self.store.importance()}
        self.assertEqual(scores["Formal Grammar"], 2)

    def test_relationship_update_and_self_link(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.link("Parsing", "Formal Grammar", "helpful")
        self.store.link("Parsing", "Formal Grammar", "prerequisite")
        self.assertEqual(self.store.supported_by("Parsing")[0][1], "prerequisite")
        with self.assertRaises(InvalidRelationship):
            self.store.link("Parsing", "Parsing", "helpful")

    def test_dot_direction(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.link("Parsing", "Formal Grammar", "helpful")
        self.assertIn('"Formal Grammar" -> "Parsing"', to_dot(self.store))


if __name__ == "__main__":
    unittest.main()
