// 右栏「当前线」卡·21:00 防剧透通审（剧情策划稿 2026-10-27-线的下一步提示文案.md §13.1，起因真机 1f9f24127b4e 报告第 179–186 行）。
// 口径（用户 21:00）：只写中性的地点和动作；不定性、不剧透；不点玩家没见过的人或物；`when` 保证不了的一律改，拿不准就不点名。
// 改 25 条，其余 38 条不动。
// R-8（总策划定）：改完后 5 对「见过／没见过」两版同文，删掉「见过」那一行，只留兜底那行（去掉 acq 条件），表现不变。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const { validateLineCompassTable } = await loadTs('../src/modules/scenarioMods/validator.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');
const texts = packs.CONTENT_PACKS.texts;

/** §13.1 改动表：[线, 步 id, 旧文案, 新文案] */
const AUDIT = [
  ['nanhuang', 'nh_f03_huamiao_mist', '跟送亲队伍一道走', '从熊耳铺跟大伙上路'],
  ['nanhuang', 'nh_shanghou_ice_gu', '回叶媪那个山村看看', '回来时住过的山村看看'],
  ['jin', 'jin_arrive_icegu', '去建康，找云苍峰问冰蛊', '去建康，托人想想办法'],
  ['jin', 'jin_eagle_beifu', '随萧遥逸出城去鹰愁峪', '出建康城走走'],
  ['song', 'song_guangyang_from_jin', '进广阳城看看', '上岸，进附近的城看看'],
  ['song', 'song_escort_yue_girls', '护送两位岳家姑娘去晴州', '离开广阳，接着上路'],
  ['song', 'song_jiangzhou_war_open', '去江州找萧遥逸', '去江州看看那边的情形'],
  ['song', 'song_yuanwailang', '带着举荐文书去临安', '离开江州，往临安去'],
  ['song', 'song_xuezhun_takeover', '去西湖边的农居看看', '去约好的地方看看'],
  ['song', 'song_yuntao_niaoren', '去云涛观看看', '在临安城里四处看看'],
  ['han', 'han_zhu_urge_luo', '随朱老头去洛都', '去洛都看看'],
  ['han', 'han_camera_palace', '随斯明信进宫取回摄像机', '进宫看看'],
  ['han', 'han_huo_bieyuan', '去霍家别院找严君平', '照打听来的消息去看看'],
  ['han', 'han_liujian_yuxi', '去长秋宫见赵飞燕', '去长秋宫看看'],
  ['tang', 'tang_d7_secret_treaty', '去鸿胪寺找申服君谈谈', '在长安城里打听打听'],
  ['taiquan', 'tq_entry_fruit', '去太泉古阵，找赤阳圣果', '去苍澜的太泉古阵'],
  ['taiquan', 'tq_xionggu_key', '去熊谷，找一四七五', '去熊谷看看'],
  ['taiquan', 'tq_chiyang_fruit', '去火山口找赤阳圣果', '往古阵深处走走'],
  ['qin', 'qin_entry_xu_met', '去咸阳找徐君房问问', '去咸阳，找那个方士问问'],
  ['qin', 'qin_camp_route', '去城外军营，问问马匹粮秣', '去城外军营看看'],
  ['qin', 'qin_banquet', '跟徐君房进宫赴年节宴', '进宫看看'],
  ['qin', 'qin_purge_suxiao', '在咸阳找苏骁', '在咸阳城里打听打听'],
  ['qin', 'qin_villa', '去供词里说的那处别院', '在咸阳四处走走看看'],
  ['qin', 'qin_baiqi', '去军营找白起谈谈', '去城外军营看看'],
  ['qin', 'qin_branch_raid', '去广源行咸阳分号看看', '去咸阳的商铺街看看'],
];

/** 通审清零的人名、物件、代号与结果动词（§11「21:00 重跑」） */
const CLEARED = ['摄像机', '赤阳圣果', '一四七五', '取回', '供词', '斯明信', '赵飞燕', '严君平', '申服君', '徐君房', '苏骁', '白起', '云苍峰', '萧遥逸', '朱老头',
  '叶媪', '送亲', '冰蛊', '岳家', '晴州', '举荐', '文书', '西湖', '农居', '云涛观', '霍家', '鸿胪寺', '火山口', '马匹', '粮秣', '年节宴', '广源行', '分号'];

