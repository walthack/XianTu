// 物品/角色 ↔ 剧情事件 的指针：手写关系（story-links.json + 总表 story 字段）与脚本生成的只读登场反向索引。
// 关卡事件结构不改；事件 id 是机器指针，原著章号（axisId 第二段）只做展示。
// 严格度与词表都在 mod-kit/entity-catalog/validation.config.json 的 storyLinks 里。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { variantIdentityErrors } from './validate-entity-catalog.mjs';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
export const APPEARANCES_PATH = 'mod-kit/entity-catalog/entity-appearances.json';
const GEN_HINT = '请运行 node scripts/build-entity-appearances.mjs';

export function loadInputs() {
  const dir = 'src/modules/scenarioMods/builtins/data/', stages = {};
  for (const f of readdirSync(new URL(dir, root)).filter(n => n.endsWith('.json')).sort()) { const m = read(dir + f); stages[m.manifest.id] = m; }
  return {
    stages,
    items: read('mod-kit/entity-catalog/items.json'),
    links: read('mod-kit/entity-catalog/story-links.json'),
    characterIds: new Set(read('src/modules/scenarioMods/builtins/character-registry.json').characters.map(c => c.id)),
    characterNames: new Map(read('src/modules/scenarioMods/builtins/character-registry.json').characters.map(c => [c.id, c.canonicalName])),
    config: read('mod-kit/entity-catalog/validation.config.json'),
    appearancesText: existsSync(new URL(APPEARANCES_PATH, root)) ? readFileSync(new URL(APPEARANCES_PATH, root), 'utf8') : null,
  };
}

const chapterOf = axisId => { const n = Number(String(axisId || '').split('.')[1]); return Number.isInteger(n) ? n : undefined; };
const seqOf = e => (typeof e.axisSeq === 'number' ? e.axisSeq : undefined);
const bookOf = (stageId, e) => String(e.axisId || '').split('.')[0] || stageId.split('.')[0];

function indexEvents(stages) {
  const byId = new Map();
  for (const [stageId, mod] of Object.entries(stages)) for (const e of mod.scenario?.events || []) {
    if (!byId.has(e.id)) byId.set(e.id, []);
    byId.get(e.id).push({ stageId, event: e });
  }
  return byId;
}
function actionIdsOf(event) { // 事件里任意层级的 actions[].id（含世界行动者机会里的步骤动作）
  const out = new Set();
  const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o.actions)) for (const a of o.actions) if (a?.id) out.add(a.id); for (const v of Object.values(o)) walk(v); };
  walk(event);
  return out;
}
function transfersOf(event) { // [{itemId, quantity}]
  const out = [];
  const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o.inventoryTransfers)) for (const t of o.inventoryTransfers) out.push({ itemId: t.itemId, quantity: t.quantity }); for (const v of Object.values(o)) walk(v); };
  walk(event);
  return out;
}
const doneFlagsOf = conditions => { // 条件里依赖的 flags.event.<名>.done
  const out = new Set();
  const walk = o => { if (!o || typeof o !== 'object') return; if (typeof o.path === 'string') { const m = /^flags\.event\.(.+)\.done$/.exec(o.path); if (m) out.add(m[1]); } for (const v of Object.values(o)) walk(v); };
  walk(conditions);
  return out;
};

/** 手写的「必须出现 / 前置」：物品在总表条目的 story 字段，角色（总表由 registry 生成、不能手写）在 story-links.json 的 characterStory。 */
export function annotationsOf(inputs) {
  const out = [];
  for (const e of inputs.items.entries) if (e.story) out.push({ kind: 'item', id: e.id, mustAppear: e.story.mustAppear || [], requires: e.story.requires || [], source: `items.json:${e.id}.story` });
  for (const [id, s] of Object.entries(inputs.links.characterStory || {})) out.push({ kind: 'character', id, mustAppear: s.mustAppear || [], requires: s.requires || [], source: `story-links.json:characterStory.${id}` });
  return out;
}

