import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dataUrl = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const registryUrl = new URL('../src/modules/scenarioMods/builtins/character-registry.json', import.meta.url);

const STAGE_ID = 'lyl.luoyang_coup';

/**
 * R2-11N 人物投影校准：每拍 relatedCharacterIds 必须等于按 EPUB 第 66 集《两宫交兵》
 * 逐章核对的在场行动者（0359-0371，章序与 yunlong/source-index.json 一致）。
 * 规则：只收该拍映射章内实际在场并行动的人物；仅被提及/未出场者不挂。
 */
const EXPECTED_RELATED = {
  // 280《凌辱》+281《治丧》：藻井目睹组 + 假死局在场执行者（义姁六识禁绝丹、胡夫人拟声、张恽服侍吕冀）
  'lyl.event.s06_01b': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.zhao_he_de',
    'liuchao.character.lv_ji', 'lyl.character.np060',
    'liuchao.character.zhang_yun', 'liuchao.character.yi_xin', 'liuchao.character.hu_fu_ren',
  ],
  // 282《矫诏》：护送二赵撤回长秋宫；刘建矫诏劫持吕冀、中行说持刀参与、金蜜镝请皇后回宫并留守护驾
  'lyl.event.s06_01': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.zhao_feiyan',
    'liuchao.character.zhao_he_de', 'liuchao.character.lv_ji',
    'lyl.character.liu_jian', 'liuchao.character.zhong_hangyue', 'liuchao.character.jin_mi_di',
  ],
  // 283《侠义》：通商里议事；班超、高智商、吴三桂均在场受命
  'lyl.event.s06_02': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.yun_dan_liu',
    'liuchao.character.qin_hui', 'liuchao.character.np069',
    'lyl.character.np016', 'liuchao.character.np007',
    'liuchao.character.guo_jie', 'lyl.character.np067',
    'liuchao.character.gao_zhishang', 'liuchao.character.wu_san_gui',
  ],
  // 284《乱军》：潜回布防、下诏授金蜜镝宫禁、救出徐璜唐衡左悺；吕冀仅被提及（伤重），不得挂
  'lyl.event.s06_03': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.yun_dan_liu',
    'liuchao.character.np007', 'liuchao.character.zhao_feiyan',
    'liuchao.character.jin_mi_di', 'liuchao.character.cai_jingzhong',
    'liuchao.character.xu_huang', 'liuchao.character.tang_heng',
    'lyl.character.zuo_huan', 'lyl.character.liu_jian',
  ],
  // 285《空饷》：长秋宫守卫战；刘子骏率中垒军主攻、左悺被推入敌阵失踪
  'lyl.event.s06_04': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.cai_jingzhong',
    'liuchao.character.ao_run', 'lyl.character.liu_jian',
    'lyl.character.cang_lu', 'lyl.character.liu_zijun',
    'liuchao.character.wu_san_gui', 'liuchao.character.yun_dan_liu',
    'liuchao.character.lu_jing', 'lyl.character.zuo_huan',
    'liuchao.character.qi_yu_xian',
  ],
  // 286《赏格》：班超仅被场外提及（"让班超准备了一批钱铢"），本人未出场，不得挂
  'lyl.event.s06_04b': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.ao_run',
    'liuchao.character.cai_jingzhong', 'liuchao.character.zhao_feiyan',
    'liuchao.character.lu_jing',
  ],
  // 287《诱动》：谈判；吴三桂发现投奔的中垒军军司马并报信
  'lyl.event.s06_05': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.jian_yu_ji',
    'liuchao.character.cai_jingzhong', 'liuchao.character.wu_san_gui',
  ],
  // 288《阻境》：拖住齐羽仙、阙楼观战、移宫路线转告；蔡敬仲击杀吕戟
  'lyl.event.s06_06': [
    'liuchao.character.cheng_zongyang', 'liuchao.character.qi_yu_xian',
    'liuchao.character.cai_jingzhong', 'liuchao.character.lv_fengxian',
    'lyl.character.lv_ji_changshui', 'lyl.character.cang_lu',
    'lyl.character.liu_jian', 'liuchao.character.yun_dan_liu',
    'liuchao.character.lu_jing',
  ],
};

/** 本次按时间门控补入的真实参与者（本关 275-288 时区内登场） */
const ADDED_CHARACTERS = {
  'liuchao.character.ao_run': '敖润',
  'liuchao.character.qi_yu_xian': '齐羽仙',
  'liuchao.character.jin_mi_di': '金蜜镝',
  'liuchao.character.xu_huang': '徐璜',
  'liuchao.character.tang_heng': '唐衡',
  'liuchao.character.zhong_hangyue': '中行说',
  'liuchao.character.gao_zhishang': '高智商',
  'liuchao.character.wu_san_gui': '吴三桂',
  'lyl.character.zuo_huan': '左悺',
  'lyl.character.liu_zijun': '刘子骏',
  'lyl.character.lv_ji_changshui': '吕戟',
};

