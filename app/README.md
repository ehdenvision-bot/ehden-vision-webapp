# Chantier WebApp (Node.js + PostgreSQL + React)

Migration target for the Google Apps Script + Google Sheets construction-site
management app ("Ehden Vision") found in `../extracted/Web APP/`. See
`TODO.md` for the full migration plan and status.

## Access

### Local development
- Backend API + built frontend: http://localhost:3000
- Frontend dev server (hot reload, proxies `/api` + `/uploads` to :3000): http://localhost:5173
- Login: `admin@example.com` / `changeme123` (created by `npm run db:seed`
  — change this before any non-local use)

### Production (michel.optima-tech.info)
Not deployed yet. This section will be filled in with the real production
URL and an admin login once the app is actually deployed there — do not
treat anything above this line as live until that happens. When deploying,
remember to:
- generate real `.env` secrets (`JWT_SECRET`, DB credentials, SMTP) —
  never reuse the local dev values above
- create the first real admin user (`npm run db:seed` only inserts the
  dev-only `admin@example.com` account — don't run it as-is against
  production, or immediately rotate that password if you do)
- run `npm run build:frontend` before deploying — the Express server only
  serves `frontend/dist` if it exists (see `src/server.js`)

## Local development setup

Postgres must be running and reachable at the `DATABASE_URL` in `.env`.
`docker-compose.yml` is provided for environments with a Docker daemon; in
this sandbox there wasn't one, so Postgres 17 was installed natively
instead (`apt-get install postgresql`) — either works.

```bash
cp .env.example .env
npm install

# Option A: Docker (if available)
docker compose up -d        # Postgres :5432, Adminer :8081

# Option B: native Postgres already running — create the role/db once:
#   sudo -u postgres psql -c "CREATE ROLE chantier LOGIN PASSWORD 'chantier' CREATEDB;"
#   sudo -u postgres psql -c "CREATE DATABASE chantier OWNER chantier;"

npx prisma migrate dev --name init
npm run db:seed             # creates admin@example.com / changeme123
npm run dev                 # API on http://localhost:3000
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to :3000
```

For a single-process check (no hot reload), build the frontend once and let
Express serve it: `npm run build:frontend && npm run dev`, then everything
is at http://localhost:3000.

Health check: `GET /health`
Login: `POST /api/auth/login` with `{ "email": "admin@example.com", "password": "changeme123" }`

## Stack

- **Backend**: Express (API), PostgreSQL + Prisma ORM, JWT (httpOnly cookie)
  auth, bcrypt password hashing, nodemailer (password-reset emails — falls
  back to console logging if SMTP isn't configured, see `.env.example`)
- **Frontend**: React + Vite + Tailwind CSS v4 + React Router + TanStack
  Query, plain JS (no TypeScript), at `frontend/`. No component library —
  Tailwind utility classes matching the legacy app's real design tokens
  (see `frontend/src/index.css`'s `@theme` block: primary `#0d59f2`,
  corporate blue `#004595`, Inter font, Material Symbols Outlined icons).
- Docker Compose for local Postgres + Adminer (DB admin UI), or native
  Postgres
