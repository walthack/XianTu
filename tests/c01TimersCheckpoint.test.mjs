// C01 四年跳前挂好计时器的检查点（c01-before-wuyuan-220-timers；生成器 scripts/generate-c01-timers-checkpoint.mjs）。
// 读档链确认未跳且计时器在；再走插入事件正式入口 applyTimelineInserts（reachedAxisSeq＝插入事件 anchor.beforeAxisSeq）拨四年。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTs } from './loadTs.mjs';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const G = await import('../scripts/generate-c01-timers-checkpoint.mjs');
const TL = await loadTs('../src/modules/scenarioMods/timelineInserts.ts');
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const MG = await loadTs('../src/modules/scenarioMods/freeAction/maigu.ts');

const read = (name, base = new URL('./fixtures/checkpoints/', import.meta.url)) => JSON.parse(readFileSync(new URL(name, base), 'utf8'));
const bundle = read(`${G.CHECKPOINT_STEM}.json`);
const INSERT = P.CONTENT_PACKS.timeline.inserts[0];
const yearMinutes = () => { const c = N.GAME_NUMBERS.story.actionTime.calendar; return c.daysPerMonth * c.monthsPerYear * 1440; };
const loaded = () => quiet(() => G.loadLikeGame(bundle));

test('检查点：220 年、与 c01-before-wuyuan-220 同一停点；麻古成瘾、限时伤势、传功冷却已挂；施微沫未挂', () => {
  assert.equal(bundle.type, 'saves');
  assert.equal(bundle.saves[0].存档名, G.SAVE_NAME);
  const save = bundle.saves[0].存档数据, base = read('c01-before-wuyuan-220.json').saves[0].存档数据;
  assert.equal(R.getScenarioFocusEvent(save.世界.状态.剧本模组)?.id, R.getScenarioFocusEvent(base.世界.状态.剧本模组)?.id);
  assert.equal(R.getScenarioFocusEvent(save.世界.状态.剧本模组)?.id, 'lcq.event.s02_04');
  assert.deepEqual(save.角色.位置, base.角色.位置);
  const v = G.timerView(save), cfg = MG.maiguConfig();
  assert.equal(v.year, 220);
  assert.deepEqual(v.timelineReceipts, []);
  assert.ok(v.addiction && v.addiction.expiresAt === null && v.addictionEffect, '成瘾行（不过期）与主角 角色.效果');
  assert.ok(v.heightened && v.heightened.expiresAt - v.now === cfg.heightened.minutes, '感官亢奋仍在（未推进时钟）');
  assert.deepEqual(v.maiguClock, { lastDoseAt: v.now });
  assert.equal(save.角色.背包.物品[cfg.itemId], undefined, '自服扣掉了放入的那一份');
  assert.ok(v.burn && v.burnEffect, '主角限时伤势行与 角色.效果');
  assert.ok(v.burn.expiresAt - v.now > 0 && v.burn.expiresAt - v.now < 4 * yearMinutes(), '剩余短于四年');
  assert.equal(v.cooldownAt, v.now);
  assert.ok(v.cooldownMinutes > 0);
  assert.equal(v.shiweimo, undefined, '施微沫未挂');
});

test('读档链（validateLoadedSave→applyLoadRepairs→migrateCalendar）：未跳，计时器都在且锚点不变', async () => {
  const before = G.timerView(bundle.saves[0].存档数据), s = await loaded(), after = G.timerView(s);
  assert.equal(after.year, 220);
  assert.deepEqual(after.timelineReceipts, []);
  assert.equal(after.now, before.now);
  assert.ok(after.addiction && after.addictionEffect);
  assert.deepEqual(after.maiguClock, before.maiguClock);
  assert.equal(after.burn.expiresAt, before.burn.expiresAt);
  assert.ok(after.burnEffect);
  assert.equal(after.cooldownAt, before.cooldownAt);
  assert.equal(s.角色.身份.出生日期.年, 200);
});

test('读档后走插入事件正式入口拨四年：224 年；麻古仍成瘾且时钟平移；伤势与冷却自然到期', async () => {
  const s = await loaded(), before = G.timerView(s), cfg = MG.maiguConfig();
  const res = await quiet(() => TL.applyTimelineInserts(s, { reachedAxisSeq: INSERT.anchor.beforeAxisSeq }));
  assert.equal(res.length, 1);
  const skipped = res[0].years * yearMinutes(), after = G.timerView(s);
  assert.equal(after.year, 224);
  assert.equal(after.now - before.now, skipped);
  assert.equal(after.timelineReceipts.length, 1);
  // 麻古成瘾（freeze）
  assert.ok(after.addiction && after.addictionEffect, '仍成瘾，未戒除');
  assert.equal(after.maiguClock.lastDoseAt, before.maiguClock.lastDoseAt + skipped, 'maiguClock 平移');
  assert.equal(after.now - after.maiguClock.lastDoseAt, before.now - before.maiguClock.lastDoseAt, '渴求进度不变');
  assert.ok(!(s.世界.状态.剧本模组.sceneLedger.statusRecords.actors[after.pid] || []).some(r => r.statusId === cfg.withdrawalStatus), '没因这一跳进入戒断');
  // 感官亢奋（natural）
  assert.equal(after.heightened, undefined, '感官亢奋自然到期');
  // 限时伤势（natural）
  assert.equal(after.burn, undefined, '伤势行已清');
  assert.ok(!(s.角色.效果 || []).some(e => e.状态名称 === before.burn.label && e.来源 === before.burn.sourceScene), '主角 角色.效果 对应项已清');
  // 冷却（natural）
  assert.equal(after.cooldownAt, before.cooldownAt, '冷却锚点不平移');
  assert.ok(after.now - after.cooldownAt >= after.cooldownMinutes, '下次不挡（判式同 gates.ts）');
});

test('检查点可由生成器确定性重生（整份对照，含 trace）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'c01-timers-'));
  try {
    const url = pathToFileURL(dir + '/');
    await quiet(() => G.writeC01TimersCheckpoint(url));
    for (const suffix of ['.json', '.trace.json']) {
      assert.deepEqual(read(G.CHECKPOINT_STEM + suffix, url), read(G.CHECKPOINT_STEM + suffix), suffix);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
