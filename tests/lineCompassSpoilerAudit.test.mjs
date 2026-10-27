// 右栏「当前线」卡·21:00 防剧透通审（剧情策划稿 2026-10-27-线的下一步提示文案.md §13.1，起因真机 1f9f24127b4e 报告第 179–186 行）。
// 口径（用户 21:00）：只写中性的地点和动作；不定性、不剧透；不点玩家没见过的人或物；`when` 保证不了的一律改，拿不准就不点名。
// 改 25 条，其余 38 条不动。
import assert from 'node:assert/strict';
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
