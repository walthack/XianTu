// 结构验收（常驻）：一条合成的假国家线 zz_test，只加数据文件，能否编译、注册、跑通。
//
// 做法同 tests/nationLinesPack.test.mjs 的「单次重建」：把 src、mod-kit、scripts、package.json 复制到系统临时目录（node_modules 软链），
// 在副本的 packs/ 下新建一个线包目录 zz-test-line/，在副本里跑 scripts/content-packs.mjs，再用 jiti 从副本加载 TS 模块跑运行时。
// 仓库里的包、catalog、builtins、mod-kit 一律不碰（最后一项用例逐字节核对副本 src 与仓库 src，并核对仓库 catalog 未变）。
//
// 合成线用到的线级格式：manifest（dependsOn）、stages（包内关，3 拍 rail + 1 拍加拍 + 失败收束拍 + 口信拍）、texts、nationLines（注册、
// 地区、计入收束、失败收束事件）、rails、railExtraBeats、stageMeta（称号、默认章、章配乐、事件章名／配乐／目标）、secondaryLines（after）、
// lineCompass（含 closedWhen）、mapEntries、mapRoutes、compassConditions、lineCriticalEvents、contractRevisions、worldEvents（closes 指向本线）。
// 不适用、只钉现状的：endings（结局实体在 mod-kit）、persistentEntries（只有 algae／rejoin 两种、各全局一条）、openWorldSlices（只有 TS 写死的 key 有读取方）。
//
// 「现状钉子」：标【缺口】的断言钉的是「目前加一条线还得改非包文件」的现状；缺口修掉后这些断言会变红，届时把它们改成正向断言。
// 缺口清单与建议修法见 accept-summary.md（结构验收报告）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

// musicLibrary.ts 直接 import 曲目 .mp3；Node 下只把它当成 URL 字符串模块（同 tests/festivalReplay.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

const root = resolve(import.meta.dirname, '..');
const read = async p => JSON.parse(await readFile(p, 'utf8'));
const sha = async p => createHash('sha256').update(await readFile(p)).digest('hex');
const REPO_CATALOG = join(root, 'src/modules/contentPacks/generated/catalog.json');
const REPO_CATALOG_SHA = await sha(REPO_CATALOG);

// ── 合成数据（id 一律 zz_test／zztest. 前缀，不用任何真实剧情前缀）──────────────────────────────
const LINE = 'zz_test', PACK_ID = 'zztest.line', PACK_DIR = 'zz-test-line', STAGE = 'zztest.stage_01';
const CH1 = 'zztest.chapter.part_1', CH2 = 'zztest.chapter.part_2', REGION = '测试国';
const EV = s => `zztest.event.${s}`;
const RAIL_BASE = [EV('arrive'), EV('inquire'), EV('settle')], EXTRA = EV('aside');
const RAIL_FULL = [EV('arrive'), EV('inquire'), EXTRA, EV('settle')];
// 地点与主角只能用 mod-kit 里已有的实体（新地点进不了包，见缺口清单）
const LOC = 'liuchao.location.yong', PC = 'liuchao.character.cheng_zongyang';
const EXPECTED_LINES = ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin', 'taiquan'];

const action = (id, label) => ({ id, label, actionText: `我${label}。`, timeCost: 1,
  outcomeText: { success: `${label}，成了。`, partial: `${label}，只成了一半。`, failure: `${label}，没成。` } });
