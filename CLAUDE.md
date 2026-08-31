# CLAUDE.md

## Instructions for Claude

# Working relationship

- No sycophancy.
- Be direct, matter-of-fact, and concise.
- Be critical; challenge my reasoning.2
- Don't include timeline estimates in plans.
- Don't add yourself as a co-author to git commits. (Also set `"includeCoAuthoredBy": false`
  in `.claude/settings.json` — that enforces it at the tool level instead of relying on me
  remembering.)

# Tooling

- **Two active toolchains now** (since 2026-08-25 — see `agents/decisions.md`):
  - `Webapp Files/` — the Google Apps Script project cloned via `clasp clone`. Edit files there
    directly, then run `clasp push` to sync to Google Workspace. If changes were ever made in
    the Apps Script web editor directly, `clasp pull` first — don't assume the local copy is
    current. **This stays live and untouched** — it is not a legacy copy being phased out, it's
    a parallel build.
  - `app/` — the Node.js + PostgreSQL rewrite. `npm install`, `npm run migrate:up`, `npm start`
    (or `npm run dev` for restart-on-change). Needs a local Postgres instance and `app/.env`
    (copy `app/.env.example`). See `agents/runbook.md` for the full command set.
- Use your Edit tool for changes; Search tool for searching.
- Use Mermaid diagrams for complex systems.

# No Shortcuts, No Compromises

**The correct fix is ALWAYS better than the quick fix. No exceptions.**

- **Fix bugs when you find them.** If a bug affects the work you're doing, fix it NOW — don't
  defer it, don't say "out of scope", don't create a follow-up task for it. The only exception
  is if the fix is genuinely multi-day work AND blocked by missing infrastructure.
- **Take the correct approach, not the easy one.** Technical debt compounds. A shortcut today
  becomes a refactoring nightmare tomorrow. Always choose the long-term solution.
