import os

import pytest

from learning_links.api import (
    EncounterPayload,
    TopicPayload,
    WorkspacePayload,
    replace_workspace,
    workspace_from_store,
)
from learning_links.store import Store

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")


class TestApiWorkspace:
    def setup_method(self):
        self.admin = Store(TEST_DATABASE_URL)
        self.admin.conn.execute("DELETE FROM users")
        self.admin.conn.commit()
        self.alice = self.admin.add_user("alice@example.com", "test-hash")
        self.bob = self.admin.add_user("bob@example.com", "test-hash")
        self.store = Store(TEST_DATABASE_URL, user_id=self.alice.id)
        self.bob_store = Store(TEST_DATABASE_URL, user_id=self.bob.id)

    def teardown_method(self):
        self.store.close()
        self.bob_store.close()
        self.admin.conn.execute("DELETE FROM users")
        self.admin.conn.commit()
        self.admin.close()

    def test_workspace_round_trip(self):
        workspace = WorkspacePayload(
            topics=[
                TopicPayload(id="mechanics", name="Classical Mechanics", status="learning"),
                TopicPayload(id="diff-eq", name="Differential Equations"),
            ],
            encounters=[
                EncounterPayload(
                    id="mechanics--diff-eq",
                    context="mechanics",
                    topic="diff-eq",
                    reason="need",
                    note="Harmonic oscillators",
                )
            ],
        )

        replace_workspace(self.store, workspace)
        stored = workspace_from_store(self.store)

        assert [topic.name for topic in stored.topics] == ["Classical Mechanics", "Differential Equations"]
        assert len(stored.encounters) == 1
        assert stored.encounters[0].reason == "need"
        assert stored.encounters[0].note == "Harmonic oscillators"

    def test_workspace_replace_does_not_touch_other_user(self):
        replace_workspace(
            self.bob_store,
            WorkspacePayload(
                topics=[TopicPayload(id="bob", name="Bob Topic")],
                encounters=[],
            ),
        )
        replace_workspace(
            self.store,
            WorkspacePayload(
                topics=[TopicPayload(id="alice", name="Alice Topic")],
                encounters=[],
            ),
        )

        assert [topic.name for topic in workspace_from_store(self.store).topics] == ["Alice Topic"]
        assert [topic.name for topic in workspace_from_store(self.bob_store).topics] == ["Bob Topic"]

    def test_same_topic_names_are_valid_for_different_users(self):
        workspace = WorkspacePayload(
            topics=[TopicPayload(id="shared", name="Differential Equations")],
            encounters=[],
        )
        replace_workspace(self.store, workspace)
        replace_workspace(self.bob_store, workspace)

        assert workspace_from_store(self.store).topics[0].name == "Differential Equations"
        assert workspace_from_store(self.bob_store).topics[0].name == "Differential Equations"

    def test_rejects_unknown_encounter_topic(self):
        workspace = WorkspacePayload(
            topics=[TopicPayload(id="mechanics", name="Classical Mechanics")],
            encounters=[
                EncounterPayload(
                    id="mechanics--missing",
                    context="mechanics",
                    topic="missing",
                )
            ],
        )

        with pytest.raises(ValueError):
            replace_workspace(self.store, workspace)

    def test_rejects_duplicate_encounter_pair(self):
        workspace = WorkspacePayload(
            topics=[
                TopicPayload(id="mechanics", name="Classical Mechanics"),
                TopicPayload(id="diff-eq", name="Differential Equations"),
            ],
            encounters=[
                EncounterPayload(id="one", context="mechanics", topic="diff-eq"),
                EncounterPayload(id="two", context="mechanics", topic="diff-eq", reason="curious"),
            ],
        )

        with pytest.raises(ValueError):
            replace_workspace(self.store, workspace)
