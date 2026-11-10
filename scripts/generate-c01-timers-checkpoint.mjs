// C01 四年跳计时器验收检查点（设计稿 2026-11-11「四年跳计时器口径」；PR #4）。
// 底档＝freshPrologueCheckpoint({ beforeWuyuan: true })：220 年、焦土后进五原前，与 c01-before-wuyuan-220 同一停点
// （玩家再推进「前往 · 五原露天市集」即触发四年跳）。在其上用真实函数挂麻古成瘾、一处限时伤势、一个自由行动冷却，不拨钟、不触发跳。
// 施微沫 220 年五原前剧情未到，不挂（不硬造 系统.扩展.lcq_shiweimo）。
// 生成：node scripts/generate-c01-timers-checkpoint.mjs（只写本检查点与 trace；不动 c01-before-wuyuan-220.json）。
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadTs } from '../tests/loadTs.mjs';
import { freshPrologueCheckpoint, assertRealOpeningAfterLoad } from './generate-prologue-checkpoint.mjs';

const MG = await loadTs('../src/modules/scenarioMods/freeAction/maigu.ts');
const SC = await loadTs('../src/modules/scenarioMods/freeAction/selfConsumable.ts');
const AS = await loadTs('../src/modules/scenarioMods/freeAction/actorStatus.ts');
const FS = await loadTs('../src/modules/scenarioMods/freeAction/state.ts');
const FC = await loadTs('../src/modules/scenarioMods/freeAction/config.ts');
const INJ = await loadTs('../src/modules/sceneModule/host/injuries.ts');
const ST = await loadTs('../src/modules/sceneModule/statuses.ts');
const EC = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const IG = await loadTs('../src/modules/scenarioMods/itemGrades.ts');
const PID = await loadTs('../src/modules/scenarioMods/playerIdentity.ts');

export const outputDir = new URL('../tests/fixtures/checkpoints/', import.meta.url);
export const CHECKPOINT_STEM = 'c01-before-wuyuan-220-timers';
export const SAVE_NAME = 'C01验收-五原前挂计时器-220年';
export const BURN = 'wound.burn';
export const COOLDOWN = { actionClass: 'cast', variant: 'transfer_qi', targetId: 'lcq.character.yue_shuang' };
export const cooldownKey = () => `${COOLDOWN.variant}:${COOLDOWN.targetId}`;
const SELF_USE_INPUT = item => `我取出${item}服下`;
const rt = save => save.世界.状态.剧本模组;

/** 固定宿主时钟/随机/UUID，只为离线重放可重复（同 generate-line-entry-checkpoints）；不改游戏时钟。 */
async function withFixedHost(fn) {
  const OriginalDate = globalThis.Date, originalRandom = Math.random;
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const epoch = OriginalDate.parse('2026-11-01T00:00:00.000Z');
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [epoch])); }
    static now() { return epoch; }
  };
  let seed = 20261111;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    randomUUID() {
      const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  } });
  try { return await fn(); } finally {
    globalThis.Date = OriginalDate; Math.random = originalRandom;
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); else delete globalThis.crypto;
  }
}

/** 档里能读到的各计时器快照（深拷贝；检查点断言与测试共用）。 */
export function timerView(save) {
  return structuredClone(timerRefs(save));
}
function timerRefs(save) {
  const pid = PID.scenarioPlayerId(save), cfg = MG.maiguConfig(), now = INJ.sceneTime(save);
  const rows = INJ.injuryStore(save).actors[pid] || [];
  const row = id => rows.find(r => r.statusId === id);
  const effectOf = r => r && (save.角色.效果 || []).find(e => e.状态名称 === r.label && e.来源 === r.sourceScene);
  const burn = row(BURN), addiction = row(cfg.addictionStatus), heightened = row(cfg.heightenedStatus);
  return {
    pid, now, year: save.元数据.时间.年,
    timelineReceipts: Object.keys(save.系统?.扩展?.actionTime?.receipts || {}).filter(k => k.startsWith('author:timeline:')),
    addiction, addictionEffect: effectOf(addiction), heightened, heightenedEffect: effectOf(heightened),
    maiguClock: rt(save).maiguClock?.[pid],
    burn, burnEffect: effectOf(burn),
    cooldownAt: FS.readFreeActionState(save).cooldowns[cooldownKey()],
    cooldownMinutes: FC.variantSpecOf(COOLDOWN.actionClass, COOLDOWN.variant).cooldownMinutes,
    shiweimo: save.系统?.扩展?.lcq_shiweimo,
  };
}

