import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const root = new URL('../', import.meta.url);

test('standard validation and production build both enforce canon decisions', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.match(pkg.scripts['validate:all'], /canon:validate/);
  assert.match(pkg.scripts.prebuild, /validate-canon-decisions\.mjs/);
});

test('canon decision enforcement scans generated sources and shipped builtin data', async () => {
  const validator = await readFile(new URL('../scripts/validate-canon-decisions.mjs', import.meta.url), 'utf8');

  assert.match(validator, /path\.join\(builtinRoot, 'data'\)/);
  assert.match(validator, /yunlong\.character-cards-v2\.json/);
  assert.match(validator, /yange\.character-cards-v2\.json/);
  assert.match(validator, /faction-details-v2-additions\.json/);

  const { stdout } = await execFileAsync(
    process.execPath,
    ['scripts/validate-canon-decisions.mjs'],
    { cwd: root },
  );
  assert.match(stdout, /canon decision enforcement PASS/);
});