const doneFlag = slug => [{ path: `flags.event.zztest_${slug}.done`, operator: 'eq', value: true }];
const never = [{ path: 'flags.zztest.never', operator: 'eq', value: true }];
const event = (slug, name, conditions) => ({
  id: EV(slug), name, description: `合成测试事件：${name}。`, axisId: null, axisMethod: 'zz-test-no-axis', axisAnchor: '合成验收数据', axisSeq: 9000,
  axisBeat: `合成：${name}`, critical: true, conditions, completion: doneFlag(slug), relatedCharacterIds: [PC], locationId: LOC,
  objective: `合成目标：${name}`, playerCompletionContract: { kind: 'objective_action', settleOn: ['success'], actions: [action(`zztest_${slug}`, name)] },
});
/** 合成关：world／canon／content／rules 借秦关（包内关，均为普通字符串）；开场、章、事件全是合成的。 */
function syntheticStage(template) {
  const events = [event('arrive', '抵达测试城', []), event('inquire', '打听消息', doneFlag('arrive')), event('aside', '岔路一拍', doneFlag('inquire')),
    event('settle', '了结此事', doneFlag('aside')), event('fail', '败走', never), event('rumor', '口信', never)];
  const chapters = [
    { id: CH1, title: '测试章一', summary: '合成。', completion: [{ path: 'flags.chapter.zztest.part_1.done', operator: 'eq', value: true }], eventIds: [EV('arrive'), EV('inquire')] },
    { id: CH2, title: '测试章二', summary: '合成。', activation: [{ path: 'flags.chapter.zztest.part_1.done', operator: 'eq', value: true }],
      completion: [{ path: 'flags.chapter.zztest.part_2.done', operator: 'eq', value: true }], eventIds: [EXTRA, EV('settle'), EV('fail'), EV('rumor')] },
  ];
  const initialFlags = Object.fromEntries([...['part_1', 'part_2'].flatMap(c => [[`chapter.zztest.${c}.started`, true], [`chapter.zztest.${c}.done`, false]]),
    ...events.map(e => [`event.zztest_${e.id.split('.').pop()}.done`, false])]);
  const preset = JSON.parse(JSON.stringify(template.scenario.opening.creationPreset).replace(/\{"\$text":"[^"]+"\}/g, '"合成说明"'));
  return {
    schema: template.schema, version: template.version,
    manifest: { id: STAGE, name: '合成测试关', version: '1.0.0', author: '结构验收（合成）', description: '合成国家线 zz_test 的唯一一关。', axisSeqLo: null, axisSeqHi: null,
      eventIdContract: 'append-only-frozen', prevStageId: null, prevStageName: null, nextStageId: null, nextStageName: null },
    world: template.world, canon: template.canon, content: template.content, rules: template.rules,
    scenario: { opening: { ...template.scenario.opening, text: '合成开场：你来到测试城。', creationPreset: preset, locationId: LOC }, initialFlags, events, chapters },
  };
}
const contract = e => ({ eventId: e, mustReach: `合成：${e} 必达。`, completionEvidence: [], forbiddenInCanon: ['合成：不得跳拍'], allowedElaboration: '合成：可补细节。' });

/** 合成线包的全部文件（文件名 → 内容）。lineCompassEvents=false 时下一步表不写 eventId／closedWhen（两段编译的第一段，见用例 1）。 */
function syntheticPackFiles(template, { lineCompassEvents = true } = {}) {
  const steps = [{ id: 'zz_arrive', eventId: EV('arrive'), hintKey: 'lineCompass.zz_test.step.arrive' }, { id: 'zz_settle', eventId: EV('settle'), hintKey: 'lineCompass.zz_test.step.settle' }];
  return {
    'manifest.json': { schemaVersion: 1, id: PACK_ID, dependsOn: ['qingyu.core'], stages: ['stage-zztest.json'], texts: ['texts.json'], lineCompass: 'line-compass.json',
      nationLines: ['nation-lines.json'], mapEntries: ['map-entries.json'], mapRoutes: ['map-routes.json'], rails: ['rails.json'], railExtraBeats: ['rail-extra-beats.json'],
      stageMeta: ['stage-meta.json'], secondaryLines: ['secondary-lines.json'], compassConditions: ['compass-conditions.json'], lineCriticalEvents: ['line-critical-events.json'],
      contractRevisions: ['contract-revisions.json'], worldEvents: ['world-events.json'] },
    'stage-zztest.json': syntheticStage(template),
    'texts.json': {
      'lineCompass.zz_test.name': '测试国', 'lineCompass.zz_test.step.arrive': '去测试城看看', 'lineCompass.zz_test.step.settle': '把事了结',
      'mapEntry.zz_test.preview': '前往测试城。', 'mapEntry.zz_test.return.label': '返回{stage}', 'mapEntry.zz_test.return.narrative': '你回到了离开时的地方。', 'mapEntry.zz_test.return.chronicle': '返回「{stage}」',
      'zztest.rail.arrive.mustReach': '合成：抵达测试城。',
      'worldEvent.zzTestWorld.label': '开启测试世界事件', 'worldEvent.zzTestWorld.warning': '合成警告', 'worldEvent.zzTestWorld.transition': '合成过渡', 'worldEvent.zzTestWorld.blocked': '合成：此处不可用',
    },
    'nation-lines.json': [{ lineId: LINE, order: 8, regions: [REGION], countsTowardClosedLines: true, failureClosureEvents: [EV('fail')] }],
    'line-compass.json': { version: 1, lines: [{ lineId: LINE, nameKey: 'lineCompass.zz_test.name', anchorLine: LINE,
      ...(lineCompassEvents ? { closedWhen: [{ path: `done.${EV('settle')}`, operator: 'eq', value: true }] } : {}),
      steps: lineCompassEvents ? steps : steps.map(({ eventId, ...s }) => s) }] },
    'map-entries.json': [{ id: LINE, stageId: STAGE, eventId: EV('arrive'), locationId: LOC, readyPath: 'compass.zzTestReady', previewTextId: 'mapEntry.zz_test.preview',
      returnLabelTextId: 'mapEntry.zz_test.return.label', returnTextId: 'mapEntry.zz_test.return.narrative', returnChronicleTextId: 'mapEntry.zz_test.return.chronicle' }],
    'map-routes.json': [{ id: 'zztest.route.yong_xianyang', fromId: LOC, toId: 'liuchao.location.xianyang', dayCost: 2, unlockWhen: [EV('arrive')] }],
    'compass-conditions.json': [{ id: 'zzTestReady', kind: 'closedLinesAtLeast', min: 1 }],
    'rails.json': [{ note: '合成 rail：三拍', id: 'zztest.rail', modId: STAGE, chapterId: CH1, orderedEventIds: RAIL_BASE,
      contracts: RAIL_BASE.map(e => e === EV('arrive') ? { ...contract(e), mustReach: { $text: 'zztest.rail.arrive.mustReach' } } : contract(e)) }],
    'rail-extra-beats.json': [{ note: '合成加拍', modId: STAGE, afterEventId: EV('inquire'), eventIds: [EXTRA], contracts: [contract(EXTRA)] }],
    'stage-meta.json': [{ stageId: STAGE, milestoneReward: { titles: ['测试城客'], note: '合成称号' },
      presentation: { defaultUiChapterId: CH1, chapters: { [CH1]: { mood: 'court' } }, events: { [EV('settle')]: { uiChapterId: CH2, mood: 'battle', objective: '合成：stageMeta 目标覆盖' } } } }],
    'secondary-lines.json': [{ after: 'tang', id: LINE, name: '测试国', kind: 'nation', anchorEventIds: [EV('arrive')], anchorLocationIds: [LOC], entryHint: '合成入口提示。', basis: '合成验收线。',
      nodes: [{ reviewSummary: '抵达测试城', status: 'ready', stageId: STAGE, eventId: EV('arrive') }, { reviewSummary: '了结此事', status: 'ready', stageId: STAGE, eventId: EV('settle') },
        { reviewSummary: '待扩', status: 'pending' }] }],
    'line-critical-events.json': [{ eventId: EV('settle'), lineId: LINE }],
    'contract-revisions.json': [{ eventId: EV('arrive'), from: '00000000', to: '11111111', note: '合成迁移（只过编译期形状校验）' }],
    'world-events.json': [{ id: 'zzTestWorld', eventId: EV('world_start'), actionId: 'start_zz_test_world', startedExtensionKey: 'zzTestWorldStarted', stageId: STAGE,
      availableWhen: 'stageRailSettled', blockedInStageIds: [], closes: [{ lineId: LINE, stageId: STAGE, messageEventId: EV('rumor') }],
      textKeys: { label: 'worldEvent.zzTestWorld.label', warning: 'worldEvent.zzTestWorld.warning', transition: 'worldEvent.zzTestWorld.transition', blocked: 'worldEvent.zzTestWorld.blocked' } }],
  };
}
const writePack = async (packsDir, files) => {
  const dir = join(packsDir, PACK_DIR); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  for (const [f, v] of Object.entries(files)) await writeFile(join(dir, f), JSON.stringify(v, null, 1) + '\n');
};

// ── 副本 ────────────────────────────────────────────────────────────────────────────────────────
const copy = await mkdtemp(join(tmpdir(), 'xiantu-synthetic-line-'));
test.after(() => rm(copy, { recursive: true, force: true }));
for (const x of ['src', 'mod-kit', 'scripts', 'package.json']) await cp(join(root, x), join(copy, x), { recursive: true });
await symlink(join(root, 'node_modules'), join(copy, 'node_modules'), 'dir');
const PACKS = join(copy, 'src/modules/contentPacks/packs');
const CATALOG = join(copy, 'src/modules/contentPacks/generated/catalog.json');
const INDEX = 'mod-kit/entity-catalog/index.json';
const TEMPLATE = await read(join(PACKS, 'qin/stage-qin-xianyang.json'));
const node = (...args) => spawnSync(process.execPath, args, { cwd: copy, encoding: 'utf8' });
const errText = r => `${r.stdout}\n${r.stderr}`.split('\n').filter(l => !/^\s+at /.test(l)).join('\n');
let built = false;

test('1 只加数据：线包目录 + 两段编译 + 重建实体索引后，content-packs 编译与 --check 全绿', async () => {
  // 【缺口 G1】一次写全、单次编译不行：下一步表校验（validator.validateLineCompassTable → knownEventIds）只认 mod-kit 实体索引里的事件，
  // 而索引由 build-entity-index.mjs 从 catalog 派生——新包关的事件第一次编译时还不在索引里。编译失败会恢复旧 catalog。
  await writePack(PACKS, syntheticPackFiles(TEMPLATE));
  const once = node('scripts/content-packs.mjs');
  assert.notEqual(once.status, 0, '单次编译居然通过了：G1 已修，把这一段改成单次编译');
  assert.match(errText(once), /invalid lineCompass: .*Unknown event id \\"zztest\.event\.arrive\\"/);
  assert.equal(await sha(CATALOG), REPO_CATALOG_SHA, '失败的编译应恢复原 catalog');
  // 现行绕法：第一段下一步表不写 eventId／closedWhen → 编译 → 重建实体索引（写 mod-kit 生成物）→ 第二段写全 → 编译 → --check
  await writePack(PACKS, syntheticPackFiles(TEMPLATE, { lineCompassEvents: false }));
  let r = node('scripts/content-packs.mjs'); assert.equal(r.status, 0, errText(r));
  r = node('scripts/build-entity-index.mjs'); assert.equal(r.status, 0, errText(r));
  await writePack(PACKS, syntheticPackFiles(TEMPLATE));
  r = node('scripts/content-packs.mjs'); assert.equal(r.status, 0, errText(r));
  r = node('scripts/content-packs.mjs', '--check'); assert.equal(r.status, 0, errText(r));
  // 加的数据文件清单（全部在线包目录里）
  assert.deepEqual((await readdir(join(PACKS, PACK_DIR))).sort(), Object.keys(syntheticPackFiles(TEMPLATE)).sort());
  const catalog = await read(CATALOG);
  assert.deepEqual(catalog.nationLines.map(l => l.lineId), [...EXPECTED_LINES, LINE]);
  assert.ok(catalog.stages.some(s => s.manifest.id === STAGE));
  assert.deepEqual(catalog.rails.find(x => x.modId === STAGE).orderedEventIds, RAIL_FULL, '加拍已并进包 rail');
  built = true;
});

test('2 副本里被改动的非包文件只有两个生成物：catalog.json 与 mod-kit 实体索引（后者只多了合成线的行）', async () => {
  assert.ok(built);
  const changed = [];
  const walk = async rel => {
    for (const d of await readdir(join(copy, rel), { withFileTypes: true })) {
      const p = join(rel, d.name);
      if (d.isDirectory()) { if (d.name !== 'node_modules') await walk(p); continue; }
      const theirs = join(root, p);
      const same = await sha(join(copy, p)).then(async a => a === await sha(theirs).catch(() => null));
      if (!same) changed.push(p);
    }
  };
  for (const x of ['src', 'mod-kit', 'scripts']) await walk(x);
  const packFiles = changed.filter(p => p.startsWith(`src/modules/contentPacks/packs/${PACK_DIR}/`));
  assert.equal(packFiles.length, Object.keys(syntheticPackFiles(TEMPLATE)).length);
  assert.deepEqual(changed.filter(p => !packFiles.includes(p)).sort(), [INDEX, 'src/modules/contentPacks/generated/catalog.json'].sort());
  // 副本 src 的 .ts/.vue 与仓库逐字节相同（上面的遍历已覆盖；这里单独点名，免得以后放宽 changed 的口径时漏掉）
  assert.ok(!changed.some(p => /\.(ts|vue)$/.test(p)));
  // 【缺口 G1】实体索引是 mod-kit 下的生成物，content-packs 不生成它；新增行全是合成线的
  const key = e => `${e.kind}:${e.id}`;
  const before = new Map((await read(join(root, INDEX))).entries.map(e => [key(e), JSON.stringify(e)]));
  const after = new Map((await read(join(copy, INDEX))).entries.map(e => [key(e), JSON.stringify(e)]));
  assert.deepEqual([...before.keys()].filter(k => !after.has(k) || after.get(k) !== before.get(k)), [], '索引里原有行不删不改');
  const added = [...after.keys()].filter(k => !before.has(k));
  const ours = added.filter(k => /zz_?test|zzTest/.test(k));
  assert.deepEqual(ours.filter(k => k.startsWith('event:')).sort(), [EXTRA, ...RAIL_BASE, EV('fail'), EV('rumor')].map(e => `event:${e}`).sort());
  assert.ok(ours.includes(`line:${LINE}`) && ours.includes(`chapter:${CH1}`));
  // 其余新增行是仓库索引本身就落后于 catalog 的正文键（与本线无关；canon:build 会重建）
  const repoTexts = (await read(REPO_CATALOG)).texts;
  assert.ok(added.filter(k => !ours.includes(k)).every(k => k.startsWith('text:') && k.slice(5) in repoTexts));
});

// ── 运行时：从副本加载 TS（catalog 已是含合成线的那份）────────────────────────────────────────────
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': join(copy, 'src') } });
const M = p => jiti.import(join(copy, 'src', p));
const rt = save => save.世界.状态.剧本模组;

test('3 注册：国家线清单与顺序、地区映射、计入收束、二级线、下一步表、rail、章名、配乐、称号、目标、派生条件、世界事件', async () => {
  assert.ok(built);
  const nl = await M('modules/contentPacks/nationLines.ts');
  const reg = await M('modules/sceneModule/numbersRegistry.ts');
  assert.deepEqual([...nl.PACK_NATION_LINE_IDS], [...EXPECTED_LINES, LINE]);
  assert.deepEqual([...reg.NATION_LINE_IDS], [...EXPECTED_LINES, LINE]);
  assert.equal(nl.NATION_LINE_OF_REGION[REGION], LINE);
  assert.deepEqual([...nl.CLOSURE_TALLY_LINE_IDS], ['nanhuang', 'jin', 'song', 'han', 'tang', LINE]);
  assert.deepEqual(nl.FAILURE_CLOSURE_EVENTS[LINE], [EV('fail')]);
  const numbers = await M('modules/sceneModule/numbers.ts');
  assert.deepEqual(reg.validateAgainstRegistry(numbers.GAME_NUMBERS), [], 'numbers 冷启动校验不因新线报错');

  const SL = await M('modules/scenarioMods/secondaryLines.ts');
  const ids = SL.SECONDARY_LINES.map(l => l.id);
  assert.equal(ids.at(-1), LINE); assert.equal(ids[ids.indexOf(LINE) - 1], 'tang', 'after: tang');
  const LC = await M('modules/scenarioMods/lineCompass.ts');
  assert.deepEqual(LC.lineCompassTable().lines.map(l => l.lineId), [...EXPECTED_LINES, LINE], '右栏线顺序跟 nationLines');
  assert.equal(LC.lineOfEvent(EV('arrive'), STAGE), LINE, '下一步表里写了的事件归本线');
  assert.equal(SL.LINE_CRITICAL_EVENTS[EV('settle')], LINE, 'lineCriticalEvents 并入承重表');

  const CR = await M('modules/scenarioMods/canonRail.ts');
  assert.deepEqual(CR.getCanonRailProfile({ modId: STAGE })?.orderedEventIds, RAIL_FULL);
  assert.equal(CR.CANON_RAIL_PROFILES.filter(r => r.modId === STAGE).length, 1);
  assert.equal(CR.isDefaultLineQuarantinedStageId(STAGE), false);
  assert.equal(CR.getCanonRailProfile({ modId: STAGE }).contracts[0].mustReach, '合成：抵达测试城。', '$text 已替换');

  const NV = await M('modules/scenarioMods/eventNarrativeView.ts');
  assert.equal(NV.storyChapterTitle(STAGE, EV('inquire'), '回退'), '测试章一', 'defaultUiChapterId');
  assert.equal(NV.storyChapterTitle(STAGE, EV('settle'), '回退'), '测试章二', '事件 uiChapterId');
  const MU = await M('utils/musicLibrary.ts');
  assert.equal(MU.resolveMusicMoodForChapter(CH1), 'court');
  assert.equal(MU.resolveMusicMoodForScenario(CH2, [{ id: EV('settle') }]), 'battle');
  const MR = await M('modules/scenarioMods/milestoneRewards.ts');
  assert.deepEqual(MR.milestoneRewardFor(STAGE)?.titles, ['测试城客']);
  const FQ = await M('modules/scenarioMods/fixedQuestObjectives.ts');
  assert.equal(FQ.resolveFixedQuestObjective({ id: EV('settle'), objective: '原目标' }), '合成：stageMeta 目标覆盖');
  assert.equal(FQ.resolveFixedQuestObjective({ id: EV('inquire'), objective: '原目标' }), '原目标');

  const LD = await M('modules/scenarioMods/ledgerConditions.ts');
  assert.deepEqual([...LD.COMPASS_DERIVED_IDS], ['anyLineClosed', 'qinEntryReady', 'zzTestReady']);
  const WE = await M('modules/scenarioMods/worldEvents.ts');
  assert.deepEqual(WE.WORLD_EVENTS.map(w => w.id), ['heimohaiFestival', 'zzTestWorld']);
  const P = await M('modules/contentPacks/index.ts');
  assert.ok(P.CONTENT_PACKS.mapRoutes.some(r => r.id === 'zztest.route.yong_xianyang'));
  assert.ok(P.CONTENT_PACKS.contractRevisions.some(r => r.eventId === EV('arrive')));
  // 包内关进内置模组库：builtins/index.ts 拼接 CONTENT_PACKS.stages（require.context 在 Node 下不可用，只能读源码核对这一处）
  assert.match(await readFile(join(copy, 'src/modules/scenarioMods/builtins/index.ts'), 'utf8'), /\.\.\.CONTENT_PACKS\.stages\]/);
});

test('4 计入收束：记为已收束后「已收束 N 条线」加一，numbers 不改；入秦条件与本线派生条件随之变化', async () => {
  assert.ok(built);
  const LO = await M('modules/scenarioMods/lineOutcomes.ts');
  const LD = await M('modules/scenarioMods/ledgerConditions.ts');
  const base = { modId: 'lcq.stage_01', flags: { 'line.nanhuang.outcome': 'resolved', 'line.jin.outcome': 'resolved' }, completedEventIds: [], chronicle: [] };
  const plus = { ...base, flags: { ...base.flags, [`line.${LINE}.outcome`]: 'resolved' } };
  assert.equal(LO.nationClosedLineCount(base), 2);
  assert.equal(LO.nationClosedLineCount(plus), 3);
  const v = (path, runtime) => LD.resolveLedgerPath(path, runtime, { 世界: { 状态: { 剧本模组: runtime } }, 系统: { 扩展: {} } })?.value;
  assert.equal(v('compass.qinEntryReady', base), false, '阈值 3：两条不够');
  assert.equal(v('compass.qinEntryReady', plus), true, '合成线计入后够 3 条');
  assert.equal(v('compass.zzTestReady', { ...base, flags: {} }), false);
  assert.equal(v('compass.zzTestReady', base), true);
  // 失败收束事件：编年史里有 zztest.event.fail 即按 unresolved 收束
  const failed = { modId: STAGE, flags: {}, completedEventIds: [EV('fail')], chronicle: [], events: [{ id: EV('fail') }] };
  assert.equal(LO.lineClosed(LINE, failed), true);
  // 【缺口 G4】判档线（numbers story.lineOutcome.judgedLines／failEndsGame）不含新线：太泉解锁的「已收束判档线」不数它
  assert.deepEqual(LO.closedLineIds(plus), ['nanhuang', 'jin']);
});

test('5 开局：从合成关 strict initializer 开局，沿 rail 推进到最后一拍，不抛错；线卡、收束、世界事件随之变化', async () => {
  assert.ok(built);
  const P = await M('modules/contentPacks/index.ts');
  const R = await M('modules/scenarioMods/runtime.ts');
  const I = await M('modules/scenarioMods/strictInitializer.ts');
  const DR = await M('utils/dataRepair.ts');
  const T = await M('modules/scenarioMods/actionTime.ts');
  const CR = await M('modules/scenarioMods/canonRail.ts');
  const LC = await M('modules/scenarioMods/lineCompass.ts');
  const LO = await M('modules/scenarioMods/lineOutcomes.ts');
  const WE = await M('modules/scenarioMods/worldEvents.ts');
  const mod = P.applyContentPackOverlays(P.CONTENT_PACKS.stages.find(s => s.manifest.id === STAGE));
  const save = I.applyStrictScenarioInitializationToSave(DR.createMinimalSaveDataV3(), I.buildStrictScenarioInitialization(mod, '2026-11-01T00:00:00.000Z'));
  save.世界 = R.advanceScenarioRuntime(save).saveData.世界;
  assert.equal(rt(save).modId, STAGE);
  assert.deepEqual(rt(save).activeEventIds, [EV('arrive')]);
  const rail = CR.getCanonRailProfile(rt(save)).orderedEventIds;
  assert.deepEqual(rail, RAIL_FULL);
  const focused = [], cards = [];
  let s = save;
  for (let n = 0; n < 40; n++) {
    const state = rt(s);
    if (rail.every(id => state.completedEventIds.includes(id))) break;
    const focus = R.getScenarioFocusEvent(state);
    focused.push(focus?.id);
    cards.push(LC.lineCompassView(s, { focusEventId: focus?.id, compassPointer: () => '' }).current?.lineId ?? null);
    const action = R.getCurrentStoryEventActions(s).find(a => focus?.playerCompletionContract?.actions.some(c => c.id === a.actionId));
    assert.ok(action, `第 ${n} 步 ${focus?.id} 没有合同动作`);
    assert.ok(R.recordStoryEventStructuredAction(s, action).attempted);
    T.settleActionTime(s, { action_time: { tier: '片刻' } }, { timeActionId: `synthetic-line:${n}` }, null, false, false);
    s = R.advanceScenarioRuntime(s).saveData;
  }
  const end = rt(s);
  assert.deepEqual(focused, RAIL_FULL, '焦点按 rail 顺序逐拍走（含加拍）');
  assert.deepEqual(end.completedEventIds, RAIL_FULL);
  assert.equal(!!end.gameOver, false);
  assert.equal(end.flags['chapter.zztest.part_1.done'], true);
  assert.deepEqual(cards.slice(1), [LINE, LINE, LINE], '走进本线后右栏当前线卡是本线');
  assert.equal(LO.lineClosed(LINE, end), true, 'closedWhen done.zztest.event.settle');
  assert.equal(LO.nationClosedLineCount(end), 1);
  assert.equal(LC.lineCompassView(s, { compassPointer: () => '' }).current, null, '收束后不再是当前线');
  const view = WE.worldEventViews(s).find(x => x.id === 'zzTestWorld');
  assert.deepEqual({ label: view.label, available: view.view.available }, { label: '开启测试世界事件', available: true }, 'rail 走完后本线声明的世界事件可开');
});

test('6 地图入口：正式 stage_01 新档在派生条件成立后可经地图入口进合成关', async () => {
  assert.ok(built);
  const P = await M('modules/contentPacks/index.ts');
  const R = await M('modules/scenarioMods/runtime.ts');
  const I = await M('modules/scenarioMods/strictInitializer.ts');
  const DR = await M('utils/dataRepair.ts');
  const ME = await M('modules/scenarioMods/mapEntries.ts');
  const dataDir = join(copy, 'src/modules/scenarioMods/builtins/data');
  const mods = [...await Promise.all((await readdir(dataDir)).filter(f => f.endsWith('.json')).sort().map(async f => P.applyContentPackOverlays(await read(join(dataDir, f))))),
    ...P.CONTENT_PACKS.stages.map(s => P.applyContentPackOverlays(s))];
  const save = I.applyStrictScenarioInitializationToSave(DR.createMinimalSaveDataV3(), I.buildStrictScenarioInitialization(mods.find(m => m.manifest.id === 'lcq.stage_01'), '2026-11-01T00:00:00.000Z'));
  save.世界 = R.advanceScenarioRuntime(save).saveData.世界;
  const entry = P.CONTENT_PACKS.mapEntries.find(e => e.id === LINE);
  assert.equal(ME.mapEntryReady(save, entry), false, '没有收束线时 compass.zzTestReady 不成立');
  rt(save).flags['line.nanhuang.outcome'] = 'resolved';
  assert.equal(ME.mapEntryReady(save, entry), true);
  const r = I.transitionToMapEntryStage(save, entry, mods);
  assert.equal(r.ok, true, r.reason);
  assert.equal(rt(r.saveData).modId, STAGE);
  assert.equal(r.saveData.系统.扩展.mapEntryResume.entryId, LINE);
});

test('7 现状钉子：加线仍要改的非包文件（缺口修掉后这些断言变红，改成正向断言）', async () => {
  assert.ok(built);
  const LC = await M('modules/scenarioMods/lineCompass.ts');
  const RL = await M('modules/scenarioMods/reputationLedger.ts');
  // 【缺口 G2】关 → 地区在 mod-kit/entity-ledger/overrides.json 的 stageRegions，包不能声明：新关没有地区，lineOfStage 认不出本线
  assert.equal(RL.STAGE_REGION[STAGE], undefined);
  assert.equal(LC.lineOfStage(STAGE), undefined);
  assert.equal(LC.lineOfEvent(EV('inquire'), STAGE), undefined, '下一步表没写的拍不归任何线');
  // 【缺口 G1·运行时】跨关 done.*（编年史）只认实体索引里的事件：索引没重建时，离开合成关后本线事件不算完成
  const stale = createJiti(import.meta.url, { interopDefault: true, moduleCache: false, alias: { '@': join(root, 'src') } });
  const repoRules = await stale.import(join(root, 'src/modules/scenarioMods/playerLedgerRules.ts'));
  const away = { modId: 'lcq.stage_01', completedEventIds: [], chronicle: [{ type: 'event', id: `chronicle.${STAGE}.${EV('settle')}`, stageId: STAGE, sequence: 1 }] };
  assert.deepEqual(repoRules.orderedDoneEventIds(away), [], '仓库索引（未重建）下跨关读不到合成线事件');
  const copyRules = await M('modules/scenarioMods/playerLedgerRules.ts');
  assert.deepEqual(copyRules.orderedDoneEventIds(away), [EV('settle')], '副本重建索引后读得到');
  // 包格式不适用于新线的三种，各钉一条现状
  const { compileContentPacks } = await import(pathToFileURL(join(copy, 'scripts/content-packs.mjs')).href);
  const neg = await mkdtemp(join(copy, 'src/modules/contentPacks/_neg-'));
  try {
    const tryPack = async extra => {
      const dir = join(neg, String(Math.random()).slice(2)); await cp(PACKS, dir, { recursive: true });
      const m = await read(join(dir, PACK_DIR, 'manifest.json'));
      for (const [k, [file, value]] of Object.entries(extra)) { m[k] = [file]; await writeFile(join(dir, PACK_DIR, file), JSON.stringify(value)); }
      await writeFile(join(dir, PACK_DIR, 'manifest.json'), JSON.stringify(m));
      return compileContentPacks({ packsDir: dir });
    };
    // 【缺口 G5】结局实体在 mod-kit/entity-catalog/endings.json，包不能新建：新线的结局编不过
    await assert.rejects(tryPack({ endings: ['endings.json', [{ endingId: 'zztest.ending.closed', key: 'E99' }]] }), /endings zztest\.ending\.closed: unknown ending entity/);
    // 【不适用 G6】常驻入口只有 algae／rejoin 两种、各全局一条（都已被昭南占用）
    await assert.rejects(tryPack({ persistentEntries: ['persistent-entries.json', [{ kind: 'rejoin', beatId: 'x', eventId: EV('arrive'), stageId: STAGE }]] }), /persistentEntries rejoin: declared twice/);
    // 【不适用 G7】行旅切片只有 TS 里写死 key 的两处读取方（nanhuang、wuyuan）；新 key 编得进也没人读，这里只钉读取方
    const callers = [];
    for (const f of ['travel/defs/qingyuNanhuang.ts', 'travel/defs/qingyuWuyuanZones.ts', 'wuyuanOpenWorldSlice.ts'])
      if (/resolveOpenWorldSlice\(CONTENT_PACKS\.openWorldSlices/.test(await readFile(join(copy, 'src/modules/scenarioMods', f), 'utf8'))) callers.push(f);
    assert.equal(callers.length, 3);
  } finally { await rm(neg, { recursive: true, force: true }); }
});

test('8 负例：缺 dependsOn、地区重复登记、rail 引用不存在的事件、依赖不存在的包，编译报错', async () => {
  assert.ok(built);
  const { compileContentPacks } = await import(pathToFileURL(join(copy, 'scripts/content-packs.mjs')).href);
  const neg = await mkdtemp(join(copy, 'src/modules/contentPacks/_neg-'));
  try {
    let n = 0;
    const variant = async edit => {
      const dir = join(neg, String(n++)); await cp(PACKS, dir, { recursive: true });
      const files = syntheticPackFiles(TEMPLATE); edit(files); await writePack(dir, files);
      return () => compileContentPacks({ packsDir: dir });
    };
    // 正向对照：原样编译通过
    assert.ok((await (await variant(() => {}))()).nationLines.some(l => l.lineId === LINE));
    // 缺 dependsOn：二级线锚到秦包的事件，本包只依赖核心包
    const QIN_EVENT = 'liuchao.event.qin_hook_fangshi_rumor';
    await assert.rejects(await variant(f => f['secondary-lines.json'][0].anchorEventIds.push(QIN_EVENT)), new RegExp(`${PACK_ID.replace('.', '\\.')} references ${QIN_EVENT.replaceAll('.', '\\.')} owned by qingyu\\.qin; add dependsOn`));
    assert.ok(await (await variant(f => { f['secondary-lines.json'][0].anchorEventIds.push(QIN_EVENT); f['manifest.json'].dependsOn.push('qingyu.qin'); }))(), '补上 dependsOn 即通过');
    // 地区重复登记：秦国已归 qin 线
    await assert.rejects(await variant(f => { f['nation-lines.json'][0].regions = ['秦国']; }), /nation line zz_test: region 秦国 also registered to qin/);
    // rail 引用不存在的事件（报错文案不点事件名）
    await assert.rejects(await variant(f => { f['rails.json'][0].orderedEventIds = [...RAIL_BASE, EV('no_such')]; f['rails.json'][0].contracts.push(contract(EV('no_such'))); }), /rail zztest\.stage_01: orderedEventIds must be distinct events of the stage/);
    // 依赖不存在的包
    await assert.rejects(await variant(f => f['manifest.json'].dependsOn.push('zztest.missing')), /zztest\.line\.dependsOn: unknown pack zztest\.missing/);
  } finally { await rm(neg, { recursive: true, force: true }); }
});

test('9 仓库未被污染：仓库 catalog 逐字节未变，仓库 packs 里没有合成线目录', async () => {
  assert.equal(await sha(REPO_CATALOG), REPO_CATALOG_SHA);
  assert.ok(!(await readdir(join(root, 'src/modules/contentPacks/packs'))).includes(PACK_DIR));
  assert.equal(relative(root, copy).startsWith('..'), true, '副本在仓库外');
});
