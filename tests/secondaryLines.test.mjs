import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

// 二级线入口锚：国家／地区线锚地点，宗派线锚人（用户裁定 2026-08-16）。
// 只验"接得到吗"，不验"加入了没有"——后者不归本模块。

// 规则：国家／地区线锚地点，宗派线锚人。破例写成白名单而不是放松规则——
// 多一条破例就得改这里，改不动就说明该重想。
// 昭南原本破例用人物锚，理由是「南荒没有可投的朝廷，只有带你进去的人」。
// Helgen 切法（9ac33d8）把这个前提推翻了：入口改成「出五原南门一直走」——那是个地方，
// 商队降为默认矢量上最常见的交通、不是门票。破例随之作废，昭南回归常规国家线。
// 集合保留（不是删掉）：将来若再出现真破例，机制还在，且必须在 basis 里写明理由。
const ANCHOR_RULE_EXEMPT_NATIONS = new Set([]);

test('两类线各用各的锚，破例只有白名单里那条', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  // 2026-08-17 由 8 增至 9：新增商道线。用户从「盘江股东大会」一条孤儿反查出本线整条缺失——
  // 事件层有一条 seq 134→885 的完整商业弧（跨度为全部线之最），而我们一条节点都没落。
  // 2026-08-19 由 9 增至 10：太泉单独成线（用户裁定「太泉这一段应该单独拿出来，不应该放在原先的主轴里」）。
  // 它是 `expedition`——既非宗派（无法统）也非国家（不是政权地盘），是一处远征目的地，
  // 恰为主线条件一（修为达六阳、前往太泉古阵祭祀故人）的落点。
  assert.equal(SECONDARY_LINES.length, 10, '十条线：宗派 3 ＋ 国家 5 ＋ 商道 1 ＋ 远征 1');
  for (const line of SECONDARY_LINES) {
    if (line.kind === 'commerce' || line.kind === 'expedition' || line.id === 'heimohai') {
      // 商道与太泉都既不锚地方也不锚人——它锚的是「你第一次发现生意能办武力办不成的事」那一拍。
      // 给它挂地点锚是错的：这条线跨十一关、没有一个"去了就算入线"的地方。
      assert.ok(line.anchorEventIds?.length, `${line.name} 是事锚线，必须给 anchorEventIds`);
      assert.ok(!line.anchorEventPending, `${line.name} 的锚事件必须是已落地的真 event`);
      assert.ok(!line.anchorLocationIds?.length, `${line.name} 不该有地点锚——它没有入口地`);
    } else if (line.kind === 'nation' && !ANCHOR_RULE_EXEMPT_NATIONS.has(line.id)) {
      // 国家线**必须**有地点锚；**可以另外**有引路人锚（两条路都能入线）。
      // 汉国即如此：跟八骏查左武军旧案（第 10 关）或直接走到洛都（第 24 关）。
      assert.ok(line.anchorLocationIds?.length, `国家／地区线 ${line.name} 必须有地点锚`);
    } else {
      assert.ok(line.anchorCharacterIds?.length, `${line.name} 必须有人物锚`);
      assert.ok(!line.anchorLocationIds, `${line.name} 不该用地点锚`);
    }
    assert.ok(line.basis && line.basis.length > 10, `${line.name} 缺锚的正典依据`);
  }
  assert.equal(SECONDARY_LINES.filter(l => l.kind === 'sect').length, 3);
  assert.equal(SECONDARY_LINES.filter(l => l.kind === 'nation').length, 5);

  // 破例必须在 basis 里讲明白，不能只是代码里悄悄换个字段
  for (const id of ANCHOR_RULE_EXEMPT_NATIONS) {
    const line = SECONDARY_LINES.find(l => l.id === id);
    assert.ok(line, `白名单里的 ${id} 不存在了，白名单该清理`);
    assert.match(line.basis, /破例/, `${line.name} 破例了却没在 basis 里说明理由`);
  }
});