async function stage() {
  return JSON.parse(await readFile(new URL(`${STAGE_ID}.json`, dataUrl), 'utf8'));
}

test('every luoyang coup beat maps to the on-scene cast verified from the source chapters', async () => {
  const document = await stage();
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  assert.deepEqual([...byId.keys()].sort(), Object.keys(EXPECTED_RELATED).sort());
  for (const [eventId, expected] of Object.entries(EXPECTED_RELATED)) {
    assert.deepEqual(byId.get(eventId)?.relatedCharacterIds, expected, eventId);
  }
});

test('Banchao stays off the reward-scale beat but on the council beat he actually attended', async () => {
  const document = await stage();
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  // 286《赏格》：班超只在场外备钱找向导，未出场。
  assert.equal(byId.get('lyl.event.s06_04b').relatedCharacterIds.includes('liuchao.character.np069'), false);
  // 283《侠义》：班超在通商里议事并受命联络何大当家、搜集情报，保留。
  assert.equal(byId.get('lyl.event.s06_02').relatedCharacterIds.includes('liuchao.character.np069'), true);
});

test('every related character resolves in the stage cast, and the added participants are present', async () => {
  const document = await stage();
  const cast = new Map(document.canon.characters.map(character => [character.id, character]));
  for (const event of document.scenario.events) {
    for (const id of event.relatedCharacterIds || []) {
      assert.ok(cast.has(id), `${event.id} references missing character ${id}`);
    }
  }
  for (const [id, name] of Object.entries(ADDED_CHARACTERS)) {
    assert.equal(cast.get(id)?.name, name, `${id} (${name}) missing from canon.characters`);
  }
});

test('added participants keep unique flag slugs and canonical card coverage', async () => {
  const document = await stage();
  // divergenceLedger 以 id 末段作 flags.character.<slug>.status：吕戟不得与吕冀(lv_ji)折叠。
  const slugs = document.canon.characters.map(character => character.id.split('.').at(-1));
  assert.equal(new Set(slugs).size, slugs.length, 'character flag slug collision');
  // 三人新卡必须进了运行时注册表（characterCardCoverage 的硬约束）。
  const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
  const covered = new Set(registry.characters.flatMap(character => [
    character.canonicalName, ...(character.aliases || []),
  ]).filter(Boolean));
  for (const name of ['左悺', '刘子骏', '吕戟']) {
    assert.equal(covered.has(name), true, `${name} missing from character registry`);
  }
});

test('added participants carry only this-stage minimal fields and zero future-stage leaks', async () => {
  const document = await stage();
  const cast = new Map(document.canon.characters.map(character => [character.id, character]));
  // 本关最小字段白名单（R2-11O）：静态档案由 canon:build 卡投影与运行时 registry 还原，
  // stage 条目不写 appearance/attributes/spiritRoot/talents/race；realm 与技能/物品引用是进度量，禁写。
  const ALLOWED_TOP = new Set(['id', 'name', 'description', 'role', 'gender', 'affiliations', 'locationId', 'profile', 'level', 'levelSource', 'level', 'levelSource']);
  const ALLOWED_PROFILE = new Set(['origin', 'personality', 'notes']); // personality 只许来自总卡投影
  // 后期身份/经历/外貌标记：中行说「内宅总管」（燕歌行时区）、金蜜镝凉州军阵披麻叩首（第三本）、
  // 齐羽仙「玉姬之一」关联（裁定 #108 机密；「剑玉姬」为已登场人物名，不在此列）等一律不得出现在本关条目。
  const FUTURE_MARKERS = ['内宅总管', '凉州军', '定陶王叩首', '谈判代表', '玉姬之一', '毒宗联络人', '辅政大臣'];
  for (const [id, name] of Object.entries(ADDED_CHARACTERS)) {
    const entry = cast.get(id);
    assert.ok(entry, `${id} (${name}) missing`);
    assert.equal(entry.level, null, `${id} must not infer a level`);
    assert.equal(entry.level, null, `${id} must not infer a level`);
    for (const key of Object.keys(entry)) {
      assert.ok(ALLOWED_TOP.has(key), `${id} (${name}) has non-whitelist field: ${key}`);
    }
    for (const key of Object.keys(entry.profile || {})) {
      assert.ok(ALLOWED_PROFILE.has(key), `${id} (${name}) has non-whitelist profile field: ${key}`);
    }
    const blob = JSON.stringify(entry);
    for (const marker of FUTURE_MARKERS) {
      assert.equal(blob.includes(marker), false, `${id} (${name}) leaks future-stage content: ${marker}`);
    }
  }
  // 归属投影的时间门控排除必须生效：中行说在本关不得挂程宗扬势力（内宅总管是燕歌行时区身份）。
  const zhong = cast.get('liuchao.character.zhong_hangyue');
  assert.deepEqual(
    (zhong.affiliations || []).map(a => a.factionId),
    ['liuchao.faction.han_guo_chao_ting'],
  );
});