/** 落盘形状（JSON 往返）走真实读档链 validateLoadedSave → applyLoadRepairs → migrateCalendar，返回读后的档。 */
export async function loadLikeGame(bundleOrSave, label = CHECKPOINT_STEM) {
  const [fallback, repairs, calendar] = await Promise.all([
    loadTs('../src/utils/saveLoadFallback.ts'), loadTs('../src/modules/scenarioMods/loadRepairs.ts'), loadTs('../src/utils/calendarMigration.ts')]);
  const disk = JSON.parse(JSON.stringify(bundleOrSave?.saves ? bundleOrSave.saves[0].存档数据 : bundleOrSave));
  const outcome = await fallback.validateLoadedSave('checkpoint-generator', label, disk, { keep: 0, readBackup: async () => null });
  if (outcome.status !== 'ok') throw Error(`[checkpoint ${label}] 读档校验未通过：${outcome.status}`);
  repairs.applyLoadRepairs(outcome.data);
  calendar.migrateCalendar(outcome.data);
  return outcome.data;
}

/** 生成失败条件：出生/寿命检查（assertRealOpeningAfterLoad）之外，读后年仍 220、未跳、各计时器仍在且锚点不变。 */
export async function assertC01TimersCheckpoint(bundle) {
  const fail = msg => { throw Error(`[checkpoint ${CHECKPOINT_STEM}] ${msg}`); };
  const opening = await assertRealOpeningAfterLoad(bundle, CHECKPOINT_STEM);
  const before = timerView(bundle.saves[0].存档数据), after = timerView(await loadLikeGame(bundle));
  for (const [name, v] of [['生成档', before], ['读后', after]]) {
    if (v.year !== 220) fail(`${name}年 ${v.year} ≠ 220`);
    if (v.timelineReceipts.length) fail(`${name}已有时间线回执 ${v.timelineReceipts}`);
    if (!v.addiction || !v.addictionEffect) fail(`${name}麻古成瘾行或 角色.效果 缺失`);
    if (!Number.isFinite(v.maiguClock?.lastDoseAt)) fail(`${name}maiguClock 缺失`);
    if (!v.burn || !Number.isFinite(v.burn.expiresAt) || v.burn.expiresAt <= v.now) fail(`${name}限时伤势行缺失或已到期`);
    if (!v.burnEffect) fail(`${name}主角伤势的 角色.效果 缺失`);
    if (!Number.isFinite(v.cooldownAt) || v.now - v.cooldownAt >= v.cooldownMinutes) fail(`${name}冷却缺失或已过`);
    if (v.shiweimo !== undefined) fail(`${name}不应有施微沫记录`);
  }
  if (after.now !== before.now) fail(`读后场景时间 ${before.now} → ${after.now}`);
  if (after.burn.expiresAt !== before.burn.expiresAt) fail(`读后伤势 expiresAt ${before.burn.expiresAt} → ${after.burn.expiresAt}`);
  if (JSON.stringify(after.maiguClock) !== JSON.stringify(before.maiguClock)) fail('读后 maiguClock 变了');
  if (after.cooldownAt !== before.cooldownAt) fail(`读后冷却 ${before.cooldownAt} → ${after.cooldownAt}`);
  return { opening, before, after };
}

