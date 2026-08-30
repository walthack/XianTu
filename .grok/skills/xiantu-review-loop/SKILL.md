---
name: xiantu-review-loop
description: >
  Launch the XianTu implement-and-review workflow. Use when the user asks
  to implement a XianTu task with second review, says 二审闭环, /xiantu-review-loop,
  or wants Claude default review with Codex fallback without copy-paste.
---

# XianTu review loop

Do not review this yourself, and do not paste a Claude/Codex prompt by hand.

Launch the project workflow:

```
/xiantu-review-loop {"task":"<the work>","base":"main"}
```

or `/workflow xiantu-review-loop {"task":"..."}`.

Policy lives in `AGENTS.md` §审查路由. Adapters:

- `.grok/workflows/reviewers/claude-code-adapter/`
- `.grok/workflows/reviewers/codex-cli-adapter/`

Optional args: `repo`, `base`, `reviewer` (`claude_code`|`codex_cli`), `urgent`, `dual_review`, `skip_implement`.

Grok remains controller. A failed reviewer call is not PASS.
