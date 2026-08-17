import assert from 'node:assert/strict';
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
  assert.equal(SECONDARY_LINES.length, 9, '九条线：宗派 3 ＋ 国家／地区 5 ＋ 商道 1');
  for (const line of SECONDARY_LINES) {
    if (line.kind === 'commerce') {
      // 商道既不锚地方也不锚人——它锚的是「你第一次发现生意能办武力办不成的事」那一拍。
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
    if (!j.scenario?.worldSimulation) continue;
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
    if (!j.scenario?.worldSimulation) continue;
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
    if (line.kind === 'commerce') {
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
    if (!j.scenario?.worldSimulation) continue;
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
