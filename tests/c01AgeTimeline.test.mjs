import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadTs } from './loadTs.mjs';
import { compileTimeline } from '../scripts/content-pack-timeline.mjs';
import { auditC01Ages, c01AuditInputs } from '../scripts/audit-c01-ages.mjs';
import { freshPrologueCheckpoint } from '../scripts/generate-prologue-checkpoint.mjs';

// C01 年龄与时间线（设计稿 C01 v5 §1.8 T1–T13；规则见 docs/COMPLIANCE-REQUIREMENTS.md C01 段 A1–A20）。
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const CR = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const TL = await loadTs('../src/modules/scenarioMods/timelineInserts.ts');
const REL = await loadTs('../src/modules/scenarioMods/relationships.ts');
const LR = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const PL = await loadTs('../src/modules/scenarioMods/promptLayers.ts');
const F = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const { buildNarrativePromptState } = await loadTs('../src/utils/narrativePromptState.ts');

const TIMELINE = P.CONTENT_PACKS.timeline;
const INSERT_ID = 'qingyu.insert.grassland_four_years';
const RECEIPT = `author:timeline:${INSERT_ID}:y4`;
const withYears = years => ({ ...TIMELINE, inserts: TIMELINE.inserts.map(x => ({ ...x, years })) });
const without = () => ({ ...TIMELINE, inserts: [] });
const ID = {
  wangZhe: 'lcq.character.wang_zhe', yueShuang: 'lcq.character.yue_shuang', leMingzhu: 'liuchao.character.le_mingzhu',
  shenWanying: 'liuchao.character.shen_wan_ying', huoQubing: 'liuchao.character.huo_qu_bing', yunRuyao: 'liuchao.character.yun_ru_yao',
  ningYu: 'liuchao.character.ning_yu', panJinlian: 'liuchao.character.pan_jinlian',
};
const meetYear = (id, timeline = TIMELINE) => TL.timelineGameYearAt(CR.getRegistryDebutAxisSeq(id), timeline);
const meetAge = (id, timeline = TIMELINE) => CR.gateAgeNow(id, meetYear(id, timeline), timeline);
const yearMinutes = () => { const c = N.GAME_NUMBERS.story.actionTime.calendar; return c.daysPerMonth * c.monthsPerYear * 1440; };
const rt = save => save.世界.状态.剧本模组;
const auditWith = patch => auditC01Ages({ ...c01AuditInputs(), ...patch });
const open = gate => ({ inputHit: true, present: true, favor: 100, ...gate });

test('T1 基线（四年、挂在王哲陨落后进城路线前）：王哲 68、月霜 18 拨钟后 22、乐明珠 19、申婉盈≥18；月霜进下限抬升清单；乐明珠门可开', () => {
  assert.equal(N.GAME_NUMBERS.story.actionTime.prologueYears, 4);
  assert.equal(TIMELINE.canonPresentYear, 220);
  assert.deepEqual(TIMELINE.inserts.map(x => [x.id, x.years, x.anchor.afterAxisSeq, x.anchor.beforeAxisSeq]), [[INSERT_ID, 4, 30, 31]]);
  assert.equal(meetAge(ID.wangZhe), 68);
  assert.equal(meetYear(ID.yueShuang), 220);
  assert.equal(meetAge(ID.yueShuang), 18, '月霜原著 15 岁见面，由下限抬到 18');
  assert.equal(CR.gateAgeNow(ID.yueShuang, 224), 22, '拨钟后照日历长');
  assert.equal(meetYear(ID.leMingzhu), 224);
  assert.equal(meetAge(ID.leMingzhu), 19);
  assert.ok(meetAge(ID.shenWanying) >= 18);
  const report = auditWith({});
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.under18, []);
  assert.ok(report.lifted.some(x => x.includes(ID.yueShuang)));
  assert.ok(PL.privateGateOpen(open({ ageNow: CR.gateAgeNow(ID.leMingzhu, 224) })));
});

test('T2 改 3 年：乐明珠见面 18，月霜、王哲不变；不改卡（总表出生年不变）', () => {
  const t = withYears(3);
  assert.equal(meetAge(ID.leMingzhu, t), 18);
  assert.equal(meetAge(ID.yueShuang, t), 18);
  assert.equal(meetAge(ID.wangZhe, t), 68);
  assert.equal(json('src/modules/scenarioMods/builtins/character-registry.json').characters.find(c => c.id === ID.leMingzhu).staticProfile.birthYear, 205);
  assert.deepEqual(auditWith({ timeline: t }).under18, []);
});

