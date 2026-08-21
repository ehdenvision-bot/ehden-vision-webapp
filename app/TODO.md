# Migration TODO — Apps Script + Sheets → Node.js + PostgreSQL

Source app: Google Apps Script web app (clasp export in `../extracted/Web APP/WepAPP.json`),
data stored in 11 Google Sheets workbooks, photos/plans in Google Drive.
Domain: construction site management (projects, buildings/"Batiments", reserves
= punch-list items, EDL = état des lieux / move-in-out inspections, users,
role-based permissions, activity logs).

## Phase 0 — Analysis (in progress)
- [ ] Full route table from `doGet`/`doPost` in the Apps Script (pages, params → views)
- [ ] Auth/session logic used today (how login + roles currently work)
- [ ] Exact columns per sheet for all 11 workbooks → finalize Prisma schema
- [ ] Drive folder layout for photos (Plans / Photos / Reserves Photos / Icons) → object storage layout
- [ ] Email flows (Gmail scopes) → SMTP/nodemailer equivalents
- [ ] Any external API calls

## Phase 1 — Local dev environment (scaffolded ✅, needs `npm install`)
- [x] `app/` skeleton: Express API, Prisma, docker-compose Postgres + Adminer
- [x] `.env.example`
- [ ] `npm install`
- [ ] `docker compose up -d` (Postgres on :5432, Adminer on :8081)
- [ ] `npx prisma migrate dev --name init`
- [ ] `npm run db:seed`
- [ ] `npm run dev` and smoke-test `/health`, `POST /api/auth/login`

## Phase 2 — Data model (draft in `prisma/schema.prisma`, WILL CHANGE)
- [ ] Refine `Configuration` (dropdown lists / script properties from sheet 01)
- [ ] Refine `Role` / `Permission` from sheet 05 (Permissions matrix)
- [ ] Refine `User` fields from sheet 02 (All Users)
- [ ] Refine `Project` fields from sheet 03 (All Projects) + 06 (Dashboard, likely becomes computed views/aggregates, not a table)
- [ ] Refine `Building` / `Unit` from sheet 07 (Batiments) — confirm floor/unit hierarchy (log/com/fac naming seen in filenames: log_L2B, com_1-A-B01-HE01, fac_1-A-N-0101-Bar1)
- [ ] Refine `Reserve` from sheet 10
- [ ] Refine `Edl` / `EdlItem` from sheet 11
- [ ] Refine `Log` from sheet 08
- [ ] Sheet 09 "Gestion Chantier" is the biggest file (1.9MB) — likely the core transactional sheet, needs closest look
- [ ] Decide: keep `Photo` generic/polymorphic or split per entity

## Phase 3 — Data migration
- [ ] Script to export each Sheets workbook to CSV/JSON (via Sheets API or manual export)
- [ ] ETL script (Node) to load CSV/JSON → Postgres via Prisma, preserving relations (map old row IDs → new UUIDs, keep a mapping table during migration)
- [ ] Migrate photos from Drive → local `uploads/` (or S3-compatible) preserving folder categories, store new paths in `Photo` table

## Phase 4 — API surface
- [x] Auth (login/logout/me) with JWT + bcrypt
- [x] Projects CRUD (stub)
- [x] Reserves CRUD (stub)
- [ ] Buildings/Units CRUD
- [ ] EDL CRUD (+ EdlItem sub-resource)
- [ ] Users + Roles/Permissions admin CRUD
- [ ] Logs (read-only, filterable) + write on mutating actions (audit middleware)
- [ ] File upload endpoint (multer) for photos/plans, linked to project/building/reserve/edl
- [ ] Configurations (dropdown lists) CRUD/read endpoint
- [ ] Permission checks wired per route (`requirePermission`) once permission codes are known from sheet 05

## Phase 5 — Frontend
- [ ] Decide: server-rendered (EJS/Handlebars) vs SPA (React/Vite) — TBD with user
- [ ] Recreate pages found in the Apps Script HTML files (dashboard, project list, buildings, reserves, EDL, permissions admin, logs)

## Phase 6 — Hardening
- [ ] Input validation on all routes (express-validator)
- [ ] Rate limiting / helmet config review
- [ ] Tests (at least for auth + one CRUD resource)
- [ ] Dockerfile for the app itself + docker-compose service (currently only Postgres/Adminer are dockerized)
- [ ] CI (lint/test) — optional