const stepTexts = () => Object.entries(texts).filter(([key]) => /^lineCompass\.[a-z]+\.step\./.test(key));

test('防剧透通审 §13.1：25 条按步 id 换成新文案，旧文案不再出现；都在 20 字内、validator 对仓库表无问题', () => {
  assert.equal(AUDIT.length, 25);
  const table = compass.lineCompassTable();
  const maxChars = numbers.GAME_NUMBERS.story.lineCompass.hint.maxChars;
  assert.equal(maxChars, 20);
  for (const [lineId, stepId, , next] of AUDIT) {
    const key = `lineCompass.${lineId}.step.${stepId}`;
    const step = table.lines.find(l => l.lineId === lineId)?.steps.find(s => s.id === stepId);
    // R-8 合并后「见过」那一行连同文案键一并删掉，由兜底那行出同一句
    if (step) assert.equal(step.hintKey, key, key);
    if (texts[key] !== undefined) assert.equal(texts[key], next, key);
    assert.ok(step || Object.values(texts).includes(next), `${key}：合并后仍有一行出这一句`);
    assert.ok([...next].length <= maxChars, key);
  }
  const all = stepTexts();
  for (const [, , old] of AUDIT) assert.ok(!all.some(([, value]) => value === old), `旧文案仍在：${old}`);
  assert.deepEqual(validateLineCompassTable(table, texts, compass.lineCompassPlaces()), []);
});

test('防剧透通审：当前线卡各句不再点名通审清零的人、物、代号与结果动词', () => {
  for (const [key, value] of stepTexts()) {
    for (const word of CLEARED) assert.ok(!value.includes(word), `${key}「${value}」含「${word}」`);
  }
});

/** R-8 合并的 5 对：[线, 删掉的「见过」步, 留下的兜底步, 相识账人物, 留下那行的 when（去掉 acq 后）, 同文] */
const MERGED = [
  ['song', 'song_jiangzhou_war_open', 'song_jiangzhou_war_open_alt', 'xiao_yao_yi',
    [{ path: 'done.lcq.event.s10_10_xiaozi_crisis', operator: 'eq', value: true }], '去江州看看那边的情形'],
  ['han', 'han_zhu_urge_luo', 'han_zhu_urge_luo_alt', 'shang_zhen_yu', undefined, '去洛都看看'],
  ['han', 'han_camera_palace', 'han_camera_palace_alt', 'si_ming_xin',
    [{ path: 'done.lyl.event.taiquan_afterfall_09_beat', operator: 'eq', value: true }], '进宫看看'],
  // 五线补全·汉 H11（2026-10-28）：改挂默认路线 arrange_escape_route，when 简化为只读同序号的 emperor_death_spreads（隔离关 s06_01 不再引用）
  ['han', 'han_liujian_yuxi', 'han_liujian_yuxi_alt', 'zhao_feiyan',
    [{ path: 'done.lyl.event.emperor_death_spreads', operator: 'eq', value: true }], '去长秋宫看看'],
  ['qin', 'qin_entry_xu_met', 'qin_entry_xu_unmet', 'xu_junfang', undefined, '去咸阳，找那个方士问问'],
];

test('R-8：5 对同文变体已合并——「见过」那一行连同文案键删掉，兜底那行去掉 acq 条件、文案不变；带提示的步 63 → 58', () => {
  const table = compass.lineCompassTable();
  for (const [lineId, met, kept, who, when, sentence] of MERGED) {
    const steps = table.lines.find(l => l.lineId === lineId).steps;
    assert.ok(!steps.some(s => s.id === met), `${met} 已删`);
    assert.equal(texts[`lineCompass.${lineId}.step.${met}`], undefined, `${met} 文案键已删`);
    const step = steps.find(s => s.id === kept);
    assert.deepEqual(step.when, when, kept);
    assert.ok(!JSON.stringify(step.when ?? []).includes(`acq.liuchao.character.${who}`), `${kept} 不再读相识账`);
    assert.equal(texts[step.hintKey], sentence, kept);
  }
  // 没有别的同一事件、同一句的重复行
  for (const line of table.lines) {
    const seen = new Set();
    for (const step of line.steps.filter(s => s.hintKey && s.eventId)) {
      const sig = `${step.eventId}|${texts[step.hintKey]}`;
      assert.ok(!seen.has(sig), `${line.lineId}.${step.id} 与前一行同事件同文`);
      seen.add(sig);
    }
  }
  assert.equal(table.lines.flatMap(l => l.steps).filter(s => s.hintKey).length, 58, 'R-8 后 58，R-15 再删南荒 nh_leave_for_jin 一条，五线补全·唐 T20 给 tang_d7_publish 补一条（剧情策划唐稿定文案）');
});

