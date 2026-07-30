#!/usr/bin/env node

// 把立绘外观数据拆成两层，因为服装会随场景更换而身体特征不会：
//   identity —— 一人一份，跨场景不变：发色、瞳色、肤色、五官、体型档位，
//               以及**永久标记**（刺青/疤/胎记/月牙痕）与**真身特征**（狐尾/蝎尾/鳞/尖耳）。
//               后两类必须留在不变层：它们带情节含义，裁定 #142 与 storyContext
//               第 5 条【人物真身】都要用，换装不能把它们换掉。
//   outfits[] —— 一人多套，可变：服装形制、配饰、配色、随身器物，以及**跟着装束变的发式**
//               （发色不变、束法会变：吕雉盘髻+步摇 / 月霜高马尾 / 苏荔随意挽起）。
//               scope=default 的那套是立绘定妆用；stage:<id> / phase:<label> 供叙事按场景取。
//
// 输入 portrait-visual-master.json（官图回填 + 原文补抽的合并产物），原地升级为 v2 分层结构。
// 拆分只做保守的文本切分，不做 NLP 推断：识别不了多套就保持单套，原句一律不丢。
//
// 用法：node scripts/build-portrait-visual-layers.mjs [--dry]

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const masterPath = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/portrait-visual-master.json');
const DRY = process.argv.includes('--dry');

// 装束/兵器/器物词。真身与标记的判定必须先排除它们：
// 单字正则会把「鳞片胸甲」「翼状饰片」「羽衣高冠」「月牙短戟」「翼钩」乃至书名
// 「清羽记」全判成真身特征——收紧前实测 14 个 trueForm 里 8 个是误判。
const GEAR_RE = /甲|盔|冠|饰|簪|钗|剑|刀|戟|斧|弓|箭|钩|扇|袍|衣|衫|裙|靴|带|壶|镜|笏/;
// 永久标记：跨场景不变，且多半带情节含义
const MARK_RE = /刺青|纹身|伤?疤|胎记|痕迹|印记|烙印|咬痕|月牙状/;
// 真身特征：种族/妖身，属于身份而非装束。一律要求具体部位或共现语境，不用裸单字。
const TRUE_FORM_RE = /狐尾|蝎尾|蛇尾|龙尾|狐皮|兽耳|尖耳|耳廓略尖|龙鳞|鳞纹|化身藏形|现出真身|本相|(?:身后|臀后|背后|腰间)[^，。]{0,8}(?:尾巴|双翼)/;
// 「乌亮」「青丝」都是黑发的古语写法，漏了会让 hairColor 空掉（苏荔一度被从另一条补成「棕色」，
// 与原文「乌亮的长发」矛盾）。故 hairColor 只从本条 hair 抽，抽不到就留空，绝不跨条目补。
// 「乌亮的长发」中间有「的」，lookahead 不放过它就抽不到颜色（苏荔一度空值）
const HAIR_COLOR_RE = /(乌亮|乌黑|乌|青丝|墨黑|漆黑|纯黑|黑|亚麻金|金色|金|银白|银灰|银|白|栗棕|棕黑|深棕|棕红|棕|栗|玫瑰粉|紫粉|紫黑|薰衣草紫|紫|靛|蓝黑|青|灰|赤|褐|红棕|酒红|橄榄棕|孔雀蓝绿|粉)[色]?(?:的)?(?=发|长发|短发|直发|卷发|鬈发|秀发|头发)/;
const NORMALIZE_HAIR = { 乌亮: '乌黑', 乌: '乌黑', 青丝: '乌黑' };