test('任务栏把太泉 expedition 显示成远征，不伪装成国家线', () => {
  const sidebar = fs.readFileSync('src/modules/scenarioMods/sidebarLineEntries.ts', 'utf8');
  assert.match(sidebar, /line\.kind === 'expedition'[\s\S]*\? '远征'/);
});

test('锚不得落在被默认路线跳过的死 id 上', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  // 真正的死锚：只在隔离关出现、或 live 关查无。
  // ⚠ 不要把"某一关没有它"当死锚——liuchao.location.luoyang 曾被误列，
  // 它其实覆盖 24 关，只是抵达关 luoyang_cloud_secret 没有；那种应当"全收"而非排除。
  const deadLocationIds = new Set([
    'linan_city',                   // 只在隔离关 lyl.taiquan_expedition
    'lyg.location.changan',         // live 关查无
    'lcq.location.longchi',         // 太乙山门，只在 stage_01 注入
    'liuchao.location.longchi',
    'liuchao.location.xingyue_lake', // 只在 lyg.mijing_rumen 注入
  ]);
  for (const line of SECONDARY_LINES) {
    for (const id of line.anchorLocationIds || []) {
      assert.ok(!deadLocationIds.has(id), `${line.name} 的地点锚 ${id} 是已知死锚`);
    }
  }
});

// 锚＝你知道那件事的那一拍（用户裁定 2026-08-16，收窄了原先"国家锚地点／宗派锚人"的规则）。
// 下面三条原本编的是旧规则，随裁定一起改写：到场不再等于入线。

test('到场不开线：走到地方、见到人，都只是"到了能知道的位置"', async () => {
  const { resolveAvailableLines } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');

  // 走到临安——宋国的"知道"是贾师宪的攻江州军令，不是踏进都城。
  const atLinan = resolveAvailableLines('liuchao.location.linan', {}, []);
  assert.ok(!atLinan.some(l => l.id === 'song'),
    '光走到临安不该开宋国线——那只是到了能知道的位置');

  // 见到殇侯——黑魔海的"知道"是那张羊皮纸被解读，不是见着朱老头本人。
  const metShanghou = resolveAvailableLines(undefined, {
    'liuchao.character.shang_zhen_yu': { characterId: 'liuchao.character.shang_zhen_yu', kind: 'encountered' },
  }, []);
  assert.ok(!metShanghou.some(l => l.id === 'heimohai'),
    '见过朱老头不该开黑魔海线——玩家此时还不知道"黑魔海"这个名字');

  // 见到谢艺——星月湖的"知道"是问清星月湖是什么。
  const metXieYi = resolveAvailableLines(undefined, {
    'liuchao.character.xie_yi': { characterId: 'liuchao.character.xie_yi', kind: 'encountered' },
  }, []);
  assert.ok(!metXieYi.some(l => l.id === 'xingyuehu'),
    '见过谢艺不该开星月湖线——见到人不等于知道那是什么');
});

