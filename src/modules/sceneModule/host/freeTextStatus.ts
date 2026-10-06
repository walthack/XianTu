// 场外自由文本 → 主角状态：由代码按目录 label/别名裁决，模型只提供文字，不决定挂不挂、挂多久。
// 只处理目录里标了 freeText 的状态；被点穴、麻痹、昏迷不标（合规标记：不得用于把强迫情节做成可玩内容），本入口一律不挂。
import type { SaveData, StatusEffect } from '@/types/game';
import { STATUS_CATALOG, statusNamePattern } from '../statuses';
import { toPlayerStatusEffect } from '../statusAdapters';
import type { StatusDef } from '../types';
import { injuryStore, renderInjuryViews, sceneTime } from './injuries';
import { runtimeOf } from './refs';

const SOURCE_PREFIX = 'narrative:';
const NEGATION_RE = /未|没|不曾|并无|并非|不是|无法|别|勿|免得/;
const UNREAL_RE = /假装|装作|佯装|如果|若是|要是|万一|仿佛|好像|似乎|宛如|如同|差点|险些|几乎|担心|以免|会不会|吗|？|\?/;
const HEALED_RE = /痊愈|愈合|好转|消退|止住|解了|解毒|醒酒|酒醒|清醒|结痂|缓过/;
const PRONOUN_RE = /你|我|他|她|它/g;

const mountable = (from: 'input' | 'narrative'): StatusDef[] =>
  STATUS_CATALOG.filter(def => def.freeText === 'input' || (from === 'narrative' && def.freeText === 'narrative'));

type Mention = { clause: string; subject: string };

/** 状态名在文中的每次出现：所在小句，以及同一句里它前面最近的人称（主语承前句内省略时沿用）。 */
function mentions(text: string, def: StatusDef): Mention[] {
  const name = new RegExp(statusNamePattern(def.id), 'g'), out: Mention[] = [];
  for (const sentence of String(text || '').split(/[。！？；;\n]/)) {
    for (const hit of sentence.matchAll(name)) {
      const head = sentence.slice(0, hit.index), subject = [...head.matchAll(PRONOUN_RE)].pop()?.[0] || '';
      const start = Math.max(head.lastIndexOf('，'), head.lastIndexOf(','));
      const end = sentence.slice(hit.index).search(/[，,]/);
      out.push({ clause: sentence.slice(start + 1, end < 0 ? undefined : hit.index! + end), subject });
    }
  }
  return out;
}

const real = (clause: string): boolean => !NEGATION_RE.test(clause) && !UNREAL_RE.test(clause) && !HEALED_RE.test(clause);

/** 裁决：返回本轮应挂到主角身上的状态 id（按目录顺序）。正文须以「你」为主语；玩家自述以「我」或无主语为准，且正文不得否认。 */
export function adjudicateFreeTextStatuses(narrative: string, userAction: string): string[] {
  const out: string[] = [];
  for (const def of mountable('narrative')) {
    const told = mentions(narrative, def).filter(m => m.subject === '你');
    const byNarrative = told.some(m => real(m.clause));
    const byInput = def.freeText === 'input' && !told.some(m => !real(m.clause))
      && mentions(userAction, def).some(m => (m.subject === '我' || m.subject === '') && real(m.clause));
    if (byNarrative || byInput) out.push(def.id);
  }
  return out;
}

const isMountableName = (name: string): StatusDef | undefined =>
  mountable('narrative').find(def => new RegExp(`^(?:${statusNamePattern(def.id)})$`).test(name));

/**
 * 写入：角色.效果 一项 + sceneLedger.statusRecords 一行（与剧情线 status 效果同一写法），时长取目录 afterScene。
 * 模型本轮自己 push 的同名状态（目录里可由文字挂的那几条）一律撤掉，以代码裁决为准。返回是否有改动。
 */
export function mountFreeTextStatuses(save: SaveData, before: SaveData, narrative: string, userAction: string): boolean {
  const effects: StatusEffect[] = Array.isArray(save.角色?.效果) ? save.角色.效果 : [];
  const prior = new Set((Array.isArray(before.角色?.效果) ? before.角色.效果 : []).map((e: StatusEffect) => JSON.stringify(e)));
  const kept = effects.filter(e => prior.has(JSON.stringify(e)) || !isMountableName(String(e?.状态名称 || '')));
  let changed = kept.length !== effects.length;
  const now = (save as any).元数据?.时间;
  const ids = now ? adjudicateFreeTextStatuses(narrative, userAction) : [];
  const runtime = runtimeOf(save), playerId = runtime?.opening?.playerCharacterId;
  for (const id of ids) {
    const def = STATUS_CATALOG.find(d => d.id === id)!;
    const source = `${SOURCE_PREFIX}${def.id}`, minutes = def.afterScene?.minutes ?? null;
    // 其他来源（场面/剧情线）已挂着同名状态时不重复挂；本入口自己挂的再次命中就刷新时长。
    if (kept.some(e => e.状态名称 === def.label && e.来源 !== source)) continue;
    const effect = toPlayerStatusEffect({ party: 'player', ref: playerId || 'player', status: def.id, label: def.label, minutes, cause: def.cause, source }, now, def);
    const at = kept.findIndex(e => e.状态名称 === def.label && e.来源 === source);
    if (at >= 0) kept[at] = effect; else kept.push(effect);
    if (runtime && playerId) {
      const store = injuryStore(save), t = sceneTime(save);
      store.actors[playerId] = (store.actors[playerId] || []).filter((row: any) => row.sourceScene !== source);
      store.actors[playerId].push({ player: true, statusId: def.id, label: def.label, sourceScene: source, cause: def.cause, source: def.source, appliedAt: t, expiresAt: minutes === null ? null : t + minutes, effects: structuredClone(def.effects), remove: structuredClone(def.remove || []) });
    }
    changed = true;
  }
  if (!changed) return false;
  ((save as any).角色 ||= {}).效果 = kept;
  if (ids.length && runtime && playerId) renderInjuryViews(save);
  return true;
}