// 同人重复条目用 registry 的别名表做权威归一，不靠字符串相似度猜。
// 手工比对只找到 3 组，还漏了「定陶王=刘欣」「阮香凝=凝姨」，并把殇侯那组看成只有两条朱老头
// ——实际是三条（殇侯 + 朱老头（刘谋）+ 朱老头（刘询/殇振羽））。名字毫不相似，字符串法无解。
// 合并偏好：identity 默认取官图（视觉权威），下表可指定改取原文；marks/trueForm 一律取并集。
const MERGE_PREFS = {
  苏荔: { identityFrom: '苏荔', defaultFrom: '苏荔',
    note: '官图条目「阿依苏荔」已并入（裁定 #142）。identity 取原文（蝎尾真身、身高超一米九）；两套装束可能是同一身衣服的不同视角，暂并存待人工确认。' },
  剑玉姬: { identityFrom: '剑玉姬（云龙吟版）', defaultFrom: '剑玉姬（云龙吟版）',
    note: '两版官图造型互斥但都合正典——原文「未曾遮面，却只见其风采，未见其面容」（巫宗障眼法术），故 identity 本身不定形。default 取云龙吟版（赛璐璐，合定版画风）。' },
  殇侯: { note: '朱老头即殇侯（用户裁定 + 原文云龙吟 0402 名链：北寺狱囚徒刘病已→太学生刘次卿→游侠儿刘谋→阳武侯刘询→鸩羽殇侯殇振羽，0264「你说老头啊！他叫刘谋？」）。清羽记 ch82 朱老头称殇振羽为「老爷子」并劝人别打听，是其隐藏身份的桥段，不可当作两人的证据。' },
};

// 裁定 #142 的逐条例外：这几处官图偏离原文，identity 必须按原文覆盖。
// 只写进 notes 是不够的——裁定落到文档层不等于落到结构化字段，出图脚本读的是字段。
const CANON_OVERRIDES = {
  月霜: { hairColor: '乌黑',
    hair: '一头青丝（乌黑长发），高扎马尾并系红色发带；寒毒发作时发丝带细霜、眉眼间泛青',
    why: '裁定 #142：canon evidence 有「一头青丝」，官图的栗棕发是画师上色' },
  凝羽: { hairColor: '乌黑',
    hair: '乌亮的乌黑长发，散披及背，额前碎发',
    marks: ['肩头有一个淡红的月牙状痕迹（清羽记 ch26）'],
    why: '裁定 #142：原文 ch26「乌亮的发丝」「在她肩头，有一个淡红的月牙状痕迹」，官图作栗棕发且无月牙痕' },
  黛姬雪娜: { hairColor: '金',
    hair: '金黄色美发（原文「女祭司金黄的美发」）',
    eyes: '碧蓝色眼眸，神情冷漠',
    why: '裁定 #142：原文 ch17 金发碧眼+黑色罩帽、ch272 拜火教女祭司；官图的棕金发/绿眼/紫甲弓手不采' },
};

function splitOutfits(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  // 形式一：「甲（战装）：… ；乙（常服）：…」
  const labeled = [...t.matchAll(/([甲乙丙丁][一二三四]?)(?:（([^）]*)）)?[：:]\s*([^；;]+)/g)];
  if (labeled.length >= 2) {
    return labeled.map(m => ({ label: m[2] || `装束${m[1]}`, outfit: m[3].trim() }));
  }
  // 形式二：「…；另一版为…」/「…，另一版为…」
  const alt = t.split(/[；;，,]?\s*(?:另一版为|另一版是|另一版|另有一套)\s*/);
  if (alt.length >= 2) {
    return alt.filter(Boolean).map((s, i) => ({ label: i === 0 ? '常态' : `变体${i}`, outfit: s.replace(/^[；;，,]\s*/, '').trim() }));
  }
  return [{ label: '', outfit: t }];
}

function pickMarks(visual) {
  const marks = [];
  const trueForm = [];
  const scan = (field, value) => {
    for (const seg of String(value || '').split(/[；;。]/)) {
      const s = seg.trim().replace(/\*\*/g, '');
      if (!s) continue;
      // 先看是不是真身/标记，再用装束词排除：「鳞片胸甲」含甲 → 装束，不是真身
      const isTrue = TRUE_FORM_RE.test(s);
      const isMark = MARK_RE.test(s);
      if (!isTrue && !isMark) continue;
      // 狐尾/蝎尾这类明确部位词即使句中同时提到甲胄也仍是真身，只排除仅靠弱线索命中的
      const strongTrue = /狐尾|蝎尾|蛇尾|龙尾|狐皮|兽耳|尖耳|耳廓略尖|龙鳞|鳞纹|化身藏形|现出真身/.test(s);
      if (GEAR_RE.test(s) && !strongTrue && !/刺青|纹身|胎记|烙印|咬痕/.test(s)) continue;
      if (isTrue) trueForm.push({ text: s, from: field });
      else marks.push({ text: s, from: field });
    }
  };
  for (const f of ['face', 'accessories', 'poseProps', 'outfit', 'build', 'hair']) scan(f, visual[f]);
  return { marks, trueForm };
}

