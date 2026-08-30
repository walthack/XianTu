let meta = #{
    name: "xiantu-review-loop",
    description: "Grok implements a XianTu task, Claude Code is default read-only second review, Codex CLI is per-task fallback",
    when_to_use: "After a XianTu implementation should go through Claude second review with automatic Codex fallback, without copy-pasting prompts",
    phases: [
        #{ title: "Implement", detail: "Grok writes the candidate commit" },
        #{ title: "Review", detail: "Claude default; Codex fallback; per-task stickiness" },
        #{ title: "Fix", detail: "Grok repairs open findings" },
        #{ title: "Gate", detail: "Grok runs final tests; Grok decides stop" },
    ],
};

let implement_schema = #{
    "type": "object",
    "required": ["status", "summary"],
    "properties": #{
        "status": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "head": #{ "type": "string" },
        "commit": #{ "type": "string" },
        "tests": #{ "type": "string" },
    },
};

let review_schema = #{
    "type": "object",
    "required": ["status", "reviewer", "summary"],
    "properties": #{
        "status": #{ "type": "string" },
        "reviewer": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "job_id": #{ "type": "string" },
        "fallback_reason": #{ "type": "string" },
        "open_findings": #{
            "type": "array",
            "items": #{
                "type": "object",
                "required": ["severity", "title"],
                "properties": #{
                    "severity": #{ "type": "string" },
                    "title": #{ "type": "string" },
                    "file": #{ "type": "string" },
                    "detail": #{ "type": "string" },
                },
            },
        },
    },
};

let gate_schema = #{
    "type": "object",
    "required": ["status", "summary"],
    "properties": #{
        "status": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

fn as_text(value) {
    if value == () { "" } else { value }
}

fn is_fallback_reason(reason) {
    reason == "claude_5h_quota_exhausted"
        || reason == "claude_job_submit_failed"
        || reason == "claude_review_incomplete"
        || reason == "user_explicitly_requests_codex"
        || reason == "urgent_synchronous_review"
        || reason == "claude_result_conflicts_with_tests_or_contract"
        || reason == "independent_adjudication_required"
}

fn should_fallback(status, reason) {
    if status == "fallback" { true }
    else if status == "failed" && is_fallback_reason(reason) { true }
    else { false }
}

fn review_usable(rev) {
    rev != () && rev.success == true && rev.output != () && as_text(rev.output.status) != ""
}

fn build_implement_prompt(task_json, repo, base_ref, findings_json, skip_impl, round_no) {
    let p = "";
    p += "You are the XianTu implementer. You are not the reviewer and you do not CLOSE P0 items.\n";
    p += "Working directory: " + repo + "\n";
    p += "Review base: " + base_ref + "\n";
    p += "Round: " + round_no + "\n";
    p += "Task JSON: " + task_json + "\n";
    p += "Open findings JSON: " + findings_json + "\n";
    p += "Read AGENTS.md and PROJECT-STATUS.md first. Use read_file/grep/run_terminal_command on the real tree.\n";
    p += "Standing limits: do not inject API keys; do not touch player save char_1786807415293; do not rewrite canon without the 裁定簿; do not claim P0-1/P0-2 CLOSE.\n";
    p += "If skip_implement=" + skip_impl + " and there are no open findings, only record current HEAD and tests already run. Do not edit.\n";
    p += "Otherwise implement or repair, run focused tests, and create a local candidate commit. Do not push.\n";
    p += "Return JSON {status: done|blocked, summary, head, commit, tests}. status=done only after the candidate exists or skip snapshot is recorded.\n";
    p
}

fn build_review_prompt(kind, task_json, repo, base_ref, findings_json, head, skip_commit) {
    let adapter_dir = repo + "/.grok/workflows/reviewers/";
    let adapter = adapter_dir + "claude-code-adapter";
    let runner = adapter + "/run.mjs";
    if kind != "claude_code" {
        adapter = adapter_dir + "codex-cli-adapter";
        runner = adapter + "/run.mjs";
    }
    let p = "";
    p += "You are a review-adapter runner. You do not control the loop, do not fix code, and do not CLOSE.\n";
    p += "Read this file completely before any command: " + adapter + "/ADAPTER.md\n";
    p += "Then write a self-contained prompt under /tmp and run:\n";
    p += "node " + runner + " --repo " + repo + " --prompt /tmp/xiantu-review-prompt.md\n";
    if kind != "claude_code" {
        p += "For Codex also pass --base " + base_ref + " and --findings /tmp/xiantu-open-findings.json\n";
        p += "Codex MUST review full " + base_ref + "..HEAD, not only the last commit.\n";
        if skip_commit == "true" {
            p += "Pass --uncommitted because the candidate may still be dirty.\n";
        }
        p += "Write the open findings JSON to /tmp/xiantu-open-findings.json before launching Codex.\n";
        p += "Open findings JSON: " + findings_json + "\n";
    }
    p += "Repo: " + repo + "\n";
    p += "Base: " + base_ref + "\n";
    p += "HEAD hint: " + head + "\n";
    p += "Task JSON: " + task_json + "\n";
    p += "Copy status/reviewer/summary/job_id/fallback_reason/open_findings from the script JSON.\n";
    p += "Never upgrade failed, fallback, or findings to pass. Empty/missing script JSON is failed, not pass.\n";
    p += "Claude jobs must go through claude-review-submit.mjs; never claude-async.mjs submit.\n";
    p
}