/** 只读派生：每个被跟踪实体出现在哪些事件。来源 = 事件 relatedCharacterIds、story-links 指针、事件内 inventoryTransfers。 */
export function buildAppearances(inputs) {
  const { stages, links, config } = inputs, cfg = config.storyLinks;
  const annotated = annotationsOf(inputs);
  const tracked = new Set(annotated.map(a => `${a.kind}:${a.id}`));
  for (const l of links.links) tracked.add(`${l.object.kind}:${l.object.id}`);
  const rows = new Map(), add = (key, row) => { if (!rows.has(key)) rows.set(key, []); rows.get(key).push(row); };
  const slim = (stageId, e) => ({ stageId, eventId: e.id, ...(e.axisId ? { axisId: e.axisId } : {}), ...(chapterOf(e.axisId) !== undefined ? { chapter: chapterOf(e.axisId) } : {}), ...(e.critical !== undefined ? { critical: e.critical } : {}) });
  for (const [stageId, mod] of Object.entries(stages)) for (const e of mod.scenario?.events || []) {
    for (const id of e.relatedCharacterIds || []) { const key = `character:${id}`; if (cfg.appearanceScope === 'all' || tracked.has(key)) add(key, { ...slim(stageId, e), source: 'relatedCharacterIds' }); }
    for (const t of transfersOf(e)) { const key = `item:${t.itemId}`; if (tracked.has(key)) add(key, { ...slim(stageId, e), source: 'inventoryTransfers', quantity: t.quantity }); }
  }
  const events = indexEvents(stages);
  for (const l of links.links) {
    const hit = (events.get(l.eventId) || []).find(x => x.stageId === l.stageId);
    if (!hit) continue; // 悬空由校验报
    add(`${l.object.kind}:${l.object.id}`, { ...slim(l.stageId, hit.event), source: 'story-link', linkId: l.id, verb: l.verb, quantity: l.object.quantity, necessity: l.necessity });
  }
  const order = r => [r.stageId, String(seqOf(stages[r.stageId]?.scenario?.events?.find(e => e.id === r.eventId) || {}) ?? 1e9).padStart(9, '0'), r.eventId, r.source, r.linkId || ''].join('|');
  const entities = {};
  for (const key of [...rows.keys()].sort()) {
    const list = rows.get(key).sort((a, b) => order(a).localeCompare(order(b)));
    entities[key] = { chapters: [...new Set(list.map(r => r.chapter).filter(c => c !== undefined))].sort((a, b) => a - b), events: list };
  }
  return { version: 1, scope: cfg.appearanceScope, derivedFrom: ['builtins/data scenario.events', 'story-links.json', 'items.json story'], entities };
}
export const serializeAppearances = a => `${JSON.stringify(a, null, 2)}\n`;

