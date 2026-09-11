import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyReviewText } from '../.grok/workflows/reviewers/classify-review-verdict.mjs';

test('PASS with P0/P1 无 is pass, not findings', () => {
  const text = `VERDICT: PASS

P0/P1 无

Reviewed the full I3+I4 slice. P0-1 / P0-2 remain OPEN.
Lin'an longrest hides the tomb. FAIL CLOSED on unmapped fate.
`;
  assert.equal(classifyReviewText(text), 'pass');
});

test('real P1 finding line is findings even if P0 is 无', () => {
  const text = `VERDICT: FINDINGS

P0: 无

1. **P1 — Test suite is red on HEAD: tests/fixedQuestObjectives.test.mjs**
   I3 raised FIXED_QUEST_OBJECTIVE_OVERRIDES from 52 to 54.
`;
  assert.equal(classifyReviewText(text), 'findings');
});

test('REJECT and GO-WITH-CHANGES stay findings', () => {
  assert.equal(classifyReviewText('REJECT: contract broken.'), 'findings');
  assert.equal(classifyReviewText('NO-GO until mapping is idempotent.'), 'findings');
  assert.equal(classifyReviewText('GO-WITH-CHANGES\nP2 only.'), 'findings');
});

test('MUST FIX is findings; missing verdict defaults to findings', () => {
  assert.equal(classifyReviewText('Looks fine but MUST FIX the count.'), 'findings');
  assert.equal(classifyReviewText('I read the diff.'), 'findings');
});
