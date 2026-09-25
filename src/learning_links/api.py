from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .store import Store, StoreError

TopicStatus = Literal["planned", "learning", "learned", "later"]
RelationshipKind = Literal["prerequisite", "helpful"]


class TopicPayload(BaseModel):
    id: str
    name: str
    status: TopicStatus = "planned"
    url: str = ""


class RelationshipPayload(BaseModel):
    id: str
    source: str
    target: str
    kind: RelationshipKind


class GraphPayload(BaseModel):
    topics: list[TopicPayload]
    relationships: list[RelationshipPayload]


app = FastAPI(title="learning-links")


def database_path() -> Path:
    return Path(os.environ.get("LEARNING_LINKS_DB", "learning-links.db"))


def graph_from_store(store: Store) -> GraphPayload:
    topics = store.list_topics()
    relationships = store.relationships()

    return GraphPayload(
        topics=[
            TopicPayload(
                id=str(topic.id),
                name=topic.name,
                status=topic.status,
                url=topic.url or "",
            )
            for topic in topics
        ],
        relationships=[
            RelationshipPayload(
                id=f"{relationship.supporting_topic.id}--{relationship.topic.id}",
                source=str(relationship.supporting_topic.id),
                target=str(relationship.topic.id),
                kind=relationship.kind,
            )
            for relationship in relationships
        ],
    )


def replace_graph(store: Store, graph: GraphPayload) -> None:
    ids = [topic.id for topic in graph.topics]
    if len(ids) != len(set(ids)):
        raise ValueError("topic ids must be unique")

    names = [topic.name.strip().casefold() for topic in graph.topics]
    if len(names) != len(set(names)):
        raise ValueError("topic names must be unique")

    topic_ids = set(ids)
    for relationship in graph.relationships:
        if relationship.source not in topic_ids or relationship.target not in topic_ids:
            raise ValueError("relationship references an unknown topic")
        if relationship.source == relationship.target:
            raise ValueError("a topic cannot support itself")

    by_id = {topic.id: topic for topic in graph.topics}

    store.reset()

    for topic in graph.topics:
        store.add_topic(
            topic.name,
            topic.url or None,
            topic.status,
        )

    for relationship in graph.relationships:
        supporting = by_id[relationship.source]
        dependent = by_id[relationship.target]
        store.link(
            dependent.name,
            supporting.name,
            relationship.kind,
        )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/graph", response_model=GraphPayload)
def get_graph() -> GraphPayload:
    with Store(database_path()) as store:
        return graph_from_store(store)


@app.put("/api/graph", response_model=GraphPayload)
def put_graph(graph: GraphPayload) -> GraphPayload:
    try:
        with Store(database_path()) as store:
            replace_graph(store, graph)
    except (StoreError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Return the same client ids. They only identify nodes within this payload.
    return graph


def frontend_dist() -> Path:
    default = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return Path(os.environ.get("LEARNING_LINKS_FRONTEND_DIST", default))


_dist = frontend_dist()
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
else:

    @app.get("/")
    def root() -> dict[str, str]:
        return {
            "status": "ok",
            "message": "API is running. Build frontend/ to serve the UI here.",
        }


def run() -> None:
    import uvicorn

    host = os.environ.get("LEARNING_LINKS_HOST", "127.0.0.1")
    port = int(os.environ.get("LEARNING_LINKS_PORT", "8000"))
    uvicorn.run("learning_links.api:app", host=host, port=port)
