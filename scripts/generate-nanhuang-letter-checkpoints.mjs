// 南荒密信两个检查点（PR #1 驿馆路径）：从当前新档（freshPrologueCheckpoint）沿正式关链逐拍推进，战斗走场面宿主固定骰（walkMainline）。
// 不手写完成标志/位置/物品；固定宿主时钟、随机种子和 UUID 只为离线重放可重复，不改游戏时间。
//  - nanhuang-04b-before-letter-id：04b，s04b_04 成为焦点之前，竹筒已在背包（态一）。
//  - nanhuang-05b-inn-stay-before-rejoin：Y5 选「留下」，04b 关末启程进 05b，焦点为 blank_letter_and_dagu、尚未会合（态二）。
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadTs } from '../tests/loadTs.mjs';
import { walkMainline } from '../tests/baihuMainlineWalk.mjs';
import { freshPrologueCheckpoint, assertRealOpeningAfterLoad } from './generate-prologue-checkpoint.mjs';

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const V = await loadTs('../src/utils/saveValidationV3.ts');
const E = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const H = await loadTs('../src/modules/scenarioMods/stayRejoin.ts');
const outputDir = new URL('../tests/fixtures/checkpoints/', import.meta.url);
const EPOCH = '2026-11-01T00:00:00.000Z';
const IDENTIFY = 'lcq.event.s04b_lingfei_baiyi_crisis_04', TUBE = 'lcq.item.crow_bamboo_tube';
const Y5 = 'lcq.event.guiwangdong_coop_pact_ins_ningyu_enter', LETTER = 'lcq.event.blank_letter_and_dagu';
const INN = 'lcq.location.guiwang_inn', B05 = 'lcq.stage_05b';
const rt = save => save.世界.状态.剧本模组;
const STOP = Symbol('checkpoint captured');

async function withFixedHost(run) {
  const OriginalDate = globalThis.Date, originalRandom = Math.random;
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const epoch = OriginalDate.parse(EPOCH);
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [epoch])); }
    static now() { return epoch; }
  };
  let seed = 20261111;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID() {
    const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } } });
  try { return await run(); } finally {
    globalThis.Date = OriginalDate; Math.random = originalRandom;
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); else delete globalThis.crypto;
  }
}

/** 逐拍走到 onTop(save,event) 返回真时取档，取到即停。 */
async function walkUntil(start, onTop) {
  let captured;
  try {
    await walkMainline((save, event) => { const hit = onTop(save, event); if (hit) { captured = structuredClone(save); throw STOP; } }, start);
  } catch (error) { if (error !== STOP) throw error; }
  assert.ok(captured, 'walk ended before the checkpoint');
  return captured;
}

function bundle(save, name) {
  save.元数据.存档名 = name;
  E.assertEntitySaveFormat(save);
  assert.equal(rt(save).entitySaveFormat, E.ENTITY_SAVE_FORMAT, 'entitySaveFormat written by the stage transition');
  const v = V.validateSaveDataV3(save);
  assert.equal(v.isValid, true, JSON.stringify(v.errors || v));
  return { type: 'saves', saves: [{ 存档名: name, 保存时间: EPOCH, 存档数据: save }] };
}

export async function generateNanhuangLetterCheckpoints() {
  return withFixedHost(async () => {
    const { save: prologue } = await freshPrologueCheckpoint();
    const sealed = await walkUntil(prologue, (save, event) => event?.id === IDENTIFY);
    assert.equal(rt(sealed).modId, 'lcq.stage_04b_lingfei_baiyi_crisis');
    assert.ok(sealed.角色.背包.物品[TUBE], 'tube already in the bag');
    assert.ok(!rt(sealed).completedEventIds.includes(IDENTIFY));

    let stayed = false;
    const inn = await walkUntil(prologue, (save, event) => {
      const r = rt(save);
      const y5 = !stayed && R.getCurrentStoryExplorationActions(save).find(a => a.eventId === Y5 && a.actionId === 'act.ningyu.y5.stay');
      if (y5) { r.worldTurn++; assert.equal(R.recordStoryEventStructuredAction(save, y5).completed, true); stayed = true; }
      return r.modId === B05 && event?.id === LETTER && r.flags['branch.ningyu.y5_rejoined'] !== true;
    });
    assert.ok(stayed && rt(inn).flags['branch.ningyu.enter_dong'] === 'stay');
    assert.equal(inn.角色.位置.locationId, INN);
    assert.ok(H.heldActions(inn).length > 0, 'letter opening is held until the rejoin');
    return {
      'nanhuang-04b-before-letter-id': bundle(sealed, '当前构建新档-南荒04b竹筒未辨认前'),
      'nanhuang-05b-inn-stay-before-rejoin': bundle(inn, '当前构建新档-南荒05b驿馆留下未会合'),
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checkpoints = await generateNanhuangLetterCheckpoints();
  // 生成失败条件：全部档先过真实读档入口断言（出生 200、读后不被修复），任一不成立即抛错，不写半截。
  for (const [stem, value] of Object.entries(checkpoints)) await assertRealOpeningAfterLoad(value, stem);
  await mkdir(outputDir, { recursive: true });
  for (const [stem, value] of Object.entries(checkpoints)) {
    await writeFile(fileURLToPath(new URL(`${stem}.json`, outputDir)), JSON.stringify(value, null, 2) + '\n');
    const save = value.saves[0].存档数据;
    console.log(stem, JSON.stringify({ stage: rt(save).modId, focus: R.getScenarioFocusEvent(rt(save))?.id, location: save.角色.位置.locationId, time: save.元数据.时间 }));
  }
}