test('知道了才开线：锚事件完成，线才亮', async () => {
  const { resolveAvailableLines, SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  for (const line of SECONDARY_LINES) {
    if (!line.anchorEventIds?.length || line.anchorEventPending) continue;
    const before = resolveAvailableLines(undefined, {}, []);
    assert.ok(!before.some(l => l.id === line.id), `${line.name} 在锚事件完成前不该开`);
    const after = resolveAvailableLines(undefined, {}, [line.anchorEventIds[0]]);
    assert.ok(after.some(l => l.id === line.id),
      `${line.name} 的锚事件 ${line.anchorEventIds[0]} 完成后应开线`);
  }
});

test('锚事件还没写出来的线，退回粗锚，不得变成永远打不开的死线', async () => {
  const fs = await import('node:fs');
  const { resolveAvailableLines, SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const dir = 'src/modules/scenarioMods/builtins/data/';
  const real = new Set();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    for (const e of j.scenario.events || []) real.add(e.id);
  }
  for (const line of SECONDARY_LINES) {
    assert.ok(line.anchorEventIds?.length, `${line.name} 没有锚事件——八条线都该锚在"知道那一刻"`);
    const exists = line.anchorEventIds.some(id => real.has(id));
    if (line.anchorEventPending) {
      // 声明待补的，锚 id 必须确实还不存在（否则标志过期），且必须有粗锚可退。
      assert.ok(!exists, `${line.name} 标了 anchorEventPending，但锚事件已经存在——标志该去掉了`);
      assert.ok(line.anchorLocationIds?.length || line.anchorCharacterIds?.length,
        `${line.name} 锚事件待补却没有粗锚可退，这条线永远打不开`);
      // 并且必须已经挂了 new 节点把它排进待补清单，不能只留一个悬空 id。
      assert.ok(line.nodes.some(n => n.status === 'new' && line.anchorEventIds.includes(n.eventId)),
        `${line.name} 的待补锚事件没有对应的 new 节点，等于没人知道要补它`);
    } else {
      assert.ok(exists, `${line.name} 的锚事件 ${line.anchorEventIds} 在正典里查无——锚到不存在的 id 上，线永远打不开`);
    }
  }
});

test('星月湖的引路人仍是八骏，且不含月霜', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const line = SECONDARY_LINES.find(l => l.id === 'xingyuehu');
  // 人物列表现在只用于指引落点（说明"去找谁"），不再参与判定，但仍不该指错人。
  assert.ok(line.anchorCharacterIds.length >= 2, '八骏该给出多个引路人');
  assert.ok(!line.anchorCharacterIds.includes('lcq.character.yue_shuang'),
    '月霜不该当星月湖引路人——她是要护的人，不是引你进门的人');
});

test('每条线都有入口指引，且说清"去哪／找谁"', async () => {
  const fs = await import('node:fs');
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  // 地名从正典里取，不在测试里手抄一份——手抄的那份迟早和数据对不上。
  const names = new Map();
  const people = new Map();
  const dir = 'src/modules/scenarioMods/builtins/data/';
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    for (const loc of j.canon?.locations || []) {
      if (loc?.id && loc.name) names.set(loc.id, loc.name);
    }
    // 人名收成集合：同一个 id 在不同关用不同称呼（殇侯／朱老头／朱八八）。
    for (const c of j.canon?.characters || []) {
      if (c?.id && c.name) {
        if (!people.has(c.id)) people.set(c.id, new Set());
        people.get(c.id).add(c.name);
      }
    }
  }
  for (const line of SECONDARY_LINES) {
    assert.ok(line.entryHint && line.entryHint.length >= 6, `${line.name} 缺入口指引`);
    // 指引要对得上它实际用的锚：锚地就说清是哪个地方，锚人就说找谁／跟谁。
    //
    // 地点线这条原来只找「去／前往」两个动词——那是弱代理，管不住真正要管的事。
    // 引子按原文重写后（2026-08-16）它两头都失灵：唐国写了「入长安」却因为没有「去」字被判不合格，
    // 而一句「想插手晋国朝局，去建康」这种没有任何内容的模板话反而一直合格。
    // 改成校地名本身：锚指向哪个地方，指引里就得出现那个地方的名字。
    if (line.kind === 'commerce' || line.kind === 'expedition' || line.id === 'heimohai') {
      // 事锚线的指引不指路也不指人，只说清「这条路能走通」，故不校地名／人名。
      assert.ok(line.anchorEventIds?.length, `${line.name} 是事锚线却没有锚事件`);
    } else if (line.anchorLocationIds?.length) {
      const anchors = line.anchorLocationIds.map(id => names.get(id)).filter(Boolean);
      assert.ok(anchors.length, `${line.name} 的地点锚在正典里查不到名字：${line.anchorLocationIds}`);
      // 行文里用的是地名本身，不是正式全称——昭南写「出五原南门」，而正典地名是「五原城」。
      // 要求写全称会逼出「出五原城南门」这种别扭中文，故匹配时去掉常见通名后缀。
      const bare = n => n.replace(/(城|府|关|镇|村|山|湖)$/u, '');
      assert.ok(
        anchors.some(n => line.entryHint.includes(n) || line.entryHint.includes(bare(n))),
        `${line.name} 的指引没点出锚指向的地方（${anchors.join('／')}）：${line.entryHint}`,
      );
    } else {
      // 同理，人物锚这半原来也只找「找／同行／跟」三个动词——同一个弱代理，一并收紧成校人名。
      // 人物有别名（殇侯＝朱老头＝朱八八），任一出现即可：玩家在第 5 关认识的是「朱老头」。
      const who = (line.anchorCharacterIds || []).flatMap(id => [...(people.get(id) || [])]);
      assert.ok(who.length, `${line.name} 的人物锚在正典里查不到名字：${line.anchorCharacterIds}`);
      assert.ok(
        who.some(n => line.entryHint.includes(n)),
        `${line.name} 的指引没点出锚指向的人（${who.join('／')}）：${line.entryHint}`,
      );
    }
  }
});

