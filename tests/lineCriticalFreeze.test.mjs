import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 线承重事件冻结：玩家没到现场，世界不许替他把帝统这类事办了（用户裁定 2026-08-16）。
test('只冻审核过的那批，其余事件一概不拦', async () => {
  const { lineCriticalFrozen, LINE_CRITICAL_EVENTS } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  assert.equal(lineCriticalFrozen({ id: 'not.in.table' }, 'lyg.dingtao_beijing', undefined), false,
    '不在表里的事件不该被冻——冻住整个世界比替玩家做决定更糟');
  assert.ok(Object.keys(LINE_CRITICAL_EVENTS).length >= 6, '表不该是空的');
  for (const lineId of Object.values(LINE_CRITICAL_EVENTS)) {
    assert.equal(typeof lineId, 'string');
  }
});

test('带地点的：人不在那个地点就冻，到了就放行', async () => {
  const { lineCriticalFrozen } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const ev = { id: 'lyg.event.s01_05', locationId: 'liuchao.location.zhaoyang_hall' }; // 董卓拥立定陶王为帝
  assert.equal(lineCriticalFrozen(ev, 'lyg.dingtao_beijing', 'liuchao.location.changqiu_palace'), true,
    '人在长秋宫，昭阳宫的拥立不该自行发生');
  assert.equal(lineCriticalFrozen(ev, 'lyg.dingtao_beijing', undefined), true, '地点未知时保守冻结');
  assert.equal(lineCriticalFrozen(ev, 'lyg.dingtao_beijing', 'liuchao.location.zhaoyang_hall'), false,
    '玩家已到昭阳宫，之后照常规走');
});

test('无地点的退到关卡级', async () => {
  const { lineCriticalFrozen } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const ev = { id: 'lyg.event.s01_09' }; // 吕冀赐死，无 locationId
  assert.equal(lineCriticalFrozen(ev, 'lyg.dingtao_beijing', undefined), false, '玩家已在该关即算到场');
  assert.equal(lineCriticalFrozen(ev, undefined, undefined), true, '关卡未知时冻结');
});

test('位置描述能反查出地点 id，按最长名匹配', async () => {
  const { resolveLocationIdFromPosition } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const locs = [{ id: 'a', name: '白夷' }, { id: 'b', name: '白夷谷' }];
  assert.equal(resolveLocationIdFromPosition('南荒·白夷谷', locs), 'b', '互含的地名取最长匹配');
  assert.equal(resolveLocationIdFromPosition('南荒·白夷', locs), 'a');
  assert.equal(resolveLocationIdFromPosition('', locs), undefined);
  assert.equal(resolveLocationIdFromPosition('中州·白湖商馆', undefined), undefined);
});
