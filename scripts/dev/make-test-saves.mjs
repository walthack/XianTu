#!/usr/bin/env node
/**
 * 测试存档生成（只用于试玩复测，不改正式规则、不改任何游戏数据）。
 *
 * 以一份游戏「导出存档」（dad.bundle / type=saves）为模板，保留模板的角色、属性、背包与系统设置，
 * 把剧情运行时换成目标关、按现有规则把前置拍记为已完成，产出可在游戏「保存游戏 → 导入存档」读取的 JSON：
 *   qin-entry          三条国家线已收束（compass.qinEntryReady），人在唐·留仙坪（燕歌行灞桥关开局），商会伙计口信已投递，地图点咸阳可入秦
 *   daji-warning       终关 lyg.shituolin_endgame 开局：右栏「大祭将近」预警，开祭按钮未出现
 *   daji-open          终关 rail 拍全部完成：预警＋「开启大祭」按钮可点（点了即进入大祭开始态、未入秦则秦线关闭）
 *   jiangzhou-retreat  lyl.jiangzhou_retreat（坠美）开局：人在江州，「江州宋军大溃与退军」(lyl.event.s01_01) 激活未完成
 *   heimohai-approach  lyl.lin_an_black_sea（血誓）：前序拍全部完成，「江州铁傀儡场外拍」(liuchao.event.black_sea_approach) 激活，人仍在临安
 *
 * 用法：node scripts/dev/make-test-saves.mjs [模板导出存档.json] [输出目录]
 *   默认模板 /tmp/pt/r/stuck.json，默认输出 /workspace/testsaves-out/
 * 每份写出前都用游戏读档同款校验跑一遍（assertEntitySaveFormat、版本守卫、旧结构检测、V3 校验、读档前校验、读档修复），
 * 并断言目标状态成立；任何一项不过就不写文件、以非零码退出。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': `${ROOT}src` } });
const load = rel => jiti.import(`${ROOT}${rel}`);

const readStage = id => JSON.parse(readFileSync(`${ROOT}src/modules/scenarioMods/builtins/data/${id}.json`, 'utf8'));
const rt = save => save.世界.状态.剧本模组;

async function modules() {
  const [init, validator, runtime, festival, mapTravel, mapEntries, ledger, packs, fmt, fallback, migration, v3, repairs, rail, bundle] = await Promise.all([
    load('src/modules/scenarioMods/strictInitializer.ts'),
    load('src/modules/scenarioMods/validator.ts'),
    load('src/modules/scenarioMods/runtime.ts'),
    load('src/modules/scenarioMods/heimohaiFestival.ts'),
    load('src/modules/scenarioMods/travel/mapTravel.ts'),
    load('src/modules/scenarioMods/mapEntries.ts'),
    load('src/modules/scenarioMods/ledgerConditions.ts'),
    load('src/modules/contentPacks/index.ts'),
    load('src/modules/scenarioMods/entitySaveFormat.ts'),
    load('src/utils/saveLoadFallback.ts'),
    load('src/utils/saveMigration.ts'),
    load('src/utils/saveValidationV3.ts'),
    load('src/modules/scenarioMods/loadRepairs.ts'),
    load('src/modules/scenarioMods/canonRail.ts'),
    load('src/utils/dadBundle.ts'),
  ]);
  return { init, validator, runtime, festival, mapTravel, mapEntries, ledger, packs: packs.CONTENT_PACKS, fmt, fallback, migration, v3, repairs, rail, bundle };
}

/** 模板存档 → 目标关开局：保留角色／属性／背包／系统设置，清掉旧关的叙事与记忆、待确认判定，换上目标关运行时。 */
function enterStage(m, template, stageId, label) {
  const base = structuredClone(template);
  base.系统 ||= {};
  base.系统.历史 = { 叙事: [] };
  const ext = base.系统.扩展 || {};
  delete ext.判定; delete ext.行动门控; delete ext.actionTime; delete ext.mapEntryResume; delete ext.mapEntryMessages; delete ext.festivalStarted;
  base.系统.扩展 = ext;
  base.社交 ||= {};
  base.社交.记忆 = { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] };
  const mod = m.validator.parseScenarioMod(readStage(stageId));
  let save = m.init.applyStrictScenarioInitializationToSave(base, m.init.buildStrictScenarioInitialization(mod, '2026-10-31T00:00:00.000Z'));
  save.元数据 = { ...save.元数据, 存档ID: `save_test_${label}`, 存档名: `测试-${label}`, 更新时间: '2026-10-31T00:00:00.000Z' };
  return save;
}
const advance = (m, save) => m.runtime.advanceScenarioRuntime(save).saveData;

