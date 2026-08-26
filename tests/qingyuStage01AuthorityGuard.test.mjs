import assert from 'node:assert/strict';
import test from 'node:test';

import { validateQingyuStage01Authority } from '../scripts/validate-qingyu-stage01-authority.mjs';

function validAuthority() {
  return {
    manifest: { id: 'lcq.stage_01' },
    canon: {
      locations: [{ id: 'lcq.location.command_tent', name: '帅帐' }],
    },
    scenario: {
      events: [{ id: 'lcq.event.s01_05', locationId: 'lcq.location.command_tent' }],
    },
  };
}

test('qingyu stage_01 authority guard accepts the command-tent anchor', () => {
  assert.doesNotThrow(() => validateQingyuStage01Authority(validAuthority()));
});

test('qingyu stage_01 authority guard rejects a missing command-tent location before sync', () => {
  const stage = validAuthority();
  stage.canon.locations = [];
  assert.throws(
    () => validateQingyuStage01Authority(stage),
    /缺少帅帐地点 lcq\.location\.command_tent/,
  );
});

test('qingyu stage_01 authority guard rejects a regressed s01_05 location before sync', () => {
  const stage = validAuthority();
  stage.scenario.events[0].locationId = 'lcq.location.grassland';
  assert.throws(
    () => validateQingyuStage01Authority(stage),
    /lcq\.event\.s01_05\.locationId 必须为 lcq\.location\.command_tent/,
  );
});
