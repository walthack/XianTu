#!/usr/bin/env node
/**
 * 三级任务链报表——从源码算，不手写，随时重跑即刷新。
 *
 * 为什么要它：审核时最费时间的不是读节点，是**对照**——哪个 event 被两级共用、
 * 哪条线的顶点喂了另一条线的入口、人物戏挂在谁底下、哪里序倒了。
 * 这些都能从 `mainQuestAxis.ts`／`secondaryLines.ts`／人物线文档里算出来。
 *
 * 用法：node scripts/quest-report.mjs [--json]
 * 输出：docs/quest-report.html（默认）或 stdout JSON
 */

// ── 本轮复审查出的**真缺陷**（用户 2026-08-18 要求：只报"不修就接不上"的）。
// 已明确改判为**非缺陷**、不再列入：主轴 425 拍断层、血脉拍无抉择、主轴节点稀疏、深拍占比。
// 判据基线：用户确认按《上古卷轴5》模式——**玩家跑到任何一个国家都能开启相应的线**，
// 除非有真正的限制性要求。故"玩家必然按 seq 顺序走过前面内容"这个假设不成立，
// 跨线依赖一律按"玩家可能没走过那条线"计。
const REAL_DEFECTS = [
  { kind: '✅ 已修', where: '主轴 / 黑魔海', what: '三条 event 的 axisSeq 为 null，排序当 0，被顶到线首',
    detail: 'Grok 怀疑「秦桧那拍也是空值」——查证属实，全库 3 条：`s07_qinhui_join`（黑魔海首拍，实属 222–278）、'
      + '`plan_counterattack` ＋ `yin_yang_counter`（主轴首两拍，实属 666–667，让「太泉核心区躲潘金莲」排在「穿越后初遇月霜」之前）。'
      + '正典时间线查不到这三拍的 idx，故不编 seq；改为 null 时兜底用关窗起点。修后黑魔海首拍回到 seq 78，'
      + '秦桧归顺落到 222，紧挨同为 222 的「确认朱老头就是殇侯」——殇侯交人这件事前后连上了。' },
  { kind: '✅ 已补', where: '宋国 584→604', what: '营救林冲的结果',
    detail: '`lyl.event.linchong_still_exiled`（seq 590）：野猪林截杀未逞，林冲仍按刺配赴江州。正典 idx 586／589／590。' },
  { kind: '✅ 已补', where: '黑魔海 419→540', what: '先发制人那一仗的结局',
    detail: '`lcq.event.blacksea_vault_split`（seq 423）：银库五万金铢，与孟非卿四六分成。正典 idx 423 第229章·倩影。' },
  { kind: '✅ 已补', where: '唐国 1382→1396', what: '战败之后如何还活着',
    detail: '`lyg.event.claim_slew_demon`（seq 1383）：谎称斩了李辅国所饲妖祟、以血藤为证。正典 idx 1383 玄机献处。'
      + '受封本身 idx 1396 已有 event 承载，故不重复。' },
  { kind: '✅ 已补', where: '晋国 343→372', what: '泉玉姬是谁、为何审',
    detail: '`lcq.event.quanyuji_soul_pill`（seq 371）：她献出一魂一魄炼的魂丹，你吞下后掌握她生死——**先有这拍，六扇门审问才成立**。正典 idx 370 冰泉／371 魂丹。' },
  { kind: '✅ 已补', where: '太乙 413→463', what: '元行健怎么死的',
    detail: '曾两批独立判「正典无据」，**结论被推翻**：MiniMax 第246章·粮战明写「程宗扬告知元行健是**自己所杀**」。'
      + '正典陈述了事实但未演这场戏，故 `lcq.event.yuanxingjian_disposed`（seq 414）把它演出来。'
      + 'Grok 判为浅拍不做机会卡——正典已写死是玩家所杀，给「不杀」就是造分歧线。' },
  { kind: '✅ 已补', where: '唐国 1066→1089', what: '小紫、吕雉为何被困大雁塔',
    detail: '同样曾判「无据」被推翻：MiniMax「显圣」章明写小紫**并非擅闯**，是从**兴庆宫内某处遗迹被莫名传送入塔**，'
      + '暴露传送阵的存在。`lyg.event.xiaozi_teleported_into_dayanta`（seq 1087）。'
      + 'Grok 主动没写「传送阵与太泉古阵同源」——正典没写。' },
  { kind: '✅ 已补', where: '宋国 435→495', what: '三川口战果（只走宋线时胜负是偷来的前提）',
    detail: '`lcq.event.sanchuankou_result_rumor`（seq 459）带 **B 模型场外结算**：不去打则超时后世界自行结算，只得传言。'
      + '⚠ Grok 发现两份正典冲突：deepseek seq 471 写「西夏军、刘平被俘」（那是作者**后记**里的史实比附），'
      + 'MiniMax 第244章·篓鱼正文写「捧日军三个军被星月湖击溃，刘平、卢政、郭遵战死」。取正文那份，**没有写成已胜**。' },
  { kind: '✅ 已改', where: '汉国 895→902', what: '因果写反（已定拥立在前，才问是否拥立在后）',
    detail: '做「去现场／没去现场」分支时顺带解决：902 带条件 `arrange_escape_route.done neq true`——'
      + '**走过 895 的玩家不会被再问一次**，只有没走过的人才从传闻线进来。' },
  { kind: '✅ 已摘', where: '宋国 1130／1134、黑魔海 1069', what: '不属于这些线的脊梁',
    detail: '宋国两拍改挂唐国（本就在唐国关）。依据是本轮确立的规则：**国家线跟的是「玩家在这个国家的行动与见闻」，'
      + '「内容关于宋」≠「属于宋线」**。黑魔海 1069 摘出；**1399 保留**——它审的是双姬下落与鬼王峒黑魔海旧怨，知识域确属黑魔海。' },
  { kind: '✅ 已清零', where: '八条线', what: '「本线反复用他、却从不介绍」',
    detail: '⚠ **这个指标口径错了四次**：跨线 seq 落差(27) → 登场拍不在本线(17，把隔离件当首次出现) → '
      + '只算可达 event(12) → **把第三级人物插入也算进覆盖(2)**。用户一句「为啥不做成人物任务」把它打到 2。'
      + '其余 10 处第三级本就覆盖（小紫在唐国段有 4 拍）。最后 2 处补了 4 条人物插入拍（吕雉／秦桧各 2），**清零**。' },
  { kind: '⏳ 留待', where: '宋国 ← 星月湖 / 晋国 ← 黑魔海', what: '跨线前提（龙宸被劈成两半）',
    detail: '宋国那条已由三川口结算拍解决。晋国 732／785 揭广源行旧账，而入口在黑魔海 540 擒惊理——'
      + '只走晋线，龙宸会从账本里凭空冒出来。未处理。' },
];