fn build_gate_prompt(task_json, repo, head, tests) {
    let p = "";
    p += "You are the final gate runner for XianTu, still under Grok control. You are not a reviewer.\n";
    p += "Repo: " + repo + "\nHEAD: " + head + "\nTask JSON: " + task_json + "\nPrior tests: " + tests + "\n";
    p += "Run npm run type-check, git diff --check, and the focused tests named by the implementer. Do not invent PASS if a command failed or was skipped.\n";
    p += "Return {status: pass|failed, summary, evidence}. status=pass only with command evidence.\n";
    p
}

let task = if args == () { () } else { args.task };
if task == () { pause("verification", "Pass args.task — the work Grok should implement and route through review."); }

let repo = "/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu";
if args != () && args.repo != () { repo = args.repo; }

let base_ref = "main";
if args != () && args.base != () { base_ref = args.base; }

let smoke = false;
if args != () && args.smoke_check == true { smoke = true; }

let skip_impl = "false";
if args != () && args.skip_implement == true { skip_impl = "true"; }

let dual = false;
if args != () && args.dual_review == true { dual = true; }

let sticky = "claude_code";
if args != () {
    if args.reviewer == "codex_cli" { sticky = "codex_cli"; }
    if args.urgent == true { sticky = "codex_cli"; }
}

let task_json = json_encode(task);
let findings_json = "[]";
let job_ids = [];
let switched = false;
let last_head = "";
let last_tests = "";
let last_reviewer = sticky;
let last_summary = "";
let rounds_done = 0;

if smoke {
    phase("Implement");
    let smoke_impl = agent(
        "Smoke only. Reply with JSON {\"status\":\"done\",\"summary\":\"smoke implement compiled\"}. Do not edit files.",
        #{ label: "smoke-implement", capability_mode: "read-only", output_schema: implement_schema }
    );
    phase("Review");
    let smoke_rev = agent(
        "Smoke only. Reply with JSON {\"status\":\"failed\",\"reviewer\":\"claude_code\",\"summary\":\"smoke review compiled; not a PASS\"}. Do not claim pass.",
        #{ label: "smoke-review", capability_mode: "read-only", output_schema: review_schema }
    );
    complete(#{
        verdict: "smoke",
        controller: "grok",
        review_default: "claude_code",
        review_fallback: "codex_cli",
        reviewer_stickiness: "per_task",
        impl_ok: smoke_impl != () && smoke_impl.success == true,
        review_ok: smoke_rev != () && smoke_rev.success == true,
        note: "canned-host smoke; live Claude/Codex review is not proven",
    });
}

