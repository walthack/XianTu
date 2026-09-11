/**
 * Map a finished reviewer writeup to pass | findings.
 *
 * Do not treat project milestones (P0-1 / P0-2) or negated headers
 * ("P0/P1 无") as open blockers. "FAIL CLOSED" is XianTu jargon, not a verdict.
 */
export function classifyReviewText(text) {
  const body = String(text || '');
  if (/GO-WITH-CHANGES/i.test(body)) return 'findings';
  if (/\bREJECT\b|\bNO-GO\b/i.test(body)) return 'findings';
  if (hasOpenSeverityFinding(body)) return 'findings';
  if (/\bPASS\b|PASS_WITH_FINDINGS|APPROVE|\bLGTM\b|NO FINDINGS|no findings|no blocking/i.test(body)) {
    return 'pass';
  }
  return 'findings';
}

function hasOpenSeverityFinding(text) {
  const scanned = String(text).replace(/P0-[12]\b/gi, '');
  for (const line of scanned.split(/\n/)) {
    if (isNegatedSeverityLine(line)) continue;
    if (/\bMUST FIX\b/i.test(line)) return true;
    if (/(?:\*\*)?P[01](?:\*\*)?\s*[—–:\-]\s*(?!无|none\b|n\/a\b)\S/i.test(line)) return true;
  }
  return false;
}

function isNegatedSeverityLine(line) {
  return /P0\s*\/\s*P1\s*无|P0\/P1 none|\bno P0\b|\bno P1\b|P0:\s*无|P1:\s*无|P0\/P1\s*无/i.test(line);
}
