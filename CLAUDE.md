# CLAUDE.md

## Instructions for Claude

# Working relationship

- No sycophancy.
- Be direct, matter-of-fact, and concise.
- Be critical; challenge my reasoning.
- Don't include timeline estimates in plans.
- Don't add yourself as a co-author to git commits.

# Tooling

- No Makefile/monorepo task-runner here — everything runs via `npm run <script>` inside `app/`
  (see `app/package.json`). Use your Edit tool for changes; Search tool for searching.
- Use Mermaid diagrams for complex systems.

# No Shortcuts, No Compromises

**The correct fix is ALWAYS better than the quick fix. No exceptions.**

- **Fix bugs when you find them.** If a bug affects the work you're doing, fix it NOW — don't defer it, don't say "out of scope", don't create a follow-up task for it. The only exception is if the fix is genuinely multi-day work AND blocked by missing infrastructure.
- **Take the correct approach, not the easy one.** Technical debt compounds. A shortcut today becomes a refactoring nightmare tomorrow. Always choose the long-term solution.
- **Never assume, always verify.** Don't trust plans, comments, variable names, or your own intuition. Read the code. Compare the numbers. Document what you find with file:line references. (This bit us once already in this repo — `projects.routes.js`/`reserves.routes.js` referenced fields from an early schema draft that no longer existed; `node --check` didn't catch it, only an actual end-to-end curl test did. See `agents/decisions.md`.)
- **"Good enough" is not good enough.** If there's a known issue, raise it. Figure it out. Fix it. Don't say "acceptable for now" or "close enough".
- **The user makes the decisions.** When there's a tradeoff, present the options with evidence and let the user decide. Don't silently pick the easy path.
- **Document everything you verify.** Context is lost between sessions. If you verified something end-to-end (a route, a migration), write down the command and result. Future sessions depend on this.

## Repo Management

Repo-wide guidance for Claude Code. Read `agents/current-state.md` and `agents/decisions.md`
first — prior session context (what's been mapped, what's still open) lives there rather than
here. This repo holds two things: the legacy source of the construction-site-management app
(`extracted/Web APP/` — a Google Apps Script + Google Sheets export, unzipped from the client's
Drive folder, plus `extracted/Web APP/apps-script-src/` which is that same clasp export flattened
to plain `.js`/`.html` files for easier reading) and, as of 2026-08-21, its in-progress rewrite to
Node.js + PostgreSQL (`app/` — a single Express app, not a monorepo; see `app/TODO.md` for the
phase-by-phase migration plan and `app/README.md` for local dev setup). The repo is git-initialized
(first commit `e37fa14`, 2026-08-21).

**Do not treat `extracted/` as editable source** — it's the read-only reference for what the
legacy app actually does, used to figure out what the new `app/` should replicate.

## Delegation: match each subtask to the cheapest runner that can do it

Six places work can run. Default to the main thread; escalate to a subagent or Codex only
when the task actually benefits from isolation or parallelism — delegation overhead (a fresh
context, a briefing prompt) isn't free even when the delegate itself is cheap.

1. **Main thread (you).** Default for anything short, sequential, or that needs this
   conversation's context. Most work belongs here — delegation is the exception.
2. **`Agent` with `subagent_type: "fork"`.** The subtask needs this conversation's full
   context, but its own noisy tool output (a big log tail, a wide search) shouldn't pollute
   your context. A fork always runs on your model — you cannot pick a cheaper one for it —
   but it shares your prompt cache, so continuing context this way is usually cheap despite
   carrying full history. Used successfully in this repo to parse the 1.6MB Apps Script JSON
   export and the 11 xlsx schema files, and to extract the legacy app's visual design system.
3. **`Agent` with a fresh (non-fork) type and `model: "haiku"`.** Mechanical, high-volume,
   narrowly-scoped work with a verifiable output and no need for this conversation's context.
4. **`Agent` with a fresh type, default model (Sonnet).** Real coding, investigation, and
   most subagent work — this is the tier everything runs on unless you say otherwise.
5. **`Agent` with a fresh type and `model: "opus"`.** Reserve for work that genuinely needs
   the deepest reasoning. Not used yet in this repo.
6. **`codex exec`** (below). Parallel, genuinely independent chunks that benefit from running
   entirely outside this context window and this account's usage.

