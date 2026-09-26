from __future__ import annotations

import base64
import binascii
import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .auth import verify_password
from .config import load_environment
from .store import Store, StoreError, UserNotFound

TopicStatus = Literal["planned", "learning", "learned", "later"]
EncounterReason = Literal["need", "revisit", "curious"]

load_environment()


class TopicPayload(BaseModel):
    id: str
    name: str
    status: TopicStatus = "planned"
    url: str = ""


class EncounterPayload(BaseModel):
    id: str
    context: str
    topic: str
    reason: EncounterReason = "need"
    note: str = ""


class WorkspacePayload(BaseModel):
    topics: list[TopicPayload]
    encounters: list[EncounterPayload]


app = FastAPI(title="learning-links")


def database_url() -> str:
    value = os.environ.get("DATABASE_URL")
    if not value:
        raise RuntimeError("DATABASE_URL is required")
    return value


def frontend_dist() -> Path:
    default = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return Path(os.environ.get("LEARNING_LINKS_FRONTEND_DIST", default))


def decode_basic_auth(header: str) -> tuple[str, str] | None:
    if not header.startswith("Basic "):
        return None
    try:
        raw = base64.b64decode(header[6:], validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    if ":" not in raw:
        return None
    email, password = raw.split(":", 1)
    return email, password


def is_public_path(path: str) -> bool:
    normalized = path.rstrip("/") or "/"
    return normalized in {"/", "/demo", "/api/health"} or normalized.startswith("/assets/")


@app.middleware("http")
async def require_auth(request: Request, call_next):
    if is_public_path(request.url.path) or os.environ.get("LEARNING_LINKS_DISABLE_AUTH") == "1":
        return await call_next(request)

    credentials = decode_basic_auth(request.headers.get("authorization", ""))
    if credentials is None:
        return JSONResponse(
            status_code=401,
            content={"detail": "authentication required"},
            headers={"WWW-Authenticate": 'Basic realm="learning-links"'},
        )

    email, password = credentials
    try:
        with Store(database_url()) as store:
            user = store.get_user(email)
    except UserNotFound:
        user = None

    if user is None or not user.active or not verify_password(user.password_hash, password):
        return JSONResponse(
            status_code=401,
            content={"detail": "invalid credentials"},
            headers={"WWW-Authenticate": 'Basic realm="learning-links"'},
        )

    request.state.user = user
    return await call_next(request)


def workspace_from_store(store: Store) -> WorkspacePayload:
    topics = store.list_topics()
    encounters = store.encounters()

    return WorkspacePayload(
        topics=[
            TopicPayload(
                id=str(topic.id),
                name=topic.name,
                status=topic.status,
                url=topic.url or "",
            )
            for topic in topics
        ],
        encounters=[
            EncounterPayload(
                id=f"{encounter.context.id}--{encounter.topic.id}",
                context=str(encounter.context.id),
                topic=str(encounter.topic.id),
                reason=encounter.reason,
                note=encounter.note,
            )
            for encounter in encounters
        ],
    )


def replace_workspace(store: Store, workspace: WorkspacePayload) -> None:
    ids = [topic.id for topic in workspace.topics]
    if len(ids) != len(set(ids)):
        raise ValueError("topic ids must be unique")

    names = [topic.name.strip().casefold() for topic in workspace.topics]
    if len(names) != len(set(names)):
        raise ValueError("topic names must be unique")

    topic_ids = set(ids)
    encounter_pairs: set[tuple[str, str]] = set()
    for encounter in workspace.encounters:
        if encounter.context not in topic_ids or encounter.topic not in topic_ids:
            raise ValueError("encounter references an unknown topic")
        if encounter.context == encounter.topic:
            raise ValueError("a topic cannot be flagged from itself")
        pair = (encounter.context, encounter.topic)
        if pair in encounter_pairs:
            raise ValueError("encounters must be unique per context and topic")
        encounter_pairs.add(pair)

    by_id = {topic.id: topic for topic in workspace.topics}

    store.reset()
    for topic in workspace.topics:
        store.add_topic(topic.name, topic.url or None, topic.status)

    for encounter in workspace.encounters:
        context = by_id[encounter.context]
        topic = by_id[encounter.topic]
        store.flag(context.name, topic.name, encounter.reason, encounter.note)


@app.get("/api/health")
def health() -> dict[str, str]:
    with Store(database_url()) as store:
        store.ping()
    return {"status": "ok"}


@app.get("/api/workspace", response_model=WorkspacePayload)
def get_workspace() -> WorkspacePayload:
    with Store(database_url()) as store:
        return workspace_from_store(store)


@app.put("/api/workspace", response_model=WorkspacePayload)
def put_workspace(workspace: WorkspacePayload) -> WorkspacePayload:
    try:
        with Store(database_url()) as store:
            replace_workspace(store, workspace)
            return workspace_from_store(store)
    except (StoreError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


_dist = frontend_dist()
if _dist.exists():
    assets = _dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    def frontend_index() -> FileResponse:
        return FileResponse(_dist / "index.html")

    @app.get("/")
    def landing() -> FileResponse:
        return frontend_index()

    @app.get("/demo")
    def demo() -> FileResponse:
        return frontend_index()

    @app.get("/app")
    def private_app() -> FileResponse:
        return frontend_index()
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
