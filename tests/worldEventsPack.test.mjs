// 阶段 2b：大祭改成包声明的世界事件（packs/festival，manifest.worldEvents → catalog.worldEvents）。
// 编译期校验的负例（在 _newbot_tmp 下的整份包副本里改 festival 包，不碰仓库里的包和 catalog），加上「搬迁逐字」与「通用模块不再 import 具体线」的钉子。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { compileContentPacks } from '../scripts/content-packs.mjs';
import { loadTs } from './loadTs.mjs';

const root = resolve(import.meta.dirname, '..');
const packsDir = join(root, 'src/modules/contentPacks/packs');
const read = async p => JSON.parse(await readFile(p, 'utf8'));
const OK = (await read(join(packsDir, 'festival/world-events.json')))[0];

/** 整份包副本里把 festival 包的 world-events.json 换成 events（可选另改 manifest、texts），再编译。 */
async function withFestival({ events, manifest, texts }, fn) {
  const dir = await mkdtemp(join(root, '_newbot_tmp/stage2b-world-events-'));
  try {
    await cp(packsDir, dir, { recursive: true });
    const at = f => join(dir, 'festival', f);
    if (events !== undefined) await writeFile(at('world-events.json'), JSON.stringify(events));
    if (manifest) await writeFile(at('manifest.json'), JSON.stringify({ ...(await read(at('manifest.json'))), ...manifest }));
    if (texts) await writeFile(at('texts.json'), JSON.stringify({ ...(await read(at('texts.json'))), ...texts }));
    return await fn(() => compileContentPacks({ packsDir: dir, validateContracts: false }));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const bad = (patch, re) => withFestival({ events: [{ ...structuredClone(OK), ...patch }] }, compile => assert.rejects(compile, re, JSON.stringify(patch)));

test('世界事件：编译期字段与引用校验', async () => {
  await withFestival({ events: OK }, compile => assert.rejects(compile, /qingyu\.festival\.worldEvents: expected array/));
  await withFestival({ manifest: { worldEvents: 'world-events.json' } }, compile => assert.rejects(compile, /qingyu\.festival\.worldEvents: expected file list/));
  await withFestival({ events: [OK, OK] }, compile => assert.rejects(compile, /world event missing\/duplicate id heimohaiFestival/));
  await withFestival({ events: [OK, { ...OK, id: 'other', actionId: 'x', startedExtensionKey: 'y', closes: [] }] }, compile => assert.rejects(compile, /world event eventId missing\/duplicate id/));
  await withFestival({ events: [OK, { ...OK, id: 'other', eventId: 'x', startedExtensionKey: 'y', closes: [] }] }, compile => assert.rejects(compile, /world event actionId missing\/duplicate id/));
  await withFestival({ events: [OK, { ...OK, id: 'other', eventId: 'x', actionId: 'y', closes: [] }] }, compile => assert.rejects(compile, /world event startedExtensionKey missing\/duplicate id/));
  await bad({ note: 'x' }, /world event heimohaiFestival: invalid fields/);
  await bad({ stageId: '' }, /world event heimohaiFestival: invalid fields/);
  await bad({ actionId: '' }, /world event actionId missing\/duplicate id/);
  await bad({ eventId: 'lyg.event.shituolin_endgame_15_beat' }, /eventId lyg\.event\.shituolin_endgame_15_beat is also a stage event/);
  for (const key of ['mapEntryResume', 'mapEntryMessages', '读档迁移', 'festival_started', '1festival'])
    await bad({ startedExtensionKey: key }, /startedExtensionKey .* must match/);
  await bad({ stageId: 'test.no_such_stage' }, /unknown stage test\.no_such_stage/);
  await bad({ availableWhen: 'always' }, /availableWhen must be stageRailSettled/);
  await bad({ blockedInStageIds: ['lyg.qin_xianyang', 'lyg.qin_xianyang'] }, /blockedInStageIds must be distinct stage ids/);
  await bad({ blockedInStageIds: ['lyg.shituolin_endgame'] }, /blockedInStageIds: lyg\.shituolin_endgame is not a map entry stage/);
  await bad({ closes: [{ ...OK.closes[0], note: 'x' }] }, /closes: invalid fields/);
  await bad({ closes: [{ ...OK.closes[0], lineId: 'test.no_line' }] }, /closes: unknown nation line test\.no_line/);
  await bad({ closes: [OK.closes[0], OK.closes[0]] }, /closes: line qin is also closed by world event heimohaiFestival/);
  await withFestival({ events: [OK, { ...OK, id: 'other', eventId: 'x', actionId: 'y', startedExtensionKey: 'z' }] }, compile => assert.rejects(compile, /world event other: closes: line qin is also closed by world event heimohaiFestival/));
  await bad({ closes: [{ ...OK.closes[0], stageId: 'test.no_such_stage' }] }, /closes: unknown stage test\.no_such_stage/);
  await bad({ closes: [{ ...OK.closes[0], messageEventId: 'lyg.event.shituolin_endgame_15_beat' }] }, /messageEventId lyg\.event\.shituolin_endgame_15_beat is not in stage lyg\.qin_xianyang/);
  await bad({ textKeys: { ...OK.textKeys, label: 'test.no_text' } }, /textKeys must name existing texts/);
  const { blocked: _blocked, ...three } = OK.textKeys;
  await bad({ textKeys: three }, /textKeys must name existing texts/);
  await withFestival({ texts: { [OK.textKeys.label]: '   ' } }, compile => assert.rejects(compile, /label text must not be empty/));
  // 归属：引用秦关／秦口信事件／qin 线，靠 dependsOn 秦包满足
  await withFestival({ manifest: { dependsOn: ['qingyu.core'] } }, compile => assert.rejects(compile, /qingyu\.festival references .* owned by qingyu\.qin; add dependsOn/));
});

test('世界事件：stageId 必须有 canon rail（TS 校验）', async () => {
  // lcq.stage_03 是内置关、没有 canon rail；可用性按 rail 结算口径判，没有 rail 就永远不可用
  await bad({ stageId: 'lcq.stage_03' }, /world event heimohaiFestival: stage lcq\.stage_03 has no canon rail/);
});

test('世界事件：大祭声明与原 numbers 的 story.lineCompass.festival 逐字相同（2026-11-11 搬迁）', async () => {
  const P = await loadTs('../src/modules/contentPacks/index.ts');
  const F = await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts');
  // 原 numbers-progress.json 的十个值（搬迁前原文，逐字）
  const ORIGINAL = {
    eventId: 'lyg.event.heimohai_festival_start', finalStageId: 'lyg.shituolin_endgame', qinStageId: 'lyg.qin_xianyang', qinLineId: 'qin',
    qinMessageEventId: 'liuchao.event.qin_hook_fangshi_rumor', actionId: 'start_heimohai_festival',
    warning: '【扩写】大祭将近：黑魔海圣教大祭在即，未了之事宜早作打算。', transition: '【扩写·待剧情策划】你决定赴黑魔海，圣教大祭由此开始。',
    blocked: '【扩写】秦地之事尚未了结，请先完成秦线，再赴黑魔海大祭。', label: '开启大祭',
  };
  assert.deepEqual(F.FESTIVAL, ORIGINAL);
  assert.deepEqual(Object.keys(F.FESTIVAL), Object.keys(ORIGINAL));
  const def = P.CONTENT_PACKS.worldEvents.find(x => x.id === 'heimohaiFestival');
  assert.equal(def.startedExtensionKey, 'festivalStarted');
  for (const k of ['label', 'warning', 'transition', 'blocked']) assert.equal(P.CONTENT_PACKS.texts[def.textKeys[k]], ORIGINAL[k]);
  const numbers = JSON.parse(await readFile(join(root, 'mod-kit/game-numbers.qingyu.json'), 'utf8'));
  assert.equal(numbers.story.lineCompass.festival, undefined, 'numbers 里不再有 story.lineCompass.festival');
});

test('通用模块只依赖 worldEvents.ts，不 import 具体线的 heimohaiFestival.ts', async () => {
  for (const f of ['src/modules/scenarioMods/lineCompass.ts', 'src/modules/scenarioMods/mapEntries.ts', 'src/modules/scenarioMods/ledgerConditions.ts', 'src/components/dashboard/RightSidebar.vue'])
    assert.doesNotMatch(await readFile(join(root, f), 'utf8'), /heimohaiFestival/, f);
});
