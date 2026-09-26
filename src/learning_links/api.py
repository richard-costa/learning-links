from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .auth import hash_password, verify_password
from .config import load_environment
from .security import RateLimitStore
from .sessions import Session, SessionStore
from .store import DuplicateUser, Store, StoreError, User, UserNotFound

TopicStatus = Literal["planned", "learning", "learned", "later"]
EncounterReason = Literal["need", "revisit", "curious"]

load_environment()
DUMMY_PASSWORD_HASH = hash_password("not-a-real-user-password")


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


class CredentialsPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class SessionPayload(BaseModel):
    email: str
    csrf_token: str


class PublicConfigPayload(BaseModel):
    signup_enabled: bool


app = FastAPI(title="learning-links")


def database_url() -> str:
    value = os.environ.get("DATABASE_URL")
    if not value:
        raise RuntimeError("DATABASE_URL is required")
    return value


def frontend_dist() -> Path:
    default = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return Path(os.environ.get("LEARNING_LINKS_FRONTEND_DIST", default))


def env_int(name: str, default: int, *, minimum: int = 1) -> int:
    value = int(os.environ.get(name, str(default)))
    if value < minimum:
        raise RuntimeError(f"{name} must be at least {minimum}")
    return value


def signup_enabled() -> bool:
    return os.environ.get("LEARNING_LINKS_ENABLE_SIGNUP") == "1"


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not email or "@" not in email or email.startswith("@") or email.endswith("@"):
        raise ValueError("enter a valid email address")
    if len(email) > 254:
        raise ValueError("email address is too long")
    return email


def is_public_path(path: str) -> bool:
    normalized = path.rstrip("/") or "/"
    return normalized in {
        "/",
        "/app",
        "/demo",
        "/login",
        "/signup",
        "/api/health",
        "/api/public-config",
        "/api/auth/login",
        "/api/auth/signup",
    } or normalized.startswith("/assets/")


def development_user(store: Store) -> User:
    email = os.environ.get("LEARNING_LINKS_DEV_USER")
    if email:
        user = store.get_user(email)
        if not user.active:
            raise StoreError("LEARNING_LINKS_DEV_USER is disabled")
        return user
    users = [user for user in store.list_users() if user.active]
    if len(users) == 1:
        return users[0]
    if not users:
        raise StoreError("disabled-auth mode needs an existing active user")
    raise StoreError("disabled-auth mode is ambiguous; set LEARNING_LINKS_DEV_USER")


def request_user(request: Request) -> User:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="authentication required")
    return user


def request_session(request: Request) -> Session:
    session = getattr(request.state, "session", None)
    if session is None:
        raise HTTPException(status_code=401, detail="authentication required")
    return session


def secure_cookie(request: Request) -> bool:
    override = os.environ.get("LEARNING_LINKS_SECURE_COOKIES")
    if override == "1":
        return True
    if override == "0":
        return False
    forwarded = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    return request.url.scheme == "https" or forwarded == "https"


def session_cookie_name(request: Request) -> str:
    return "__Host-learning_links_session" if secure_cookie(request) else "learning_links_session"


def session_token_from_request(request: Request) -> str | None:
    return request.cookies.get("__Host-learning_links_session") or request.cookies.get(
        "learning_links_session"
    )


def set_session_cookie(response: JSONResponse, request: Request, token: str) -> None:
    response.set_cookie(
        session_cookie_name(request),
        token,
        max_age=env_int("LEARNING_LINKS_SESSION_DAYS", 7) * 24 * 60 * 60,
        path="/",
        secure=secure_cookie(request),
        httponly=True,
        samesite="lax",
    )


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie("__Host-learning_links_session", path="/")
    response.delete_cookie("learning_links_session", path="/")


def csrf_ok(request: Request, session: Session) -> bool:
    supplied = request.headers.get("x-csrf-token", "")
    return bool(supplied) and secrets.compare_digest(supplied, session.csrf_token)