export function auditStoryLinks(inputs) {
  const errors = [], warnings = [];
  const { stages, items, links, config, characterIds } = inputs, cfg = config.storyLinks;
  const emit = (severity, msg) => (severity === 'warn' ? warnings : errors).push(msg);
  const events = indexEvents(stages), itemById = new Map(items.entries.map(e => [e.id, e]));
  const eventHit = (eventId, stageId) => (events.get(eventId) || []).find(x => !stageId || x.stageId === stageId);
  const label = eventId => { const h = eventHit(eventId); const c = h && chapterOf(h.event.axisId); return `${eventId}${c !== undefined ? `（第${c}章）` : ''}`; };
  // 1. 指针本身
  const seen = new Set();
  for (const l of links.links) {
    const where = `link ${l.id}`;
    if (seen.has(l.id)) errors.push(`${where}: 指针 id 重复`); seen.add(l.id);
    const hit = eventHit(l.eventId, l.stageId);
    if (!stages[l.stageId]) errors.push(`${where}: 关卡 ${l.stageId} 不存在`);
    else if (!hit) errors.push(`${where}: 事件 ${l.eventId} 不在关卡 ${l.stageId} 里（悬空引用）`);
    else if (l.actionId && !actionIdsOf(hit.event).has(l.actionId)) errors.push(`${where}: 动作 ${l.actionId} 不在事件 ${l.eventId} 里（悬空引用）`);
    if (!characterIds.has(l.actor)) errors.push(`${where}: 角色 ${l.actor} 不在角色总表里（悬空引用）`);
    if (!(l.verb in cfg.verbs)) errors.push(`${where}: 动词 ${l.verb} 不在配置词表 ${Object.keys(cfg.verbs).join('/')}`);
    if (!cfg.necessities.includes(l.necessity)) errors.push(`${where}: necessity ${l.necessity} 只能是 ${cfg.necessities.join('/')}`);
    if (l.object?.kind !== 'item') errors.push(`${where}: object.kind 目前只支持 item`);
    else {
      const entry = itemById.get(l.object.id);
      if (!entry) errors.push(`${where}: 物品 ${l.object.id} 不在道具总表里（悬空引用）`);
      else for (const [stageId, v] of Object.entries(entry.stageVariants)) errors.push(...variantIdentityErrors(entry, stageId, v, config.variantIdentity).map(m => `${where}: 多义 id → ${m}`));
      if (!Number.isInteger(l.object.quantity) || l.object.quantity < 1) errors.push(`${where}: quantity 需为 ≥1 的整数`);
    }
  }
  // 2. 登场证据（先重建，派生文件是否过期单独查）
  const built = buildAppearances(inputs);
  for (const a of annotationsOf(inputs)) {
    const key = `${a.kind}:${a.id}`, who = `${a.kind === 'item' ? '物品' : '角色'} ${a.id}`;
    if (a.kind === 'item' && !itemById.has(a.id)) errors.push(`${who}: 不在道具总表里`);
    if (a.kind === 'character' && !characterIds.has(a.id)) errors.push(`${who}: 不在角色总表里（${a.source}）`);
    const rows = built.entities[key]?.events || [];
    for (const m of a.mustAppear) {
      if (!eventHit(m.eventId)) { errors.push(`${who}: mustAppear 事件 ${m.eventId} 不存在（悬空引用，${a.source}）`); continue; }
      const here = rows.filter(r => r.eventId === m.eventId);
      const evidence = here.filter(r => cfg.optionalEventIsEvidence || r.critical !== false);
      if (evidence.length) continue;
      emit(cfg.mustAppearSeverity, here.length
        ? `${who}: 要求出现在 ${label(m.eventId)}，但该事件是可选事件（critical:false），可选事件不算必经出现的证据`
        : `${who}: 要求出现在 ${label(m.eventId)}，但关卡数据里没有它的登场（缺 relatedCharacterIds 或 story-links 指针）`);
    }
    // 3. 前置：被要求的事件必须先于每个 mustAppear 事件
    for (const r of a.requires) {
      const before = eventHit(r.eventDone);
      if (!before) { errors.push(`${who}: requires 事件 ${r.eventDone} 不存在（悬空引用，${a.source}）`); continue; }
      if (!cfg.requiresEnabled) continue; // 顺序校验默认关（validation.config.json: storyLinks.requiresEnabled）；悬空引用上面照查
      for (const m of a.mustAppear) {
        const after = eventHit(m.eventId);
        if (!after) continue;
        const verdict = orderOf(before, after);
        if (verdict === 'ok') continue;
        emit(cfg.requiresSeverity, `${who}: 顺序违反——要求先完成 ${label(r.eventDone)}${seqText(before)}，但出现事件 ${label(m.eventId)}${seqText(after)} ${verdict === 'unknown' ? '无法比较先后（跨书或缺 axisSeq，也没有 flags 依赖链）' : '并不在其后'}`);
      }
    }
  }
  // 4. 指针漏标：覆盖范围内的关卡里，事件的物品转移必须有对应指针
  for (const stageId of links.coverage?.stages || []) {
    if (!stages[stageId]) { errors.push(`coverage 关卡 ${stageId} 不存在`); continue; }
    for (const e of stages[stageId].scenario?.events || []) for (const t of transfersOf(e)) {
      if (!links.links.some(l => l.eventId === e.id && l.object?.id === t.itemId)) emit(cfg.unlinkedGrantSeverity, `指针漏标：${stageId} 的事件 ${e.id} 转移物品 ${t.itemId}×${t.quantity}，story-links.json 没有对应指针`);
    }
  }
  // 5. 派生文件是否过期
  const want = serializeAppearances(built);
  if (inputs.appearancesText === null) emit(cfg.staleDerivedSeverity, `${APPEARANCES_PATH} 不存在，${GEN_HINT}`);
  else if (inputs.appearancesText !== want) emit(cfg.staleDerivedSeverity, `${APPEARANCES_PATH} 与关卡/指针数据不一致（派生文件过期或被手改），${GEN_HINT}`);
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], appearances: built };

  function seqText(h) { const s = seqOf(h.event); return s === undefined ? '' : `[axisSeq ${s}]`; }
  // 'ok' 前者先于后者；'late' 前者不在后者之前；'unknown' 无法比较
  function orderOf(before, after) {
    if (before.event.id === after.event.id) return 'late';
    if (dependsOn(after, before.event.id)) return 'ok';
    if (dependsOn(before, after.event.id)) return 'late';
    const a = seqOf(before.event), b = seqOf(after.event);
    if (a === undefined || b === undefined || bookOf(before.stageId, before.event) !== bookOf(after.stageId, after.event)) return 'unknown';
    return a < b ? 'ok' : 'late';
  }
  function dependsOn(from, targetEventId, visiting = new Set()) { // from 的 conditions 是否（传递地）要求 targetEventId 完成
    if (visiting.has(from.event.id)) return false; visiting.add(from.event.id);
    for (const flag of doneFlagsOf(from.event.conditions)) {
      const next = (stages[from.stageId].scenario?.events || []).find(e => e.id.endsWith(`.event.${flag}`) || e.id === flag);
      if (!next) continue;
      if (next.id === targetEventId || dependsOn({ stageId: from.stageId, event: next }, targetEventId, visiting)) return true;
    }
    return false;
  }
}

