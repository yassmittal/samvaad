# Deployment (Phase 6.1)

Every step to host the API at **`https://samvaad-api.yashmittal.xyz`** and the web app at
**`https://samvaad.yashmittal.xyz`**, in order (D-010). You run the steps yourself. Each one says
what you should see. If a step doesn't match, stop there and send the step number, the command and
its output.

How it fits on the instance, next to StrideMon and meAsAgent:

```text
phone ──HTTPS──▶ Vercel (samvaad.yashmittal.xyz)            the page, the mic, the speech
  │
  └──WSS───▶ nginx :443 (samvaad-api.yashmittal.xyz, Let's Encrypt)
               └──▶ 127.0.0.1:3030  PM2 "samvaad-api" (Bun 1.4.2)
                                      ├──▶ Muse Voice Transcribe (wss://api.meta.ai)
                                      └──▶ Muse Spark (https://api.meta.ai)
```

Nothing that already runs on the instance changes. Samvaad gets its own subdomain, nginx server
block, certificate, port and PM2 process. It has no database: rooms live in memory (D-004), so a
restart ends every open room.

---

## 0. The existing setup

From StrideMon's `docs/deployment.md` (5 Oct). Check the port is still free before step 4:

- nginx uses `/etc/nginx/sites-enabled/`, one file per domain named after it. meAsAgent's API is
  on `127.0.0.1:3010`, StrideMon's on `3020`.
- certbot is installed, with one certificate per domain.
- StrideMon's pinned Bun is at `~/.bun-1.4.2/bin/bun`, the version `bun.lock` was made with. The
  shared `~/.bun` is older. Samvaad uses the pinned one and installs nothing new.
- The public IP is `100.55.119.114`.
- DNS for `yashmittal.xyz` is on **Vercel**, with a wildcard record.

- [X] On the server, `ss -ltn | grep ':3030 '` prints nothing (the port is free).
- [X] `~/.bun-1.4.2/bin/bun --version` prints `1.4.2`.

## 1. DNS record (Vercel)

vercel.com → your account → **Domains** → `yashmittal.xyz` → **DNS Records** → **Add**:

| Name | Type | Value | TTL |
|------|------|-------|-----|
| `samvaad-api` | `A` | `100.55.119.114` | default |

It overrides the wildcard for this one name only. The web app's `samvaad` name needs no record: it
is a Vercel project domain (step 7), which the wildcard already serves.

- [X] After a few minutes, on your Mac: `dig +short samvaad-api.yashmittal.xyz` prints only
      `100.55.119.114` (not `cname.vercel-dns.com`). Don't run step 5's certbot before this.

## 2. The Meta spend alert

dev.meta.ai → **Billing**: set a spend alert below the $150 credit (say $100), so a forgotten
open mic shows up by email before the credit runs out.

- [X] The alert is listed on the Billing page.

## 3. The code on the server

Push the repo first, so the clone has today's tree. Clone it the way you cloned StrideMon:

```bash
cd ~/projects
git clone <the Samvaad repo URL> samvaad
cd samvaad
~/.bun-1.4.2/bin/bun install --frozen-lockfile --filter '@samvaad/api'
```

`--filter` installs only the API and `packages/shared`, not Next.js.

- [ ] The install ends without an error.

## 4. The API's `.env` on the server

```bash
cd ~/projects/samvaad/apps/api
cp .env.example .env
vim .env
```

Set these values. Every other line stays as in `.env.example`:

| Variable | Value |
|----------|-------|
| `META_API_KEY` | the same key as in your laptop's `apps/api/.env` |
| `PORT` | `3030` |
| `ALLOWED_WEB_ORIGINS` | `https://samvaad.yashmittal.xyz`. Only the real site: the room socket refuses every other origin |

```bash
chmod 600 .env
```

- [ ] `grep -cE "^[A-Z_]+=" .env` prints the same number as for `.env.example`, so no variable is
      missing.

## 5. nginx and HTTPS

```bash
sudo vim /etc/nginx/sites-available/samvaad-api.yashmittal.xyz
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name samvaad-api.yashmittal.xyz;

    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        # Rooms are WebSockets: pass the upgrade through.
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # nginx closes a socket after 60 s without a frame by default. A listener's socket is
        # quiet while the other person thinks, so allow an hour.
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/samvaad-api.yashmittal.xyz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d samvaad-api.yashmittal.xyz
```