def client_rate_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(
    request: Request,
    *,
    scope: str,
    key: str,
    limit: int,
    window_seconds: int,
) -> None:
    with RateLimitStore(database_url()) as limits:
        decision = limits.hit(scope, key, limit=limit, window_seconds=window_seconds)
        limits.cleanup()
    if not decision.allowed:
        raise HTTPException(
            status_code=429,
            detail="too many attempts; try again later",
            headers={"Retry-After": str(decision.retry_after)},
        )


def enforce_auth_limits(request: Request, email: str, *, signup: bool = False) -> None:
    if signup:
        enforce_rate_limit(
            request,
            scope="signup-client",
            key=client_rate_key(request),
            limit=env_int("LEARNING_LINKS_SIGNUP_ATTEMPTS_PER_HOUR", 6),
            window_seconds=3600,
        )
        enforce_rate_limit(
            request,
            scope="signup-global",
            key="global",
            limit=env_int("LEARNING_LINKS_SIGNUP_GLOBAL_PER_HOUR", 30),
            window_seconds=3600,
        )
        return

    enforce_rate_limit(
        request,
        scope="login-account",
        key=email,
        limit=env_int("LEARNING_LINKS_LOGIN_ATTEMPTS", 10),
        window_seconds=env_int("LEARNING_LINKS_LOGIN_WINDOW_SECONDS", 900),
    )
    enforce_rate_limit(
        request,
        scope="login-client",
        key=client_rate_key(request),
        limit=env_int("LEARNING_LINKS_LOGIN_CLIENT_ATTEMPTS", 50),
        window_seconds=env_int("LEARNING_LINKS_LOGIN_WINDOW_SECONDS", 900),
    )


@app.middleware("http")
async def require_auth(request: Request, call_next):
    if is_public_path(request.url.path):
        return await call_next(request)

    if os.environ.get("LEARNING_LINKS_DISABLE_AUTH") == "1":
        try:
            with Store(database_url()) as store:
                request.state.user = development_user(store)
        except (StoreError, UserNotFound) as exc:
            return JSONResponse(status_code=503, content={"detail": str(exc)})
        return await call_next(request)

    token = session_token_from_request(request)
    if token is None:
        return JSONResponse(status_code=401, content={"detail": "authentication required"})

    with SessionStore(database_url()) as sessions:
        session = sessions.get(token)
    if session is None:
        response = JSONResponse(status_code=401, content={"detail": "authentication required"})
        clear_session_cookies(response)
        return response

    request.state.user = session.user
    request.state.session = session

    if request.method not in {"GET", "HEAD", "OPTIONS"} and not csrf_ok(request, session):
        return JSONResponse(status_code=403, content={"detail": "invalid CSRF token"})

    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    max_body = env_int("LEARNING_LINKS_MAX_REQUEST_BYTES", 1_000_000)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > max_body:
                response: Response = JSONResponse(
                    status_code=413,
                    content={"detail": "request body too large"},
                )
            else:
                response = await call_next(request)
        except ValueError:
            response = JSONResponse(status_code=400, content={"detail": "invalid content length"})
    else:
        response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'none'; "
        "frame-ancestors 'none'; "
        "form-action 'self'"
    )
    if request.url.path.startswith("/api/auth/") or request.url.path == "/api/workspace":
        response.headers["Cache-Control"] = "no-store"
    if secure_cookie(request):
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response


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
    if len(workspace.topics) > env_int("LEARNING_LINKS_MAX_TOPICS", 5000):
        raise ValueError("workspace contains too many topics")
    if len(workspace.encounters) > env_int("LEARNING_LINKS_MAX_ENCOUNTERS", 25000):
        raise ValueError("workspace contains too many encounters")

    ids = [topic.id for topic in workspace.topics]
    if len(ids) != len(set(ids)):
        raise ValueError("topic ids must be unique")

    names = [topic.name.strip().casefold() for topic in workspace.topics]
    if len(names) != len(set(names)):
        raise ValueError("topic names must be unique")

    for topic in workspace.topics:
        if not topic.name.strip() or len(topic.name) > 100:
            raise ValueError("topic names must contain 1 to 100 characters")
        if len(topic.url) > 2048:
            raise ValueError("topic URL is too long")

    topic_ids = set(ids)
    encounter_pairs: set[tuple[str, str]] = set()
    for encounter in workspace.encounters:
        if len(encounter.note) > 300:
            raise ValueError("encounter note is too long")
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