// 已提取到 identity 的片段必须从可变层里删掉，否则真身特征会绕过门控：
// 苏妲己的狐尾一度同时存在于 identity.trueForm 和 outfits[].props，
// 而 props 是当作常态装束注入 prompt 的 —— 九尾狐身份会就这样泄出去。
function stripExtracted(text, extracted) {
  let s = String(text || '').replace(/\*\*/g, '');
  for (const frag of extracted) {
    const bare = frag.replace(/\*\*/g, '').trim();
    if (bare) s = s.split(bare).join('');
  }
  return s.replace(/^[；;，,、\s]+|[；;，,、\s]+$/g, '').replace(/[；;]\s*[；;]/g, '；');
}

function convert(row) {
  const v = row.visual || {};
  const { marks, trueForm } = pickMarks(v);
  const extracted = [...marks, ...trueForm].map(m => m.text);
  // 取捕获组而非整个匹配：整匹配会把 lookahead 前的「色」「的」一起带进来（曾得到「乌亮的」）
  const rawColor = (String(v.hair || '').match(HAIR_COLOR_RE) || [])[1] || '';
  const hairColor = NORMALIZE_HAIR[rawColor] || rawColor;

  const identity = {
    hairColor,
    hair: stripExtracted(v.hair, extracted),
    eyes: stripExtracted(v.eyes, extracted),
    face: stripExtracted(v.face, extracted),      // 「额头刺青」等已进 marks，不在 face 里重复
    build: stripExtracted(v.build, extracted),
    marks: marks.map(m => m.text),
    trueForm: trueForm.map(m => m.text),
  };

  const parts = splitOutfits(v.outfit);
  const outfits = parts.map((p, i) => ({
    id: i === 0 ? 'default' : `variant-${i}`,
    label: p.label,
    scope: i === 0 ? 'default' : 'unassigned',   // 变体待人工绑定到 stage / phase
    outfit: stripExtracted(p.outfit, extracted),
    // 配饰与配色暂随主套；变体各自的配饰原文里通常没分开写，不猜
    accessories: i === 0 ? stripExtracted(v.accessories, extracted) : '',
    palette: i === 0 ? (v.palette || []) : [],
    props: i === 0 ? stripExtracted(v.poseProps, extracted) : '',
    provenance: row.provenance,
    sourceImages: i === 0 ? (row.sourceImages || undefined) : undefined,
  })).filter(o => o.outfit);

  return {
    name: row.name,
    provenance: row.provenance,
    book: row.book,
    identity,
    outfits,
    readiness: row.readiness,
    notes: row.notes || '',
    styleNote: row.styleNote || undefined,
    evidence: row.evidence,
    sourceChapters: row.sourceChapters,
    sourceTextVisual: row.sourceTextVisual,   // 官图角色的原文补充，留档
  };
}

// 始终从两个源文件重建（幂等）：原地升级 master 的话，v2 结构里已无 visual 字段，重跑就废了。
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const off = JSON.parse(await readFile(join(canonDir, 'portrait-visual-appearance.json'), 'utf8'));
const src = JSON.parse(await readFile(join(canonDir, 'portrait-visual-from-source.json'), 'utf8'));

