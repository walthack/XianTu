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

// ── 本轮待审：这一轮由 Claude 做出的判断，**每一条都需要用户过目**。
// 用户 2026-08-18 指出：「主轴和二级线并未真正定稿，你这轮做完的是待审。」
// 故本清单不是变更日志，是**审阅工单**：每条给出「我做了什么／依据是什么／你可能想推翻的是哪里」。
const PENDING_REVIEW = [
  { tag: '新增线', title: '加了第九条二级线「商道」',
    did: '把事件层里 seq 134→885 的商业弧落成一条线，12 个 ready 节点。它既不锚地方也不锚人，锚「你第一次发现生意能办武力办不成的事」那一拍（seq 134）。',
    basis: '你从「盘江股东大会」一条孤儿反查出整条线缺失。实测以商业为主语的拍 18 条，去掉隔离件后是全书跨度最长的一条连续弧。',
    risk: '锚点选 seq 134 是我定的——更早的 s03_03「以新奇器物向苏妲己索酬」(seq 38) 在隔离关，锚上去线就打不开。若你要从更早开线，需先放出隔离件。' },
  { tag: '重新归类', title: '把 4 条我原判「纯背景」的拍改判为情节拍',
    did: '宦官嫁祸(1217)／宦官再分权(1321)／独柳树刑场(1335)／凉州盟擂台(1204) 落唐国线；入微突破(297) 按其实质「以珊瑚匕首逼退苏妲己」落晋国线；探视金蜜镝谈帝统(995) 落汉国线。',
    basis: '你逐条驳回了我的「背景」判断，查证四字段后属实。',
    risk: '凉州盟(1204) 落唐国线是我的选择——它是铁马堂的擂台赛，也可归商道线（镖局生意）或独立江湖线。' },
  { tag: '归 trivial', title: '两条流言不上链',
    did: '《阳武侯小史》流言、核武不扩散条约·惊魂——不挂任何线。',
    basis: '你的裁定：算 trivial，日后作城市流言或杂项书籍提及。',
    risk: '《阳武侯小史》其实直接关联血脉正统化（舆论把你说成阳武侯嫡子），与主轴的血脉要求同题。要进主轴的话现在说。' },
  { tag: '消解 new', title: '主轴最后一个待写 event 判为「不必新增」',
    did: '「进鬼王峒并当面辨认碧姬」原挂隔离关等裁定，改指已重建的可达件 geluo_summons_biji(seq 158)。',
    basis: 'description 明写「程宗扬首次当面见到谢艺寻找的人」，正是这一拍。与昭南线双喂。',
    risk: '双喂＝同一个 event 同时喂主轴与昭南。要分开就得新增一条 event。' },
  { tag: '补断拍', title: '补了 8 处断拍，全部用现成 event，零新增',
    did: '黑魔海 +2（巢穴逆转 419／静善夜袭 596）、晋国 +1（北府兵解围 287）、汉国 +1（郭解之死 956）、唐国 +2（小紫被救走 1090／鱼弘志弑唐皇 1312）、昭南 +1（苏妲己水镜传讯 100）、宋国 +1（林冲刺配 584）。',
    basis: 'Claude 与 Grok 各自独立复审。Grok 报 10 处（6 个建议 id 我逐条核实，6/6 真实可达未认领）；我机械查出 2 处，恰在 Grok 判为干净的那两条线上。',
    risk: '每一处的节点文案是我写的——文案怎么说这一拍，决定玩家看到什么。' },
  { tag: '改文案', title: '删掉两处「文案在骗玩家」的半句',
    did: '「董卓无符入京；刘建伏诛」「旁观李辅国审判；唐皇被弑」——删掉的那半句在对应 event 四字段里根本不存在。',
    basis: 'Grok 抓出，我核实属实。真正的弑君是 seq 1312 另一条 event，已补为独立节点。',
    risk: '无，这是修错。' },
  { tag: '新机制', title: '汉国宫变段做成「去了现场／没去现场」两条分支',
    did: '901「从传闻得知…」仅当没走过 891 含光殿现场时出现；902「决定是否拥立定陶王」仅当没走过 895 时出现。另在 4 个可达件上补了场外结算合同。',
    basis: '你的设计问题。查证发现引擎早有 offscreenResolution ＋ conditions 两件现成机制，而这段的 4 条合同挂在隔离关原件上、永不触发——接线当初就建了，断在隔离迁移上。',
    risk: '门控判据取 891／895 是我定的。若玩家走过 891 却没走过 896，关于刘建的部分对他仍是新消息——我按「入口拍」一刀切，没逐条分解。' },
  { tag: '待接线', title: '人物任务落成模块，但尚未接进游戏',
    did: 'characterQuests.ts：8 条线 54 拍 ＋ A 档 29 人 35 条单点高光，id 全部解析成真实 event。',
    basis: '第三级此前零代码，只存在于 markdown 里。',
    risk: '尚未接进 RightSidebar／storyContext，且它读上级的认领表——上级一动就要重抽。你指出的顺序问题即此。' },
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
for (const f of fs.readdirSync(path.join(ROOT, DATA)).filter(x => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, DATA, f), 'utf8'));
  if (!j.scenario?.worldSimulation) continue;
  stageWindows.set(j.manifest.id, [j.manifest.axisSeqLo, j.manifest.axisSeqHi]);
  for (const e of j.scenario.events || []) {
    events.set(e.id, { seq: e.axisSeq, name: e.name, stage: j.manifest.id });
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
const chars = [];
if (fs.existsSync(path.join(ROOT, CHARDOC))) {
  const doc = fs.readFileSync(path.join(ROOT, CHARDOC), 'utf8');
  let cur = null;
  for (const line of doc.split('\n')) {
    const h = line.match(/^## \d+\.\s*(\S+)/);
    if (h && !/^(口径|17|选谁)/.test(h[1])) { cur = { name: h[1], hooks: [] }; chars.push(cur); continue; }
    if (!cur || !line.startsWith('|')) continue;
    const ids = [...line.matchAll(/`((?:lcq|lyl|lyg|liuchao)\.event\.[a-zA-Z0-9_]+)`/g)].map(x => x[1]);
    if (!ids.length) continue;
    const cells = line.replace(/^\||\|$/g, '').split('|').map(x => x.trim());
    // 表格形如 | # | 挂在 | 这一拍（玩家可见） | 标 |
    const label = cells[0] || '';
    const visible = cells[2] || '';
    const insert = line.includes('↪');
    const isNew = line.includes('🆕');
    // 一行可能引多个 id（并进拍），第一个当主挂点
    cur.hooks.push({ eventId: ids[0], alsoIds: ids.slice(1), insert, isNew, label, visible });
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
  const seqOf = n => n.seq ?? undefined;

  const track = t => {
    const pts = t.nodes.filter(n => typeof seqOf(n) === 'number');
    if (!pts.length) return '';
    const lo = Math.min(...pts.map(seqOf)), hi = Math.max(...pts.map(seqOf));
    const marks = t.nodes.map((n, i) => {
      const s = seqOf(n);
      if (typeof s !== 'number') return '';
      const cls = ['m',
        n.eventId === t.anchor ? 'anchor' : '',
        n.status === 'new' ? 'new' : '',
        charHooks.has(n.eventId) ? 'hooked' : '',
        owners.get(n.eventId)?.length > 1 ? 'shared' : ''].filter(Boolean).join(' ');
      const who = charHooks.get(n.eventId);
      return `<i class="${cls}" style="left:${pc(s)}%" title="${esc(t.name)} #${i + 1}　seq ${s}　${esc(n.text)}${who ? `　［人物：${esc(who.map(x => x.who).join('／'))}］` : ''}"></i>`;
    }).join('');
    return `<div class="sp" style="left:${pc(lo)}%;width:${pc(hi) - pc(lo)}%"></div>${marks}`;
  };

  const rows = r.tiers.map(t => `<div class="row ${t.tier === 1 ? 'main' : ''}">
    <div class="nm">${esc(t.name)}<i>${t.tier === 1 ? '一级' : t.kind === 'sect' ? '二级·宗派' : t.kind === 'commerce' ? '二级·商道' : '二级·国家'}</i></div>
    <div class="tk">${track(t)}</div></div>`).join('');

  const charRow = `<div class="row ch"><div class="nm">人物任务<i>三级·插入</i></div><div class="tk">${
    [...charHooks].map(([id, who]) => {
      const s = events.get(id)?.seq;
      return typeof s === 'number'
        ? `<i class="m hook" style="left:${pc(s)}%" title="${esc(who.map(x => x.who).join('／'))}　挂在 ${esc(id)}　seq ${s}"></i>` : '';
    }).join('')}</div></div>`;

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
.hk{font-size:12px;color:var(--ink2);padding:2px 0}
.hk b{color:var(--tan);font-weight:600}
.hk em{font-style:normal;font-size:10px;color:var(--ink3)}
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

<h2>本轮待审</h2>
<div class="box" style="padding:14px 16px">
<p class="hk" style="margin-bottom:10px">这一轮由 Claude 做出的判断，<b>每一条都需要过目</b>。「你可能想推翻的」一栏写的是我自己知道的薄弱处。</p>
${PENDING_REVIEW.map((p, i) => `<div class="ln" style="margin:0 0 12px">
  <h3 class="serif" style="font-size:15px">${i + 1}. ${esc(p.title)}<span class="tg">${esc(p.tag)}</span></h3>
  <div class="hk" style="padding:4px 0"><b>做了</b>　${esc(p.did)}</div>
  <div class="hk" style="padding:4px 0"><b>依据</b>　${esc(p.basis)}</div>
  <div class="hk" style="padding:4px 0"><b>你可能想推翻的</b>　${esc(p.risk)}</div>
</div>`).join('')}
</div>

<h2>三级同轴</h2>
<div class="box"><div class="axis">
<div class="books"><div style="flex:550">六朝清羽记</div><div style="flex:397">六朝云龙吟</div><div style="flex:452">六朝燕歌行</div></div>
${rows}${charRow}
</div>
<div class="ticks">${[1, 200, 400, 600, 800, 1000, 1200, 1399].map(v => `<span class="mono" style="left:${pc(v)}%">${v}</span>`).join('')}</div>
</div>
<div class="lg">
 <span><i style="background:var(--tan)"></i>主轴节点</span>
 <span><i style="background:var(--qing)"></i>二级线·可走</span>
 <span><i style="border:1.5px solid var(--huang)"></i>待写 event</span>
 <span><i style="background:var(--lv);width:3px"></i>锚</span>
 <span><i style="border:1.5px dashed var(--ink3);border-radius:50%;width:8px;height:8px"></i>人物挂点</span>
 <span>点上方红竖线＝双喂　点下方虚线＝有人物戏挂着</span>
</div>

<h2>逐线展开：每条线的 event 与挂在下面的角色戏</h2>
${r.tiers.map(t => `<div class="ln">
  <h3 class="serif">${esc(t.name)}<span class="tg">${t.tier === 1 ? '一级·主轴' : t.kind === 'sect' ? '二级·宗派' : t.kind === 'commerce' ? '二级·商道' : '二级·国家'}</span></h3>
  ${t.hint ? `<div class="hint">${esc(t.hint)}</div>` : ''}
  <ol class="nodes">${t.nodes.map((n, i) => {
    const ev = n.eventId ? events.get(n.eventId) : undefined;
    const st = n.status === 'ready' ? 'r' : n.status === 'new' ? 'w' : 'p';
    const hooks = (charHooks.get(n.eventId) || []);
    const hookRows = hooks.length ? `<div class="hooks">${hooks.map(h =>
      `<div class="hk">↳ <b>${esc(h.who)}</b>　${esc(h.visible || '')}${h.insert ? ' <em>［插入］</em>' : ''}</div>`).join('')}</div>` : '';
    return `<li class="${st}">
      <span class="sq mono">${n.seq ?? (n.status === 'pending' ? '' : '?')}</span>
      <span class="bd">
        <span class="tx">${esc(n.text)}</span>
        <span class="ev mono">${ev ? esc(ev.name) + '　' : ''}${n.eventId ? esc(n.eventId) : '（无 event · 待扩）'}</span>
        ${n.eventId === t.anchor ? '<span class="badge anchor">锚</span>' : ''}
        ${owners.get(n.eventId)?.length > 1 ? `<span class="badge shared">双喂 ${esc(owners.get(n.eventId).join('／'))}</span>` : ''}
        ${n.status === 'new' ? '<span class="badge todo">待写 event</span>' : ''}
        ${n.status === 'pending' ? '<span class="badge pend">未来待扩</span>' : ''}
        ${hookRows}
      </span></li>`;
  }).join('')}</ol></div>`).join('')}

<h2>逐角色：每个人自己的线</h2>
<p style="font-size:13px;color:var(--ink2);margin:0 0 14px">
角色戏不必是一条真任务线，但**对同一个角色应当读得出先后**——下面按 <span class="mono">axisSeq</span> 排。
挂在上级节点下的标「插入」，那一拍上级读它的另一面。</p>
${r.chars.filter(c => c.hooks.length).map(c => {
  const hs = c.hooks.slice().sort((a, b) => (events.get(a.eventId)?.seq ?? 9999) - (events.get(b.eventId)?.seq ?? 9999));
  return `<div class="ln"><h3 class="serif">${esc(c.name)}<span class="tg">三级·人物</span></h3>
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
</div>`;
}
