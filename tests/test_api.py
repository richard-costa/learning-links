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
        self.store = Store(TEST_DATABASE_URL)
        self.store.reset()

    def teardown_method(self):
        self.store.reset()
        self.store.close()

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
