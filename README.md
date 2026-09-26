# learning-links

A small tool for building and exploring prerequisite and helpful relationships between topics for self-directed learning.

## Architecture

```text
browser
   |
   | HTTPS in public deployments
   v
FastAPI
   |
   v
PostgreSQL
```

The frontend is Vite + vanilla TypeScript + CSS. FastAPI owns the API, authentication, and database access. PostgreSQL is the single source of truth for both the web app and CLI.

The frontend intentionally avoids an infinite canvas. It focuses on one topic at a time:

```text
Supported by  ->  [ focused topic ]  ->  Supports
```

Clicking a related topic makes it the new focus.

## Local development

Requires Python 3.11+, Node, and PostgreSQL.

Create the Python environment:

```fish
python -m venv .venv
source .venv/bin/activate.fish
python -m pip install -e .
```

Set the database connection:

```fish
set -x DATABASE_URL postgresql://localhost/learning_links
```

Run FastAPI:

```fish
learning-links-api
```

Run Vite in another terminal:

```fish
cd frontend
npm install
npm run dev
```

Vite normally runs at `http://localhost:5173` and proxies `/api` to FastAPI on port 8000.

## CLI

Examples:

```bash
learning-links add "Parsing"
learning-links add "Formal Grammar" --status later
learning-links link "Parsing" "Formal Grammar" --kind helpful
learning-links show "Formal Grammar"
learning-links overview
```

`link TOPIC SUPPORTING_TOPIC` means the second topic supports learning the first.

Main commands:

```text
learning-links add NAME [--url URL] [--status planned|learning|learned|later]
learning-links list
learning-links overview
learning-links isolated
learning-links edit NAME [--name NEW_NAME] [--url URL] [--status STATUS]
learning-links remove NAME
learning-links link TOPIC SUPPORTING_TOPIC --kind prerequisite|helpful
learning-links unlink TOPIC SUPPORTING_TOPIC
learning-links show NAME
learning-links important
learning-links reset [--yes]
learning-links graph [-o FILE] [--format svg|png] [--open]
learning-links dot [-o FILE]
```

## Web authentication

The web app uses HTTP Basic authentication backed by the PostgreSQL `users` table.
Passwords are stored as Argon2 hashes.

Add a user:

```bash
learning-links user-add friend@example.com
```

The command prompts for the password without echoing it.

Manage users:

```bash
learning-links user-list
learning-links user-disable friend@example.com
learning-links user-enable friend@example.com
learning-links user-password friend@example.com
```

Basic authentication must not be exposed over plain public HTTP. Use it only behind HTTPS, such as the Cloudflare Tunnel setup below.

## Why FastAPI also serves the frontend

FastAPI's main job is the backend API. Vite still owns and builds the frontend.

During development:

```text
Vite      :5173  -> frontend
FastAPI   :8000  -> API + PostgreSQL
```

After:

```bash
cd frontend
npm run build
```

Vite produces ordinary static files in `frontend/dist/`. FastAPI can serve those already-built files as a deployment convenience:

```text
FastAPI :8000
├── /          -> built frontend
└── /api/*     -> API
```

That gives this small project one application process, one port, and one URL. The frontend can still be hosted separately later without changing the API architecture.

## Docker

The repository contains a multi-stage `Dockerfile` and `compose.yml`.

Copy the environment example and replace the database password:

```bash
cp .env.example .env
```

Start PostgreSQL and the app:

```bash
docker compose up -d --build
```

The default bindings are intentionally local-only:

```text
127.0.0.1:8000 -> app
127.0.0.1:5432 -> PostgreSQL
```

Nothing is exposed directly to the internet.

Create your first web user:

```bash
docker compose run --rm app learning-links user-add you@example.com
```

Then open:

```text
http://127.0.0.1:8000
```

Your browser will ask for the email/password.

Useful commands:

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f db
docker compose down
```

PostgreSQL data lives in the named Docker volume `postgres_data`, so normal container recreation does not delete the database.

## Serving from your machine or a VM

A reasonable small private deployment is:

```text
Internet
   |
   | HTTPS
   v
Cloudflare Tunnel
   |
   v
Linux VM
   |
Docker Compose
├── cloudflared
├── FastAPI + built frontend
└── PostgreSQL
```

The VM is useful as a security boundary: the application stack can live there instead of directly on your desktop OS. Docker then isolates the app and database services inside the VM.

The recommended public path does not require router port forwarding. `cloudflared` makes an outbound connection to Cloudflare, while friends only see the normal HTTPS application URL.

### Optional Cloudflare Tunnel

`compose.yml` contains a disabled-by-default `public` profile with a `cloudflared` container.

Create a remotely managed tunnel in Cloudflare and configure its public hostname to route to:

```text
http://app:8000
```

Copy the tunnel token into `.env`:

```text
CLOUDFLARE_TUNNEL_TOKEN=...
```

Then start the public profile:

```bash
docker compose --profile public up -d
```

Friends visit the HTTPS hostname in a normal browser. They do not need Tailscale, a VPN, or any client software. FastAPI then asks for one of the accounts you created with `learning-links user-add`.

Keep `.env` private. The database password and Cloudflare tunnel token must never be committed.

## API

The intentionally small API is:

```text
GET  /api/health
GET  /api/graph
PUT  /api/graph
```

`/api/health` is unauthenticated so Docker and hosting platforms can perform health checks. The rest of the application is authenticated.

The frontend currently saves the whole graph with `PUT /api/graph`. This is deliberately simple. It also means simultaneous edits from multiple users are currently last-write-wins; proper per-resource updates/concurrency handling can come later.

## Tests

Password tests do not need a database:

```bash
python -m unittest tests.test_auth -v
```

Database tests require a disposable PostgreSQL database:

```bash
TEST_DATABASE_URL=postgresql://localhost/learning_links_test \
python -m unittest discover -s tests -v
```

## Roadmap

### Current
- manual topics and typed learning relationships;
- CLI and focused browser interface;
- FastAPI API;
- PostgreSQL persistence;
- basic authenticated access;
- Docker Compose deployment.

### Next
- replace whole-graph writes with normal CRUD API endpoints;
- better multi-user/concurrency behavior;
- JSON import/export;
- indirect dependency/support queries;
- cycle diagnostics.

### Later
- Wikipedia-based candidate discovery;
- LLM-assisted relationship suggestions with explicit review;
- richer importance metrics;
- learning-path generation.
