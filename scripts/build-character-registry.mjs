#!/usr/bin/env node

// P1（Character RAG）：从 character-cards-v3.json 生成共享角色注册表 + embedText。
// 输出到 SHIPPED（非 gitignored）位置：src/modules/scenarioMods/builtins/character-registry.json
// 设计见 character-canon/CHARACTER-RAG-DESIGN.md；吸收 Codex 评审：id 必须映射 stage 角色 id、
// embedText 富化(name+aliases+identitySummary+personality+relationToProtagonist+formsOfAddress+phase+keyEvents)、
// 强制 collision 检查、canon-only 显式标记、metadata 带 materialized sourceHash/model 无关。
// 用法：node scripts/build-character-registry.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const cardsPath = join(gen, 'character-canon/character-cards-v3.json');
const outPath = join(root, 'src/modules/scenarioMods/builtins/character-registry.json');
const books = ['qingyu', 'yunlong', 'yange'];

// 1) name -> stage id（权威，来自实际 stage 角色条目）
const nameToId = new Map();
for (const b of books) {
  const dir = join(gen, b, 'stages');
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const c of (m.canon?.characters) || []) if (c.id && c.name && !nameToId.has(c.name)) nameToId.set(c.name, c.id);
  }
}

const raw = readFileSync(cardsPath, 'utf8');
const src = JSON.parse(raw);
const cards = src.characters;
if (!Array.isArray(cards)) throw new Error('character-cards-v3.json 结构异常：characters 非数组');

const slug = s => 'canon.character.' + createHash('md5').update(s).digest('hex').slice(0, 10);
const uniq = a => [...new Set((a || []).flat().filter(Boolean).map(x => String(x).trim()))];
function phaseSummaries(c) {
  return (c.phaseIdentities || [])
    .filter(p => p.scope === 'relationship-chain' || p.scope === 'identity-chain')
    .map(p => p.identity).filter(Boolean);
}
// 角色地理锚点：归属势力名含国名→该国；否则登场地点查 region 映射（地点风貌扫描产物）
let LOC_REGION = {};
try { LOC_REGION = JSON.parse(readFileSync(join(root, 'mod-kit/generated/deepseek-v4-flash/shared-atlas/location-fengmao/location-region-map.json'), 'utf8')); } catch { /* 无映射则跳过 */ }
const NATIONS = ['唐国', '汉国', '宋国', '秦国', '晋国', '昭南', '南荒'];
function deriveRegion(c) {
  const sp = c.staticProfile || {};
  for (const a of sp.affiliations || []) {
    const hit = NATIONS.find(n => String(a.faction || '').includes(n.replace('国', '')) && String(a.faction || '').includes('国') || String(a.faction || '').startsWith(n));
    if (hit) return hit;
  }
  const loc = sp.debutLocation && sp.debutLocation.location;
  if (loc) { for (const [name, region] of Object.entries(LOC_REGION)) if (String(loc).includes(name)) return region; }
  return '';
}

// 立绘分层数据（portrait-visual-master.json）注入 staticProfile：
//   visualIdentity —— 换装换不掉的体貌（发色/瞳色/五官/体型 + 永久标记 + 真身特征）
//   visualOutfits  —— 可变装束，scope=default 为常态，stage:<id> 供按关卡取
// 分层的用处在 storyContext 规则 4：它要求换装时「保留刺青、饰物、发式等族裔特征」，
// 但此前没有数据说明哪些属于「不能换掉的」，只能靠 race 字段和常识猜。
let VISUAL = {};
try {
  const doc = JSON.parse(readFileSync(join(gen, 'character-canon/portrait-visual-master.json'), 'utf8'));
  for (const c of doc.characters || []) VISUAL[c.name] = c;
} catch { /* 无立绘数据则跳过 */ }
let visualInjected = 0;
function withVisualLayers(c) {
  const sp = { ...(c.staticProfile || {}) };
  // 立绘数据里的条目名可能是带括号的全称（「孙寿（襄城君）」），而卡用简称，
  // 故按 canonicalName → 别名 → 去括号 依次查，否则狐尾这类特征会静默丢失。
  const bare = s => String(s).replace(/[（(].*?[）)]/g, '').trim();
  const v = VISUAL[c.canonicalName]
    || (c.aliases || []).map(a => VISUAL[a]).find(Boolean)
    || Object.values(VISUAL).find(x => bare(x.name) === bare(c.canonicalName));
  if (!v) return sp;
  const id = v.identity || {};
  const identity = {
    hairColor: id.hairColor || undefined,
    hair: id.hair || undefined,
    eyes: id.eyes || undefined,
    face: id.face || undefined,
    build: id.build || undefined,
    marks: (id.marks || []).length ? id.marks : undefined,
    // trueForm 是身份秘密（苏妲己=九尾妖狐、孙寿平时「化身藏形」隐去狐尾），
    // 单独存放，由 resolver 加门控措辞后注入，绝不与常态体貌混为一谈。
    trueForm: (id.trueForm || []).length ? id.trueForm : undefined,
    canonOverride: id.canonOverride || undefined,
  };
  if (Object.values(identity).some(x => x !== undefined)) sp.visualIdentity = identity;
  const outfits = (v.outfits || []).filter(o => o.outfit).map(o => ({
    id: o.id, label: o.label || undefined, scope: o.scope,
    outfit: o.outfit, accessories: o.accessories || undefined,
    palette: (o.palette || []).length ? o.palette : undefined,
    props: o.props || undefined,
  }));
  if (outfits.length) sp.visualOutfits = outfits;
  if (sp.visualIdentity || sp.visualOutfits) visualInjected += 1;
  return sp;
}

