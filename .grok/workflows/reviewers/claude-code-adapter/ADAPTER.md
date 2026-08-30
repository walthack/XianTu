# Claude Code review adapter

Controller: Grok (`xiantu-review-loop`). This adapter does not own the loop, commits, tests, or CLOSE.

## When this adapter runs

Default second review. Grok calls it after a candidate commit exists.

## Hard rules

- Submit only through `/Users/clawbot/.codex/bin/claude-review-submit.mjs`.
- Never call `claude-async.mjs submit` directly.
- Never pass `--permission-mode`. The wrapper pins `plan`.
- Never edit `src/`, `tests/`, `mods/`, `mod-kit/`, or git state.
- Never treat submit/poll/parse failure as PASS.
- Record the job id. Grok is the one that stores it in the run result.

## How to run

Write a self-contained prompt file (repo, HEAD, base, task, acceptance, read-only requirement), then:

```sh
node /Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/.grok/workflows/reviewers/claude-code-adapter/run.mjs \
  --repo "$REPO" \
  --prompt "$PROMPT_FILE"
```

Copy `status` from the script JSON. Do not upgrade `failed` / `fallback` / `findings` to `pass`.

## Status mapping (script is source of truth)

| status | meaning | controller action |
|---|---|---|
| `pass` | Claude finished and no P0/P1 / REJECT / NO-GO | Grok runs final gate (or dual Codex if configured) |
| `findings` | Claude finished with open issues | Grok fixes, resubmits this adapter |
| `fallback` | quota / submit fail / incomplete | Grok switches to Codex for this task |
| `failed` | adapter crash; not a review verdict | not PASS; controller may still fallback if reason matches |

`fallback_reason` values this adapter may emit:

- `claude_5h_quota_exhausted`
- `claude_job_submit_failed`
- `claude_review_incomplete`
