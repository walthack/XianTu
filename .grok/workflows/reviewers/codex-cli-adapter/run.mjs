#!/usr/bin/env node
// Run `codex exec review` on full base..HEAD (plus optional open Claude findings).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function flag(name) {
  return process.argv.includes(name);
}

function emit(payload, code = 0) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(code);
}

function classify(text, exitCode) {
  if (exitCode !== 0 || !String(text || '').trim()) {
    return { status: 'failed', fallback_reason: '' };
  }
  const hasBlocker = /\bP0\b|\bP1\b|REJECT|NO-GO|NOT CLOSED|MUST FIX/i.test(text)
    && !/\bP0\/P1 无\b|\bno P0\b|\bno P1\b|\bP0\/P1 none\b/i.test(text);
  const goWithChanges = /GO-WITH-CHANGES/i.test(text);
  const hasPass = /\bPASS\b|PASS_WITH_FINDINGS|APPROVE|\bLGTM\b|NO FINDINGS|no findings|no blocking/i.test(text);
  if (hasBlocker || goWithChanges) return { status: 'findings', fallback_reason: '' };
  if (hasPass) return { status: 'pass', fallback_reason: '' };
  return { status: 'findings', fallback_reason: '' };
}

const repo = arg('--repo');
const base = arg('--base', 'main');
const promptFile = arg('--prompt');
const findingsFile = arg('--findings');
const uncommitted = flag('--uncommitted');
if (!repo || !promptFile) {
  emit({
    status: 'failed',
    reviewer: 'codex_cli',
    summary: 'usage: run.mjs --repo PATH --base REF --prompt FILE [--findings FILE] [--uncommitted]',
    job_id: '',
    fallback_reason: '',
    open_findings: [],
  }, 2);
}

const prompt = readFileSync(promptFile, 'utf8');
let findings = '';
if (findingsFile) {
  try { findings = readFileSync(findingsFile, 'utf8'); } catch { findings = ''; }
}

const dir = mkdtempSync(join(tmpdir(), 'xiantu-codex-review-'));
const lastMessage = join(dir, 'last.md');
const stdinPrompt = [
  prompt.trim(),
  '',
  'Review the FULL cumulative diff from the given base to HEAD, not only the latest commit.',
  findings.trim() ? `Open Claude findings that are not yet closed:\n${findings.trim()}` : 'No open Claude findings were provided.',
  'Read-only. Do not edit the repo. Explicit PASS/FAIL with P0/P1 if any.',
].join('\n');

const args = ['exec', 'review', '--base', base, '-o', lastMessage, '--json'];
if (uncommitted) args.push('--uncommitted');
args.push('-');

const child = spawn('codex', args, {
  cwd: repo,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.stdin.write(stdinPrompt);
child.stdin.end();

child.on('error', (error) => {
  emit({
    status: 'failed',
    reviewer: 'codex_cli',
    summary: error.message,
    job_id: '',
    fallback_reason: '',
    open_findings: [],
  });
});

child.on('close', (code) => {
  let last = '';
  try { last = readFileSync(lastMessage, 'utf8'); } catch { last = ''; }
  const text = last.trim() || stdout.trim() || stderr.trim();
  const classified = classify(text, code ?? 1);
  const dump = join(dir, 'stdout.jsonl');
  try { writeFileSync(dump, stdout); } catch { /* ignore */ }
  emit({
    status: classified.status,
    reviewer: 'codex_cli',
    summary: text.slice(0, 1200) || `codex exec review exit ${code}`,
    job_id: dump,
    fallback_reason: classified.fallback_reason,
    open_findings: classified.status === 'findings'
      ? [{ severity: 'unparsed', title: 'see Codex raw result', file: '', detail: text.slice(0, 2000) }]
      : [],
  });
});
