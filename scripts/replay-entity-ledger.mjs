import { readFileSync } from 'node:fs';
import { loadTs } from '../tests/loadTs.mjs';
const { genderShadowFindings } = await loadTs('../src/modules/scenarioMods/ledger/guardFramework.ts');
const corpus = JSON.parse(readFileSync(new URL('../tests/fixtures/entity-ledger/r11-replay.json', import.meta.url)));
let findings = 0, rejected = 0, reviewedClean = 0;
for (const row of corpus.rows) {
  const hits = genderShadowFindings(row.text, row.actors, row.eventId, 1);
  findings += hits.length; rejected += hits.filter(hit => hit.rejected).length;
  if (row.review.expected === 'clean') reviewedClean++;
}
console.log(JSON.stringify({ corpus: corpus.rows.length, genderReviewedClean: reviewedClean, findings, rejected,
  acceptance: 'NOT_ESTABLISHED: need 300 manually clean texts, independent holdout, and true-device metrics' }));
if (rejected) process.exitCode = 1;