- **Never assume, always verify.** Don't trust plans, comments, variable names, or your own
  intuition. Read the code. Compare the numbers. Document what you find with file:line
  references.
  - **Real example (2026-08-25):** the recovered React frontend (`app/frontend/`) was assumed
    to work as-is once built and served — it had "worked" before, in the abandoned attempt.
    Wrong: Vite's default absolute asset base (`/assets/...`) and the frontend's own
    `fetch("/api/...")` calls both resolve against the proxy host's *root* domain, not this
    app's `/proxy/<port>/` mount path — silently correct on `localhost`, silently broken through
    any path-prefixed proxy. Caught by the user's actual browser console (404s naming the exact
    wrong URL: `https://michel.optima-tech.info/api/auth/login` instead of
    `.../proxy/3001/api/auth/login`) — not by anything short of testing the real proxied URL in
    a real browser. `curl`ing the app directly on `127.0.0.1:3001` never would have caught this;
    it only reproduces once something else sits in front of the app at a non-root path. Fixed in
    `app/frontend/vite.config.js` (`base: './'`), `app/frontend/src/lib/api.js` (`apiUrl()`
    resolving against `document.baseURI`), `app/frontend/src/components/Layout.jsx` (relative
    logo path), and `app/frontend/src/main.jsx` (`HashRouter` instead of `BrowserRouter`, so
    client-side navigation doesn't push an absolute path that drops the proxy prefix). See
    `agents/decisions.md` for the full record.
- **"Good enough" is not good enough.** If there's a known issue, raise it. Figure it out. Fix
  it. Don't say "acceptable for now" or "close enough".
- **The user makes the decisions.** When there's a tradeoff, present the options with evidence
  and let the user decide. Don't silently pick the easy path.
- **Document everything you verify.** Context is lost between sessions. If you verified
  something end-to-end (a route, a deploy, a migration), write down the command and result.
  There's no second paid tool here acting as an independent check — this file and your own
  verification are the safety net, so don't skip it.

## Repo Management

Repo-wide guidance for Claude Code. Read `agents/architecture.md` for the stable structural
picture (modules, data model, request/auth flow), then `agents/current-state.md` and
`agents/decisions.md` for prior session context (what's been mapped, what's still open) — that
lives there rather than here. `agents/runbook.md` has the concrete commands for working with
this repo; `agents/todo.md` and `agents/progress-log.md` (use `agents/progress-entry-template.md`
for new entries) track pending work and session history.

This repo now holds two live things side by side (as of 2026-08-25 — see `agents/decisions.md`
for the full reasoning and reversal history):

- **`Webapp Files/`** — a `clasp clone` of the live Google Apps Script project. Still the actual
  deployed app on Google Workspace, still fully editable, **not being phased out or frozen**.
- **`app/`** — a Node.js + Express + PostgreSQL rewrite, built in parallel rather than as a later
  cutover. No ORM (plain `pg` + `node-pg-migrate`). Ported so far, with behavioral fidelity
  verified against the Apps Script source: auth (login/logout/session TTL, role-based edit gate,
  project-status lock), users, projects. Everything else (Planning, Locataires, Bâtiments,
  Réserves, EDL, Logs, the React frontend) is not yet ported — see `agents/todo.md`.

**A prior attempt at this exact rewrite (Node.js/Express/Prisma/PostgreSQL, also under `app/`)
was abandoned earlier the same day**, in favor of the progressive-migration plan this section
used to describe. That plan was then explicitly reversed by the user a few hours later — this
is the second attempt, deliberately redone rather than resumed (different ORM choice, schema
re-derived from the actual sheet columns rather than assumed). Don't treat this history as
settled precedent either way — if it happens a third time, that's a signal worth naming, not
silently repeating.

## Delegation: match each subtask to the cheapest runner that can do it

Default to the main thread; escalate to a subagent only when the task actually benefits from
isolation or parallelism — delegation overhead (a fresh context, a briefing prompt) isn't free
even when the delegate itself is cheap.

1. **Main thread (you).** Default for anything short, sequential, or that needs this
   conversation's context. Most work belongs here — delegation is the exception.
2. **`Agent` with `subagent_type: "fork"`.** The subtask needs this conversation's full
   context, but its own noisy tool output (a big log tail, a wide search) shouldn't pollute
   your context. A fork runs on your model and shares your prompt cache, so it's usually cheap
   despite carrying full history.
3. **`Agent` with a fresh (non-fork) type and `model: "haiku"`.** Mechanical, high-volume,
   narrowly-scoped work with a verifiable output and no need for this conversation's context.
4. **`Agent` with a fresh type, default model (Sonnet).** Real coding, investigation, and
   most subagent work — this is the tier everything runs on unless stated otherwise.
5. **`Agent` with a fresh type and `model: "opus"`.** Reserve for work that genuinely needs
   the deepest reasoning. Check `/model` before relying on this — on a Claude Pro plan, Opus
   access in Claude Code is currently metered separately from the plan's included usage rather
   than bundled in, so don't default to it or plan around it being free.

Don't propose Agent Teams for work the tiers above already cover — on a Pro plan's usage
limits, a team is the most expensive way to do most tasks.

There's no sixth, Codex-equivalent tier here: nothing else in this workflow is invocable by
you directly. See "Manual second opinions" below for how the free tools fit in instead — that
work is handed to the user, not dispatched by you.

## Manual second opinions: Antigravity / DeepSeek (free, low-trust)

Antigravity (Google, free preview, Gemini-powered) and DeepSeek's free tier are not integrated
into this workflow — you can't dispatch to them the way Codex could be shelled out to, and
they don't share this conversation's context or your prompt cache. They're a manual fallback
the user operates, not a tier you delegate to:

- **Use them for genuinely independent, low-stakes exploration only** — a second
  implementation attempt to compare against, or a wide research task — not for anything that
  needs the discipline in "No Shortcuts, No Compromises" above. Neither tool is bound by this
  file and there's no way to confirm it followed these rules.
- **Suggest a self-contained prompt** when the user wants to try one of these — they start
  with zero knowledge of this conversation, so the prompt needs to carry all the context.
- **Suggest isolating the work in its own branch or worktree** before it goes to either tool,
  so a bad run can't corrupt `[main branch]`.
- **Treat anything that comes back for review, not for trust.** Review it with the same
  skepticism as any unvetted contribution — check it against the actual code, don't take its
  own account of what it did at face value.
- Expect lower reliability than Claude Code's subagents from either tool: no equivalent
  permission system or sandboxing, weaker instruction-following, and free-tier rate limits.
  Flag if the user is about to give either one write access to something that hasn't been
  reviewed line-by-line.

## `Webapp Files/` local dev environment — sandbox-specific gotchas

Empty for now. When something in this dev setup behaves unexpectedly (a command that silently
fails, a tool that doesn't do what its docs say here, a networking quirk), add it here with a
date and the confirmed workaround — don't rely on rediscovering it next session.

## Cost hygiene

- **`/clear` between unrelated tasks.** Stale context gets re-sent (and re-billed against Pro
  plan usage) on every subsequent turn. This is a user-driven command, not something you
  invoke yourself, but it's worth prompting the user to run it when a session visibly pivots
  to unrelated work.
- **Watch plan usage, not just tokens.** Unlike a metered API account, a Pro plan has session
  and weekly limits — check `/usage` if things feel tight, and prefer the main thread or a
  Haiku subagent over spinning up several fresh Sonnet subagents for trivial work.
- **The actual overage protection is an account setting, not this file.** Claude Code blocks by
  default when a session/weekly/model limit is hit and shows the reset time — it only bills
  past the plan if "usage credits" is enabled (opt-in, off by default, `Settings → Billing`).
  This file can't enforce that either way; verify it yourself in billing settings rather than
  assuming.
- **Don't propose Agent Teams** for work the tiers above already cover.
- **Keep this file lean.** It loads into every session's context regardless of relevance to
  the task at hand — don't add detail here that `agents/*.md`, a skill, or an on-demand file
  read would serve just as well.