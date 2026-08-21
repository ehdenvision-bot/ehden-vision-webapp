# Chantier WebApp (Node.js + PostgreSQL)

Migration target for the Google Apps Script + Google Sheets construction-site
management app found in `../extracted/Web APP/`. See `TODO.md` for the full
migration plan and status.

## Local development

```bash
cp .env.example .env
npm install
docker compose up -d        # Postgres :5432, Adminer :8081
npx prisma migrate dev --name init
npm run db:seed             # creates admin@example.com / changeme123
npm run dev                 # http://localhost:3000
```

Health check: `GET /health`
Login: `POST /api/auth/login` with `{ "email": "admin@example.com", "password": "changeme123" }`

## Stack

- Express (API)
- PostgreSQL + Prisma ORM
- JWT (httpOnly cookie) auth, bcrypt password hashing
- Docker Compose for local Postgres + Adminer (DB admin UI)
