import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/acquaintanceLedger.ts');

const NAMES = new Map([
  ['liuchao.character.sun_shou', '孙寿'],
  ['liuchao.character.xiao_zi', '小紫'],
  ['liuchao.character.jing_li', '惊理'],
]);

test('相识程度分四档且严格递增', async () => {
  const { rankOf } = await modPromise;
  assert.ok(rankOf('rumored') < rankOf('introduced'));
  assert.ok(rankOf('introduced') < rankOf('encountered'));
  assert.ok(rankOf('encountered') < rankOf('joined'));
});

test('只升不降：见过就不会变回没见过', async () => {
  const { upgradeAcquaintance, acquaintanceOf } = await modPromise;
  const ledger = {};
  assert.equal(upgradeAcquaintance(ledger, { characterId: 'a', name: '甲', kind: 'encountered' }), true);
  // 更低的程度应被忽略
  assert.equal(upgradeAcquaintance(ledger, { characterId: 'a', name: '甲', kind: 'rumored' }), false);
  assert.equal(acquaintanceOf(ledger, 'a').kind, 'encountered');
  // 更高的程度覆盖
  assert.equal(upgradeAcquaintance(ledger, { characterId: 'a', name: '甲', kind: 'joined' }), true);
  assert.equal(acquaintanceOf(ledger, 'a').kind, 'joined');
});

test('hasMet 只认 encountered 及以上，听说过不算', async () => {
  const { upgradeAcquaintance, hasMet } = await modPromise;
  const ledger = {};
  upgradeAcquaintance(ledger, { characterId: 'a', name: '蛇夫人', kind: 'rumored' });
  assert.equal(hasMet(ledger, '蛇夫人'), false, '仅闻其名不算见过');
  upgradeAcquaintance(ledger, { characterId: 'a', name: '蛇夫人', kind: 'encountered' });
  assert.equal(hasMet(ledger, '蛇夫人'), true);
});

test('关系标签表明归属时同步为 joined', async () => {
  const { syncAcquaintanceLedger, hasJoined } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger,
    characterNames: NAMES,
    relations: {
      小紫: { 名字: '小紫', 与玩家关系: '主仆' },
      孙寿: { 名字: '孙寿', 与玩家关系: '陌生人' },
    },
  });
  assert.ok(hasJoined(ledger, '小紫'), '主仆表明已归属');
  assert.ok(!hasJoined(ledger, '孙寿'), '陌生人不算归属');
  assert.equal(ledger['liuchao.character.sun_shou'].kind, 'encountered', '有关系条目即至少见过');
});

test('事件与开场声明推导出 encountered', async () => {
  const { syncAcquaintanceLedger, hasMet } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger,
    characterNames: NAMES,
    metCharacterIds: ['liuchao.character.jing_li'],
    featuredCharacterIds: ['liuchao.character.xiao_zi'],
    stageId: 'lyl.luoyang_coup',
    worldTurn: 12,
  });
  assert.ok(hasMet(ledger, '惊理'));
  assert.ok(hasMet(ledger, '小紫'));
  assert.equal(ledger['liuchao.character.jing_li'].atStageId, 'lyl.luoyang_coup');
  assert.equal(ledger['liuchao.character.jing_li'].atWorldTurn, 12);
});

test('回填标记保留，用于标示证据强度较弱', async () => {
  const { syncAcquaintanceLedger } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger, characterNames: NAMES,
    metCharacterIds: ['liuchao.character.sun_shou'],
    backfilled: true,
  });
  assert.equal(ledger['liuchao.character.sun_shou'].backfilled, true);
});

test('主角不入账（真机实测漏过一次）', async () => {
  // 真机首轮：程宗扬以 encountered 进了账本。主角就是那个"我"，
  // 不该出现在"我认识谁"的记录里——与姿态层、上限层同一类排除。
  const { syncAcquaintanceLedger, acquaintanceByName } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({
    ledger,
    characterNames: new Map([...NAMES, ['liuchao.character.cheng_zongyang', '程宗扬']]),
    metCharacterIds: ['liuchao.character.cheng_zongyang', 'liuchao.character.xiao_zi'],
    relations: { 程宗扬: { 名字: '程宗扬', 与玩家关系: '自己' } },
    playerName: '程宗扬',
  });
  assert.equal(acquaintanceByName(ledger, '程宗扬'), undefined, '主角不得入账');
  assert.ok(acquaintanceByName(ledger, '小紫'), '其他角色照常入账');
});

test('未知角色不入账（characterNames 无映射时跳过）', async () => {
  const { syncAcquaintanceLedger } = await modPromise;
  const ledger = {};
  syncAcquaintanceLedger({ ledger, characterNames: NAMES, metCharacterIds: ['unknown.id'] });
  assert.equal(Object.keys(ledger).length, 0);
});

// —— prompt 注入：挡住"按原著快照假定熟识" ——

test('素未谋面者注入明确约束', async () => {
  const { formatAcquaintance } = await modPromise;
  const line = formatAcquaintance({}, '孙寿');
  assert.match(line, /素未谋面/);
  assert.match(line, /不得以旧识|既有交情/, '须禁止写成旧识');
  assert.match(line, /对方同样不认识玩家/, '双向都要挡');
});

test('仅闻其名与一面之缘各有措辞', async () => {
  const { upgradeAcquaintance, formatAcquaintance } = await modPromise;
  const ledger = {};
  upgradeAcquaintance(ledger, { characterId: 'a', name: '蛇夫人', kind: 'rumored' });
  assert.match(formatAcquaintance(ledger, '蛇夫人'), /仅闻其名|尚未见过本人/);
  const ledger2 = {};
  upgradeAcquaintance(ledger2, { characterId: 'b', name: '惊理', kind: 'introduced' });
  assert.match(formatAcquaintance(ledger2, '惊理'), /一面之缘/);
});

test('已见过/已归入者不注入相识约束（不啰嗦）', async () => {
  const { upgradeAcquaintance, formatAcquaintance } = await modPromise;
  const ledger = {};
  upgradeAcquaintance(ledger, { characterId: 'a', name: '小紫', kind: 'encountered' });
  assert.equal(formatAcquaintance(ledger, '小紫'), '');
  upgradeAcquaintance(ledger, { characterId: 'a', name: '小紫', kind: 'joined' });
  assert.equal(formatAcquaintance(ledger, '小紫'), '');
});

// —— 持久化与跨关继承：与 introducedCharacterIds 的关键区别 ——

test('账本写入 runtime 并在切关时继承', async () => {
  const fs = await import('node:fs');
  const runtimeSrc = fs.readFileSync(new URL('../src/modules/scenarioMods/runtime.ts', import.meta.url), 'utf8');
  assert.match(runtimeSrc, /updateAcquaintanceLedger\(next, runtime/, '每回合推进时须同步账本');
  assert.match(runtimeSrc, /rt\.acquaintances = rt\.acquaintances/, '须落在 runtime 上（持久化）');

  const initSrc = fs.readFileSync(new URL('../src/modules/scenarioMods/strictInitializer.ts', import.meta.url), 'utf8');
  assert.match(initSrc, /acquaintanceSnapshot/, '切关须快照账本');
  assert.match(initSrc, /newRuntime\.acquaintances/, '切关须恢复账本');
});

test('storyContext 消费账本，且主角不受影响', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/modules/scenarioMods/storyContext.ts', import.meta.url), 'utf8');
  const call = src.indexOf('formatAcquaintance(runtime.acquaintances');
  assert.ok(call > 0, 'storyContext 应注入相识程度');
  assert.match(src.slice(Math.max(0, call - 200), call), /!isProtagonist/, '主角不注入');
});
