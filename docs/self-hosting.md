# Self-hosting

Recommended small deployment:

```text
friends' browsers
       |
       | HTTPS
       v
Cloudflare
       |
       | outbound tunnel
       v
Linux VM
└── Docker Compose
    ├── cloudflared
    ├── learning-links
    └── PostgreSQL
```

## VM

A small Linux VM is enough. For this prototype, 1-2 GB RAM and modest disk space are sufficient.

Use NAT networking unless you have a reason to bridge the VM directly onto your LAN. The Cloudflare Tunnel makes an outbound connection, so the VM does not need inbound internet port forwarding.

Install inside the VM:

- Git
- Docker Engine
- Docker Compose plugin

Then clone the repository inside the VM.

Do not mount your home directory or other personal host directories into the containers.

## Start the stack

```bash
cp .env.example .env
```

Generate a database password, for example:

```bash
openssl rand -hex 24
```

Put that value in `.env` as `POSTGRES_PASSWORD`.

Start locally first:

```bash
docker compose up -d --build
```

Check it:

```bash
docker compose ps
docker compose logs -f app
```

Create the first account:

```bash
docker compose run --rm app learning-links user-add you@example.com
```

Add friends the same way.

## Public access

Create a remotely managed Cloudflare Tunnel and route the chosen public hostname to:

```text
http://app:8000
```

Put the tunnel token in `.env`:

```text
CLOUDFLARE_TUNNEL_TOKEN=...
```

Then:

```bash
docker compose --profile public up -d
```

Friends only need the HTTPS URL and the account/password you created for them.

Do not expose port 5432 publicly. Do not expose port 8000 publicly when the tunnel is being used.

## Disable access

```bash
docker compose run --rm app learning-links user-disable friend@example.com
```

Re-enable later with `user-enable`.

## Backups

The PostgreSQL database is the important persistent state. A simple manual backup is:

```bash
docker compose exec -T db \
  pg_dump -U learning_links -d learning_links > learning-links.sql
```

Restore into an empty database with `psql`.

Keep backups outside the VM as well. A VM disk is not itself a backup.

## Updating

```bash
git pull
docker compose up -d --build
```

The PostgreSQL named volume remains in place when the application container is rebuilt.
