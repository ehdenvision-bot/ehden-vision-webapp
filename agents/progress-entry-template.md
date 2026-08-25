# Progress Entry Template

Copy this block into `agents/progress-log.md` for each new entry, newest at the top, and fill
it in.

```markdown
## YYYY-MM-DD - Short Action Title

Status: planned | in-progress | completed | blocked

Owner/agent:

Files changed:

- `path/to/file`

Server/live-system changes:

- None

Verification:

- Command:
- Result:

Notes:

-

Next recommended action:

-
```

For this project, "Server/live-system changes" usually means "pushed to the live Apps Script
project via `clasp push`" or "changed a Sheet/Doc/Drive resource directly." Call that out
explicitly whenever it's true, rather than leaving it as "None" — it's the one part of a change
here that won't show up in a git diff.