@app.get("/api/public-config", response_model=PublicConfigPayload)
def public_config() -> PublicConfigPayload:
    return PublicConfigPayload(signup_enabled=signup_enabled())


@app.post("/api/auth/signup", response_model=SessionPayload)
def signup(request: Request, credentials: CredentialsPayload):
    if not signup_enabled():
        raise HTTPException(status_code=403, detail="account creation is currently disabled")

    try:
        email = normalize_email(credentials.email)
    except ValueError:
        raise HTTPException(status_code=400, detail="could not create account")

    enforce_auth_limits(request, email, signup=True)

    try:
        password_hash = hash_password(credentials.password)
        with Store(database_url()) as store:
            if len(store.list_users()) >= env_int("LEARNING_LINKS_MAX_USERS", 50):
                raise StoreError("account limit reached")
            user = store.add_user(email, password_hash)
    except (ValueError, DuplicateUser, StoreError):
        raise HTTPException(status_code=400, detail="could not create account")

    with SessionStore(database_url()) as sessions:
        token, session = sessions.create(
            user.id,
            ttl_days=env_int("LEARNING_LINKS_SESSION_DAYS", 7),
            max_sessions_per_user=env_int("LEARNING_LINKS_MAX_SESSIONS_PER_USER", 10),
        )
    response = JSONResponse(
        content={"email": user.email, "csrf_token": session.csrf_token}
    )
    set_session_cookie(response, request, token)
    return response


@app.post("/api/auth/login", response_model=SessionPayload)
def login(request: Request, credentials: CredentialsPayload):
    try:
        email = normalize_email(credentials.email)
    except ValueError:
        email = "invalid@example.invalid"

    enforce_auth_limits(request, email)

    try:
        with Store(database_url()) as store:
            user = store.get_user(email)
    except UserNotFound:
        user = None

    if user is None:
        verify_password(DUMMY_PASSWORD_HASH, credentials.password)
        valid = False
    else:
        valid = user.active and verify_password(user.password_hash, credentials.password)

    if not valid or user is None:
        raise HTTPException(status_code=401, detail="invalid email or password")

    with SessionStore(database_url()) as sessions:
        token, session = sessions.create(
            user.id,
            ttl_days=env_int("LEARNING_LINKS_SESSION_DAYS", 7),
            max_sessions_per_user=env_int("LEARNING_LINKS_MAX_SESSIONS_PER_USER", 10),
        )
    response = JSONResponse(
        content={"email": user.email, "csrf_token": session.csrf_token}
    )
    set_session_cookie(response, request, token)
    return response


@app.get("/api/auth/session", response_model=SessionPayload)
def current_session(request: Request) -> SessionPayload:
    user = request_user(request)
    if os.environ.get("LEARNING_LINKS_DISABLE_AUTH") == "1":
        return SessionPayload(email=user.email, csrf_token="development")
    session = request_session(request)
    return SessionPayload(email=user.email, csrf_token=session.csrf_token)


@app.post("/api/auth/logout")
def logout(request: Request):
    token = session_token_from_request(request)
    if token:
        with SessionStore(database_url()) as sessions:
            sessions.delete(token)
    response = JSONResponse(content={"status": "signed out"})
    clear_session_cookies(response)
    return response


@app.get("/api/workspace", response_model=WorkspacePayload)
def get_workspace(request: Request) -> WorkspacePayload:
    user = request_user(request)
    with Store(database_url(), user_id=user.id) as store:
        return workspace_from_store(store)


@app.put("/api/workspace", response_model=WorkspacePayload)
def put_workspace(request: Request, workspace: WorkspacePayload) -> WorkspacePayload:
    user = request_user(request)
    try:
        with Store(database_url(), user_id=user.id) as store:
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

    @app.get("/login")
    def login_page() -> FileResponse:
        return frontend_index()

    @app.get("/signup")
    def signup_page() -> FileResponse:
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