let rounds = [1, 2, 3, 4, 5, 6];
for round in rounds {
    rounds_done = round;
    let phase_name = "Implement";
    if round != 1 { phase_name = "Fix"; }
    phase(phase_name);

    let impl_prompt = build_implement_prompt(task_json, repo, base_ref, findings_json, skip_impl, round.to_string());
    let impl = agent(impl_prompt, #{
        label: "implement-" + round.to_string(),
        capability_mode: "all",
        output_schema: implement_schema,
    });
    if impl == () || impl.success != true || impl.output == () || as_text(impl.output.status) == "" {
        complete(#{
            verdict: "blocked",
            reason: "implementer_unusable",
            round: round,
            reviewer: sticky,
            note: "Implementer missing structured output is not PASS.",
        });
    }
    if impl.output.status != "done" {
        complete(#{
            verdict: "blocked",
            reason: "implementer_blocked",
            round: round,
            reviewer: sticky,
            summary: as_text(impl.output.summary),
        });
    }
    last_head = as_text(impl.output.head);
    last_tests = as_text(impl.output.tests);

    phase("Review");
    let rev_prompt = build_review_prompt(sticky, task_json, repo, base_ref, findings_json, last_head, skip_impl);
    let rev = agent(rev_prompt, #{
        label: "review-" + sticky + "-" + round.to_string(),
        capability_mode: "all",
        output_schema: review_schema,
    });

    if sticky == "claude_code" && review_usable(rev) && should_fallback(rev.output.status, as_text(rev.output.fallback_reason)) {
        log("Claude fallback → Codex for this task: " + as_text(rev.output.fallback_reason));
        if as_text(rev.output.job_id) != "" { job_ids.push(rev.output.job_id); }
        sticky = "codex_cli";
        switched = true;
        last_reviewer = "codex_cli";
        let codex_prompt = build_review_prompt("codex_cli", task_json, repo, base_ref, findings_json, last_head, skip_impl);
        rev = agent(codex_prompt, #{
            label: "review-codex_cli-" + round.to_string(),
            capability_mode: "all",
            output_schema: review_schema,
        });
    }

    if review_usable(rev) != true {
        complete(#{
            verdict: "blocked",
            reason: "reviewer_unusable",
            round: round,
            reviewer: sticky,
            switched: switched,
            job_ids: job_ids,
            note: "Reviewer call failed or returned no status. That is not PASS.",
        });
    }

    last_reviewer = as_text(rev.output.reviewer);
    if last_reviewer == "" { last_reviewer = sticky; }
    last_summary = as_text(rev.output.summary);
    if as_text(rev.output.job_id) != "" { job_ids.push(rev.output.job_id); }

    let status = rev.output.status;
    if status == "failed" || status == "fallback" {
        complete(#{
            verdict: "blocked",
            reason: as_text(rev.output.fallback_reason),
            status: status,
            round: round,
            reviewer: sticky,
            switched: switched,
            job_ids: job_ids,
            summary: last_summary,
            note: "Reviewer failure is not PASS. No third reviewer after Codex.",
        });
    }

    if status == "findings" {
        findings_json = json_encode(rev.output.open_findings);
        if findings_json == "null" || findings_json == "" { findings_json = json_encode(last_summary); }
        log("Findings on round " + round.to_string() + "; Grok will repair and resubmit " + sticky);
    } else {
        if status != "pass" {
            complete(#{
                verdict: "blocked",
                reason: "unknown_review_status",
                status: status,
                round: round,
                reviewer: sticky,
                switched: switched,
                job_ids: job_ids,
                summary: last_summary,
            });
        }

        if dual == true && sticky == "claude_code" {
            log("High-risk dual review: Claude PASS → Codex independent adjudication");
            sticky = "codex_cli";
            switched = true;
            let dual_prompt = build_review_prompt("codex_cli", task_json, repo, base_ref, findings_json, last_head, skip_impl);
            let dual_rev = agent(dual_prompt, #{
                label: "review-dual-codex-" + round.to_string(),
                capability_mode: "all",
                output_schema: review_schema,
            });
            if review_usable(dual_rev) != true {
                complete(#{
                    verdict: "blocked",
                    reason: "reviewer_unusable",
                    reviewer: "codex_cli",
                    switched: true,
                    job_ids: job_ids,
                    note: "Dual Codex call failed. That is not PASS.",
                });
            }
            if as_text(dual_rev.output.job_id) != "" { job_ids.push(dual_rev.output.job_id); }
            last_reviewer = "codex_cli";
            last_summary = as_text(dual_rev.output.summary);
            if dual_rev.output.status == "findings" {
                findings_json = json_encode(dual_rev.output.open_findings);
                log("Dual Codex found issues; stick to Codex for remaining rounds");
            } else {
                if dual_rev.output.status != "pass" {
                    complete(#{
                        verdict: "blocked",
                        reason: "dual_codex_not_pass",
                        status: dual_rev.output.status,
                        reviewer: "codex_cli",
                        switched: true,
                        job_ids: job_ids,
                        summary: last_summary,
                    });
                } else {
                    phase("Gate");
                    let gate = agent(build_gate_prompt(task_json, repo, last_head, last_tests), #{
                        label: "gate-" + round.to_string(),
                        capability_mode: "execute",
                        output_schema: gate_schema,
                    });
                    if gate == () || gate.success != true || gate.output == () || gate.output.status != "pass" {
                        complete(#{
                            verdict: "blocked",
                            reason: "final_gate_failed",
                            reviewer: last_reviewer,
                            switched: switched,
                            job_ids: job_ids,
                            head: last_head,
                            summary: if gate != () && gate.output != () { as_text(gate.output.summary) } else { "gate unusable" },
                        });
                    }
                    complete(#{
                        verdict: "pass",
                        controller: "grok",
                        reviewer: last_reviewer,
                        switched: switched,
                        dual_review: true,
                        round: round,
                        job_ids: job_ids,
                        head: last_head,
                        summary: last_summary,
                    });
                }
            }
        } else {
            phase("Gate");
            let gate = agent(build_gate_prompt(task_json, repo, last_head, last_tests), #{
                label: "gate-" + round.to_string(),
                capability_mode: "execute",
                output_schema: gate_schema,
            });
            if gate == () || gate.success != true || gate.output == () || gate.output.status != "pass" {
                complete(#{
                    verdict: "blocked",
                    reason: "final_gate_failed",
                    reviewer: last_reviewer,
                    switched: switched,
                    job_ids: job_ids,
                    head: last_head,
                    summary: if gate != () && gate.output != () { as_text(gate.output.summary) } else { "gate unusable" },
                });
            }
            complete(#{
                verdict: "pass",
                controller: "grok",
                reviewer: last_reviewer,
                switched: switched,
                dual_review: false,
                round: round,
                job_ids: job_ids,
                head: last_head,
                summary: last_summary,
            });
        }
    }
}

complete(#{
    verdict: "blocked",
    reason: "max_rounds",
    reviewer: sticky,
    switched: switched,
    job_ids: job_ids,
    head: last_head,
    summary: last_summary,
    rounds: rounds_done,
    note: "Six repair rounds exhausted. Not PASS.",
});