// 孪生 id：同一地方在不同关用不同 id，只填一个锚就只在那批关里响。
test('地点锚收齐孪生 id，覆盖该线全部关卡', async () => {
  const fs = await import('node:fs');
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const dir = 'src/modules/scenarioMods/builtins/data/';

  // 统计每个地名在各关用的 id
  const byName = {};
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    for (const l of j.canon?.locations || []) {
      (byName[l.name] ||= new Map()).set(l.id, (byName[l.name].get(l.id) || 0) + 1);
    }
  }

  const anchorNames = { han: '洛都', song: '临安', jin: '建康', tang: '长安' };
  for (const [lineId, placeName] of Object.entries(anchorNames)) {
    const line = SECONDARY_LINES.find(l => l.id === lineId);
    const variants = byName[placeName];
    assert.ok(variants, `地名 ${placeName} 在库里查无`);
    // 覆盖 ≥5 关的 id 必须被锚收下——漏了就会有整批关卡触发不了
    for (const [id, count] of variants) {
      if (count >= 5) {
        assert.ok(line.anchorLocationIds.includes(id),
          `${line.name} 漏收孪生 id ${id}（覆盖 ${count} 关），那批关卡里锚不会响`);
      }
    }
  }
});

// —— 整线解锁 T3：太泉入口显示与说法变体（太泉解锁设计稿 2026-10-27 §5 / §10-4）——
// 文案逐字取 texts（不在测试里手抄）；阈值与期限 id 取配置；规则表与期限数值是测试夹具（仓库首版为空）。
// 顺序加载：并发 loadTs 会各自实例化 numbers.ts / playerLedgerRules.ts，夹具就挂不到同一份上。
const unlockLoaded = (async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const rules = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const secondary = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const entry = await loadTs('../src/modules/scenarioMods/secondaryLineEntry.ts');
  const packs = await loadTs('../src/modules/contentPacks/index.ts');
  const log = await loadTs('../src/modules/diagnostics/log.ts');
  const store = await loadTs('../src/modules/diagnostics/store.ts');
  return { numbers, rules, secondary, entry, texts: packs.CONTENT_PACKS.texts, log, store };
})();

const SONG_HURT = 'lcq.event.s12_10_rescue_xiao';
const KEY_EVENT = 'lyl.event.taiquan_sacred_fruit_05';
const ICE_START = 'test.event.ice_start';
const ICE_CLEAR = 'test.event.ice_clear';
const chronicleEntry = (stageId, eventId, sequence) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence });
/** 存档夹具：境界、flags、跨关编年史里已完成的事件（[stageId, eventId]）。 */
const taiquanSave = ({ realm = { 名称: '坐照', 阶段: '初期' }, flags = { 'line.song.outcome': 'resolved' }, done = [] } = {}) => ({
  角色: { 属性: { 境界: realm } },
  世界: { 状态: { 剧本模组: {
    // 夹具期限事件不在正典里，挂进本关 events 才认得（orderedDoneEventIds 只认已知事件 id）
    modId: 'lcq.stage_02', events: [{ id: ICE_START }, { id: ICE_CLEAR }], completedEventIds: [], flags: structuredClone(flags),
    chronicle: [['lcq.stage_02', 'lcq.event.s02_01'], ...done].map(([stageId, eventId], i) => chronicleEntry(stageId, eventId, i + 1)),
  } } },
});
const ledgerTable = (patch = {}) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], itemGroups: [], partyJoins: [], partyLeaves: [], partyOpenings: [], progressTicks: [], progressDeadlines: [], ...patch });

