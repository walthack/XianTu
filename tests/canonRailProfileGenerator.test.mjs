import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('Canon Rail generator rejects an explicit critical event without a source-axis anchor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xiantu-canon-rail-null-axis-'));
  const mod = JSON.parse(readFileSync('src/modules/scenarioMods/builtins/data/lcq.stage_04.json', 'utf8'));
  const event = mod.scenario.events.find(item => item.critical === true || item.axisId);
  event.critical = true;
  event.axisId = null;
  event.axisBeat = '';
  writeFileSync(join(dir, 'lcq.stage_04.json'), JSON.stringify(mod));

  const result = (() => {
    try {
      execFileSync('node', ['scripts/build-canon-rail-profiles.mjs'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CANON_RAIL_STAGES_DIR: dir,
          CANON_RAIL_OUTPUT: join(dir, 'profiles.ts'),
          CANON_RAIL_REVIEW_DIR: join(dir, 'review'),
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return '';
    } catch (error) {
      return `${error.stdout || ''}\n${error.stderr || ''}`;
    }
  })();
  assert.match(result, /lcq\.stage_04 has null \(lcq\.event\.s04_01\)/);
});
