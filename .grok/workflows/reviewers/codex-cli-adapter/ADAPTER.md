# Codex CLI review adapter

Controller: Grok (`xiantu-review-loop`). This adapter does not own the loop, commits, tests, or CLOSE.

## When this adapter runs

Fallback reviewer for the rest of the current task after any of:

- `claude_5h_quota_exhausted`
- `claude_job_submit_failed`
- `claude_review_incomplete`
- `user_explicitly_requests_codex`
- `urgent_synchronous_review`
- `claude_result_conflicts_with_tests_or_contract`
- `independent_adjudication_required` (high-risk dual review after Claude PASS)

Per-task stickiness: once this adapter is selected, it stays until the task ends. Do not switch back to Claude mid-task even if quota recovers.

## Hard rules

- Review the full cumulative `base..HEAD` diff, not just the last commit.
- Also read any still-open Claude findings Grok passed in. Those stay open until Grok closes them.
- Use `codex exec review`. Do not start an interactive TUI.
- Never edit `src/`, `tests/`, `mods/`, `mod-kit/`, or git state.
- Never treat a Codex invocation failure, empty output, or timeout as PASS.

## How to run

```sh
node /Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/.grok/workflows/reviewers/codex-cli-adapter/run.mjs \
  --repo "$REPO" \
  --base "$BASE" \
  --prompt "$PROMPT_FILE" \
  --findings "$FINDINGS_FILE"
```

Add `--uncommitted` only when Grok says the candidate is not committed yet.

Copy `status` from the script JSON. Do not upgrade `failed` / `findings` to `pass`.
