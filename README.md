# learning-links

A small tool for capturing **learning encounters**: while studying one topic, flag another topic that you want to learn, review, or explore. Over time, Learning Links shows which concepts keep resurfacing across otherwise separate study contexts.

Example:

```text
Classical Mechanics ──▶ Differential Equations
Linear Algebra      ──▶ Differential Equations
Control Theory      ──▶ Differential Equations
```

The useful discovery is not the graph itself: it is that **Differential Equations came up independently in three contexts**.

## Model

There are only two domain objects:

```text
Topic
  name
  status: planned | learning | learned | later
  reference URL (optional)

Encounter
  context: topic you were studying
  topic: topic you flagged
  reason: need | revisit | curious
  note (optional)
```

An encounter is unique for a `(context, topic)` pair. Flagging the same pair again updates its reason/note. See [docs/data-model.md](docs/data-model.md) for the database model and migration from the old relationship schema.

## Web interface

The browser has four views:

- **Topics** — searchable topic library with encounter counts.
- **Topic** — the primary workspace: **Came up in** and **Flagged while studying this**.
- **Discover** — recurring topics ranked by number of distinct contexts, plus a context matrix.
- **Map** — a local ego diagram containing only the selected topic and its immediate encounters.

There is intentionally no global force-directed graph. The map is local so it answers a concrete question instead of becoming a dense overview.

## Architecture

```text
browser (Vite + vanilla TypeScript + CSS)
   |
   | HTTPS in public deployments
   v
FastAPI
   |
   v
PostgreSQL
```

PostgreSQL is the source of truth for both the web app and CLI.

## Quickstart

For local development, you need Python 3.11+, Node, Docker Compose, and `uv`.

1. Install the Python environment and copy the local configuration template:

```fish
python -m pip install --user uv
uv sync
cp .env.example .env
```

2. Set one local database password in `.env` and use it in `POSTGRES_PASSWORD`, `DATABASE_URL`, and `TEST_DATABASE_URL`. For local UI testing, set `LEARNING_LINKS_DISABLE_AUTH=1`.

3. Start PostgreSQL:

```fish
docker compose up -d --wait db
```

4. Run the API and frontend in separate terminals:

```fish
# Terminal 1, repository root
uv run learning-links-api

# Terminal 2
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. Vite proxies `/api` to FastAPI on port 8000.

### Local cleanup

Stop services while preserving database data:

```fish
docker compose down
```

Remove application topics and encounters while keeping web users:

```fish
uv run learning-links reset --yes
```

Delete all local PostgreSQL data, including users and the test database:

```fish
docker compose down --volumes
```

Recreate the disposable test database when needed:

```fish
docker compose up -d --wait db
docker compose exec -T db createdb -U learning_links learning_links_test
```

## CLI

Typical workflow:

```bash
learning-links add "Classical Mechanics" --status learning
learning-links add "Differential Equations"
learning-links flag "Classical Mechanics" "Differential Equations" \
  --reason need \
  --note "Harmonic oscillator equations"
learning-links show "Differential Equations"
learning-links discover
```

`flag CONTEXT TOPIC` means: **while studying CONTEXT, TOPIC came up and I want to keep track of it**.

Main commands:

```text
learning-links add NAME [--url URL] [--status planned|learning|learned|later]
learning-links list
learning-links overview
learning-links discover
learning-links isolated
learning-links edit NAME [--name NEW_NAME] [--url URL] [--status STATUS]
learning-links remove NAME
learning-links flag CONTEXT TOPIC [--reason need|revisit|curious] [--note TEXT]
learning-links unflag CONTEXT TOPIC
learning-links show NAME
learning-links reset [--yes]
learning-links graph NAME [-o FILE] [--format svg|png] [--open]
learning-links dot NAME [-o FILE]
```

`graph` and `dot` produce only a **local ego diagram** for the requested topic.

### Sample encounters

Load examples without resetting existing data:

```fish
uv run python scripts/generate_examples.py physics
uv run python scripts/generate_examples.py math
uv run python scripts/generate_examples.py computer-science
uv run python scripts/generate_examples.py linguistics
uv run python scripts/generate_examples.py astronomy
```

Running multiple subjects intentionally creates recurring concepts such as Differential Equations, Linear Algebra, Probability, and Statistics, so the Discover view becomes useful. Preview commands with `--dry-run`.

## Existing database migration

On startup, if an older `relationships` table exists, it is migrated once into `encounters` and then removed:

```text
prerequisite -> need
helpful      -> revisit
related      -> curious
```

The old direction is preserved as `context = old dependent topic` and `topic = old supporting topic`. Because the old `related` kind was semantically symmetric but stored directionally, its migrated direction is necessarily an approximation. Review those migrated entries if they matter to you.

## Web authentication

The web app uses HTTP Basic authentication backed by the PostgreSQL `users` table. Passwords are stored as Argon2 hashes.

Create a login in Docker:

```bash
docker compose up -d --build
docker compose exec app learning-links user-add you@example.com
```

Manage users:

```bash
learning-links user-list
learning-links user-disable user@example.com
learning-links user-enable user@example.com
learning-links user-password user@example.com
```

For local-only development, `LEARNING_LINKS_DISABLE_AUTH=1` bypasses the browser prompt. Keep authentication enabled when sharing the application. Basic authentication must only be exposed behind HTTPS.

## Docker and public sharing

The repository contains a multi-stage `Dockerfile` and `compose.yml`. The default bindings remain local-only:

```text
127.0.0.1:8000 -> app
127.0.0.1:5433 -> PostgreSQL
```

Start the stack with:

```bash
docker compose up -d --build
```

PostgreSQL data lives in the named `postgres_data` volume, so normal container recreation does not delete it.

For a public HTTPS URL without buying a domain or opening router ports, use [Tailscale Funnel](docs/tailscale-funnel.md). [docs/self-hosting.md](docs/self-hosting.md) covers the broader deployment model. `compose.yml` also retains the optional Cloudflare Tunnel profile.

## API

The intentionally small API is:

```text
GET  /api/health
GET  /api/workspace
PUT  /api/workspace
```

`/api/health` is unauthenticated for service health checks. The frontend currently saves the whole workspace with `PUT /api/workspace`; simultaneous edits are therefore last-write-wins.

## Tests

```bash
uv run pytest
```

Database tests use `TEST_DATABASE_URL` and reset that database. Never point it at the application database.

Frontend type checking/build:

```bash
cd frontend
npm install
npm run build
```

## Roadmap

### Current

- topics and learning encounters;
- Topics / Topic / Discover / local Map views;
- recurrence ranking and context matrix;
- local ego diagrams in the browser and CLI;
- FastAPI + PostgreSQL persistence;
- authenticated access and Docker Compose deployment.

### Next

- replace whole-workspace writes with resource-level CRUD endpoints;
- better multi-user/concurrency behavior;
- JSON import/export;
- filters for larger matrices and discovery lists.

### Later

- optional candidate discovery from external sources;
- LLM-assisted encounter suggestions with explicit review;
- richer recurrence signals without turning the product back into a global graph.
