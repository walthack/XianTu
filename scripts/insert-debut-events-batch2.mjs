#!/usr/bin/env node
// 登场事件批量插入·第二批（用户批准"免预审、游戏里验"方案）：
// 26 关注名单中未插的 20 人，各插 1 个「招牌登场」事件（debut 场景 + 前 2 件 high 早期事件并入描述）。
// 全部 critical:false（弹性层，演不好不卡关）；挂目标关首章；幂等。
// 落位：debut 所在书 → 清羽按 stage 名中的章节区间映射，其余书取该书首个含此角色花名册的关。
// 用法：node scripts/insert-debut-events-batch2.mjs [--apply]
import fs from 'node:fs';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const scanDir = join(gen, 'character-canon/debut-events-scan');
const DONE = new Set(['阮香凝', '吕雉', '阮香琳', '黛绮丝', '秦桧', '萧遥逸']); // 首批已插
const WATCH = ['小紫','潘金莲','云丹琉','云如瑶','卓云君','杨玉环','赵合德','蛇夫人','尹馥兰','惊理','泉玉姬','成光','凝羽','齐羽仙','白霓裳','赵飞燕','月霜','剑玉姬','乐明珠','贾文和'];
const BOOK_LABEL = { 六朝清羽记: 'qingyu', 六朝云龙吟: 'yunlong', 六朝燕歌行: 'yange' };
const PREFIX = { qingyu: 'lcq', yunlong: 'lyl', yange: 'lyg' };

// 载入 stage（含花名册/章节区间/axisOrder）
const stages = [];
for (const b of ['qingyu', 'yunlong', 'yange']) {
  const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const p = join(dir, f); const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    // 清羽 stage 名形如「…第37-41章…」/「第109章」→ 抽区间
    const nm = m.manifest.name || '';
    const rng = nm.match(/第(\d+)(?:-(\d+))?章/);
    stages.push({ p, m, book: b, order: m.manifest.axisOrder ?? 999, lo: rng ? +rng[1] : null, hi: rng ? +(rng[2] || rng[1]) : null, roster: new Set((m.canon.characters || []).map(c => c.name)) });
  }
}
stages.sort((a, b) => (a.book === b.book ? a.order - b.order : 0));

const BOOK_RANK = { qingyu: 0, yunlong: 1, yange: 2 };
function chapterOf(hint) {
  const t = String(hint || '');
  // 只认明确章号：第N章 / chapterN / NNNN.html；「第N集」不算
  const m = t.match(/第0*(\d+)章/) || t.match(/chapter\s*0*(\d+)/i) || t.match(/\b0*(\d{3,4})\.html/);
  return m ? +m[1] : null;
}
function pickStage(name, debut) {
  const book = BOOK_LABEL[debut?.book] || null;
  let pool = stages.filter(s => (!book || s.book === book) && s.roster.has(name)).sort((a, b) => a.order - b.order);
  // debut 书里无花名册（mod 让其晚登场）→ 回退任意书首个花名册关
  if (!pool.length) pool = stages.filter(s => s.roster.has(name)).sort((a, b) => (BOOK_RANK[a.book] - BOOK_RANK[b.book]) || (a.order - b.order));
  if (!pool.length) return null;
  const n = chapterOf(debut?.locationHint);
  if (pool[0].book === 'qingyu' && n !== null) {
    const byCh = pool.filter(s => s.lo !== null && s.lo <= n).sort((a, b) => a.lo - b.lo);
    if (byCh.length) return byCh[byCh.length - 1];
  }
  return pool[0];
}

const slugMap = { 小紫: 'xiaozi', 潘金莲: 'panjinlian', 云丹琉: 'yundanliu', 云如瑶: 'yunruyao', 卓云君: 'zhuoyunjun', 杨玉环: 'yangyuhuan', 赵合德: 'zhaohede', 蛇夫人: 'shefuren', 尹馥兰: 'yinfulan', 惊理: 'jingli', 泉玉姬: 'quanyuji', 成光: 'chengguang', 凝羽: 'ningyu', 齐羽仙: 'qiyuxian', 白霓裳: 'bainichang', 赵飞燕: 'zhaofeiyan', 月霜: 'yueshuang', 剑玉姬: 'jianyuji', 乐明珠: 'lemingzhu', 贾文和: 'jiawenhe' };

let inserted = 0, skipped = 0, noData = [];
const touched = new Map();
for (const name of WATCH) {
  if (DONE.has(name)) continue;
  let r; try { r = JSON.parse(fs.readFileSync(join(scanDir, `${name}.result.json`), 'utf8')); } catch { noData.push(name); continue; }
  const d = r.debut;
  if (!d || !(d.scene || d.locationHint)) { noData.push(name + '(无debut)'); continue; }
  // 坏数据守卫：合并可能取到"本书未提及"的空条目
  if (/未被原文|未提及|无实际登场|未登场/.test(`${d.scene || ''}${d.locationHint || ''}`)) { noData.push(name + '(debut为未提及占位)'); continue; }
  const st = pickStage(name, d);
  if (!st) { noData.push(name + '(无落位关)'); continue; }
  const slug = `debut_${slugMap[name] || name}`;
  const id = `${st.m.manifest.id.split('.')[0]}.event.${slug}`;
  const events = st.m.scenario.events = st.m.scenario.events || [];
  if (events.some(e => e.id === id)) { skipped++; continue; }
  // 描述 = 登场场景 + 前2件同书 high 事件点睛
  const highs = (r.keyEvents || []).filter(e => e.importance === 'high' && e.book === d.book).slice(0, 2);
  const extra = highs.length ? `随后：${highs.map(e => e.title).join('；')}。` : '';
  const desc = `${d.scene || ''}${d.howAppears ? `（${d.howAppears}）` : ''}${d.initialIdentity ? ` 初始身份：${d.initialIdentity}。` : ''}${extra}`.slice(0, 400);
  const nameToId = new Map((st.m.canon.characters || []).map(c => [c.name, c.id]));
  events.push({
    id, name: `${name}·招牌登场`, description: desc,
    conditions: [], completion: [{ path: `flags.event.${slug}.done`, operator: 'eq', value: true }],
    relatedCharacterIds: [nameToId.get(name)].filter(Boolean),
    critical: false,
  });
  const chapter = (st.m.scenario.chapters || [])[0];
  if (chapter) { chapter.eventIds = chapter.eventIds || []; if (!chapter.eventIds.includes(id)) chapter.eventIds.push(id); }
  (st.m.scenario.initialFlags = st.m.scenario.initialFlags || {})[`event.${slug}.done`] = false;
  touched.set(st.p, st.m);
  inserted++;
  console.log(`+ [${st.m.manifest.id}] ${name} ← ${d.book}/${(d.locationHint || '').slice(0, 30)}`);
}
if (APPLY) for (const [p, m] of touched) fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
console.log(`${APPLY ? '已写' : '(DRY-RUN)'} 插入:${inserted} 已存在:${skipped} 无数据/落位:${noData.join('、') || '无'}`);
