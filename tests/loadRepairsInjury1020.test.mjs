// fee4 B8：旧伤读档时按 statuses.migrations.json 迁移（不再等第一次访问伤势）。
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('读档路径调用 applyLoadRepairs；它对有场景账本的存档立即跑伤势迁移', () => {
  const store=readFileSync(new URL('../src/stores/characterStore.ts',import.meta.url),'utf8');
  assert.match(store,/applyLoadRepairs\(targetSlot\.存档数据\)/);
  const src=readFileSync(new URL('../src/modules/scenarioMods/loadRepairs.ts',import.meta.url),'utf8');
  assert.match(src,/injuryStore\(save\)/);
});