/** 按现有完成口径把若干拍记为已完成（completedEventIds＋event.<短id>.done），不另造字段。 */
function markDone(save, eventIds) {
  const runtime = rt(save);
  for (const id of eventIds) {
    if (!runtime.completedEventIds.includes(id)) runtime.completedEventIds.push(id);
    runtime.flags[`event.${id.split('.').pop()}.done`] = true;
  }
  runtime.activeEventIds = runtime.activeEventIds.filter(id => !eventIds.includes(id));
}
function note(save, text, options = []) {
  const time = save.元数据?.时间 || {};
  const stamp = `【测试存档 · ${time.年 ?? '?'}年${time.月 ?? '?'}月${time.日 ?? '?'}日】`;
  save.系统.历史.叙事 = [{ type: 'gm', role: 'assistant', content: `${stamp}${text}`, time: stamp, userIntent: '', actionOptions: options, stateChanges: { changes: [] } }];
  save.社交.记忆.短期记忆 = [`${stamp}${text}`];
}

export const TEST_SAVE_BUILDERS = {
  'qin-entry'(m, template) {
    // 三线入秦：story.lineCompass.qinEntry.minClosedLines（现为 3），只数 南荒/晋/宋/汉/唐 五条国家线的 closedWhen 收束拍。
    let save = enterStage(m, template, 'lyg.changgan_begins', 'qin-entry');
    const closers = ['nanhuang', 'jin', 'song'].map(id => m.packs.lineCompass.lines.find(l => l.lineId === id).closedWhen[0].path.slice('done.'.length));
    rt(save).completedEventIds.push(...closers);
    save = advance(m, save);
    note(save, '南荒、晋、宋三条线已收束。你在赴长安途中的留仙坪（唐，与秦相邻），商会伙计捎来咸阳的口信；打开世界地图点「咸阳」即可入秦（剧情入口转场，不计路程）。');
    return save;
  },
  'daji-warning'(m, template) {
    const save = advance(m, enterStage(m, template, 'lyg.shituolin_endgame', 'daji-warning'));
    note(save, '你已来到尸陀林终局。黑魔海大祭将近，右栏会出现预警；终关主线拍全部走完后才出现「开启大祭」。');
    return save;
  },
  'daji-open'(m, template) {
    let save = enterStage(m, template, 'lyg.shituolin_endgame', 'daji-open');
    save = advance(m, save);
    const rail = m.rail.getCanonRailProfile(rt(save));
    for (let i = 0; i < 4; i++) { markDone(save, rail.orderedEventIds); save = advance(m, save); }
    note(save, '尸陀林终局的主线拍已全部走完。右栏「开启大祭」按钮可点；点下即黑魔海大祭开始（未入秦则秦线关闭）。');
    return save;
  },
  'jiangzhou-retreat'(m, template) {
    const save = advance(m, enterStage(m, template, 'lyl.jiangzhou_retreat', 'jiangzhou-retreat'));
    note(save, '你在江州。宋军粮尽将溃，「前往江州协助撤退」一拍已经挂出、尚未开始；按主线罗盘前往金明寨即触发退军剧情。');
    return save;
  },
  'heimohai-approach'(m, template) {
    let save = enterStage(m, template, 'lyl.lin_an_black_sea', 'heimohai-approach');
    const order = rt(save).events.map(e => e.id);
    const prior = order.slice(0, order.indexOf('liuchao.event.black_sea_approach'));
    markDone(save, prior);
    // 前四章（抵达／林冲／威远／雪隼）以章完成标记收束，同 tests/jiangzhouScriptedTravel.test.mjs。
    for (const chapter of ['arrival', 'lin_chong', 'wei_yuan', 'xue_sun']) rt(save).flags[`chapter.${chapter}.done`] = true;
    rt(save).activeEventIds = [];
    for (let i = 0; i < 6 && !rt(save).activeEventIds.includes('liuchao.event.black_sea_approach'); i++) save = advance(m, save);
    note(save, '临安诸事已毕。黑魔海的动静从江州传来——主线罗盘指向江州，「江州铁傀儡场外拍」即将触发。');
    return save;
  },
};