/** 挂上冰蛊期限（id 取配置），用完复原。 */
async function withIceGu(fn) {
  const { rules, numbers } = await unlockLoaded;
  const iceId = numbers.GAME_NUMBERS.story.lineUnlock.taiquan.requireDeadlinesCleared[0];
  const limits = numbers.GAME_NUMBERS.story.progressDeadline.limits;
  rules.setPlayerLedgerRulesForTest(ledgerTable({ progressDeadlines: [{ id: iceId, name: '冰蛊', startEventIds: [ICE_START], clearEventIds: [ICE_CLEAR] }] }));
  limits[iceId] = { due: 3, urgentAt: 2 };
  try { return await fn(iceId); } finally {
    rules.setPlayerLedgerRulesForTest(undefined);
    delete limits[iceId];
  }
}
const quietConsole = async (fn) => {
  const saved = { warn: console.warn, error: console.error, info: console.info };
  console.warn = () => {}; console.error = () => {}; console.info = () => {};
  try { return await fn(); } finally { Object.assign(console, saved); }
};

test('太泉锚：王哲托付 s02_01 后可见、迷楼钥匙 _05 后也可见，原锚 _02 不再开线', async () => {
  const { secondary } = await unlockLoaded;
  const visible = (done) => secondary.resolveAvailableLines(undefined, {}, done).some(l => l.id === 'taiquan');
  assert.equal(visible(['lcq.event.s02_01']), true);
  assert.equal(visible([KEY_EVENT]), true);
  assert.equal(visible(['lyl.event.taiquan_sacred_fruit_02']), false);
  assert.equal(visible([]), false);
  const line = secondary.SECONDARY_LINES.find(l => l.id === 'taiquan');
  assert.equal(line.unlock, 'taiquan');
  assert.ok(secondary.SECONDARY_LINES.filter(l => l.id !== 'taiquan').every(l => !l.unlock && !l.entryHintKeys), '其余线不设锁');
});

test('其余九条线的锚与改动前一致（快照），resolveAvailableLines 签名不变、锁住的线照样返回', async () => {
  const { secondary } = await unlockLoaded;
  // 改动前（cd95d716）的锚：[anchorEventIds, anchorEventPending, anchorLocationIds, anchorCharacterIds]
  const before = {"commerce":[["lcq.event.weapon_deal_with_geluo"],null,null,null],"taiyi":[["lcq.event.s01_04"],null,null,["lcq.character.wang_zhe"]],"xingyuehu":[["lcq.event.s04b_lingfei_baiyi_crisis_16"],null,null,["liuchao.character.xie_yi","liuchao.character.xiao_yao_yi"]],"heimohai":[["lcq.event.s04b_lingfei_baiyi_crisis_04"],null,null,null],"zhaonan":[["lcq.event.s03b_snake_flower_bridge_02"],null,["liuchao.location.wuyuan","liuchao.location.wu_yuan_cheng"],["liuchao.character.yun_cang_feng","liuchao.character.wu_er_lang"]],"jin":[["lcq.event.palace_haunting_rumor"],null,["liuchao.location.jiankang"],null],"song":[["lcq.event.s10_01_jiangzhou_order"],null,["liuchao.location.jiangzhou","liuchao.location.linan","liuchao.location.lin_an"],null],"han":[["lcq.event.s07_01_old_case"],null,["liuchao.location.luoyang","lyl.location.luoyang"],["liuchao.character.xiao_yao_yi"]],"tang":[["lyg.event.changgan_fanseng_hunt"],null,["liuchao.location.changan"],null]};
  const now = Object.fromEntries(secondary.SECONDARY_LINES.filter(l => l.id !== 'taiquan')
    .map(l => [l.id, [l.anchorEventIds ?? null, l.anchorEventPending ?? null, l.anchorLocationIds ?? null, l.anchorCharacterIds ?? null]]));
  assert.deepEqual(now, before);
  assert.equal(secondary.resolveAvailableLines.length, 3);
  // s02_01 只开太泉，不顺带开别的线
  assert.deepEqual(secondary.resolveAvailableLines(undefined, {}, ['lcq.event.s02_01']).map(l => l.id), ['taiquan']);
});