// ── 动词反推：与 `runtime.deriveInteractionVerb` 同一套正则（玩家看到的按钮＝动词·对象）。
// 用户 2026-08-19 正在按标题审走向，故把每条会推出的动词标出来。
// ⚠ 这是**复制**的启发式，不是共享代码——runtime 那边改了正则，这里要跟着改。
const verbOf = t => {
  if (!/(?:躲避|避开|规避|防备|不被)/u.test(t) && /(?:击退|迎战|攻击|斩杀|搏杀|交锋|制伏|制服)/u.test(t)) return '攻击';
  if (/(?:使用|服用|取出|祭出|装备|交付).{0,10}(?:道具|药|丹|符|器|物|信|令)/u.test(t)) return '使用';
  if (/(?:前往|赶往|赶赴|动身|启程|进入|离开)/u.test(t)) return '前往';
  if (/(?:请求|询问|交谈|对话|商议|交涉|说服|劝说|告知)/u.test(t)) return '交谈';
  if (/(?:观察|察看|查看|留意|见证|确认|调查|探查|打量|查明|查清|识别|辨认)/u.test(t)) return '观察';
  if (/(?:休息|休整|修炼|调息|疗伤|打坐)/u.test(t)) return '修整';
  return '行动';
};

// ── 本轮待审：这一轮由 Claude 做出的判断，**每一条都需要用户过目**。
// 用户 2026-08-18 指出：「主轴和二级线并未真正定稿，你这轮做完的是待审。」
// 故本清单不是变更日志，是**审阅工单**：每条给出「我做了什么／依据是什么／你可能想推翻的是哪里」。
const PENDING_REVIEW = [
  { tag: '✅ 已确认', title: '加了第九条二级线「商道」',
    did: '把事件层里 seq 134→885 的商业弧落成一条线，12 个 ready 节点。它既不锚地方也不锚人，锚「你第一次发现生意能办武力办不成的事」那一拍（seq 134）。',
    basis: '你从「盘江股东大会」一条孤儿反查出整条线缺失。实测以商业为主语的拍 18 条，去掉隔离件后是全书跨度最长的一条连续弧。',
    risk: '锚点选 seq 134 是我定的——更早的 s03_03「以新奇器物向苏妲己索酬」(seq 38) 在隔离关，锚上去线就打不开。若你要从更早开线，需先放出隔离件。' },
  { tag: '✅ 已确认', title: '把 4 条我原判「纯背景」的拍改判为情节拍',
    did: '宦官嫁祸(1217)／宦官再分权(1321)／独柳树刑场(1335)／凉州盟擂台(1204) 落唐国线；入微突破(297) 按其实质「以珊瑚匕首逼退苏妲己」落晋国线；探视金蜜镝谈帝统(995) 落汉国线。',
    basis: '你逐条驳回了我的「背景」判断，查证四字段后属实。',
    risk: '凉州盟(1204) 落唐国线是我的选择——它是铁马堂的擂台赛，也可归商道线（镖局生意）或独立江湖线。' },
  { tag: '✅ 已确认', title: '两条流言不上链',
    did: '《阳武侯小史》流言、核武不扩散条约·惊魂——不挂任何线。',
    basis: '你的裁定：算 trivial，日后作城市流言或杂项书籍提及。',
    risk: '《阳武侯小史》其实直接关联血脉正统化（舆论把你说成阳武侯嫡子），与主轴的血脉要求同题。要进主轴的话现在说。' },
  { tag: '✅ 已确认', title: '主轴最后一个待写 event 判为「不必新增」',
    did: '「进鬼王峒并当面辨认碧姬」原挂隔离关等裁定，改指已重建的可达件 geluo_summons_biji(seq 158)。',
    basis: 'description 明写「程宗扬首次当面见到谢艺寻找的人」，正是这一拍。与昭南线双喂。',
    risk: '双喂＝同一个 event 同时喂主轴与昭南。要分开就得新增一条 event。' },
  { tag: '补断拍', title: '补了 8 处断拍，全部用现成 event，零新增',
    did: '黑魔海 +2（巢穴逆转 419／静善夜袭 596）、晋国 +1（北府兵解围 287）、汉国 +1（郭解之死 956）、唐国 +2（小紫被救走 1090／鱼弘志弑唐皇 1312）、昭南 +1（苏妲己水镜传讯 100）、宋国 +1（林冲刺配 584）。',
    basis: 'Claude 与 Grok 各自独立复审。Grok 报 10 处（6 个建议 id 我逐条核实，6/6 真实可达未认领）；我机械查出 2 处，恰在 Grok 判为干净的那两条线上。',
    risk: '每一处的节点文案是我写的——文案怎么说这一拍，决定玩家看到什么。' },
  { tag: '✅ 已确认', title: '删掉两处「文案在骗玩家」的半句',
    did: '「董卓无符入京；刘建伏诛」「旁观李辅国审判；唐皇被弑」——删掉的那半句在对应 event 四字段里根本不存在。',
    basis: 'Grok 抓出，我核实属实。真正的弑君是 seq 1312 另一条 event，已补为独立节点。',
    risk: '无，这是修错。' },
  { tag: '✅ 已确认', title: '汉国宫变段做成「去了现场／没去现场」两条分支',
    did: '901「从传闻得知…」仅当没走过 891 含光殿现场时出现；902「决定是否拥立定陶王」仅当没走过 895 时出现。另在 4 个可达件上补了场外结算合同。',
    basis: '你的设计问题。查证发现引擎早有 offscreenResolution ＋ conditions 两件现成机制，而这段的 4 条合同挂在隔离关原件上、永不触发——接线当初就建了，断在隔离迁移上。',
    risk: '门控判据取 891／895 是我定的。若玩家走过 891 却没走过 896，关于刘建的部分对他仍是新消息——我按「入口拍」一刀切，没逐条分解。' },
  { tag: '✅ 已接线', title: '人物任务已接进游戏（右侧栏＋提示词各一处）',
    did: 'characterQuests.ts：8 条线 54 拍 ＋ A 档 29 人 35 条单点高光，id 全部解析成真实 event。',
    basis: '第三级此前零代码，只存在于 markdown 里。',
    risk: '已接：右侧栏「这一拍谁有戏」＋提示词同名一行，空则整块／整行省略。⚠ 实测这块面板只会在约 18% 的拍上出现，是数据覆盖决定的——嫌少该补人物挂点，不是改代码。' },
  { tag: '待落地', title: '商贾线设计落档，后期做',
    did: 'docs/R3-11-COMMERCE-TIER-DESIGN：变现层设计（regionStanding × 商道台阶 → 每回合收益）。',
    basis: '你的设想：通过商业版图扩展（攻略各国获地区声望）获得稳定金钱／物品。',
    risk: '阻塞裁定 P1：地区立足度目前是 STAGE_ORDER 走过比例的纯派生量（打到哪赚到哪），玩家无法主动经营某地。甲（保持派生）／乙（加可投入分量）未定。' },
];

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA = 'src/modules/scenarioMods/builtins/data';
const AXIS = 'src/modules/scenarioMods/mainQuestAxis.ts';
const LINES = 'src/modules/scenarioMods/secondaryLines.ts';
const CHARDOC = 'docs/R3-10-CHARACTER-QUESTS-DRAFT-2026-08-16.md';