/** 展开成可读剧情清单（只读）：事件顺序 + 谁对哪件东西做了什么，以及总表里的必须出现/前置。 */
export function expandStoryLinks(inputs) {
  const { stages, links, config } = inputs, cfg = config.storyLinks, events = indexEvents(stages);
  const itemName = (id, stageId) => { const e = inputs.items.entries.find(x => x.id === id); return (e?.stageVariants[stageId] || e?.definition)?.name || id; };
  const charName = id => inputs.characterNames.get(id) || id;
  const evLabel = (stageId, e) => `${chapterOf(e.axisId) !== undefined ? `第 ${chapterOf(e.axisId)} 章｜` : ''}${e.name}（${e.id}）`;
  const out = ['# 剧情指针展开', ''];
  const byStage = new Map();
  for (const l of links.links) { if (!byStage.has(l.stageId)) byStage.set(l.stageId, []); byStage.get(l.stageId).push(l); }
  for (const [stageId, list] of byStage) {
    out.push(`## ${stageId}`);
    const sorted = list.slice().sort((a, b) => (seqOf(events.get(a.eventId)?.[0]?.event || {}) ?? 1e9) - (seqOf(events.get(b.eventId)?.[0]?.event || {}) ?? 1e9) || a.id.localeCompare(b.id));
    for (const l of sorted) {
      const hit = (events.get(l.eventId) || []).find(x => x.stageId === stageId);
      out.push(`- ${hit ? evLabel(stageId, hit.event) : `${l.eventId}（事件不存在）`}：${charName(l.actor)} ${cfg.verbs[l.verb] ?? l.verb} ${itemName(l.object.id, stageId)}×${l.object.quantity}（${l.necessity === 'must' ? '必须' : '可选'}${l.actionId ? `，动作 ${l.actionId}` : ''}）`);
    }
    out.push('');
  }
  const notes = annotationsOf(inputs);
  if (notes.length) {
    out.push('## 总表标注（必须出现 / 前置）');
    for (const a of notes) {
      const name = a.kind === 'item' ? itemName(a.id) : charName(a.id);
      const evs = ids => ids.map(id => { const h = events.get(id)?.[0]; return h ? `${chapterOf(h.event.axisId) !== undefined ? `第 ${chapterOf(h.event.axisId)} 章` : ''}${h.event.name}` : `${id}（事件不存在）`; }).join('、');
      out.push(`- ${name}（${a.id}）：必须出现于 ${evs(a.mustAppear.map(m => m.eventId)) || '—'}${a.requires.length ? `；须先完成 ${evs(a.requires.map(r => r.eventDone))}` : ''}`);
    }
    out.push('');
  }
  return `${out.join('\n')}\n`;
}
