#!/usr/bin/env node
// Submit a Claude read-only review via the required wrapper, poll, emit JSON.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const submitPath = join(homedir(), '.codex', 'bin', 'claude-review-submit.mjs');
const asyncPath = join(homedir(), '.codex', 'bin', 'claude-async.mjs');
const POLL_MS = 15_000;
const MAX_POLLS = 120;

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function emit(payload, code = 0) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(code);
}

function looksQuota(text) {
  return /5-?hour|5h quota|quota exhausted|usage limit|rate limit|hit your limit|limit reached|out of extra usage|too many requests/i.test(text);
}

function classify({ submitOk, submitErr, jobId, state, isError, result }) {
  const blob = `${submitErr}\n${result || ''}`;
  if (looksQuota(blob) && !jobId) {
    return { status: 'fallback', fallback_reason: 'claude_5h_quota_exhausted' };
  }
  if (!submitOk || !jobId) {
    return { status: 'fallback', fallback_reason: 'claude_job_submit_failed' };
  }
  if (state !== 'done' || isError || !String(result || '').trim()) {
    return { status: 'fallback', fallback_reason: 'claude_review_incomplete' };
  }
  const text = String(result);
  const hasBlocker = /\bP0\b|\bP1\b|REJECT|NO-GO|NOT CLOSED|MUST FIX|FAIL CLOSED/i.test(text)
    && !/\bP0\/P1 无\b|\bno P0\b|\bno P1\b|\bP0\/P1 none\b/i.test(text);
  const goWithChanges = /GO-WITH-CHANGES/i.test(text);
  const hasPass = /\bPASS\b|PASS_WITH_FINDINGS|APPROVE|\bLGTM\b|NO FINDINGS|no findings/i.test(text);
  if (hasBlocker || goWithChanges) return { status: 'findings', fallback_reason: '' };
  if (hasPass) return { status: 'pass', fallback_reason: '' };
  return { status: 'findings', fallback_reason: '' };
}

function parseJobId(stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed?.id) return parsed.id;
    } catch { /* keep scanning */ }
  }
  return '';
}

function jobQuery(id, includeResult) {
  const args = includeResult ? ['result', id] : ['status', id];
  const proc = spawnSync(process.execPath, [asyncPath, ...args], { encoding: 'utf8' });
  if (proc.status !== 0) {
    throw new Error(proc.stderr || `claude-async ${args[0]} exit ${proc.status}`);
  }
  return JSON.parse(proc.stdout.trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submit(repo, prompt) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      submitPath, '--cwd', repo, '--model', 'claude-sonnet-5', '--max-budget-usd', '10',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      resolve({ ok: false, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, stdout, stderr });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

const repo = arg('--repo');
const promptFile = arg('--prompt');
if (!repo || !promptFile) {
  emit({
    status: 'failed',
    reviewer: 'claude_code',
    summary: 'usage: run.mjs --repo PATH --prompt FILE',
    job_id: '',
    fallback_reason: 'claude_job_submit_failed',
    open_findings: [],
  }, 2);
}

const prompt = readFileSync(promptFile, 'utf8');
if (!prompt.trim()) {
  emit({
    status: 'fallback',
    reviewer: 'claude_code',
    summary: 'prompt file is empty',
    job_id: '',
    fallback_reason: 'claude_job_submit_failed',
    open_findings: [],
  });
}

const submitted = await submit(repo, prompt);
const jobId = parseJobId(submitted.stdout);
if (!submitted.ok || !jobId) {
  const classified = classify({
    submitOk: submitted.ok, submitErr: submitted.stderr, jobId, state: '', isError: true, result: '',
  });
  emit({
    status: classified.status,
    reviewer: 'claude_code',
    summary: (submitted.stderr || submitted.stdout || 'submit failed').slice(0, 800),
    job_id: jobId,
    fallback_reason: classified.fallback_reason,
    open_findings: [],
  });
}

let snapshot = { state: 'pending' };
try {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    snapshot = jobQuery(jobId, false);
    if (snapshot.state === 'done' || snapshot.state === 'failed') break;
    await sleep(POLL_MS);
  }
  if (snapshot.state === 'done' || snapshot.state === 'failed') {
    snapshot = jobQuery(jobId, true);
  }
} catch (error) {
  emit({
    status: 'fallback',
    reviewer: 'claude_code',
    summary: error instanceof Error ? error.message : String(error),
    job_id: jobId,
    fallback_reason: 'claude_review_incomplete',
    open_findings: [],
  });
}

const result = snapshot.result || '';
const classified = classify({
  submitOk: true,
  submitErr: submitted.stderr,
  jobId,
  state: snapshot.state,
  isError: Boolean(snapshot.isError) || snapshot.state === 'failed',
  result,
});

emit({
  status: classified.status,
  reviewer: 'claude_code',
  summary: String(result || snapshot.state || 'no result').slice(0, 1200),
  job_id: jobId,
  fallback_reason: classified.fallback_reason,
  open_findings: classified.status === 'findings'
    ? [{ severity: 'unparsed', title: 'see Claude raw result', file: '', detail: String(result).slice(0, 2000) }]
    : [],
});
