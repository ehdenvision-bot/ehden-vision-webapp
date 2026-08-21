# Agent Runbook

Read `agents/current-state.md` and `agents/decisions.md` first.

## Access

- **Local dev**: http://localhost:3000 — `admin@example.com` / `changeme123` (from
  `npm run db:seed`, dev-only, rotate before any non-local use).
- **This sandbox's external proxy**: `https://michel.optima-tech.info/proxy/3000/` forwards to
  this container's port 3000. The server must bind `0.0.0.0` (already does, see
  `app/src/server.js`) or the proxy gets `ECONNREFUSED`.
- **Production**: not deployed yet. See `app/README.md`'s Access section — do not write real
  credentials there or here until an actual deployment exists.
- **No other live systems or third-party credentials are in scope yet.** If any get added
  (SMTP for password-reset emails, object storage for photos), use `app/.env` and never print
  secrets into chat, logs, or these docs.

## Running the app

```bash
cd app
cp .env.example .env   # first time only
npm install             # first time only

# Postgres — native install, no Docker daemon in this sandbox (see CLAUDE.md)
service postgresql start
# first time only:
#   sudo -u postgres psql -c "CREATE ROLE chantier LOGIN PASSWORD 'chantier' CREATEDB;"
#   sudo -u postgres psql -c "CREATE DATABASE chantier OWNER chantier;"

npx prisma migrate dev   # first time / after schema changes
npm run db:seed          # first time only

node src/server.js       # foreground, or see "Backgrounding" below
```

## Backgrounding the dev server

`node --watch` does **not** reliably detect file changes in this sandbox's filesystem (confirmed
2026-08-21 — no restart, no log line, despite the edited file being correct on disk). Don't rely
on it. Instead:

1. Start plain `node src/server.js` as a backgrounded Bash command.
2. After editing files, find and kill it, then start it again:
   ```bash
   ps aux | grep "[n]ode src/server.js"   # find the PID
   kill <pid>                              # NOT pkill -f — see below
   node src/server.js                      # restart, backgrounded again
   ```
3. **Do not use `pkill -f "node src/server.js"`.** It has reliably returned exit 144 in this
   sandbox and appears to also terminate the invoking shell (likely because the wrapping shell
   command's own argv contains the same match string). `kill <pid>` on the specific PID does
   not have this problem (clean exit 143 = SIGTERM).

## Verification pattern

This repo has no automated test suite yet (`app/TODO.md` Phase 6). Verify changes with real
end-to-end `curl` chains against the running dev server, not just `node --check` — syntax
checking does not catch Prisma field-name mismatches against the actual schema (this happened
once for real, see `agents/decisions.md`). A representative chain:

```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme123"}'

curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" -d '{"code":"...", "name":"..."}'
# then chain the returned id into building -> unit -> reserve creation, etc.
```

For frontend/visual changes: no browser automation tool has been available in this session so
far (`claude-in-chrome` skill reports the extension isn't connected). If that's still true,
verify what you can via `curl` (status codes, markup structure, CSP headers allowing the
resources you're loading) and say explicitly that visual rendering wasn't confirmed — don't
claim a visual check that didn't happen.

## Claiming work — ownership tags on live todos

Not yet needed — this has been a single-agent-at-a-time repo so far. Adopt an ownership-tag
convention here (mirroring whatever the user's other repos use) if/when multiple agents start
working this repo concurrently.