certbot adds the `listen 443 ssl` lines and the certificate to this file. Pick the HTTP → HTTPS
redirect when it asks. It renews the certificate on its own.

- [ ] `nginx -t` says `syntax is ok` and `test is successful`.
- [ ] certbot ends with `Successfully deployed certificate`.

## 6. Start it with PM2

```bash
cd ~/projects/samvaad/apps/api
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs samvaad-api --lines 30
```

- [ ] `pm2 list` shows `samvaad-api` **online**, and its ↺ count stays at 0 over a minute.
- [ ] `pm2 describe samvaad-api | grep "script path"` shows `.bun-1.4.2/bin/bun`.
- [ ] The logs show `"msg":"Server listening at http://127.0.0.1:3030"` and no error.
- [ ] `curl -s http://127.0.0.1:3030/health` on the server prints `{"status":"ok"}`.
- [ ] From your Mac: `curl -s https://samvaad-api.yashmittal.xyz/health` gives the same answer.

If it shows `errored`, the first log lines name the missing or wrong `.env` variable.

## 7. The web app on Vercel

vercel.com → **Add New… → Project** → import the Samvaad repository:

| Setting | Value |
|---------|-------|
| Project name | `samvaad` |
| Framework preset | Next.js |
| Root directory | `apps/web` |
| Build, output and install commands | The defaults. Vercel sees the root `bun.lock` and installs the workspace with Bun, `packages/shared` included |
| Environment variables | `NEXT_PUBLIC_API_BASE_URL` = `https://samvaad-api.yashmittal.xyz`, for Production and Preview |

`NEXT_PUBLIC_*` values are built into the page, so set it **before** the first deploy (or redeploy
after adding it). Deploy, then **Settings → Domains → Add** `samvaad.yashmittal.xyz`.

- [ ] The `….vercel.app` address loads the home page.
- [ ] `https://samvaad.yashmittal.xyz` loads with a valid certificate. If it hasn't come 20 minutes
      later: `vercel certs issue samvaad.yashmittal.xyz`.
- [ ] The home page's status panel says **Server ok** ("Ready to translate"). While it checks, it
      shows the URL it calls: `https://samvaad-api.yashmittal.xyz`.

Preview deploys (`….vercel.app`) load, but their rooms are refused: only the real domain is in
`ALLOWED_WEB_ORIGINS`.

## 8. On the phone, on mobile data

Turn the phone's Wi-Fi off. Close the laptop's dev servers.

- [ ] Table mode on `https://samvaad.yashmittal.xyz/table`: speak Hindi, hear English, and the
      reverse.
- [ ] A room: create it on the laptop, join from the phone by QR, talk both ways, End & recap.
- [ ] Stay silent for two minutes in the room, then talk: it still works (step 5's timeouts).
- [ ] `pm2 logs samvaad-api` shows the room and no errors.

## Updating the API later

```bash
cd ~/projects/samvaad
git pull
~/.bun-1.4.2/bin/bun install --frozen-lockfile --filter '@samvaad/api'
pm2 restart samvaad-api
```

A new variable in `.env.example` must be added to the server's `.env` before the restart, or the
API refuses to start and names it (`pm2 logs samvaad-api`). A restart ends open rooms: don't
restart during a demo. The web app redeploys on its own when you push.

## When something goes wrong

| What you see | Check |
|---|---|
| `curl` to the domain fails, but `127.0.0.1:3030` works | DNS (step 1: `dig` must print `100.55.119.114`), or the nginx file isn't enabled (`sudo nginx -T \| grep samvaad`) |
| certbot fails its challenge | DNS still points at Vercel: wait until step 1's `dig` passes |
| `bun install` fails on the lockfile | It ran with the shared Bun: use `~/.bun-1.4.2/bin/bun` |
| `502 Bad Gateway` | The API isn't running: `pm2 logs samvaad-api` |
| PM2 restarts it in a loop | A `.env` value is wrong. The log's first line names it |
| The page loads but the room never connects | `ALLOWED_WEB_ORIGINS` must be exactly `https://samvaad.yashmittal.xyz` (no trailing `/`); the log says `conversation socket origin rejected` |
| The socket connects but drops after about a minute of silence | The nginx file is missing step 5's `proxy_read_timeout` |
| The status panel says "Server unreachable", or briefly shows `localhost` | `NEXT_PUBLIC_API_BASE_URL` was set after the build: redeploy on Vercel |