// ── 事件层：id → { seq, name, stage }
const events = new Map();
const stageWindows = new Map();
const chapterOf = new Map();   // eventId → 所属章（大场景）
const gateOf = new Map();      // eventId → 前置拍的 id 尾段（该拍 done 才开）
for (const f of fs.readdirSync(path.join(ROOT, DATA)).filter(x => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, DATA, f), 'utf8'));
  if (!j.scenario?.worldSimulation) continue;
  stageWindows.set(j.manifest.id, [j.manifest.axisSeqLo, j.manifest.axisSeqHi]);
  // 触发关系（核实 2026-08-19，读 `runtime.ts` 的推进循环得出）：
  //   关→关   本关无 active 且无未结 critical → `stage_ready`
  //   章→章   章的 `activation` 链在上一章的 done flag 上（`settleCompletedChapterFlags` 派生）
  //   章内     **章一激活，章内 conditions 通过的 event 一次性全部进 `activeEventIds`**；
  //            而 `conditionsMatch` 首行是 `!conditions?.length` —— **空条件＝无条件放行**。
  // 故章内默认**无先后**，除非某拍的 conditions 指向同章另一拍的 `flags.event.X.done`。
  // 全库实测：524 拍中有 conditions 的 177（34%），指向另一拍的 143，**同章的仅 71（14%）**。
  // 严格顺序来自 canonRail（一次只放一拍）：37 个 world_sim 关里 29 关有 rail profile，
  // 但每个 profile 只覆盖**一个章**的一串 orderedEventIds，章外的拍仍是池。
  // 用户 2026-08-19：「接下去这个 event 怎么触发没有显示在文档内，所以前后 event 会让我觉得没啥关系」——
  // 感觉是准的，故在此把门控读出来标进报告。
  for (const e of j.scenario.events || []) {
    for (const c of e.conditions || []) {
      const m = /^flags\.event\.(.+)\.done$/.exec(c.path || '');
      if (m && c.operator === 'eq' && c.value === true) {
        if (!gateOf.has(e.id)) gateOf.set(e.id, []);
        gateOf.get(e.id).push(m[1]);
      }
    }
  }
  // 章（`scenario.chapters`）就是「大场景」，其 eventIds 是这场戏下的小拍。
  // 2026-08-19 用户看着一串平铺的拍问「这一串是否可以归入一个大场景」——
  // 结构本来就在，是本报告没显示；显示出来同时也防误合：
  // 他举的三川口／定川寨看着像一场，实为两关两章两场仗（史上亦相隔两年）。
  for (const c of j.scenario.chapters || []) {
    for (const id of c.eventIds || []) {
      chapterOf.set(id, { id: c.id, title: c.title || c.id, summary: c.summary || '', size: (c.eventIds || []).length });
    }
  }
  const seqs = (j.scenario.events || []).map(e => e.axisSeq).filter(v => typeof v === 'number');
  const stageLo = seqs.length ? Math.min(...seqs) : 0;
  for (const e of j.scenario.events || []) {
    events.set(e.id, {
      // `axisSeq` 可能为 null。**不要当 0**——那会把后段内容顶到线首
      // （实测曾造成主轴首拍变成太泉核心区、黑魔海首拍变成秦桧归顺）。
      // 兜底用该关窗口起点：不发明正典数据，只保证排序不撒谎。
      seq: e.axisSeq ?? stageLo, seqIsFallback: e.axisSeq == null,
      name: e.name, stage: j.manifest.id,
      // 四字段拼一起，供「登场」判定用（谁最早出现在哪一拍）
      blob: [e.name, e.description, e.objective, e.axisBeat].filter(Boolean).join(' '),
    });
  }
}

// ── 正典人名：登场判定用。取 `canonicalName`（registry 的 `name` 字段不存在，曾在此栽过）。
const charNames = new Set();
{
  const p = path.join(ROOT, 'src/modules/scenarioMods/builtins/character-registry.json');
  if (fs.existsSync(p)) {
    for (const c of JSON.parse(fs.readFileSync(p, 'utf8')).characters || []) {
      if (typeof c.canonicalName === 'string') charNames.add(c.canonicalName);
    }
  }
}

// ── 节点表：正则抽，不引入 TS 运行时（报表要能独立跑）
const nodeRe = /\{[^{}]*text: '([^']+)'[^{}]*\}/g;
const field = (blob, key) => blob.match(new RegExp(`${key}: '([^']+)'`))?.[1];

function parseNodes(blob) {
  const out = [];
  for (const m of blob.matchAll(nodeRe)) {
    const b = m[0];
    const status = field(b, 'status');
    if (!status) continue;
    const eventId = field(b, 'eventId');
    out.push({
      text: m[1],
      status,
      eventId,
      stageId: field(b, 'stageId'),
      branch: field(b, 'bloodlineBranch'),
      seq: eventId && status === 'ready' ? events.get(eventId)?.seq : undefined,
      exists: eventId ? events.has(eventId) : false,
    });
  }
  return out;
}

const axisSrc = fs.readFileSync(path.join(ROOT, AXIS), 'utf8');
const linesSrc = fs.readFileSync(path.join(ROOT, LINES), 'utf8');

const axisStart = axisSrc.indexOf('MAIN_QUEST_NODES: MainQuestNode[]');
const tiers = [{
  id: 'main', name: '主轴', tier: 1,
  nodes: parseNodes(axisSrc.slice(axisStart, axisSrc.indexOf('\n];', axisStart))),
}];
for (const m of linesSrc.matchAll(/id: '(\w+)',\s*\n\s*name: '([^']+)',\s*\n\s*kind: '(\w+)',([\s\S]*?)pendingExpansion:/g)) {
  tiers.push({
    id: m[1], name: m[2], tier: 2, kind: m[3],
    anchor: m[4].match(/anchorEventIds: \['([^']+)'\]/)?.[1],
    anchorPending: m[4].includes('anchorEventPending'),
    hint: m[4].match(/entryHint: '([^']+)'/)?.[1] ?? '',
    nodes: parseNodes(m[4]),
  });
}