function has(v, k) {
  const x = (v || {})[k];
  const s = Array.isArray(x) ? x.filter(i => String(i).trim()).join('') : String(x ?? '');
  return Boolean(s.trim()) && !s.includes('无法辨识') && !s.startsWith('（未见') && !s.startsWith('（不采');
}
function readiness(v) {
  if (!v) return 'insufficient';
  const core = ['hair', 'outfit'].filter(k => has(v, k)).length;
  const aux = ['accessories', 'palette', 'face', 'eyes'].filter(k => has(v, k)).length;
  if (core === 2 && aux >= 2) return 'ready';
  if (core >= 1 && aux >= 1) return 'partial';
  return 'insufficient';
}

const flat = new Map();
for (const c of off.characters) {
  flat.set(c.name, { name: c.name, provenance: 'official-illustration', sourceImages: c.sourceImages,
    visual: c.visual || {}, notes: c.notes || '', styleNote: (c.visual || {}).styleNote,
    readiness: readiness(c.visual) });
}
for (const c of src.characters) {
  if (flat.has(c.name)) { flat.get(c.name).sourceTextVisual = c.visual; continue; }
  flat.set(c.name, { name: c.name, provenance: 'source-text', book: c.book, visual: c.visual,
    evidence: c.evidence, sourceChapters: c.sourceChapters,
    notes: c.note || (c.coverage === 'none' ? '原文可画信息不足，按用户裁定标记跳过、不补设计稿' : ''),
    readiness: readiness(c.visual) });
}

const converted = [...flat.values()].map(convert);

// 用 registry 的 canonicalName + aliases 做权威归一
const reg = JSON.parse(await readFile(join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));
const canonOf = new Map();
for (const c of reg.characters) {
  canonOf.set(c.canonicalName, c.canonicalName);
  for (const a of c.aliases || []) if (!canonOf.has(a)) canonOf.set(a, c.canonicalName);
}
const resolveName = n => canonOf.get(n) || canonOf.get(n.replace(/[（(].*?[）)]/g, '').trim()) || n;

