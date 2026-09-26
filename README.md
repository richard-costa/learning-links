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

The frontend has an all-topics graph and a local graph for the selected topic. Every arrow goes from a topic you can use to learn another topic:

```text
Helps you learn this  ->  [ focused topic ]  ->  This helps you learn
```

For example, `Formal Grammar → Parsing` means Formal Grammar helps you learn Parsing. A **required first** connection is a prerequisite; **helpful context** is optional; and **related** links record useful associations without implying a learning order. The web interface uses these plain-language labels while the API and database values are `prerequisite`, `helpful`, and `related`.

Select a topic from the left library to inspect it in the right pane, or switch
to **Local graph** to see its immediate connections. Drag nodes to arrange the
map, drag empty space to pan, and scroll to zoom.

## Quickstart

For local frontend development, you need Python 3.11+, Node, Docker Compose,
and `uv`.

1. Install the Python environment and copy the local configuration template:

```fish
python -m pip install --user uv
uv sync
cp .env.example .env
```

2. Set a local database password in `.env`, then replace the placeholder password
in both `DATABASE_URL` and `TEST_DATABASE_URL` with that same value. For local
UI testing, set `LEARNING_LINKS_DISABLE_AUTH=1`.

3. Start PostgreSQL once. This command returns when the database is ready:

```fish
docker compose up -d --wait db
```

4. Keep these two commands running in separate terminals:

```fish
# Terminal 1, at the repository root
uv run learning-links-api

# Terminal 2
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. The API runs on port 8000;
Vite proxies `/api` requests to it.

### Local configuration

Use one password value consistently in `POSTGRES_PASSWORD`, `DATABASE_URL`, and
`TEST_DATABASE_URL`. The default PostgreSQL host port is `5433`, which avoids a
collision with a local PostgreSQL instance on `5432`.

`docker compose up -d --wait db` creates the application database,
`learning_links`. It is all that the API and frontend need. The separate
`learning_links_test` database is only for pytest, which resets it during
database tests.

The repository-root `.env` is loaded by `learning-links-api`, `learning-links`,
and pytest. `LEARNING_LINKS_DISABLE_AUTH=1` is for local testing only; set it to
`0` or leave it empty before sharing the app. An exported environment variable
takes precedence over the same setting in `.env`.

### Stop and clean up local development

Stop the locally run API and Vite servers with `Ctrl-C` in their terminals. Stop
the background PostgreSQL container while preserving its data:

```fish
docker compose down
```

To remove only the sample topics and their relationships while PostgreSQL is
running, use:

```fish
uv run learning-links reset --yes
```

This leaves web users intact. To delete every local PostgreSQL database,
including users and the disposable test database, remove the Compose volume:

```fish
docker compose down --volumes
```

To start a fresh application database afterward, run:

```fish
docker compose up -d --wait db
```

If you also plan to run `uv run pytest`, create the disposable test database
once after the volume reset:

```fish
docker compose exec -T db createdb -U learning_links learning_links_test
```

## Share publicly

For a public HTTPS URL without buying a domain or opening router ports, deploy
the Docker app and publish it with Tailscale Funnel. Keep
`LEARNING_LINKS_DISABLE_AUTH` empty or set it to `0`, then follow the complete
guide in [docs/tailscale-funnel.md](docs/tailscale-funnel.md). Each user gets
their own Learning Links email/password; they do not need a Tailscale account.

## CLI

Examples:

```bash
learning-links add "Parsing"
learning-links add "Formal Grammar" --status later
learning-links link "Parsing" "Formal Grammar" --kind helpful
learning-links show "Formal Grammar"
learning-links overview
```

`link TOPIC SUPPORTING_TOPIC` means the second topic helps you learn the first. For example, `link "Parsing" "Formal Grammar" --kind helpful` draws an arrow from Formal Grammar to Parsing.

Main commands:

```text
learning-links add NAME [--url URL] [--status planned|learning|learned|later]
learning-links list
learning-links overview
learning-links isolated
learning-links edit NAME [--name NEW_NAME] [--url URL] [--status STATUS]
learning-links remove NAME
learning-links link TOPIC SUPPORTING_TOPIC --kind prerequisite|helpful|related
learning-links unlink TOPIC SUPPORTING_TOPIC
learning-links show NAME
learning-links important
learning-links reset [--yes]
learning-links graph [-o FILE] [--format svg|png] [--open]
learning-links dot [-o FILE]
```

### Sample topic commands

Load a connected set of sample topics for one subject into `DATABASE_URL`:

```fish
uv run python scripts/generate_examples.py physics
uv run python scripts/generate_examples.py math
uv run python scripts/generate_examples.py computer-science
uv run python scripts/generate_examples.py linguistics
uv run python scripts/generate_examples.py astronomy
```

Each run adds only missing topics and creates or updates that subject's
relationships; it does not reset the database or load every subject. Preview the
commands without modifying the database with `--dry-run`:

```fish
uv run python scripts/generate_examples.py physics --dry-run
```

## Web authentication

The web app uses HTTP Basic authentication backed by the PostgreSQL `users` table.
Passwords are stored as Argon2 hashes.

For local testing with Docker Compose, copy `.env.example` to `.env`, replace its database password, then create a login:

```bash
docker compose up -d --build
docker compose exec app learning-links user-add you@example.com
```

Enter the email and password you just created in your browser's sign-in prompt. If you run FastAPI outside Docker, use `learning-links user-add you@example.com` with `DATABASE_URL` set instead.

To skip the prompt for a local-only FastAPI process, set the development flag in
the repository-root `.env`, then stop and restart the API:

```bash
LEARNING_LINKS_DISABLE_AUTH=1
```

`DATABASE_URL` is still required, because bypassing authentication does not
bypass PostgreSQL. Docker Compose forwards this flag to the app service when it
is set. Keep authentication on when sharing the app.

Add another user from a local Python installation:

```bash
learning-links user-add user@example.com
```

The command prompts for the password without echoing it.

Manage users:

```bash
learning-links user-list
learning-links user-disable user@example.com
learning-links user-enable user@example.com
learning-links user-password user@example.com
```

Basic authentication must not be exposed over plain public HTTP. Use it only
behind HTTPS, such as Tailscale Funnel or Cloudflare Tunnel.

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
127.0.0.1:5433 -> PostgreSQL
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
Tailscale Funnel or Cloudflare Tunnel
   |
   v
Linux VM
   |
Docker Compose
├── FastAPI + built frontend
└── PostgreSQL
```

The VM is useful as a security boundary: the application stack can live there instead of directly on your desktop OS. Docker then isolates the app and database services inside the VM.

The recommended public path does not require router port forwarding. Tailscale
Funnel provides a free `.ts.net` URL through an outbound connection; Cloudflare
Tunnel is an alternative when you own a custom domain. Users only see a normal
HTTPS application URL.

### Tailscale Funnel (no domain)

See [docs/tailscale-funnel.md](docs/tailscale-funnel.md) for the complete setup.
It is the simplest option for public sharing without buying a domain.

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

Users visit the HTTPS hostname in a normal browser. They do not need Tailscale, a VPN, or any client software. FastAPI then asks for one of the accounts you created with `learning-links user-add`.

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

Run the test suite with uv:

```bash
uv run pytest
```

The database tests use `TEST_DATABASE_URL` and reset all data in that database.
Create it once after starting PostgreSQL:

```bash
docker compose exec -T db createdb -U learning_links learning_links_test
```

Use a separate disposable test database, never the application database.

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