// ── 人物线：从文档抽「挂在哪个 event 下」。↪ 插入 与 ✅ 已有 都算挂点。
// ── 人物任务：**读模块，不读文档**（2026-08-18）。
// 文档是草稿，`characterQuests.ts` 才是接进游戏的那份——待审稿必须审代码里真有的东西。
// 仍用正则抽（报表不引入 TS 运行时）。
const CHARMOD = 'src/modules/scenarioMods/characterQuests.ts';
const chars = [];
if (fs.existsSync(path.join(ROOT, CHARMOD))) {
  const src = fs.readFileSync(path.join(ROOT, CHARMOD), 'utf8');
  const questBlock = src.slice(src.indexOf('CHARACTER_QUESTS'), src.indexOf('CHARACTER_HIGHLIGHTS'));
  let cur = null;
  for (const line of questBlock.split('\n')) {
    const nm = line.match(/^\s*name: '([^']+)',\s*$/);
    if (nm) { cur = { name: nm[1], hooks: [] }; chars.push(cur); continue; }
    const beat = line.match(/\{ text: '(.*?)', status: '(\w+)', eventIds: \[(.*?)\] \}/);
    if (!cur || !beat) continue;
    const ids = [...beat[3].matchAll(/'([^']+)'/g)].map(x => x[1]);
    if (beat[2] === 'new' || !ids.length) continue;
    cur.hooks.push({ eventId: ids[0], alsoIds: ids.slice(1), insert: beat[2] === 'insert', isNew: false,
                     label: '', visible: beat[1] });
  }
  // A 档单点高光：不成线，但同样是人物挂点，也要进待审稿。
  const hlBlock = src.slice(src.indexOf('CHARACTER_HIGHLIGHTS: CharacterHighlight[]'));
  const byName = new Map(chars.map(c => [c.name, c]));
  for (const m of hlBlock.matchAll(/\{ name: '([^']+)', eventIds: \[(.*?)\], text: '(.*?)' \}/g)) {
    const ids = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
    if (!ids.length) continue;
    let c = byName.get(m[1]);
    if (!c) { c = { name: m[1], hooks: [], highlightOnly: true }; chars.push(c); byName.set(m[1], c); }
    c.hooks.push({ eventId: ids[0], alsoIds: ids.slice(1), insert: true, isNew: false, label: 'A档', visible: m[3] });
  }
}


// ── 登场：某个角色在**事件层**里最早出现的那一拍。
// 用户 2026-08-18：「登场如果是某个任务下挂的注名一下，现在状态更像没做。」
// 实测确实容易误判——凝羽的登场就挂在昭南线 seq 35「奉苏妲己之命进赌局」上，
// 但节点没有任何标记，看起来像没做。故在这里算出来并打标。
// 判据是事件层最早出现，不是 `debut_*` 这个命名：那批「招牌登场」多数 axisSeq 为 0，
// 且 16 条压根没被任何线认领——真正承载首次登场的往往是别的拍。
const debutOf = new Map();   // eventId -> [人名]
{
  const named = [...charNames].filter(n => n.length >= 2 && n.length <= 4 && n !== '程宗扬');
  const first = new Map();
  const bySeq = [...events.entries()]
    .filter(([, e]) => typeof e.seq === 'number' && e.seq > 0)
    .sort((a, b) => a[1].seq - b[1].seq);
  for (const [id, e] of bySeq) {
    for (const n of named) {
      if (!first.has(n) && (e.blob || '').includes(n)) first.set(n, id);
    }
  }
  for (const [n, id] of first) {
    if (!debutOf.has(id)) debutOf.set(id, []);
    debutOf.get(id).push(n);
  }
}

// ── 关系：双喂 / 序回退 / 人物挂点
const owners = new Map();
for (const t of tiers) for (const n of t.nodes) if (n.eventId) {
  if (!owners.has(n.eventId)) owners.set(n.eventId, []);
  owners.get(n.eventId).push(t.name);
}
const shared = [...owners].filter(([, v]) => v.length > 1)
  .map(([id, v]) => ({ eventId: id, seq: events.get(id)?.seq, name: events.get(id)?.name, by: v }))
  .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

const regressions = [];
for (const t of tiers) {
  let prev = null;
  t.nodes.forEach((n, i) => {
    if (typeof n.seq !== 'number') { if (n.status !== 'ready') prev = null; return; }
    if (prev && n.seq < prev.seq) regressions.push({ line: t.name, from: prev, to: { i: i + 1, ...n } });
    prev = { i: i + 1, ...n };
  });
}

// §11 回填表用的是另一种表格形态（不在 `## N. 人名` 小节里），上面的分节解析读不到。
// 那批同样是人物挂点，漏了会让"真孤儿"虚高 35 条——本轮实测就栽在这里。
// 故再全文扫一遍：文档里出现过的 event id 一律算已挂点。
const docHooked = new Set();
if (fs.existsSync(path.join(ROOT, CHARDOC))) {
  const raw = fs.readFileSync(path.join(ROOT, CHARDOC), 'utf8');
  for (const m of raw.matchAll(/`((?:lcq|lyl|lyg|liuchao)\.event\.[a-zA-Z0-9_]+)`/g)) docHooked.add(m[1]);
}

const charHooks = new Map();
for (const c of chars) for (const h of c.hooks) {
  if (!charHooks.has(h.eventId)) charHooks.set(h.eventId, []);
  charHooks.get(h.eventId).push({ who: c.name, visible: h.visible, insert: h.insert });
}

// ── 人物任务清单：已展开 vs 待做。
// **口径（用户裁定 2026-08-17）：这些角色都要做。「料不够」只决定做多深，不决定做不做**——
// 所以下表不叫"不展开"，叫"待做"；理由一栏说明的是**该做到什么程度**，不是拒绝。
const charTodo = [];
if (fs.existsSync(path.join(ROOT, CHARDOC))) {
  const doc = fs.readFileSync(path.join(ROOT, CHARDOC), 'utf8');
  const i = doc.indexOf('### 2.2');
  const j = doc.indexOf('\n**为什么', i);
  if (i > 0) {
    for (const line of doc.slice(i, j > 0 ? j : undefined).split('\n')) {
      if (!line.startsWith('|') || line.includes('---')) continue;
      const c = line.replace(/^\||\|$/g, '').split('|').map(x => x.trim());
      if (c.length < 4 || /人物/.test(c[0])) continue;
      charTodo.push({ name: c[0].replace(/\*\*/g, ''), total: c[1], unclaimed: c[2], note: c[3] });
    }
  }
}
const charDone = chars.map(c => {
  const hooks = c.hooks;
  return { name: c.name, points: hooks.length, insert: hooks.filter(h => h.insert).length };
}).filter(c => c.points > 0);

