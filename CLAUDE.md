# CLAUDE.md

## Instructions for Claude

# Working relationship

- No sycophancy.
- Be direct, matter-of-fact, and concise.
- Be critical; challenge my reasoning.
- Don't include timeline estimates in plans.
- Don't add yourself as a co-author to git commits. (Also set `"includeCoAuthoredBy": false`
  in `.claude/settings.json` — that enforces it at the tool level instead of relying on me
  remembering.)

# Tooling

- This repo currently has one active toolchain: the Google Apps Script project cloned into
  `Webapp Files/` via `clasp clone`. Edit files there directly, then run `clasp push` to sync to
  Google Workspace. If changes were ever made in the Apps Script web editor directly, `clasp
  pull` first — don't assume the local copy is current. There is no separate rewrite codebase
  yet; when that starts, add its toolchain (commands, package manager, etc.) here too.
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
  references. **[The first time a plan, comment, or assumption turns out to be wrong in this
  repo, log the specifics here — the files, what was assumed, what actually caught it. A real
  example is worth more than the abstract rule.]**
- **"Good enough" is not good enough.** If there's a known issue, raise it. Figure it out. Fix
  it. Don't say "acceptable for now" or "close enough".
- **The user makes the decisions.** When there's a tradeoff, present the options with evidence
  and let the user decide. Don't silently pick the easy path.
- **Document everything you verify.** Context is lost between sessions. If you verified
  something end-to-end (a route, a deploy, a migration), write down the command and result.
  There's no second paid tool here acting as an independent check — this file and your own
  verification are the safety net, so don't skip it.

## Repo Management

Repo-wide guidance for Claude Code. Read `agents/current-state.md` and `agents/decisions.md`
first — prior session context (what's been mapped, what's still open) lives there rather than
here. `agents/runbook.md` has the concrete commands for working with this repo;
`agents/todo.md` and `agents/progress-log.md` (use `agents/progress-entry-template.md` for new
entries) track pending work and session history.

Right now this repo holds one thing: `Webapp Files/`, a `clasp clone` of the live Google Apps
Script project. It is the actual, editable source — not a frozen reference copy — and stays
deployed to Google Workspace for testing. The plan is a *progressive* migration: keep building
directly against `Webapp Files/` + Google Sheets as the database (so the app stays testable
online throughout), and only cut over to a dedicated database once the app is functionally
complete. Target stack for that final cutover isn't decided yet (see `agents/decisions.md`).

**There is no "legacy vs. new" split right now — `Webapp Files/` is simply the app.** A prior
attempt at an early full rewrite (Node.js/Express/Prisma/PostgreSQL, under `app/`) was
abandoned and removed — Apps Script + Sheets remains the one active codebase. Don't invent a
migration-in-progress narrative beyond what's actually true: `Webapp Files/` is the live
source, full stop, until a real cutover starts.

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