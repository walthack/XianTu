// 设置页「当前存档难度」：练功上限下拉框前有文字标签，文案在内容包 texts（真机 1f9f24127b4e 观察：下拉框前没有标签）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const packs = await loadTs('../src/modules/contentPacks/index.ts');
const KEY = 'settings.difficulty.trainingCap.label';

test('练功上限下拉框包在带文字的 label 里，文字读 texts 键，不写死在模板', () => {
  assert.equal(packs.packText(KEY), '练功上限');
  const vue = readFileSync('src/components/dashboard/SettingsPanel.vue', 'utf8');
  const row = vue.split('\n').find(line => line.includes('difficultySettings.trainingCap'));
  assert.ok(row, '设置页有练功上限下拉框');
  assert.match(row, new RegExp(`<label>\\{\\{ packText\\('${KEY.replace(/\./g, '\\.')}'\\) \\}\\}<select v-model="gameStateStore\\.difficultySettings\\.trainingCap">.*</select></label>`));
  assert.ok(!row.includes('练功上限'), '文案不写死在模板');
  assert.match(vue, /import \{ packText \} from '@\/modules\/contentPacks';/);
});