test('已走进太泉只认门后节点：迷楼两拍（临安收束章、门前）不算，取果 _10 及以后算', async () => {
  const { secondary } = await unlockLoaded;
  const line = secondary.SECONDARY_LINES.find(l => l.id === 'taiquan');
  const opts = secondary.secondaryLineUnlockOptions(line);
  assert.equal(opts.required, true);
  assert.ok(!opts.enteredEventIds.includes('lyl.event.taiquan_sacred_fruit_04'));
  assert.ok(!opts.enteredEventIds.includes(KEY_EVENT));
  assert.ok(opts.enteredEventIds.includes('lyl.event.taiquan_sacred_fruit_10'));
  assert.deepEqual(opts.enteredEventIds, line.nodes.filter(n => !n.beforeUnlock).map(n => n.eventId));
  assert.equal(secondary.secondaryLineUnlockOptions(secondary.SECONDARY_LINES.find(l => l.id === 'song')), undefined);
  // 境界 3 走完迷楼两拍：仍锁；走到取果：追认解锁
  const { entry } = await unlockLoaded;
  const weak = { realm: { 名称: '生象' }, flags: {} };
  assert.equal(entry.secondaryLineEntryView(line, taiquanSave({ ...weak, done: [['lyl.taiquan_sacred_fruit', 'lyl.event.taiquan_sacred_fruit_04'], ['lyl.taiquan_sacred_fruit', KEY_EVENT]] })).locked, true);
  assert.equal(entry.secondaryLineEntryView(line, taiquanSave({ ...weak, done: [['lyl.taiquan_sacred_fruit', 'lyl.event.taiquan_sacred_fruit_10']] })).locked, false);
});

test('锁住时：标题＋缺项句逐字等于 texts，顺序修为 → 线数 → 冰蛊，{X} 换成中文数字', async () => {
  const { secondary, entry, texts, numbers } = await unlockLoaded;
  const line = secondary.SECONDARY_LINES.find(l => l.id === 'taiquan');
  const short = numbers.GAME_NUMBERS.story.lineUnlock.taiquan.minClosedLines;
  const linesText = texts['line.taiquan.locked.lines'].split('{X}').join(entry.lineGapCountText(short));
  assert.ok(texts['line.taiquan.locked.lines'].includes('{X}'));
  assert.equal(texts['line.taiquan.locked.title'], '太泉古阵 · 时机未到');
  await withIceGu(async (iceId) => {
    const iceText = texts[`line.taiquan.locked.deadline.${iceId}`];
    assert.ok(iceText);
    const running = [['lcq.stage_02', ICE_START]];
    const cases = [
      [{ realm: { 名称: '入微' }, flags: {}, done: running }, [texts['line.taiquan.locked.realm'], linesText, iceText]],
      [{ realm: { 名称: '入微' } }, [texts['line.taiquan.locked.realm']]],
      [{ flags: {} }, [linesText]],
      [{ done: running }, [iceText]],
      [{ realm: { 名称: '入微' }, done: running }, [texts['line.taiquan.locked.realm'], iceText]],
    ];
    for (const [fixture, hintLines] of cases) {
      const view = entry.secondaryLineEntryView(line, taiquanSave(fixture));
      assert.deepEqual(view, { locked: true, title: texts['line.taiquan.locked.title'], hintLines }, JSON.stringify(fixture));
    }
    // 冰蛊已了结、或期限未起算：不出冰蛊句
    const cleared = entry.secondaryLineEntryView(line, taiquanSave({ realm: { 名称: '入微' }, done: [...running, ['lcq.stage_02', ICE_CLEAR]] }));
    assert.deepEqual(cleared.hintLines, [texts['line.taiquan.locked.realm']]);
  });
});