const groups = new Map();
for (const r of converted) {
  const k = resolveName(r.name);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

let rows = [];
const unresolved = [];
for (const [canonName, group] of groups) {
  if (!canonOf.has(canonName)) unresolved.push(canonName);
  if (group.length === 1) {
    const r = group[0];
    if (r.name !== canonName) r.aliasOf = r.name;
    r.name = canonName;
    rows.push(r);
    continue;
  }
  const pref = MERGE_PREFS[canonName] || {};
  const pick = n => group.find(r => r.name === n);
  // identity 默认取官图（视觉权威），可由 identityFrom 改取指定条目
  const idSrc = pick(pref.identityFrom) || group.find(r => r.provenance === 'official-illustration') || group[0];
  const others = group.filter(r => r !== idSrc);
  const identity = { ...idSrc.identity };
  for (const k of ['marks', 'trueForm']) identity[k] = [...new Set(group.flatMap(r => r.identity[k]))];
  for (const k of ['eyes', 'face', 'build', 'hair']) {
    if (!identity[k]) identity[k] = others.map(r => r.identity[k]).find(Boolean) || '';
  }
  // hairColor 不跨条目补：宁可留空，也不要和 hair 原句矛盾
  const defaultSrc = pick(pref.defaultFrom) || idSrc;
  const outfits = [defaultSrc, ...group.filter(r => r !== defaultSrc)]
    .flatMap(r => r.outfits)
    .map((o, i) => ({ ...o, id: i === 0 ? 'default' : `variant-${i}`, scope: i === 0 ? 'default' : 'unassigned' }));
  rows.push({
    name: canonName,
    provenance: [...new Set(group.map(r => r.provenance))].join('+'),
    book: group.map(r => r.book).find(Boolean),
    identity,
    outfits,
    readiness: readiness({ ...identity, ...(outfits[0] || {}) }),
    notes: [...group.map(r => r.notes).filter(Boolean), pref.note].filter(Boolean).join(' '),
    mergedFrom: group.map(r => r.name),
    evidence: group.map(r => r.evidence).find(Boolean),
    sourceChapters: group.map(r => r.sourceChapters).find(Boolean),
  });
  console.error(`  归一 ${canonName} ← ${group.map(r => r.name).join(' + ')}（${outfits.length} 套装束）`);
}
const byName = new Map(rows.map(r => [r.name, r]));
// 裁定 #142 的例外落到 identity 字段（不只落 notes）
for (const [name, ov] of Object.entries(CANON_OVERRIDES)) {
  const r = byName.get(name);
  if (!r) { console.error(`  跳过 canon 覆盖（缺条目）：${name}`); continue; }
  const { why, marks, ...fields } = ov;
  Object.assign(r.identity, fields);
  if (marks) r.identity.marks = [...new Set([...r.identity.marks, ...marks])];
  r.identity.canonOverride = why;
  console.error(`  canon 覆盖 ${name}：${Object.keys(fields).join('/')}${marks ? '+marks' : ''}`);
}

rows.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
if (unresolved.length) {
  console.error(`\n⚠️ 未登记进 registry 的条目名 ${unresolved.length} 个（无法参与别名归一，重复风险）：`);
  console.error(`   ${unresolved.join('、')}`);
}

const doc = {
  purpose: '立绘生成的单一数据源：官图反向回填 + 原文可画维度补抽，合并后按 identity / outfits 分层',
  precedence: '有官图者以官图为准，但裁定 #142 逐条例外（凝羽发色与肩头月牙痕、黛姬雪娜金发碧眼女祭司以原文 canon 为准）；带情节含义的特征须回原文核实',
  styleBaseline: '美术方向（2026-07-30 改向，暂记不展开）：PC-98 风格大像素立绘，参照 ELF《龙骑士 4》那类——640×400、16 色调色板、dithering 网点做渐变，对话时半身大立绘。'
    + '取代原「扁平二次元/赛璐璐」定版（2026-06-29）。此改向下，三种官图画风（赛璐璐／写实厚涂／水彩）的不统一问题自动消解——官图退为纯外观信息源，不再作画风参考，剑玉姬也不必再选定妆版本。'
    + '未展开的前置：需先定一套全角色共用的 16 色主调色板，并把 palette 字段从扁平色名改为色阶分组（肤色/发色/服装各若干阶，dithering 需要阶而非单色）。调色板定了风格才定，务必走在出图前面。',
  readinessRule: 'ready=发型与服装齐全且至少 2 项辅助维度；partial=二者之一齐全；insufficient=不足以出图',
  stats: {},
};

const byReadiness = {};
for (const r of rows) byReadiness[r.readiness] = (byReadiness[r.readiness] || 0) + 1;
const byProvenance = {};
for (const r of rows) byProvenance[r.provenance] = (byProvenance[r.provenance] || 0) + 1;
const stats = {
  total: rows.length,
  byProvenance,
  byReadiness,
  withMultipleOutfits: rows.filter(r => r.outfits.length > 1).length,
  unassignedVariants: rows.reduce((n, r) => n + r.outfits.filter(o => o.scope === 'unassigned').length, 0),
  withMarks: rows.filter(r => r.identity.marks.length).length,
  withTrueForm: rows.filter(r => r.identity.trueForm.length).length,
  hairColorResolved: rows.filter(r => r.identity.hairColor).length,
};

const out = {
  ...doc,
  schema: 'xiantu.portrait-visual-master.v2',
  layering: {
    identity: '跨场景不变：发色/瞳色/五官/体型档位 + marks（永久标记）+ trueForm（真身特征）。换装不得改动这一层。',
    outfits: '可变，一人多套：scope=default 供立绘定妆；stage:<stageId> / phase:<label> 供叙事按场景取；unassigned=已识别出的变体但尚未绑定场景，待人工指派。',
    hairRule: '发色属 identity，束法随装束——outfits[].hairStyle 仅在该套发式与 identity.hair 不同时填写并覆盖。',
  },
  stats: { ...doc.stats, layers: stats },
  characters: rows,
};

if (DRY) {
  console.error('[dry-run] 不写盘');
} else {
  await writeFile(masterPath, `${JSON.stringify(out, null, 1)}\n`);
}
console.error('分层统计:', JSON.stringify(stats, null, 1));
console.error('多套装束角色:', rows.filter(r => r.outfits.length > 1).map(r => r.name).join('、') || '（无）');