const eventStage = new Map(fs.readdirSync('src/modules/scenarioMods/builtins/data').filter(f => f.endsWith('.json'))
  .flatMap(f => { const d = JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${f}`, 'utf8')); return (d.scenario?.events || []).map(e => [e.id, d.manifest.id]); }));
/** 只有跨关账的存档：done＝编年史里已完成的事件（按给定顺序），acq＝见过的人。 */
const saveOf = (done, acq = []) => ({
  角色: { 属性: { 境界: { 名称: '生象', 阶段: '初期' } } },
  世界: { 状态: { 剧本模组: {
    modId: eventStage.get(done[done.length - 1]), events: [], completedEventIds: [], flags: {},
    acquaintances: Object.fromEntries(acq.map(id => [`liuchao.character.${id}`, { kind: 'encountered' }])),
    chronicle: done.map((eventId, i) => {
      assert.ok(eventStage.has(eventId), eventId);
      return { id: `chronicle.${eventStage.get(eventId)}.${eventId}`, type: 'event', stageId: eventStage.get(eventId), title: '', sequence: i + 1 };
    }),
  } } },
});
const stepOf = (save, focusEventId) => compass.lineCompassView(save, { focusEventId, compassPointer: () => '去某处 · 见某人' }).current;

test('R-8：表现不变——合并的 4 对非待建步，见过和没见过那个人时卡片出同一句（秦线那对是待建步，运行时本就跳过）', () => {
  const PACT = 'lcq.event.sudaji_south_pact';
  const cases = [
    ['song_jiangzhou_war_open', 'xiao_yao_yi', [PACT, 'lcq.event.s10_09_yin_yang_fish', 'lcq.event.s10_10_xiaozi_crisis'], 'lcq.event.s10_09_yin_yang_fish', '去江州看看那边的情形'],
    // 入汉四步已改挂 H1（五线补全·汉 2026-10-28，不再 pending）：编年史按真实顺序先过 H1
    ['han_zhu_urge_luo', 'shang_zhen_yu', [PACT, 'lyl.event.han_shouyang_gaoyanei'], 'lyl.event.s05_01', '去洛都看看'],
    // 进宫看看已挪到进洛都那一拍（s05_01）之前（原著顺序，总策划定）：编年史按真实顺序，afterfall_09 之后、s05_01 之前
    ['han_camera_palace', 'si_ming_xin', [PACT, 'lyl.event.taiquan_afterfall_07_beat', 'lyl.event.taiquan_afterfall_09_beat'], 'lyl.event.s06_01', '进宫看看'],
    ['han_liujian_yuxi', 'zhao_feiyan', [PACT, 'lyl.event.emperor_death_spreads'], 'lyl.event.han_palace_endgame_08_beat', '去长秋宫看看'],
  ];
  for (const [label, who, done, focus, sentence] of cases) {
    for (const acq of [[who], []]) {
      const card = stepOf(saveOf(done, acq), focus);
      assert.equal(card?.step, sentence, `${label}：${acq.length ? '见过' : '没见过'}`);
    }
  }
  // 斯明信那对：原「见过」版另要求走过太泉；走过太泉、见过斯明信也照样出这一句
  const viaTaiquan = stepOf(saveOf([PACT, 'lyl.event.taiquan_portal_exit', 'lyl.event.taiquan_afterfall_07_beat', 'lyl.event.taiquan_afterfall_09_beat'], ['si_ming_xin']), 'lyl.event.s06_01');
  assert.equal(viaTaiquan?.step, '进宫看看');
  const qin = compass.lineCompassTable().lines.find(l => l.lineId === 'qin').steps.find(s => s.id === 'qin_entry_xu_unmet');
  assert.equal(qin.pending, true);
});