test('T3/T4 改 0 年或删掉插入事件：乐明珠、霍去病、云如瑶被下限抬到 18 并进抬升清单；门照开；开局已过年数 0；s02_04 兜底不触发', () => {
  for (const t of [withYears(0), without()]) {
    for (const id of [ID.leMingzhu, ID.huoQubing, ID.yunRuyao, ID.yueShuang]) assert.equal(meetAge(id, t), 18, id);
    const report = auditWith({ timeline: t });
    for (const id of [ID.leMingzhu, ID.huoQubing, ID.yunRuyao, ID.yueShuang]) assert.ok(report.lifted.some(x => x.includes(id)), id);
    assert.deepEqual(report.under18, []);
    assert.ok(PL.privateGateOpen(open({ ageNow: CR.gateAgeNow(ID.leMingzhu, 220, t) })));
  }
  const event = P.CONTENT_PACKS.overlays.find(o => o.stageId === 'lcq.stage_02').events.find(e => e.id === 'lcq.event.s02_04');
  const save = { 元数据: { 时间: { 年: 220, 月: 3, 日: 1, 小时: 9, 分钟: 0 } }, 系统: { 扩展: {} }, 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_02', events: [event], completedEventIds: [] } } } };
  assert.deepEqual(TL.applyTimelineInserts(save, { timeline: without(), reachedAxisSeq: event.axisSeq }), []);
  assert.equal(save.元数据.时间.年, 220);
  assert.equal(TL.timelineConfig().inserts.reduce((sum, x) => sum + TL.timelineAppliedYears(save, x), 0), 0);
});

test('T5 再插一个 2 年事件（在 lyl 线之前）：lyl 线人物再 +2，lcq 线不变', () => {
  const lylLo = json('src/modules/scenarioMods/builtins/data/lyl.jiangzhou_retreat.json').manifest.axisSeqLo;
  const t = { ...TIMELINE, inserts: [...TIMELINE.inserts, { id: 'test.insert.two_years', anchor: { afterAxisSeq: lylLo - 1, beforeAxisSeq: lylLo }, years: 2, order: 0 }] };
  assert.equal(meetYear(ID.huoQubing, t), meetYear(ID.huoQubing) + 2);
  assert.equal(meetAge(ID.huoQubing, t), meetAge(ID.huoQubing) + 2);
  assert.equal(meetAge(ID.leMingzhu, t), meetAge(ID.leMingzhu));
  assert.equal(meetAge(ID.wangZhe, t), meetAge(ID.wangZhe));
});

test('T6 旧档对账：总表人物出生日期按当前时间线重写（改时间线后跟着变），临时 NPC 不动', () => {
  const save = { 元数据: { 时间: { 年: 224, 月: 1, 日: 1 } }, 社交: { 关系: {
    乐明珠: { 角色ID: ID.leMingzhu, 出生日期: { 年: 210, 月: 1, 日: 1 } },
    路人: { 出生日期: { 年: 199, 月: 5, 日: 3 } },
  } } };
  assert.deepEqual(REL.reconcileRegistryBirthdates(save), ['乐明珠']);
  assert.equal(save.社交.关系.乐明珠.出生日期.年, 205);
  assert.deepEqual(save.社交.关系.路人.出生日期, { 年: 199, 月: 5, 日: 3 });
  assert.deepEqual(REL.reconcileRegistryBirthdates(save), [], '幂等');
  REL.reconcileRegistryBirthdates(save, without());
  assert.equal(save.社交.关系.乐明珠.出生日期.年, 202, '删掉插入事件后有效出生年跟着变');
});

test('T7 私密门不读存档年龄：存档出生日期折算 12 岁，但总表现算满 18 → 门开；两条链路（提示词与状态 JSON）同一道门', () => {
  const ageNow = CR.gateAgeNow(ID.ningYu, 220);
  assert.equal(ageNow, 24);
  assert.ok(PL.privateGateOpen(open({ ageNow })));
  const storyContext = readFileSync(new URL('../src/modules/scenarioMods/storyContext.ts', import.meta.url), 'utf8');
  const promptState = readFileSync(new URL('../src/utils/narrativePromptState.ts', import.meta.url), 'utf8');
  for (const source of [storyContext, promptState]) {
    assert.match(source, /ageNow: gateAgeNow\(/);
    assert.doesNotMatch(source, /gateAgeNow\([^)]*出生日期/, '门不读存档出生日期');
  }
});

test('T8 现算 17（人为让下限失效）：门不开只留 hardLimits，改发未满 18 约束句；构建期口径甲列出、口径乙为空', async () => {
  assert.equal(PL.privateAgeBlocked(17), true);
  assert.equal(PL.privateGateOpen(open({ ageNow: 17 })), false);
  const { findIntimacyProfile } = await loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
  const profile = findIntimacyProfile('凝羽');
  assert.deepEqual(PL.projectIntimacyLines(profile, open({ ageNow: 17 })), []);
  assert.ok(profile.hardLimits.length > 0);
  assert.match(PL.privateAgeConstraint('now', '凝羽'), /^凝羽现年未满十八岁：不开私密层/);
  // 构建期口径乙：下限之后首登仍不满 18 才报；有首登记录时下限必然兜住，正常数据为空
  const registry = c01AuditInputs().registry.map(e => e.id === ID.leMingzhu ? { ...e, staticProfile: { ...e.staticProfile, birthYear: 215 } } : e);
  const report = auditWith({ registry });
  assert.deepEqual(report.under18, []);
  assert.ok(report.lifted.some(x => x.includes(ID.leMingzhu)), '原著口径不满 18 的进抬升清单（口径甲）');
});

test('T9 缺出生年：按满 18 处理（记 LCQ-NAR-010），门照普通规则；canon:build 报缺，不关门', () => {
  const registry = c01AuditInputs().registry.map(e => e.id === ID.leMingzhu ? { ...e, staticProfile: { ...e.staticProfile, birthYear: undefined } } : e);
  const report = auditWith({ registry });
  assert.ok(report.missing.some(x => x.startsWith(ID.leMingzhu)));
  assert.equal(CR.gateAgeNow('liuchao.character.__not_in_registry__', 224), 18);
  assert.ok(PL.privateGateOpen(open({ ageNow: 18 })), '缺值按 18，不另设缺值关门');
  assert.equal(PL.privateGateOpen(open({ ageNow: 18, inputHit: false })), false, '普通规则照常：入口不中不开');
});

test('T10 临时 NPC（不在总表）：在场、输入命中、关系已确立 → 门开（默认成年，不读存档）；非剧本存档的私密信息同样过门', () => {
  assert.equal(CR.gateAgeNow('npc.temp.someone', 224), 18);
  assert.ok(PL.privateGateOpen(open({ ageNow: CR.gateAgeNow('npc.temp.someone', 224) })));
  const intimate = PL.PROMPT_LAYERS.intimateInputPatterns[0];
  const save = { 元数据: { 时间: { 年: 224 } }, 角色: {}, 世界: { 状态: {} }, 社交: { 关系: { 某人: { 名字: '某人', 好感度: 90, 出生日期: { 年: 212 }, 私密信息: { 性取向: 'x', 不在清单: 'y' } } } } };
  const closed = buildNarrativePromptState(save, '我们去喝茶');
  assert.equal('私密信息' in closed.社交.关系.某人, false, '入口不中：剔除');
  const opened = buildNarrativePromptState(save, intimate);
  assert.ok(opened.社交.关系.某人.私密信息, '入口命中且关系已确立：门开，存档写 12 岁也不关');
  assert.equal('不在清单' in opened.社交.关系.某人.私密信息, false);
});

test('T11 主角出生年只在新开档对齐：开档 220 → 进城拨 4 年 → 切到下一关，出生年不变、年龄 +4', async () => {
  const { save } = await quiet(() => freshPrologueCheckpoint());
  const birth = save.角色.身份.出生日期.年;
  assert.equal(save.元数据.时间.年, 224);
  rt(save).nextStageReadyId = rt(save).nextStageId;
  const mods = ['lcq.stage_03', 'lcq.stage_03b_snake_flower_bridge'].map(id => P.applyContentPackOverlays(json(`src/modules/scenarioMods/builtins/data/${id}.json`)));
  const result = await quiet(() => I.transitionToNextScenarioStage(save, mods));
  assert.equal(result.ok, true, result.reason);
  assert.notEqual(rt(result.saveData).modId, 'lcq.stage_02');
  assert.equal(result.saveData.元数据.时间.年, 224, '切关不再补拨');
  assert.equal(result.saveData.角色.身份.出生日期.年, birth);
  const source = readFileSync(new URL('../src/modules/scenarioMods/strictInitializer.ts', import.meta.url), 'utf8');
  assert.match(source, /applyStrictScenarioInitializationToSave\(saveData, initialization, false, false\)/);
});

test('T11b 主角旧档修复：切关挪过出生年的旧夹具（224 年、出生 206）读档后改回 202，读两次结果一样', () => {
  const bundle = JSON.parse(execFileSync('git', ['show', '061a6c49:tests/fixtures/checkpoints/current-han-entry.json'], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  const save = bundle.saves[0].存档数据;
  assert.equal(save.元数据.时间.年, 224);
  assert.equal(save.角色.身份.出生日期.年, 206);
  LR.applyLoadRepairs(save);
  assert.equal(save.角色.身份.出生日期.年, 202);
  const once = structuredClone(save);
  LR.applyLoadRepairs(save);
  assert.deepEqual(save.角色.身份.出生日期, once.角色.身份.出生日期);
  assert.equal(save.元数据.时间.年, 224, '已有旧挂点回执，读档不补拨');
});

test('T12 读档补顺延：220 年旧档已过进城路线但没有跳年回执 → 读档静默拨到 224 并写回执，不出过场；再读不重复；已有 s02_04 回执的档不补', async () => {
  const { save } = await quiet(() => freshPrologueCheckpoint());
  delete rt(save).timeSkipInterlude;
  delete save.系统.扩展.actionTime.receipts[RECEIPT];
  save.元数据.时间.年 = 220;
  assert.ok((rt(save).openWorldSlice?.travelReceipts || []).some(r => r.routeId === 'lcq.route.wuyuan.arrive_market'));
  LR.applyLoadRepairs(save);
  assert.equal(save.元数据.时间.年, 224);
  assert.ok(save.系统.扩展.actionTime.receipts[RECEIPT]);
  assert.equal(rt(save).timeSkipInterlude, undefined, '读档不重播过场');
  LR.applyLoadRepairs(save);
  assert.equal(save.元数据.时间.年, 224);
  const legacy = (await quiet(() => freshPrologueCheckpoint())).save;
  delete rt(legacy).timeSkipInterlude;
  delete legacy.系统.扩展.actionTime.receipts[RECEIPT];
  legacy.系统.扩展.actionTime.receipts['author:lcq.event.s02_04::advance_declared_objective'] = { minutes: 4 * yearMinutes(), source: 'author' };
  LR.applyLoadRepairs(legacy);
  assert.equal(legacy.元数据.时间.年, 224);
  assert.equal(legacy.系统.扩展.actionTime.receipts[RECEIPT], undefined);
});

test('T12b 改年数：已过挂点的旧档年数增加只补差额，减少不回拨日历', () => {
  const save = { 元数据: { 时间: { 年: 224, 月: 1, 日: 1, 小时: 0, 分钟: 0 } }, 系统: { 扩展: { actionTime: { receipts: { [RECEIPT]: { minutes: 4 * yearMinutes(), source: 'author' } } } } }, 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_03', axisSeqLo: 36, events: [], completedEventIds: [] } } } };
  TL.applyTimelineInserts(save, { silent: true, timeline: withYears(6) });
  assert.equal(save.元数据.时间.年, 226);
  TL.applyTimelineInserts(save, { silent: true, timeline: withYears(3) });
  assert.equal(save.元数据.时间.年, 226);
  TL.applyTimelineInserts(save, { silent: true, timeline: withYears(6) });
  assert.equal(save.元数据.时间.年, 226, '幂等');
});

test('T13 旁门进城：没走进城路线、直接到了五原城，ensureWuyuanOpenWorldSlice 拨钟一次；s02_04 兜底不再拨', async () => {
  const { save } = await quiet(() => freshPrologueCheckpoint());
  delete rt(save).timeSkipInterlude;
  delete save.系统.扩展.actionTime.receipts[RECEIPT];
  rt(save).openWorldSlice.travelReceipts = [];
  save.元数据.时间.年 = 220;
  W.ensureWuyuanOpenWorldSlice(save);
  assert.equal(save.元数据.时间.年, 224);
  assert.equal(rt(save).timeSkipInterlude?.eventId, INSERT_ID);
  W.ensureWuyuanOpenWorldSlice(save);
  assert.equal(save.元数据.时间.年, 224);
  const event = rt(save).events.find(e => e.id === 'lcq.event.s02_04');
  F.applyStepSceneLedger(save, rt(save), event.id, event.playerCompletionContract.actions[0].id);
  assert.equal(save.元数据.时间.年, 224);
});

test('构建期：时间线校验挡住跨事件挂点、未知占位、负年数；总表不写派生字段；过场按年数换中文数字', () => {
  const stages = readdirSync(new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => json(`src/modules/scenarioMods/builtins/data/${f}`));
  const numbers = json('mod-kit/game-numbers.qingyu.json');
  const texts = P.CONTENT_PACKS.texts;
  const raw = json('src/modules/contentPacks/packs/qingyu/timeline.json');
  assert.deepEqual(compileTimeline({ rawInserts: raw, numbers, stages, texts }).inserts, TIMELINE.inserts);
  assert.throws(() => compileTimeline({ rawInserts: [{ ...raw[0], anchor: { afterAxisSeq: 1, beforeAxisSeq: 31 } }], numbers, stages, texts }), /straddles/);
  assert.throws(() => compileTimeline({ rawInserts: [{ ...raw[0], years: -1 }], numbers, stages, texts }), /non-negative/);
  assert.throws(() => compileTimeline({ rawInserts: [raw[0]], numbers, stages, texts: { ...texts, [raw[0].interludeTextKey]: '流浪了{story.actionTime.oops}年' } }), /placeholder/);
  assert.deepEqual(auditWith({}).derived, []);
  const save = { 元数据: { 时间: { 年: 220, 月: 1, 日: 1, 小时: 0, 分钟: 0 } }, 系统: { 扩展: {}, 历史: { 叙事: [{ type: 'gm', content: '正文' }] } }, 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_03', axisSeqLo: 36, events: [], completedEventIds: [] } } } };
  TL.applyTimelineInserts(save, { timeline: withYears(3) });
  const text = F.flushTimeSkipInterlude(save);
  assert.match(text, /流浪了三年/);
  assert.equal(save.系统.历史.叙事[0].content, `${text}\n\n正文`, '过场排在本回合正文之前');
});

test('原著未成年岁数不进卡与提示词：小紫 hardLimits、小紫 memories、毛延寿外貌、秦翰「白发萧索」已清', () => {
  const registry = JSON.stringify(json('src/modules/scenarioMods/builtins/character-registry.json'));
  const intimacy = readFileSync(new URL('../src/modules/scenarioMods/intimacyProfiles.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(intimacy, /十五岁弑母/);
  for (const f of readdirSync(new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url)).filter(f => f.endsWith('.json'))) {
    const text = readFileSync(new URL(`../src/modules/scenarioMods/builtins/data/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /十五岁离开南荒|(?<!二)十五六岁年纪|白发萧索/, f);
  }
  assert.doesNotMatch(registry, /(?<!二)十五六岁年纪|白发萧索/);
  assert.match(PL.privateAgeConstraint('period', '小紫'), /普通童年回忆照常可写/);
});

test('补丁（剧情策划 11-10 清单）：宋主 200【推断】且删去往事岁数 storyAge；补表 6 项；无首登且开局年不满 18 的只报不挡', () => {
  const registry = json('src/modules/scenarioMods/builtins/character-registry.json').characters;
  const entry = id => registry.find(e => e.id === id);
  const songZhu = 'canon.character.2a4df37bfa';
  assert.equal(entry(songZhu).staticProfile.birthYear, 200);
  assert.equal(entry(songZhu).birthYearBasis, '推断');
  assert.equal('storyAge' in entry(songZhu).staticProfile, false, '「七八岁」是岳帅出事那年的往事岁数，不进总表');
  assert.equal(CR.getRegistryAgeFacts({ id: songZhu }).storyAge, undefined);
  assert.equal(CR.gateAgeNow(songZhu, 220), 20);
  const sup = json('mod-kit/character-registry-supplements.json');
  assert.deepEqual(sup.overrides.find(o => o.id === songZhu).removeStaticProfileFields, ['storyAge']);

  const table = new Map(json('mod-kit/character-birth-years.json').entries.map(e => [e.id, e]));
  for (const [id, year, basis] of [[songZhu, 200, '推断'], ['liuchao.character.guo_jing', 218, '推断'], ['liuchao.character.liu_xin', 217, '原著'],
    ['canon.character.1d2719bc6f', 205, '原著'], ['canon.character.886a02fef4', 202, '下限'], ['lyl.character.np039', 202, '下限']]) {
    assert.deepEqual([table.get(id)?.birthYear, table.get(id)?.basis], [year, basis], id);
    assert.equal(entry(id).staticProfile.birthYear, year, id);
  }
  assert.match(table.get('liuchao.character.an_le_gong_zhu').source, /^「先帝嫡女安乐公主，年已及笄」\(ygx\.txt:36741\)/);
  assert.equal(table.get('liuchao.character.yan_er').birthYear, 204);

  const report = auditWith({});
  assert.deepEqual([report.missing, report.under18], [[], []]);
  assert.deepEqual(report.lifted.map(x => x.match(/（([^）]+)）/)[1]), [ID.yueShuang]);
  for (const x of report.noDebutMinor) assert.equal(CR.getRegistryDebutAxisSeq(x.match(/（([^）]+)）/)[1]), undefined, x);
  assert.equal(report.noDebutMinor.some(x => x.includes(songZhu)), false);
});

test('剧情小孩（用户 11-10 21:39 逐人定）：郭靖 218、定陶王 217 不套首登下限，现算不满 18 时只靠唯一的年龄门关私密层；存档不兜 18；体检单列不报警', () => {
  const guoJing = 'liuchao.character.guo_jing', liuXin = 'liuchao.character.liu_xin';
  const table = new Map(json('mod-kit/character-birth-years.json').entries.map(e => [e.id, e]));
  assert.deepEqual(json('mod-kit/character-birth-years.json').entries.filter(e => e.storyChild).map(e => e.id).sort(), [guoJing, liuXin].sort());
  assert.deepEqual([table.get(guoJing).birthYear, table.get(guoJing).basis, table.get(liuXin).birthYear, table.get(liuXin).basis], [218, '推断', 217, '原著']);
  const registry = json('src/modules/scenarioMods/builtins/character-registry.json').characters;
  for (const id of [guoJing, liuXin]) {
    const entry = registry.find(e => e.id === id);
    assert.equal(entry.storyChild, true);
    assert.equal('storyChild' in entry.staticProfile, false, '标记不进角色档案与提示词');
  }
  assert.equal(CR.registryEffectiveBirthYear(guoJing), 218);
  assert.equal(CR.registryEffectiveBirthYear(liuXin), 217);
  assert.equal(meetYear(guoJing), 224);
  assert.equal(meetAge(guoJing), 6);
  assert.equal(meetAge(liuXin), 7);
  assert.equal(PL.privateGateOpen(open({ ageNow: meetAge(guoJing) })), false, '现算 6 岁：门不开');
  assert.equal(CR.gateAgeNow(liuXin, 235), 18);
  assert.equal(PL.privateGateOpen(open({ ageNow: CR.gateAgeNow(liuXin, 235) })), true, '照日历长到 18 后按普通规则');
  assert.equal(CR.isRegistryStoryChild(ID.yueShuang), false);
  assert.equal(meetAge(ID.yueShuang), 18, '未标记的人仍套下限');

  assert.equal(REL.estimateNpcAge({ id: guoJing, name: '郭靖' }, 224), 6);
  const save = { 元数据: { 时间: { 年: 224, 月: 1, 日: 1 } }, 社交: { 关系: {
    [guoJing]: { 名字: '郭靖', 出生日期: { 年: 206, 月: 1, 日: 1 } },
    [ID.yueShuang]: { 名字: '月霜', 出生日期: { 年: 205, 月: 1, 日: 1 } },
  } } };
  REL.enforceScenarioNpcAdulthood(save);
  assert.deepEqual(save.社交.关系[guoJing].出生日期, { 年: 218, 月: 1, 日: 1 }, '存档出生年对到原著出生年，不兜 18');
  assert.equal(save.社交.关系[ID.yueShuang].出生日期.年, 202);

  const report = auditWith({});
  assert.deepEqual(report.under18, []);
  assert.deepEqual(report.storyChildren.map(x => x.match(/（([^）]+)）/)[1]).sort(), [guoJing, liuXin].sort());
  assert.ok(report.storyChildren.every(x => /私密层由年龄门关着/.test(x)));
  assert.equal(report.lifted.some(x => x.includes(guoJing) || x.includes(liuXin)), false);
});
