# cPanel / Phusion Passenger deployment

This directory documents the one-time cPanel setup that the
`.github/workflows/deploy.yml` pipeline deploys into.

> ⚠️ **Deploy only to a clean, rebuilt cPanel account with freshly rotated
> credentials.** The previous `goodbuys.info` account is a confirmed live
> compromise (infostealer + self-healing backdoor). Any SSH key or `.env` you
> push to a compromised box is captured immediately, and the app will be
> re-infected. Stand up the new account first, then wire up the secrets below.

## What actually runs

`next.config.mjs` sets `output: "standalone"`, so `next build` emits a
self-contained Node server at `.next/standalone/server.js`. The workflow copies
`public/` and `.next/static/` next to it (Next omits those from the standalone
output on purpose) and rsyncs the whole thing to `CPANEL_APP_ROOT`. Passenger
runs `server.js` as the app's startup file — no Python `passenger_wsgi.py` is
involved; this is a **Node** Passenger app.

Runtime notes:
- `app/api/search` uses `cheerio` + bundled JSON + global `fetch` — bundled into
  standalone. **`better-sqlite3` is scraper-only and is NOT in the request path**,
  so there is no native module to compile on the host.
- `app/api/contact` writes to `<APP_ROOT>/data/formEntries.json`. The deploy
  step **excludes `data/`** from `--delete`, so submissions survive redeploys.

## One-time cPanel setup

1. **Create the Node.js app** — cPanel → *Setup Node.js App* → **Create Application**:
   - Node.js version: pick the newest available **≥ 20** (ideally match the CI
     build major in `.nvmrc` as closely as the host allows).
   - Application mode: **Production**
   - Application root: e.g. `goodbuys` → this becomes `/home/<user>/goodbuys`
     (use this absolute path as `CPANEL_APP_ROOT`).
   - Application URL: your domain / subdomain.
   - Application startup file: **`server.js`**
   - Create it, then **Stop** the app (the first deploy populates the files).
   - Do **not** run "Run NPM Install" — the standalone bundle ships its own
     minimal `node_modules`.

2. **Add environment variables** in the same screen (optional but recommended):
   - `NODE_ENV=production`
   - `CONTACT_FORM_ALLOWED_ORIGINS=https://yourdomain,https://www.yourdomain`
     (locks `app/api/contact` to your origins; unset = no origin check).

3. **Create a dedicated deploy SSH key** (do this locally, keep the private key
   off the server):
   ```bash
   ssh-keygen -t ed25519 -f goodbuys_deploy -C "gh-actions-deploy" -N ""
   ```
   - Append `goodbuys_deploy.pub` to `~/.ssh/authorized_keys` on the cPanel
     account (cPanel → *SSH Access* → Manage/Import Keys → Authorize).
   - Put the **private** key `goodbuys_deploy` into the `CPANEL_SSH_KEY` secret.

4. **Pin the host key** (recommended — skip TOFU):
   ```bash
   ssh-keyscan -p <ssh-port> <host> 
   ```
   Paste the output line(s) into the `CPANEL_KNOWN_HOSTS` secret.

## GitHub Actions secrets

Set under *Settings → Secrets and variables → Actions*:

| Secret | Example | Notes |
| --- | --- | --- |
| `CPANEL_HOST` | `server123.web-hosting.com` | SSH host |
| `CPANEL_USER` | `myacct` | cPanel/ssh username |
| `CPANEL_SSH_PORT` | `21098` | Namecheap shared hosting default |
| `CPANEL_SSH_KEY` | *(PEM)* | private deploy key from step 3 |
| `CPANEL_APP_ROOT` | `/home/myacct/goodbuys` | absolute app root from step 1 |
| `CPANEL_KNOWN_HOSTS` | *(keyscan line)* | recommended; TOFU if omitted |

## Deploy

Push to `main` (or run the workflow manually via *Actions → Deploy to cPanel →
Run workflow*). The pipeline builds, rsyncs, and touches
`<APP_ROOT>/tmp/restart.txt` to make Passenger reload the app.

## Passenger config via .htaccess (alternative)

If you manage Passenger by hand instead of via the *Setup Node.js App* UI, see
`passenger.htaccess.example` for the directives to place in the domain's
document root. The UI approach in step 1 is preferred on shared hosting.
