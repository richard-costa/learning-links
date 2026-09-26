# Public Sharing With Tailscale Funnel

This guide publishes Learning Links at a public `https://...ts.net` URL without
buying a domain, opening router ports, or requiring users to install
Tailscale. It works on a Linux VM or a machine that stays online.

```text
users' browsers
       |
       | HTTPS
       v
Tailscale Funnel
       |
       v
127.0.0.1:8000 on the host
       |
       v
Docker Compose app + PostgreSQL
```

## Before you begin

- Create a free Tailscale account at <https://login.tailscale.com>.
- Install Docker Engine, Docker Compose, and Git on the host.
- Clone this repository on that host.
- Keep `LEARNING_LINKS_DISABLE_AUTH` empty or set it to `0`. Never publish with
  authentication disabled.
- Set `LEARNING_LINKS_SECURE_COOKIES=1` for the Funnel deployment so browser
  sessions always use the `Secure` `__Host-` cookie even though Funnel forwards
  to the app over localhost HTTP.

## Start the application

Create the environment file, generate a password, and put that password in
`POSTGRES_PASSWORD` in `.env`:

```bash
cp .env.example .env
openssl rand -hex 24
```

For the initial deployment, keep public account creation disabled:

```text
LEARNING_LINKS_ENABLE_SIGNUP=
LEARNING_LINKS_SECURE_COOKIES=1
```

Start the complete production-like stack and wait for its health checks:

```bash
docker compose up -d --build --wait
docker compose ps
curl --fail http://127.0.0.1:8000/api/health
```

Create the first browser login. The password prompt does not echo input:

```bash
docker compose exec app learning-links user-add you@example.com
```

The web app uses an opaque server-side session cookie after sign-in. Passwords
are stored as Argon2 hashes, and session tokens are stored in PostgreSQL only as
SHA-256 hashes.

## Install and authenticate Tailscale

Install Tailscale using the command for your Linux distribution from
<https://tailscale.com/download/linux>. For Arch-based systems, the installer
uses pacman:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Open the authentication URL printed by `tailscale up` and sign in. Confirm the
host appears in the Tailscale Machines page:

```bash
tailscale status
```

If installation updates the kernel, reboot before continuing so the `tun` kernel
module matches the running kernel.

## Enable and start Funnel

The first Funnel command opens a one-time Tailscale page to enable HTTPS
certificates and Funnel access for the tailnet. Approve it, then run the command
again.

Allow your normal Linux user to manage Funnel without `sudo`:

```bash
sudo tailscale set --operator=$USER
```

Publish the locally bound Docker app:

```bash
tailscale funnel --bg --https=443 http://127.0.0.1:8000
tailscale funnel status
```

`tailscale funnel status` prints the public `https://...ts.net` URL. Open it in
a normal browser. `/demo` is public and browser-only; `/login` opens a normal
Learning Links session for an existing account.

## Account creation

The safer default is manual account provisioning:

```bash
docker compose exec app learning-links user-add user@example.com
```

To temporarily allow visitors to create their own accounts from `/signup`, set:

```text
LEARNING_LINKS_ENABLE_SIGNUP=1
LEARNING_LINKS_MAX_USERS=50
```

and restart the app container:

```bash
docker compose up -d --build app
```

When signup is disabled, the Create account controls disappear from the landing
and login pages, and the signup API rejects account creation. The demo remains
available.

Public login and signup endpoints are rate-limited in PostgreSQL. Defaults are
listed in `.env.example`; they can be tightened for a small private audience.

To disable public account creation again, clear `LEARNING_LINKS_ENABLE_SIGNUP`
and restart the app.

Manage existing users with:

```bash
learning-links user-list
learning-links user-disable user@example.com
learning-links user-enable user@example.com
learning-links user-password user@example.com
```

Disabling a user or changing a password revokes that user's existing sessions.

## Verify the public deployment

At the Funnel URL, verify:

- `/` loads without authentication;
- `/demo` works and resets on refresh;
- `/login` accepts an existing account;
- `/app` redirects to `/login` when signed out;
- the browser session cookie is named `__Host-learning_links_session` and is
  `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`;
- authenticated workspace writes still require the CSRF header;
- responses include the application's CSP, frame, content-type, referrer, and
  permissions security headers.

If public signup is enabled, create one temporary account, confirm its workspace
is isolated, then delete or disable it after testing.

## MagicDNS warning on NetworkManager systems

Funnel works without MagicDNS, but Tailscale may report this warning:

```text
systemd-resolved and NetworkManager are wired together incorrectly; MagicDNS will probably not work
```

Configure `/etc/resolv.conf` to use the systemd-resolved stub, then restart the
resolver, NetworkManager, and Tailscale:

```bash
sudo ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
sudo systemctl restart systemd-resolved
sudo systemctl restart NetworkManager
sudo systemctl restart tailscaled
tailscale status
```

Network connectivity may reconnect briefly. This is the configuration recommended
by the [Tailscale Linux DNS guide](https://tailscale.com/s/resolved-nm).

## Operate the deployment

Check status and logs:

```bash
docker compose ps
docker compose logs -f app
tailscale funnel status
```

Stop public sharing but leave the app running:

```bash
tailscale funnel --https=443 off
```

Stop the containers while preserving database data:

```bash
docker compose down
```

For a maximum shutdown, stop public sharing, stop the containers, and disconnect
this host from the tailnet. Tailscale remains installed and can be reconnected
later with `sudo tailscale up`:

```bash
tailscale funnel --https=443 off
docker compose down
sudo tailscale down
```

Back up the application database:

```bash
docker compose exec -T db \
  pg_dump -U learning_links -d learning_links > learning-links-backup.sql
```
