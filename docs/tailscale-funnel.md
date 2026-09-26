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

## Start the application

Create the environment file, generate a password, and put that password in
`POSTGRES_PASSWORD` in `.env`:

```bash
cp .env.example .env
openssl rand -hex 24
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
a normal browser, then sign in with the Learning Links email/password created
earlier. That browser login is separate from the Tailscale account.

## Add and manage users

Create one app account per user:

```bash
docker compose exec app learning-links user-add user@example.com
```

Send the public URL, account email, and password through a secure channel. To
disable access later:

```bash
docker compose exec app learning-links user-disable user@example.com
```

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