## Using Codex as parallel subagents

The `codex` CLI is installed (`/usr/local/bin/codex`) — tier 6 above. Used once so far in this
repo, successfully: porting the domino-shift scheduling algorithm and two-phase task-type
deletion logic from the legacy `Planing_Code.js` into `app/src/services/schedule.service.js`,
in an isolated `git worktree` on its own branch, reviewed and merged afterward (not
auto-merged).

```bash
codex exec --skip-git-repo-check -C <worktree-dir> --dangerously-bypass-approvals-and-sandbox - < /path/to/prompt.md
```

**Always pass `--dangerously-bypass-approvals-and-sandbox`.** Codex's own sandbox (bubblewrap)
does not initialize in this container (a nested-sandboxing restriction from the container's own
seccomp/capability profile — not verified first-hand in this repo, but this is the same
underlying sandbox container documented elsewhere on this host, and the bypass flag is
explicitly documented as safe "for environments that are externally sandboxed," which this
container already is via the Claude Code harness). **Because sandboxing is bypassed, the prompt
is the only safety boundary** — scope it tightly (which files it may touch, what not to run),
and isolate the work in its own `git worktree`/branch so a bad run can't corrupt `master`.

Guidelines:

- **Write long/complex prompts to a file first, then pipe via stdin** —
  `codex exec ... - < /path/to/prompt.txt` — rather than inlining a long double-quoted string
  in the Bash tool call (backticks inside a double-quoted bash string trigger command
  substitution and silently mangle the prompt).
- **Only for genuinely independent work.** If subtasks share state or one depends on another's
  output, don't parallelize them this way.
- **Each prompt must be self-contained** — a `codex exec` process starts with zero conversation
  context.
- **Launch as a background Bash command** (`run_in_background: true`) and use `Monitor` with a
  one-shot "wait for pid to exit" loop rather than polling — see how the scheduling-engine port
  was run.
- **Review before trusting**, same as any subagent's output — check the diff before merging.
- **A stray, unrelated Codex process was found running in this exact directory once** (2026-08-21,
  writing files that turned out to belong to an entirely different project — see
  `agents/decisions.md`'s resolved-decisions section). If something similar happens again, flag it
  to the user before touching it; don't assume any file you didn't create is safe to overwrite or
  delete without asking.

## `app/` local dev environment — sandbox-specific gotchas confirmed 2026-08-21

- **No Docker daemon in this sandbox** (`docker info` fails: `Cannot connect to the Docker
  daemon`). `app/docker-compose.yml` is kept for environments that do have one, but local dev
  here uses Postgres 17 installed natively via `apt-get install postgresql` — role `chantier` /
  db `chantier`, see `app/.env`.
- **`node --watch` does not reliably pick up file changes in this sandbox's filesystem** (no
  restart, no log line, despite edited files being correct on disk — likely an inotify
  limitation of the container's filesystem). Don't rely on it; restart the server manually
  (`node src/server.js`, backgrounded) after edits.
- **`pkill -f "node src/server.js"` unreliably kills its own invoking shell** in this sandbox
  (every use so far has returned exit 144 and sometimes killed more than intended). Find the PID
  with `ps aux | grep "[n]ode src/server.js"` and `kill <pid>` instead.
- **The server must bind `0.0.0.0`, not the default**, or the sandbox's external proxy
  (`https://<host>/proxy/<port>/`) gets `ECONNREFUSED` — see `app/src/server.js`'s
  `app.listen(port, "0.0.0.0", ...)`.
- **Content-Security-Policy (helmet defaults) allows `https:` sources for `style-src`/`font-src`**
  but not `script-src` — Google Fonts `<link>` tags work fine, but any external `<script src>`
  (e.g. a CDN-hosted UI library) would need an explicit CSP override or must be self-hosted
  instead.

## Cost hygiene

- **`/clear` between unrelated tasks.** Stale context gets re-sent (and re-billed at the cached
  rate) on every subsequent turn. This is a user-driven command, not something you invoke
  yourself, but it's worth prompting the user to run it when a session visibly pivots to
  unrelated work.
- **Don't propose Agent Teams** for work the tiers above already cover.
- **Keep this file lean.** It loads into every session's context regardless of relevance to the
  task at hand — don't add detail here that `agents/*.md`, a skill, or an on-demand file read
  would serve just as well.
