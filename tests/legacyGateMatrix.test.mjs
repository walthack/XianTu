import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

test('ten inherited gates all have at least one local coverage row', async () => {
  const { LEGACY_GATE_IDS, LEGACY_GATE_MATRIX, uncoveredLegacyGates } = await loadTs(
    '../src/modules/scenarioMods/legacyGateMatrix.ts',
  );
  assert.deepEqual(LEGACY_GATE_IDS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(uncoveredLegacyGates(), []);
  for (const id of LEGACY_GATE_IDS) {
    const rows = LEGACY_GATE_MATRIX.filter(rule => rule.gate === id);
    assert.ok(rows.length > 0, `gate ${id} must have a coverage row`);
    assert.ok(rows.every(rule => rule.localAnchor), `gate ${id} must name a local anchor`);
  }
  const packetGates = LEGACY_GATE_MATRIX.filter(rule => [1, 2, 3, 4, 5, 6, 9].includes(rule.gate));
  assert.ok(packetGates.every(rule => rule.inNarratorPacket), 'phase-2 packet must carry gates 1-6 and 9');
  const sentenceGate = LEGACY_GATE_MATRIX.find(rule => rule.id === 'sentence-gate');
  assert.equal(sentenceGate.inNarratorPacket, false);
  assert.match(sentenceGate.localAnchor, /createLegacySentenceStream/);
});