function buildEmbedText(c) {
  const sp = c.staticProfile || {};
  // 小紫全书归属和阶段链含未揭秘密；embedding无当前章上下文，只索引表面卡。
  if (c.canonicalName === '小紫') return [c.canonicalName, sp.identitySummary, sp.appearance, ...(sp.personality || [])].filter(Boolean).join(' ｜ ');
  const parts = [
    c.canonicalName,
    (c.aliases || []).join(' '),
    sp.identitySummary,
    deriveRegion(c) ? `【${deriveRegion(c)}人物】` : '',
    // 归属/登场地点：宗门与地名是强检索键（场景提到地点/门派时可召回相关角色）
    uniq((sp.affiliations || []).map(a => `${a.faction}${a.role ? `(${a.role})` : ''}`)).join('、'),
    sp.debutLocation?.location ? `登场于${sp.debutLocation.location}` : '',
    uniq(sp.personality).join('、'),
    uniq(sp.relationToProtagonist).join('；'),
    uniq(sp.formsOfAddress).join(' '),
    uniq(phaseSummaries(c)).join('；'),
    uniq((sp.keyEvents || []).slice(0, 6)).join('；'),
  ].filter(Boolean).map(s => String(s).replace(/\s+/g, ' ').trim());
  let text = parts.join(' ｜ ');
  if (text.length > 600) text = text.slice(0, 600);
  return text;
}

// 2) 解析 id + 组装
const byId = new Map();
const canonOnly = [];
const collisions = [];
for (const c of cards) {
  let id = c.id || nameToId.get(c.canonicalName);
  if (!id) for (const a of (c.aliases || [])) { if (nameToId.get(a)) { id = nameToId.get(a); break; } }
  const stagePresence = !!id;
  if (!id) { id = slug(c.canonicalName); canonOnly.push(c.canonicalName); }

  const entry = {
    id,
    canonicalName: c.canonicalName,
    ...(c.idAliases ? {idAliases:c.idAliases} : {}),
    aliases: uniq(c.aliases),
    gender: c.gender,
    ...(c.entityType ? { entityType: c.entityType } : {}),
    books: c.books || [],
    tier: c.tier,
    stagePresence,
    staticProfile: withVisualLayers(c),
    region: deriveRegion(c) || undefined,
    phaseIdentities: c.phaseIdentities || [],
    ...(c.presenceWindow ? {presenceWindow:c.presenceWindow} : {}),
    ...(c.naming ? { naming: c.naming } : {}),
    review: c.review || undefined,
    embedText: buildEmbedText(c),
  };

  if (byId.has(id)) {
    // 同 id 撞卡（同人双卡）：保留 profile 更全的，另一名并入 aliases，embedText 合并
    const prev = byId.get(id);
    const score = e => JSON.stringify(e.staticProfile).length + (e.phaseIdentities?.length || 0) * 100;
    const [keep, drop] = score(entry) >= score(prev) ? [entry, prev] : [prev, entry];
    keep.aliases = uniq([...keep.aliases, drop.canonicalName, ...drop.aliases]);
    keep.embedText = (keep.embedText + ' ｜ ' + drop.canonicalName).slice(0, 640);
    byId.set(id, keep);
    collisions.push({ id, kept: keep.canonicalName, folded: drop.canonicalName });
  } else {
    byId.set(id, entry);
  }
}

const entries = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
// 3) 校验
const idSet = new Set(entries.map(e => e.id));
if (idSet.size !== entries.length) throw new Error('注册表存在重复 id（不应发生）');

// RAG 以 sourceHash 判断是否重建本地向量。注册表 ID/stagePresence 不只取决于角色卡，
// 也取决于当前 stage 演员集合；只哈希 raw cards 会在演员移出关卡后留下旧向量 ID。
// 哈希最终稳定排序的 entries，覆盖角色卡内容、stage ID 映射和 embedText 的全部变化。
const sourceHash = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16);

const registry = {
  schema: 'xiantu.character-registry.v1',
  version: `cr-${new Date().toISOString().slice(0, 10)}-${sourceHash}`,
  sourceHash,
  sourceGeneratedAt: src.generatedAt || null,
  generatedAt: new Date().toISOString(),
  stats: {
    total: entries.length,
    stagePresent: entries.filter(e => e.stagePresence).length,
    canonOnly: entries.filter(e => !e.stagePresence).length,
    collisionsMerged: collisions.length,
  },
  characters: entries,
};
writeFileSync(outPath, JSON.stringify(registry, null, 2));

console.log('=== character-registry 生成完成 ===');
console.log('输出:', outPath.replace(root + '/', ''));
console.log('条目:', entries.length, '| stage 出场:', registry.stats.stagePresent, '| canon-only:', registry.stats.canonOnly, '| 撞卡合并:', collisions.length);
console.log('立绘分层注入:', visualInjected, '人（visualIdentity / visualOutfits）');
console.log('撞卡:', collisions.map(c => `${c.id}(留 ${c.kept} / 并 ${c.folded})`).join(' ; '));
console.log('文件大小:', Math.round(JSON.stringify(registry).length / 1024) + 'KB');
console.log('embedText 样例(小紫):', (entries.find(e => e.canonicalName === '小紫') || {}).embedText?.slice(0, 160));