const report = { tiers, chars, charDone, charTodo, shared, regressions, stageWindows: [...stageWindows] };
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(report, null, 1));
} else {
  const out = path.join(ROOT, 'docs/quest-report.html');
  fs.writeFileSync(out, render(report));
  const cnt = s => tiers.reduce((a, t) => a + t.nodes.filter(n => n.status === s).length, 0);
  console.log(`已生成 ${out}`);
  console.log(`  节点 ${tiers.reduce((a, t) => a + t.nodes.length, 0)}　ready ${cnt('ready')}　需新增 ${cnt('new')}　待扩 ${cnt('pending')}`);
  console.log(`  双喂 ${shared.length}　序回退 ${regressions.length}　人物挂点 ${charHooks.size}`);
  console.log(`  人物线 已展开 ${report.charDone.length} 条／待做 ${report.charTodo.length} 条`);
}

function render(r) {
  const MAX = 1399;
  const pc = s => ((s - 1) / MAX * 100).toFixed(3);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const cnt = (t, s) => t.nodes.filter(n => n.status === s).length;
  // 批注槽：`<artifact-sync>` 区域内的 contenteditable —— 读者敲进去的字会存进本页文档，
  // 并回到 Claude 会话（runtime contract 0.2.4）。注意三条硬约束：
  //   · `<textarea>` 的值**不会**被捕获，必须用 contenteditable 或 <input>；
  //   · 区域内容必须是页面里真实存在的 HTML（本报表是构建期生成，满足）；
  //   · 每块可编辑文本独占一个无子元素的容器。
  const cmt = (key, hint) => `<artifact-sync><span class="cmt" contenteditable="true" `
    + `data-k="${esc(key)}" data-hint="${esc(hint || '批注')}"></span></artifact-sync>`;
  const seqOf = n => n.seq ?? undefined;




  const flags = [
    ...r.regressions.map(x => `<li class="bad"><b>序回退</b> ${esc(x.line)}：#${x.from.i}「${esc(x.from.text)}」seq ${x.from.seq} → #${x.to.i}「${esc(x.to.text)}」seq ${x.to.seq}</li>`),
    ...r.tiers.filter(t => t.anchorPending).map(t => `<li class="warn"><b>锚待补</b> ${esc(t.name)} 的锚事件 <code>${esc(t.anchor)}</code> 还没写，暂用粗锚</li>`),
    ...r.tiers.flatMap(t => t.nodes.filter(n => n.status === 'new').map(n => `<li class="todo"><b>待写</b> ${esc(t.name)}：${esc(n.text)} → <code>${esc(n.eventId)}</code></li>`)),
  ].join('');

  return `<title>三级任务链</title>
<style>
:root{--paper:#EFE9DC;--card:#F6F2E8;--edge:#D3C8B2;--ink:#1F2124;--ink2:#4A4640;--ink3:#79715F;
 --qing:#2C5C7A;--huang:#8F6209;--zhu:#9E3527;--lv:#46654B;--tan:#6A4B45;--grid:#DCD2BE;--band:#E2D9C6}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--paper:#15171A;--card:#1E2126;--edge:#333A42;
 --ink:#ECE6DA;--ink2:#B8B0A1;--ink3:#8B8375;--qing:#74ADD1;--huang:#DCAE4A;--zhu:#E4735E;--lv:#88B28C;--tan:#B29189;--grid:#2B3138;--band:#232830}}
:root[data-theme=dark]{--paper:#15171A;--card:#1E2126;--edge:#333A42;--ink:#ECE6DA;--ink2:#B8B0A1;--ink3:#8B8375;
 --qing:#74ADD1;--huang:#DCAE4A;--zhu:#E4735E;--lv:#88B28C;--tan:#B29189;--grid:#2B3138;--band:#232830}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-size:15px;line-height:1.6;
 font-family:"PingFang SC","Hiragino Sans GB",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.serif{font-family:"Songti SC","STSong",serif}
.mono{font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.wrap{max-width:1180px;margin:0 auto;padding:44px 26px 80px}
h1{font-size:32px;margin:0 0 4px;letter-spacing:.04em;font-weight:600}
.sub{color:var(--ink3);font-size:13px}
header{border-bottom:2px solid var(--ink);padding-bottom:18px;margin-bottom:26px}
.stats{display:flex;gap:22px;flex-wrap:wrap;margin-top:15px}
.stat b{font-size:21px;font-weight:600;display:block}
.stat span{font-size:11px;color:var(--ink3);letter-spacing:.08em}
h2{font-size:12px;letter-spacing:.18em;color:var(--ink3);font-weight:600;margin:38px 0 13px;
 padding-bottom:6px;border-bottom:1px solid var(--edge)}
.box{background:var(--card);border:1px solid var(--edge);padding:16px 18px 10px;overflow-x:auto}
.axis{min-width:860px;position:relative}
.books{display:flex;margin-left:104px;margin-bottom:7px;gap:2px}
.books div{font-size:10px;letter-spacing:.1em;color:var(--ink3);background:var(--band);padding:3px 0;text-align:center}
.row{display:grid;grid-template-columns:96px 1fr;align-items:center;gap:8px}
.row+.row{margin-top:2px}
.row.main{padding-bottom:7px;margin-bottom:7px;border-bottom:1px solid var(--edge)}
.row.ch{padding-top:7px;margin-top:7px;border-top:1px solid var(--edge)}
.nm{font-size:13px;text-align:right}
.nm i{font-style:normal;font-size:9px;color:var(--ink3);display:block;letter-spacing:.06em}
.row.main .nm{font-weight:600;font-size:14px}
.tk{position:relative;height:24px}
.tk::after{content:"";position:absolute;left:0;right:0;top:12px;height:1px;background:var(--grid)}
.sp{position:absolute;top:11px;height:3px;background:var(--edge);border-radius:2px}
.m{position:absolute;top:7px;width:7px;height:11px;margin-left:-3.5px;border-radius:1px;background:var(--qing)}
.row.main .m{background:var(--tan);height:13px;top:6px}
.m.new{background:none;border:1.5px solid var(--huang)}
.m.anchor{top:2px;height:20px;width:3px;margin-left:-1.5px;background:var(--lv)}
.m.shared::after{content:"";position:absolute;left:2px;top:-7px;width:1px;height:7px;background:var(--zhu)}
.m.hooked::before{content:"";position:absolute;left:2px;top:11px;width:1px;height:9px;
 background:repeating-linear-gradient(var(--ink3) 0 2px,transparent 2px 4px)}
.m.hook{background:none;border:1.5px dashed var(--ink3);width:8px;height:8px;border-radius:50%;top:8px}
.ticks{position:relative;height:15px;margin-left:104px;margin-top:4px}
.ticks span{position:absolute;font-size:9px;color:var(--ink3);transform:translateX(-50%)}
.lg{display:flex;gap:17px;flex-wrap:wrap;margin-top:13px;font-size:12px;color:var(--ink2);align-items:center}
.lg i{display:inline-block;width:8px;height:11px;margin-right:5px;vertical-align:-1px;border-radius:1px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:10px;letter-spacing:.1em;color:var(--ink3);padding:0 8px 6px;border-bottom:1px solid var(--edge)}
td{padding:8px;border-bottom:1px solid var(--grid);vertical-align:top}
ul{list-style:none;margin:0;padding:0}
li{padding:7px 10px;border-left:3px solid var(--edge);background:var(--card);margin-bottom:5px;font-size:13px}
li.bad{border-left-color:var(--zhu)}
li.warn{border-left-color:var(--huang)}
li.todo{border-left-color:var(--qing);opacity:.85}
li b{font-size:10px;letter-spacing:.08em;margin-right:8px;color:var(--ink3)}
code{font-family:ui-monospace,Menlo,monospace;font-size:11.5px}
.ln{background:var(--card);border:1px solid var(--edge);padding:15px 17px;margin-bottom:14px}
.ln h3{margin:0 0 3px;font-size:18px;font-weight:600;letter-spacing:.03em}
.tg{font-size:9.5px;letter-spacing:.11em;color:var(--ink3);margin-left:9px;vertical-align:2px;font-weight:400}
.hint{font-size:12.5px;color:var(--ink3);border-left:2px solid var(--edge);padding-left:9px;margin:7px 0 11px}
ol.nodes{list-style:none;margin:0;padding:0}
ol.nodes li{display:grid;grid-template-columns:44px 1fr;gap:9px;padding:6px 0;border-top:1px solid var(--grid);
 border-left:none;background:none;margin:0;align-items:baseline}
ol.nodes li:first-child{border-top:none}
ol.nodes li.w .sq{color:var(--huang)}
ol.nodes li.p{opacity:.6}
ol.nodes li.p .sq{color:var(--ink3)}
.sq{font-size:11px;text-align:right;color:var(--qing);font-variant-numeric:tabular-nums}
.bd{display:block}
.tx{font-size:13.5px}
.ev{display:block;font-size:11px;color:var(--ink3);margin-top:1px}
.badge{display:inline-block;font-size:9.5px;letter-spacing:.08em;padding:1px 5px;margin:2px 4px 0 0;
 border:1px solid currentColor;vertical-align:1px}
.badge.anchor{color:var(--lv)}
.badge.shared{color:var(--zhu)}
.badge.todo{color:var(--huang)}
.badge.pend{color:var(--ink3)}
.badge.ins{color:var(--tan)}
.hooks{margin-top:5px;padding-left:11px;border-left:2px dashed var(--grid)}
.chap{list-style:none;margin:14px 0 4px;padding:5px 9px;background:var(--band);border-left:3px solid var(--accent);border-radius:0 3px 3px 0}
.chap b{font-family:var(--serif);font-size:14px}
.cn{margin-left:9px;font-size:11px;color:var(--ink3)}
.cs{margin-top:2px;font-size:11.5px;color:var(--ink2);line-height:1.55}
.pool{margin-left:8px;padding:1px 5px;font-size:10px;border-radius:2px;background:var(--warn-bg,#e8d9b0);color:var(--ink2)}
.chain{margin-left:8px;padding:1px 5px;font-size:10px;border-radius:2px;background:var(--ok-bg,#c9dcc4);color:var(--ink2)}
.gate{display:block;margin:1px 0 0;font-size:11px;color:var(--accent)}
.vb{display:inline-block;min-width:30px;margin-right:6px;padding:1px 5px;font-size:10px;border-radius:2px;background:var(--band);color:var(--ink3);vertical-align:1px}
.hk{font-size:12px;color:var(--ink2);padding:2px 0}
.hk b{color:var(--tan);font-weight:600}
.hk em{font-style:normal;font-size:10px;color:var(--ink3)}
.cmt{display:inline-block;min-width:190px;padding:2px 8px;border-bottom:1px dashed var(--edge);
 font-size:13px;color:var(--zhu);outline:none;vertical-align:baseline}
.cmt:empty::before{content:attr(data-hint);color:var(--ink3);opacity:.5}
.cmt:focus{background:var(--card);border-bottom-color:var(--qing);box-shadow:0 1px 0 0 var(--qing)}
.cmt:not(:empty){border-bottom-color:var(--zhu);background:color-mix(in srgb,var(--zhu) 7%,transparent)}
.badge.debut{background:var(--lv);color:var(--paper);border-color:var(--lv)}
.linecmt{font-size:12px;color:var(--ink3);margin:4px 0 8px}
.submit{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:14px 0 0;
 padding:12px 14px;background:var(--card);border:1px solid var(--edge);border-left:3px solid var(--zhu)}
.btn{font:inherit;font-size:13px;padding:7px 16px;border:1px solid var(--zhu);background:transparent;
 color:var(--zhu);cursor:pointer;border-radius:2px}
.btn:hover{background:var(--zhu);color:var(--paper)}
.btn:focus-visible{outline:2px solid var(--qing);outline-offset:2px}
.stamp{font-size:12px;color:var(--ink2)}
.stamp:empty::before{content:"（还没标记过）";color:var(--ink3);opacity:.6}
.cmthow{font-size:12px;color:var(--ink2);background:var(--card);border:1px solid var(--edge);
 border-left:3px solid var(--qing);padding:8px 12px;margin:14px 0 0}
[artifact-sync-state=off] .cmt{border-bottom-style:solid;border-bottom-color:var(--ink3);opacity:.55}
</style>
<div class="wrap">
<header><h1 class="serif">三级任务链</h1>
<div class="sub">主轴 · 二级线 · 人物任务，同一根 <span class="mono">axisSeq</span> 轴 · 由源码生成，重跑即刷新</div>
<div class="stats">
 <div class="stat"><b class="mono">${r.tiers.reduce((a, t) => a + t.nodes.length, 0)}</b><span>节点</span></div>
 <div class="stat"><b class="mono">${r.tiers.reduce((a, t) => a + cnt(t, 'ready'), 0)}</b><span>可走</span></div>
 <div class="stat"><b class="mono">${r.tiers.reduce((a, t) => a + cnt(t, 'new'), 0)}</b><span>待写 EVENT</span></div>
 <div class="stat"><b class="mono">${r.tiers.reduce((a, t) => a + cnt(t, 'pending'), 0)}</b><span>待扩</span></div>
 <div class="stat"><b class="mono">${r.shared.length}</b><span>双喂</span></div>
 <div class="stat"><b class="mono">${r.regressions.length}</b><span>序回退</span></div>
 <div class="stat"><b class="mono">${charHooks.size}</b><span>人物挂点</span></div>
</div></header>

<div class="cmthow"><b>批注怎么用</b>　虚线处点一下就能直接打字。写下的批注会随本页保存，
并回到 Claude 那边——<b>不需要复制粘贴给我</b>。每个节点、每条线、每条待审判断各有一个槽。
若虚线变成实线灰色，说明这个视图是只读的，批注不会被保存。</div>

<div class="submit">
 <button type="button" id="mark" class="btn">标记这批批注已写完，请 Claude 复核</button>
 <artifact-sync><span class="stamp" id="stamp"></span></artifact-sync>
</div>

<h2>本轮复审：真缺陷</h2>
<div class="box" style="padding:14px 16px">
<p class="hk" style="margin-bottom:10px">只列<b>不修就接不上</b>的。已明确改判为<b>非缺陷</b>、不再出现在此表：
主轴 425 拍断层、血脉拍无抉择、主轴节点稀疏、深拍占比——主轴是<b>两个通关条件</b>不是故事线，
这几项本就不该按"线"去要求。判据基线：按《上古卷轴5》模式，玩家可直接跑去任一国开线，
故跨线依赖一律按"玩家可能没走过那条线"计。</p>
${REAL_DEFECTS.map((d, i) => `<div class="ln" style="margin:0 0 10px">
  <h3 class="serif" style="font-size:15px">${i + 1}. ${esc(d.where)}　${esc(d.what)}<span class="tg">${esc(d.kind)}</span></h3>
  <div class="hk" style="padding:3px 0">${esc(d.detail)}</div>
  <div class="hk" style="padding:3px 0"><b>你的裁定</b>　${cmt('defect:' + i, '修 / 不修 / 改成……')}</div>
</div>`).join('')}
</div>

<h2>本轮待审</h2>
<div class="box" style="padding:14px 16px">
<p class="hk" style="margin-bottom:10px">这一轮由 Claude 做出的判断，<b>每一条都需要过目</b>。「你可能想推翻的」一栏写的是我自己知道的薄弱处。</p>
${PENDING_REVIEW.map((p, i) => `<div class="ln" style="margin:0 0 12px">
  <h3 class="serif" style="font-size:15px">${i + 1}. ${esc(p.title)}<span class="tg">${esc(p.tag)}</span></h3>
  <div class="hk" style="padding:4px 0"><b>做了</b>　${esc(p.did)}</div>
  <div class="hk" style="padding:4px 0"><b>依据</b>　${esc(p.basis)}</div>
  <div class="hk" style="padding:4px 0"><b>你可能想推翻的</b>　${esc(p.risk)}</div>
  <div class="hk" style="padding:4px 0"><b>你的裁定</b>　${cmt('verdict:' + p.tag + ':' + i, '通过 / 改成…… / 推翻，理由')}</div>
</div>`).join('')}
</div>

<h2>逐线展开：每条线的 event 与挂在下面的角色戏</h2>
${r.tiers.map(t => `<div class="ln">
  <h3 class="serif">${esc(t.name)}<span class="tg">${t.tier === 1 ? '一级·主轴' : t.kind === 'sect' ? '二级·宗派' : t.kind === 'commerce' ? '二级·商道' : '二级·国家'}</span></h3>
  ${t.hint ? `<div class="hint">${esc(t.hint)}</div>` : ''}
  <div class="linecmt">整条线的批注　${cmt('line:' + t.name, '这条线整体怎么看')}</div>
  <ol class="nodes">${t.nodes.map((n, i) => {
    const ev = n.eventId ? events.get(n.eventId) : undefined;
    // 章头：与上一拍不同章就起一个新的大场景标题。
    // 「本线 X／全章 Y」——Y>X 表示这场戏还有几拍没走本线（在别条线上，或无人认领）。
    const ch = chapterOf.get(n.eventId);
    const prevCh = i > 0 ? chapterOf.get(t.nodes[i - 1].eventId) : undefined;
    let chHead = '';
    if (ch && ch.id !== prevCh?.id) {
      const mine = t.nodes.filter(x => chapterOf.get(x.eventId)?.id === ch.id).length;
      // 章内是「链」还是「池」：看这章有几拍被同章另一拍的 done flag 门住。
      // 池＝章一激活就全部同时开放，玩家眼里没有先后——这正是「前后 event 没啥关系」的来源。
      const chIds = t.nodes.filter(x => chapterOf.get(x.eventId)?.id === ch.id).map(x => x.eventId);
      const chTails = new Set(chIds.map(id => String(id).split('.').pop()));
      const gated = chIds.filter(id => (gateOf.get(id) || []).some(g => chTails.has(g))).length;
      const shape = mine < 2 ? '' : gated === 0
        ? `<span class="pool">池 · ${mine} 拍同时开放，章内无先后</span>`
        : gated >= mine - 1 ? '<span class="chain">链 · 章内逐拍串起</span>'
        : `<span class="pool">半链 · ${gated}/${mine - 1} 处有前置</span>`;
      chHead = `<li class="chap"><b>${esc(ch.title)}</b><span class="cn">本线 ${mine}／全章 ${ch.size} 拍</span>${shape}`
             + (ch.summary ? `<div class="cs">${esc(ch.summary)}</div>` : '') + '</li>';
    }
    const st = n.status === 'ready' ? 'r' : n.status === 'new' ? 'w' : 'p';
    const hooks = (charHooks.get(n.eventId) || []);
    const hookRows = hooks.length ? `<div class="hooks">${hooks.map(h =>
      `<div class="hk">↳ <b>${esc(h.who)}</b>　${esc(h.visible || '')}${h.insert ? ' <em>［插入］</em>' : ''}</div>`).join('')}</div>` : '';
    return chHead + `<li class="${st}">
      <span class="sq mono">${n.seq ?? (n.status === 'pending' ? '' : '?')}</span>
      <span class="bd">
        <span class="vb">${esc(verbOf(n.text))}</span><span class="tx">${esc(n.text)}</span>
        ${(gateOf.get(n.eventId) || []).length ? `<span class="gate">⇠ 需先 ${esc((gateOf.get(n.eventId) || []).map(g => events.get([...events.keys()].find(k => k.endsWith('.' + g)) || '')?.name || g).join('、'))}</span>` : ''}
        <span class="ev mono">${ev ? esc(ev.name) + '　' : ''}${n.eventId ? esc(n.eventId) : '（无 event · 待扩）'}</span>
        ${n.eventId === t.anchor ? '<span class="badge anchor">锚</span>' : ''}
        ${owners.get(n.eventId)?.length > 1 ? `<span class="badge shared">双喂 ${esc(owners.get(n.eventId).join('／'))}</span>` : ''}
        ${n.status === 'new' ? '<span class="badge todo">待写 event</span>' : ''}
        ${n.status === 'pending' ? '<span class="badge pend">未来待扩</span>' : ''}
        ${debutOf.get(n.eventId) ? `<span class="badge debut">登场 ${esc(debutOf.get(n.eventId).join('／'))}</span>` : ''}
        ${hookRows}
        ${cmt('node:' + (n.eventId || t.name + '#' + (i + 1)), '这一拍的批注')}
      </span></li>`;
  }).join('')}</ol></div>`).join('')}

<h2>逐角色：每个人自己的线</h2>
<p style="font-size:13px;color:var(--ink2);margin:0 0 14px">
角色戏不必是一条真任务线，但**对同一个角色应当读得出先后**——下面按 <span class="mono">axisSeq</span> 排。
挂在上级节点下的标「插入」，那一拍上级读它的另一面。</p>
${r.chars.filter(c => c.hooks.length).map(c => {
  const hs = c.hooks.slice().sort((a, b) => (events.get(a.eventId)?.seq ?? 9999) - (events.get(b.eventId)?.seq ?? 9999));
  return `<div class="ln"><h3 class="serif">${esc(c.name)}<span class="tg">三级·人物</span></h3>
  <div class="linecmt">这个角色整体的批注　${cmt('charline:' + c.name, '这个人的戏够不够、缺什么')}</div>
  <ol class="nodes">${hs.map(h => {
    const ev = events.get(h.eventId);
    const who = owners.get(h.eventId);
    return `<li class="${h.isNew ? 'w' : 'r'}">
      <span class="sq mono">${ev?.seq ?? '?'}</span>
      <span class="bd"><span class="tx">${esc(h.visible || h.label)}</span>
      <span class="ev mono">${ev ? esc(ev.name) + '　' : ''}${esc(h.eventId)}</span>
      ${h.insert ? '<span class="badge ins">插入</span>' : ''}
      ${h.isNew ? '<span class="badge todo">待写</span>' : ''}
      ${who ? `<span class="badge shared">上级：${esc(who.join('／'))}</span>` : ''}
      ${debutOf.get(h.eventId) ? `<span class="badge debut">登场 ${esc(debutOf.get(h.eventId).join('／'))}</span>` : ''}
      ${cmt('char:' + c.name + ':' + h.eventId, '这一拍的批注')}
      </span></li>`;
  }).join('')}</ol></div>`;
}).join('')}

<h2>双喂：同一个 event 被几级同时引用</h2>
<div class="box" style="padding-bottom:16px"><table>
<thead><tr><th>seq</th><th>event</th><th>被谁引用</th><th>人物戏</th></tr></thead><tbody>
${r.shared.map(s => `<tr><td class="mono">${s.seq ?? '—'}</td><td>${esc(s.name ?? '')}<div class="mono" style="color:var(--ink3);font-size:11px">${esc(s.eventId)}</div></td>
<td>${esc(s.by.join('　／　'))}</td><td>${esc((charHooks.get(s.eventId) || []).map(x => x.who).join('／')) || '—'}</td></tr>`).join('')}
</tbody></table></div>

<h2>人物任务：谁做了、谁待做</h2>
<div class="box" style="padding-bottom:16px">
<p style="margin:0 0 12px;font-size:13px;color:var(--ink2)">
<b>这些角色都要做</b>（用户裁定 2026-08-17）。「料不够」只决定<b>做多深</b>——
一两个插入点还是一条线——<b>不决定做不做</b>。所以下面第二张表叫「待做」，不叫「不展开」。</p>
<table><thead><tr><th>已展开</th><th style="text-align:right">插入点</th><th style="text-align:right">其中挂在上级</th></tr></thead><tbody>
${r.charDone.map(c => `<tr><td class="serif" style="font-size:15px">${esc(c.name)}</td><td class="mono" style="text-align:right">${c.points}</td><td class="mono" style="text-align:right">${c.insert || ''}</td></tr>`).join('')}
</tbody></table>
<table style="margin-top:18px"><thead><tr><th>待做</th><th style="text-align:right">事件层</th><th style="text-align:right">未认领</th><th>该做到什么程度</th></tr></thead><tbody>
${r.charTodo.map(c => `<tr><td>${esc(c.name)}</td><td class="mono" style="text-align:right">${esc(c.total)}</td><td class="mono" style="text-align:right">${esc(c.unclaimed)}</td><td style="color:var(--ink2)">${esc(c.note)}</td></tr>`).join('')}
</tbody></table></div>

<h2>该看的地方</h2>
<ul>${flags || '<li>无</li>'}</ul>
</div>
<script>
// 批注是逐键自动保存的（每个批注都在同步区里），本按钮**不负责发送**——
// 它只给这一批批注盖一个可读的戳：把「几时写完、共几条」写进同步区的 DOM，
// Claude 那边因此看得到「这批可以复核了」。改 DOM 必须发生在用户手势内，这正是合同支持的写法。
document.getElementById('mark').addEventListener('click', function () {
  var filled = Array.prototype.filter.call(
    document.querySelectorAll('.cmt'), function (el) { return el.textContent.trim(); }).length;
  document.getElementById('stamp').textContent =
    '\u5df2\u6807\u8bb0 ' + new Date().toLocaleString('zh-CN', { hour12: false })
    + '\uff0c\u5171 ' + filled + ' \u6761\u6279\u6ce8\u5f85\u590d\u6838';
});
</script>`;
}