test('太泉时机未到：六阳换算成配置里的境界名，只出实际缺的条件，{X} 写成中文且不出现阿拉伯数字', async () => {
  const { secondary, entry, texts, numbers } = await unlockLoaded;
  const { levelName } = await loadTs('../src/utils/realmUtils.ts');
  const realmText = texts['line.taiquan.locked.realm'];
  const linesTemplate = texts['line.taiquan.locked.lines'];
  const needLevel = numbers.GAME_NUMBERS.story.lineUnlock.taiquan.minRealmLevel;
  const realmName = levelName(needLevel);
  assert.ok(realmText.includes('六阳'));
  assert.ok(realmText.includes(realmName), realmName);
  assert.equal(realmName, '坐照');
  for (const sentence of [realmText, linesTemplate]) {
    assert.equal(sentence.includes('国家线'), false, sentence);
    assert.equal(sentence.includes('收束'), false, sentence);
  }
  assert.equal(linesTemplate.split('{X}').length - 1, 1);
  assert.equal(entry.lineGapCountText(1), '一');
  assert.equal(entry.lineGapCountText(2), '两');
  assert.equal(entry.lineGapCountText(3), '三');
  assert.equal(entry.lineGapCountText(12), '十二');
  assert.equal(entry.lineGapCountText(20), '二十');
  assert.equal(/[0-9]/.test([0, 1, 2, 3, 10, 12, 20, 22].map(n => entry.lineGapCountText(n)).join('')), false);

  const line = secondary.SECONDARY_LINES.find(l => l.id === 'taiquan');
  const onlyLines = entry.secondaryLineEntryView(line, taiquanSave({ flags: {} }));
  assert.equal(onlyLines.hintLines.length, 1);
  assert.equal(onlyLines.hintLines[0], '手头的事还没了结。至少还得先了结一处的大事，才腾得出手。');
  assert.equal(/\s/.test(onlyLines.hintLines[0]), false, '锁定句数字两侧不留空格（fix5939-3）');
  assert.equal(onlyLines.hintLines[0].includes('六阳'), false);
  assert.equal(/[0-9]/.test(onlyLines.hintLines[0]), false);

  const onlyRealm = entry.secondaryLineEntryView(line, taiquanSave({ realm: { 名称: '入微' } }));
  assert.equal(onlyRealm.hintLines.length, 1);
  assert.equal(onlyRealm.hintLines[0], '王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。');
  assert.equal(onlyRealm.hintLines[0], realmText);
});

test('解锁后两版说法：s12_10 已完成＝宋版，否则王哲版；钥匙附句只在 _05 已完成时跟在宋版后面', async () => {
  const { secondary, entry, texts } = await unlockLoaded;
  const line = secondary.SECONDARY_LINES.find(l => l.id === 'taiquan');
  // 定稿原文（剧情方案 §10，用户 2026-10-27 08:17 批）：逐字核对，入口不点徐君房名字
  assert.equal(texts['line.taiquan.entry.song'], '「我正好要去一趟太泉古阵，大伙儿说说那东西长什么样子，我顺路把它采了。」小狐狸的伤指望着那颗赤阳圣果，往苍澜去碰碰运气。');
  assert.equal(texts['line.taiquan.entry.wangzhe'], '「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」师帅交代的事，总得走这一趟。到了苍澜镇，再找个认路的向导。');
  assert.equal(texts['line.taiquan.entry.song.key'], line.entryHint, '钥匙附句沿用原 entryHint');
  for (const key of Object.keys(texts).filter(k => k.startsWith('line.taiquan.'))) assert.ok(!texts[key].includes('徐君房'), key);

  const song = [['lcq.stage_12_jiangzhou_counterwar', SONG_HURT]];
  const key = [['lyl.taiquan_sacred_fruit', KEY_EVENT]];
  const view = (done) => entry.secondaryLineEntryView(line, taiquanSave({ done }));
  assert.deepEqual(view([]), { locked: false, title: line.name, hintLines: [texts['line.taiquan.entry.wangzhe']] });
  assert.deepEqual(view(key).hintLines, [texts['line.taiquan.entry.wangzhe']], '王哲版不挂钥匙附句');
  assert.deepEqual(view(song).hintLines, [texts['line.taiquan.entry.song']]);
  assert.deepEqual(view([...song, ...key]).hintLines, [texts['line.taiquan.entry.song'], texts['line.taiquan.entry.song.key']]);
});

