import os
import unittest

from learning_links.store import DuplicateTopic, InvalidRelationship, Store
from learning_links.visualize import to_dot

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DATABASE_URL, "TEST_DATABASE_URL is not set")
class StoreTests(unittest.TestCase):
    def setUp(self):
        self.store = Store(TEST_DATABASE_URL)
        self.store.reset()

    def tearDown(self):
        self.store.reset()
        self.store.close()

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

        supported = [topic.name for topic, _ in self.store.supports("Formal Grammar")]
        self.assertCountEqual(supported, ["Compilers", "Parsing"])

        scores = {topic.name: count for topic, count in self.store.importance()}
        self.assertEqual(scores["Formal Grammar"], 2)

    def test_relationship_update_and_self_link(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.link("Parsing", "Formal Grammar", "helpful")
        self.store.link("Parsing", "Formal Grammar", "prerequisite")
        self.assertEqual(self.store.supported_by("Parsing")[0][1], "prerequisite")
        with self.assertRaises(InvalidRelationship):
            self.store.link("Parsing", "Parsing", "helpful")

    def test_overview_and_isolated_topics(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.add_topic("Orphan")
        self.store.link("Parsing", "Formal Grammar", "helpful")

        summaries = {summary.topic.name: summary for summary in self.store.overview()}
        self.assertEqual(summaries["Formal Grammar"].supports_count, 1)
        self.assertEqual(summaries["Formal Grammar"].supported_by_count, 0)
        self.assertEqual(summaries["Parsing"].supported_by_count, 1)
        self.assertTrue(summaries["Orphan"].isolated)
        self.assertEqual([topic.name for topic in self.store.isolated_topics()], ["Orphan"])

    def test_reset_removes_topics_and_relationships(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.link("Parsing", "Formal Grammar", "helpful")

        self.assertEqual(self.store.reset(), (2, 1))
        self.assertEqual(self.store.counts(), (0, 0))
        self.assertEqual(self.store.list_topics(), [])

    def test_dot_direction(self):
        self.store.add_topic("Parsing")
        self.store.add_topic("Formal Grammar")
        self.store.link("Parsing", "Formal Grammar", "helpful")
        self.assertIn('"Formal Grammar" -> "Parsing"', to_dot(self.store))


if __name__ == "__main__":
    unittest.main()