export async function generateC01TimersCheckpoint() {
  return withFixedHost(async () => {
    const { save, trace: prologue } = await freshPrologueCheckpoint({ beforeWuyuan: true });
    const trace = [{ kind: 'source', generator: 'freshPrologueCheckpoint', options: { beforeWuyuan: true },
      note: '220 年焦土后进五原前，与 c01-before-wuyuan-220 同一停点；固定宿主时钟和随机种子，不固定游戏时钟。' }, ...prologue];
    const pid = PID.scenarioPlayerId(save), cfg = MG.maiguConfig();
    if (!pid) throw Error('missing player id');
    // 1. 麻古：自服（selfConsumable → afterItemFed）会扣背包份数，先按背包行形状（同 inventoryTransactions.canonicalInventoryItem）放一份。
    const def = EC.contentDefinition('item', cfg.itemId);
    if (def?.type !== 'consumable') throw Error(`麻古 ${cfg.itemId} 不是消耗品`);
    const bag = save.角色.背包.物品;
    if (bag[cfg.itemId]) throw Error('底档背包已有麻古');
    bag[cfg.itemId] = { 物品ID: cfg.itemId, 名称: def.name, 类型: '丹药', 品质: IG.itemSaveQuality(def.grade, () => ({ quality: '凡', grade: 0 })), 数量: 1, 描述: def.description || '', 已装备: false };
    const input = SELF_USE_INPUT(def.name), used = SC.settleSelfConsumable(save, input);
    if (!used || used.itemId !== cfg.itemId) throw Error(`自服麻古未结算：${JSON.stringify(used)}`);
    trace.push({ kind: 'timer', timer: 'maiguAddiction', via: 'freeAction/selfConsumable.settleSelfConsumable → maigu.afterItemFed', input, actorId: pid, result: used });
    // 2. 限时伤势：目录默认时长（afterScene.minutes）。
    const burn = AS.applyActorStatus(save, pid, BURN);
    if (!burn.ok) throw Error(`伤势未挂：${burn.reason}`);
    trace.push({ kind: 'timer', timer: 'injuries', via: 'freeAction/actorStatus.applyActorStatus', actorId: pid, statusId: BURN, catalogMinutes: ST.catalogStatus(BURN)?.afterScene?.minutes ?? null, expiresAt: burn.record.expiresAt });
    // 3. 传功冷却：真实 settle 过不了闸门（月霜不在场、主角无修为），按 settle.ts 同一状态对象与 key 形状写。
    FS.writableFreeActionState(save).cooldowns[cooldownKey()] = INJ.sceneTime(save);
    trace.push({ kind: 'timer', timer: 'freeActionCooldowns', via: 'freeAction/state.writableFreeActionState(save).cooldowns（同 settle.ts 写法）', key: cooldownKey(), at: INJ.sceneTime(save) });
    save.元数据.存档名 = SAVE_NAME;
    return { bundle: { type: 'saves', saves: [{ 存档名: SAVE_NAME, 存档数据: JSON.parse(JSON.stringify(save)) }] }, trace };
  });
}

export async function writeC01TimersCheckpoint(dir = outputDir) {
  const { bundle, trace } = await generateC01TimersCheckpoint();
  const check = await assertC01TimersCheckpoint(bundle);
  await mkdir(dir, { recursive: true });
  const stem = fileURLToPath(new URL(CHECKPOINT_STEM, dir));
  await writeFile(`${stem}.json`, JSON.stringify(bundle, null, 2) + '\n');
  await writeFile(`${stem}.trace.json`, JSON.stringify(trace, null, 2) + '\n');
  return { bundle, trace, check };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check } = await writeC01TimersCheckpoint();
  const v = check.after;
  console.log('load check', JSON.stringify({ year: v.year, now: v.now, timelineReceipts: v.timelineReceipts, maiguClock: v.maiguClock,
    addiction: v.addiction?.expiresAt, heightenedLeft: v.heightened ? v.heightened.expiresAt - v.now : null,
    burnLeft: v.burn.expiresAt - v.now, cooldownAt: v.cooldownAt, cooldownLeft: v.cooldownMinutes - (v.now - v.cooldownAt), birth: check.opening.after.birth }));
}