test('没设锁的线照旧：标题＝线名，指引＝entryHint 原文', async () => {
  const { secondary, entry } = await unlockLoaded;
  for (const line of secondary.SECONDARY_LINES.filter(l => !l.unlock)) {
    assert.deepEqual(entry.secondaryLineEntryView(line, taiquanSave({ realm: { 名称: '无修为' }, flags: {} })), { locked: false, title: line.name, hintLines: [line.entryHint] });
  }
});

test('文案键缺失记 LCQ-PCK-005（同一键只记一次）并用兜底：标题退回「线名 · 时机未到」、缺项句跳过、说法主句缺失退回 entryHint', async () => {
  const { secondary, entry, texts, log, store } = await unlockLoaded;
  const line = secondary.SECONDARY_LINES.find(l => l.id === 'taiquan');
  const without = (...keys) => Object.fromEntries(Object.entries(texts).filter(([k]) => !keys.includes(k)));
  const hits = () => store.logStore.recent(500).filter(e => e.code === 'LCQ-PCK-005');
  log.resetLogState();
  await quietConsole(async () => {
    const locked = entry.secondaryLineEntryView(line, taiquanSave({ realm: { 名称: '入微' }, flags: {} }), without('line.taiquan.locked.title', 'line.taiquan.locked.realm'));
    assert.deepEqual(locked, { locked: true, title: '太泉古阵 · 时机未到', hintLines: [texts['line.taiquan.locked.lines'].split('{X}').join(entry.lineGapCountText(1))] });
    entry.secondaryLineEntryView(line, taiquanSave({ realm: { 名称: '入微' }, flags: {} }), without('line.taiquan.locked.title', 'line.taiquan.locked.realm'));
    const song = [['lcq.stage_12_jiangzhou_counterwar', SONG_HURT], ['lyl.taiquan_sacred_fruit', KEY_EVENT]];
    assert.deepEqual(entry.secondaryLineEntryView(line, taiquanSave({ done: song }), without('line.taiquan.entry.song')).hintLines, [line.entryHint]);
    assert.deepEqual(entry.secondaryLineEntryView(line, taiquanSave({ done: song }), without('line.taiquan.entry.song.key')).hintLines, [texts['line.taiquan.entry.song']], '附句缺失只跳过那一句');
  });
  const keys = hits().map(e => e.detail.textKey).sort();
  assert.deepEqual(keys, ['line.taiquan.entry.song', 'line.taiquan.entry.song.key', 'line.taiquan.locked.realm', 'line.taiquan.locked.title']);
  assert.ok(hits().every(e => e.detail.lineId === 'taiquan' && e.level === 'warn'));
  log.resetLogState();
});

test('右栏入口改走 secondaryLineEntryView：锁住时用「时机未到」标题、逐句显示、灰显不隐藏', () => {
  const sidebar = fs.readFileSync('src/components/dashboard/RightSidebar.vue', 'utf8');
  const entries = fs.readFileSync('src/modules/scenarioMods/sidebarLineEntries.ts', 'utf8');
  assert.match(entries, /secondaryLineEntryView\(line, save\)/);
  assert.match(entries, /name: view\.locked \? view\.title : secondaryLineDisplayName\(line, event\)/);
  assert.match(sidebar, /v-for="\(hint, i\) in line\.hintLines"/);
  assert.match(sidebar, /'quest-locked': line\.locked/);
  assert.doesNotMatch(sidebar + entries, /hint: line\.entryHint/);
});