/** 每份的目标状态断言；返回给 README / 测试用的摘要。 */
export const TEST_SAVE_CHECKS = {
  'qin-entry'(m, save) {
    const entry = m.packs.mapEntries.find(e => e.id === 'qin');
    must(m.ledger.resolveLedgerPath('compass.qinEntryReady', rt(save), save).value === true, 'qinEntryReady 未成立');
    must(m.mapEntries.mapEntryReady(save, entry), '咸阳地图入口未就绪');
    must(rt(save).activeEventIds.includes(entry.eventId), '商会伙计口信未投递');
    must(!!m.mapTravel.selectMapTravel(structuredClone(save), entry.locationId), '地图点咸阳不可选');
    return { modId: rt(save).modId, location: save.角色.位置.locationId, closedLines: 3, qinMessage: entry.eventId };
  },
  'daji-warning'(m, save) {
    const view = m.festival.festivalView(save);
    must(!!view.warning && !view.available && !view.transition, `大祭预警态不成立：${JSON.stringify(view)}`);
    return { modId: rt(save).modId, warning: view.warning, available: view.available };
  },
  'daji-open'(m, save) {
    const view = m.festival.festivalView(save);
    must(!!view.warning && view.available && !view.transition, `开祭可点态不成立：${JSON.stringify(view)}`);
    const started = structuredClone(save);
    must(m.festival.startHeimohaiFestival(started, { source: 'player', actionId: m.festival.FESTIVAL.actionId }).ok, '点开祭失败');
    must(m.festival.qinClosedByFestival(started), '开祭后未入秦时秦线应关闭');
    return { modId: rt(save).modId, available: view.available };
  },
  'jiangzhou-retreat'(m, save) {
    must(save.角色.位置.locationId === 'liuchao.location.jiangzhou', '不在江州');
    must(rt(save).activeEventIds.includes('lyl.event.s01_01') && !rt(save).completedEventIds.includes('lyl.event.s01_01'), '退军拍未处于触发前');
    const action = m.runtime.getCurrentStoryEventActions(structuredClone(save)).find(a => a.eventId === 'lyl.event.s01_01');
    must(action?.actionId === 'travel:liuchao.location.jinming_zhai', `罗盘首步应为前往金明寨：${action?.actionId}`);
    return { modId: rt(save).modId, location: save.角色.位置.locationId, active: 'lyl.event.s01_01' };
  },
  'heimohai-approach'(m, save) {
    must(save.角色.位置.locationId === 'liuchao.location.lin_an', '不在临安');
    must(rt(save).activeEventIds.includes('liuchao.event.black_sea_approach') && !rt(save).completedEventIds.includes('liuchao.event.black_sea_approach'), '黑魔海逼近拍未处于触发前');
    const action = m.runtime.getCurrentStoryEventActions(structuredClone(save)).find(a => a.eventId === 'liuchao.event.black_sea_approach');
    must(action?.actionId === 'travel:liuchao.location.jiangzhou', `罗盘首步应为前往江州：${action?.actionId}`);
    return { modId: rt(save).modId, location: save.角色.位置.locationId, active: 'liuchao.event.black_sea_approach' };
  },
};

function must(ok, message) { if (!ok) throw new Error(message); }

/** 游戏读档同款校验（离线）：导入（importSave）与读档（loadGame）路径上会拒绝的检查都要过。 */
export async function verifyLoadable(m, data, label) {
  m.fmt.assertEntitySaveFormat(data);
  must(m.migration.checkSaveSchemaVersion(data).supported, `${label}：存档版本高于当前游戏`);
  must(!m.migration.detectLegacySaveData(data).needsMigration, `${label}：被判为旧结构需迁移`);
  must(m.migration.isSaveDataV3(data), `${label}：不是 V3 结构`);
  const v3 = m.v3.validateSaveDataV3(data);
  must(v3.isValid, `${label}：V3 校验失败 ${v3.errors?.[0] || ''}`);
  const outcome = await m.fallback.validateLoadedSave('test', label, structuredClone(data), { keep: 0 });
  must(outcome.status === 'ok', `${label}：读档前校验 ${outcome.status}`);
  m.repairs.applyLoadRepairs(structuredClone(data));
}

function slotOf(save) {
  const time = save.元数据?.时间 || {};
  const now = '2026-10-31T00:00:00.000Z';
  return {
    存档名: save.元数据.存档名, 保存时间: now, 最后保存时间: now,
    游戏内时间: `${time.年}年${time.月}月${time.日}日`,
    角色名字: save.角色?.身份?.名字, 境界: save.角色?.属性?.境界?.名称 || '凡人', 位置: save.角色?.位置?.描述 || '未知', 修为进度: 0,
    存档数据: save,
  };
}

/** 生成全部测试存档（内存）：返回 { name: { bundle, save, summary } }。 */
export async function buildTestSaves(templateBundle, names = Object.keys(TEST_SAVE_BUILDERS)) {
  const m = await modules();
  const unwrapped = m.bundle.unwrapDadBundle(templateBundle);
  must(unwrapped.type === 'saves' && Array.isArray(unwrapped.payload?.saves) && unwrapped.payload.saves[0]?.存档数据, '模板不是游戏导出的存档文件');
  const template = unwrapped.payload.saves[0].存档数据;
  const out = {};
  for (const name of names) {
    const save = TEST_SAVE_BUILDERS[name](m, template);
    await verifyLoadable(m, save, name);
    const summary = TEST_SAVE_CHECKS[name](m, save);
    const bundle = m.bundle.createDadBundle('saves', {
      characterId: unwrapped.payload.characterId, characterName: unwrapped.payload.characterName, saves: [slotOf(save)],
    }, { exportedAt: '2026-10-31T00:00:00.000Z' });
    out[name] = { bundle, save, summary };
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const templatePath = process.argv[2] || '/tmp/pt/r/stuck.json';
  const outDir = process.argv[3] || '/workspace/testsaves-out';
  const built = await buildTestSaves(JSON.parse(readFileSync(templatePath, 'utf8')));
  mkdirSync(outDir, { recursive: true });
  for (const [name, { bundle, summary }] of Object.entries(built)) {
    const file = `${outDir}/${name}.json`;
    writeFileSync(file, JSON.stringify(bundle, null, 2) + '\n');
    console.log(`✔ ${file}`, JSON.stringify(summary));
  }
}
