import { isNoSummary } from '@/services/narrativeSummary';
import { applyTimelineInserts } from './timelineInserts';
import { lineGapCountText } from './secondaryLineEntry';
import {CONTENT_PACKS} from '../contentPacks';
import type { PackEnding } from '../contentPacks/presentationFormats';
import {applyStoryLevel} from './levelProgression';

import { canonicalEndingId, endingPresentation } from './endingPresentation';
import { runtimeEntityId, runtimeEntityName, migrateRuntimePersonRecords } from './ledger/affinityIdentity';
import type { SaveData } from '@/types/game';
import { inventoryItemEntries, resolveItemPresentation } from './itemPresentation';
import type { ScenarioStepScene } from './schema';
import { advanceClock } from './travel/travelLedger';
import { isStepSceneStage } from './travel/stepScene';
import { visibleModuleText } from './modularTurn';
import { logEventOnce } from '../diagnostics/log';
import { encounterPromptFacts } from './randomEncounter';
import { authoritativeAbsentCharacterIds } from './presence';
import { entityAliases } from './namedEntities';
/** 剧情交接 2026-10-02：固定死亡正文；配图由 endingPresentation 提供。 */
const ENDING_TEXTS: Readonly<Record<string,string>> = CONTENT_PACKS.texts;

// 战斗正式接入时消费此表；此处只录数据，不由LLM写tier触发，也不重复判slay_dragon/s06_02。
// F0b：TS 侧表，与内容包 endings 的 battleLoss 合并（TS 在前、包按 catalog 顺序在后，endingId 取外层；编译期禁止同一结局两边都有）。
export const TS_BATTLE_LOSS_ENDINGS = ([
  {
    "endingId": "lcq.ending.death.ghost_king_skull",
    "title": "天命的指引",
    "kind": "death",
    "sourceEventId": "lcq.event.s05b_05b_ideology_duel_and_defeat",
    "tierFlag": "lcq.encounter.f10.tier",
    "tier": "rout",
    "facts": [
      "程宗扬被封回龛窟，血没能沾上骨虎",
      "鬼巫王剖开天命者的头颅",
      "银镜中的同伴未能找到他",
      "龙神照常吞下鬼巫王"
    ]
  },
  {
    "endingId": "lcq.ending.death.dragon_well",
    "title": "龙首无人",
    "kind": "death",
    "sourceEventId": "lcq.event.ghost_king_swallowed",
    "tierFlag": "lcq.encounter.f13.tier",
    "tier": "lose",
    "facts": [
      "你带乐明珠逃往洞窟裂缝时滚下碎石坡，背脊重伤",
      "乐明珠被推进龙角下的空隙",
      "程宗扬被埋在鬼王峒地底",
      "龙神吞下鬼巫王，龙首无人号令反击"
    ]
  },
  {
    "endingId": "lcq.ending.fail.dragon_essence",
    "title": "龙精入体",
    "kind": "failure",
    "sourceEventId": "lcq.event.slay_dragon",
    "tierFlag": "lcq.encounter.f14.tier",
    "tier": "lose",
    "facts": [
      "龙神死去",
      "龙精携鬼巫王残念进入程宗扬丹田",
      "程宗扬存活，原来的自我不再主宰身体",
      "本局结束，不可续玩"
    ]
  }
] as const);
/** TS 表在前、包 endings 的 battleLoss 按 catalog 顺序在后（endingId 取外层）；同一结局两边都有抛错（编译期已拦）。 */
export function mergeBattleLossEndings<T extends { endingId: string }>(ts: readonly T[], endings: readonly PackEnding[]): T[] {
  const pack = endings.filter(e => e.battleLoss).map(e => ({ endingId: e.endingId, ...e.battleLoss! })) as unknown as T[];
  for (const e of pack) if (ts.some(t => t.endingId === e.endingId)) throw Error(`战败结局 ${e.endingId} 同时在 TS 表与内容包里`);
  return [...ts, ...pack];
}
export const BATTLE_LOSS_ENDINGS = mergeBattleLossEndings(TS_BATTLE_LOSS_ENDINGS, CONTENT_PACKS.endings || []).map(ending => ({ ...ending, presentation: endingPresentation(ending) }));

/**
 * 同一结局按来路追加的分支句（裁定簿 #240，用户 2026-10-27 00:35）：texts 键首行插正文开头、其余插结尾。
 * 来路认 gameOver.sourceEventId——阿姬曼路是武二郎入队拍的绝路，落结局时该拍尚未完成、不进编年史；期限到期等其它来路只给通用正文。
 */
export const TS_ENDING_PATH_TEXTS: Readonly<Record<string, { sourceEventId: string; textKey: string }>> = {
  'lcq.ending.death.ajiman_bond': { sourceEventId: 'lcq.event.wuerlang_joins', textKey: 'lcq.ending.death.ajiman_bond.ajiman_path' },
};
/** F0b：与内容包 endings 的 pathText 合并（TS 在前；同一结局只有一句来路分支，两边都有抛错，编译期已拦）。 */
export function mergeEndingPathTexts(ts: Readonly<Record<string, { sourceEventId: string; textKey: string }>>, endings: readonly PackEnding[]): Readonly<Record<string, { sourceEventId: string; textKey: string }>> {
  const pack = endings.filter(e => e.pathText);
  if (!pack.length) return ts;
  const out = { ...ts };
  for (const e of pack) { if (e.endingId in out) throw Error(`结局来路分支 ${e.endingId} 同时在 TS 表与内容包里`); out[e.endingId] = e.pathText!; }
  return out;
}
const ENDING_PATH_TEXTS = mergeEndingPathTexts(TS_ENDING_PATH_TEXTS, CONTENT_PACKS.endings || []);

export function fixedEndingNarrative(ending: { endingId: string; sourceEventId: string } | undefined): string | undefined {
  if (!ending) return undefined;
  const endingId = canonicalEndingId(ending);
  const text = ENDING_TEXTS[endingId];
  const path = ENDING_PATH_TEXTS[endingId];
  if (!text || !path || ending.sourceEventId !== path.sourceEventId) return text;
  const extra = ENDING_TEXTS[path.textKey];
  if (typeof extra !== 'string' || !extra.trim()) {
    // 分支句缺失不挡结局：照发通用正文，带码写持久日志（同一键本会话只记一次）
    logEventOnce(`LCQ-PCK-004:${path.textKey}`, { code: 'LCQ-PCK-004', detail: { endingId, sourceEventId: ending.sourceEventId, textKey: path.textKey } });
    return text;
  }
  const [opening, ...closing] = extra.split('\n');
  return [opening, text, ...closing].filter(line => line.trim()).join('\n');
}

/** 关键动作已由引擎预结算；不让写手追加条件、选择或道具。 */
export function fixedBeatNarrative(eventId: string | undefined, actionId: string | undefined): string | undefined {
  return CONTENT_PACKS.texts[`fixed.beat.${eventId}.${actionId}`];
}

/** 结局承接只保留1–2个完整句；长句/格式异常直接舍弃，固定结局始终可发布。 */
export function endingBridge(raw: string, endingId?: string): string {
  const fixedBridge = endingId ? ENDING_TEXTS[`ending.bridge.${endingId}`] : undefined;
  if (fixedBridge) return fixedBridge;
  try {
    let text = visibleModuleText(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    if (text.startsWith('{')) text = String(JSON.parse(text).text || '');
    const sentences = text.match(/[^。！？!?]+[。！？!?][”’」』"]?/g) || [];
    const kept: string[] = [];
    for (const sentence of sentences.slice(0, 2)) {
      if (kept.join('').length + sentence.trim().length > 220) break;
      kept.push(sentence.trim());
    }
    return kept.join('');
  } catch { return ''; }
}


export interface SceneLedger {
  receipts: string[]; actors: Record<string, { status: 'dead' | 'missing' | 'departed' | 'present'; eventId: string; actionId: string; name?: string; characterId?: string }>;
  injuries: Record<string, string>; names: Record<string, string>; worldFacts: string[];
  cultivation?: Record<string, { stage: string; eventId: string; actionId: string }>;
  groupInjuries?: Record<string, { label: string; text: string }>;
  lastBeat?: { eventId: string; actionId: string; facts: string[] };
}
export function stepScene(runtime: any, eventId?: string, actionId?: string): ScenarioStepScene | undefined {
  const event = runtime?.events?.find((e: any) => e.id === eventId);
  // 老存档内嵌旧合同；仅补当前内容包明确声明的耗时，不替换其它状态/合同。
  const overlay = CONTENT_PACKS.overlays.find(o => o.stageId === runtime?.modId)?.events?.find(e => e.id === eventId);
  const actions = (event?.playerCompletionContract?.actions || []).map((a: any) => {
    const current = overlay?.playerCompletionContract?.actions?.find((c: any) => c.id === a.id);
    return current?.timeAdvance ? { ...a, timeAdvance: current.timeAdvance } : a;
  });
  const prepared = runtime?.eventActionStates?.[eventId || '']?.preparations || [];
  return withoutHeldCast(runtime, actionId ? actions.find((a: any) => a.id === actionId) : actions.find((a: any) => (a.requiresPreparation || []).every((p: string) => prepared.includes(p)) && !(a.kind === 'prepare' && prepared.includes(a.grantsPreparation))));
}
/** 权威暂留的人（cast-gates authoritative）不进步卡在场／入场名册；作者名册原样留在合同里，条件解除即恢复。 */
function withoutHeldCast(runtime: any, scene: any): any {
  if (!scene?.cast) return scene;
  const held = new Set(authoritativeAbsentCharacterIds(runtime).flatMap(id => [id, ...entityAliases('character', id)]));
  if (!held.size) return scene;
  const keep = (person: any) => !held.has(typeof person === 'string' ? person : String(person?.name || person?.id || ''));
  return { ...scene, cast: { ...scene.cast, ...(Array.isArray(scene.cast.present) ? { present: scene.cast.present.filter(keep) } : {}), ...(Array.isArray(scene.cast.enter) ? { enter: scene.cast.enter.filter(keep) } : {}) } };
}
export function sceneDayPart(time: any): string {
  const hour = Number(time?.小时) || 0;
  return hour < 5 ? '深夜' : hour < 8 ? '清晨' : hour < 12 ? '上午' : hour < 17 ? '白天' : hour < 20 ? '黄昏' : '夜';
}
/** 逐拍演出关卡判断改读行旅数据（travel/stepScene），保留旧名供现有调用方使用。 */
export function isNanhuangSceneStage(id?: string): boolean { return isStepSceneStage(id); }

/** 只由成功的本地步骤调用；同一步重复回执不重复改生死、物品或时间。 */
export function applyStepSceneLedger(save: SaveData, runtime: any, eventId: string, actionId: string, sceneOverride?: Partial<ScenarioStepScene>): void {
  const base=stepScene(runtime,eventId,actionId);
  const scene=base && sceneOverride ? {...base,...sceneOverride} : base;
  if (!scene) return;
  // 跳年只由时间线插入事件（内容包 timeline.json）拨：关卡动作上的 timeAdvance 是旧挂点，结算到这里只兜底补一次
  // 本事件之前、尚未拨过的插入事件（正常流程已在进城路线拨过，这里不再拨）。
  if (scene.timeAdvance && !(runtime.completedEventIds || []).includes(eventId)) {
    const axisSeq = (runtime.events || []).find((event: any) => event.id === eventId)?.axisSeq;
    applyTimelineInserts(save, { reachedAxisSeq: Number.isFinite(axisSeq) ? axisSeq : undefined });
  }
  if (!isNanhuangSceneStage(runtime.modId)) return;
  const ledger: SceneLedger = runtime.sceneLedger ||= { receipts: [], actors: {}, injuries: {}, names: {}, worldFacts: [] };
  const receipt = `${eventId}::${actionId}`;
  if (ledger.receipts.includes(receipt)) return;
  ledger.receipts.push(receipt);
  for (const person of scene.cast?.exit || []) {
    const id=runtimeEntityId(runtime,person.name);
    ledger.actors[id] = { name:person.name, characterId:id, status: person.status, eventId, actionId };
    runtime.departedCast = person.status === 'dead'
      ? [...new Set([...(runtime.departedCast || []), id])]
      : (runtime.departedCast || []).filter((name: string) => name !== id);
  }
  for (const name of scene.ledgerEffects?.returnActors || []) {
    const id=runtimeEntityId(runtime,name);
    ledger.actors[id] = { name, characterId:id, status: 'present', eventId, actionId };
    runtime.departedCast = (runtime.departedCast || []).filter((n: string) => n !== id);
  }
  for(const [name,value] of Object.entries(scene.ledgerEffects?.names||{}))ledger.names[runtimeEntityId(runtime,name)]=value;
  for(const [name,value] of Object.entries(scene.ledgerEffects?.injuries||{}))ledger.injuries[runtimeEntityId(runtime,name)]=value;
  migrateRuntimePersonRecords(runtime);
  ledger.worldFacts = [...new Set([...ledger.worldFacts, ...(scene.ledgerEffects?.worldFacts || [])])];
  if (scene.ledgerEffects?.level) applyStoryLevel(save, scene.ledgerEffects.level.to);
  if (scene.ledgerEffects?.jiuyang) {
    const realm = (save as any).角色.属性.境界;
    // 九阳层次没有通用等级换算记录；保留现有高手榜等级，只记原著已有层次。
    if (realm && typeof realm === 'object') realm.九阳层次 = scene.ledgerEffects.jiuyang;
    (ledger.cultivation ||= {})['lcq.technique.jiuyang'] = { stage: scene.ledgerEffects.jiuyang, eventId, actionId };
  }
  ledger.lastBeat = { eventId, actionId, facts: scene.fixedFacts?.length ? [...scene.fixedFacts] : [scene.fallbackText || scene.previousBeat || '本步已经落账。'] };

}

/**
 * 跳年过渡叙述：跳年那一回合正文落账后，把内容包里的过渡稿接在本回合正文之后（叙事历史末条与短期记忆末条），只接一次。
 * 返回接上的文字；没有待接的过渡时返回空串。
 */
export function flushTimeSkipInterlude(save: SaveData): string {
  const runtime = (save as any).世界?.状态?.剧本模组;
  const pending = runtime?.timeSkipInterlude;
  if (!pending) return '';
  delete runtime.timeSkipInterlude;
  const raw = CONTENT_PACKS.texts[pending.textKey];
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const text = pending.yearsPath && Number.isInteger(pending.years) ? raw.split(`{${pending.yearsPath}}`).join(lineGapCountText(pending.years)) : raw;
  if (pending.placement === 'before') prependToLatestNarrative(save, text);
  else appendToLatestNarrative(save, text);
  return text;
}

/** 本地追加段同时记在概要与独立插入列表，回看全文副本时不丢稿、不重复拼概要。 */
function insertToLatestNarrative(save: SaveData, text: string, placement: 'before' | 'after'): void {
  if (!text.trim()) return;
  const join = (content: string): string => {
    const base = isNoSummary(content) ? '' : content;
    return (placement === 'before' ? [text, base] : [base, text]).filter(Boolean).join('\n\n');
  };
  const history = (save as any).系统?.历史?.叙事;
  const last = Array.isArray(history) ? history[history.length - 1] : undefined;
  if (last && typeof last.content === 'string') {
    const inserts = last.localInserts ||= { before: [], after: [] };
    if (placement === 'before') inserts.before.unshift(text);
    else inserts.after.push(text);
    last.content = join(last.content);
  }
  const memory = (save as any).社交?.记忆?.短期记忆;
  if (Array.isArray(memory) && typeof memory[memory.length - 1] === 'string') memory[memory.length - 1] = join(memory[memory.length - 1]);
}

/** 插入事件发生在触发它的原著事件之前：过场排在本回合正文之前。 */
export function prependToLatestNarrative(save: SaveData, text: string): void {
  insertToLatestNarrative(save, text, 'before');
}
/** 把本地定稿接在正文之后；随机遇敌／稀有遇敌共用，同样支持有全文副本的回合。 */
export function appendToLatestNarrative(save: SaveData, text: string): void {
  insertToLatestNarrative(save, text, 'after');
}

/** 运行时事实摘要，缺字段的旧档按已有回执推导，不从模型文字反填。 */
export function sceneLedgerSummary(save: SaveData): Record<string, unknown> {
  const runtime = (save as any).世界?.状态?.剧本模组;
  const ledger: SceneLedger | undefined = runtime?.sceneLedger;
  const inventory = (save as any).角色?.背包;
  const done = new Set([...(runtime?.completedEventIds || []), ...(runtime?.travelLedger?.doneEventIds || [])]);
  const transformed = done.has('lcq.event.s04b_lingfei_baiyi_crisis_11') || done.has('lcq.event.s04b_xi_furen_trade_route');
  const yiHuState = transformed ? { status: 'transformed', detail: '被炼成血虎的怪物，不可当普通活人使用' }
    : done.has('lcq.event.s04_05') || /^lcq\.stage_0(?:4b|5b)/.test(runtime?.modId || '') ? { status: 'missing', detail: '山洪卷走后失踪' } : ledger?.actors?.易虎;
  return {
    日期: (save as any).元数据?.时间, 时段: sceneDayPart((save as any).元数据?.时间),
    主角: { 姓名: '程宗扬', 性别: '男', 身份: '白湖商馆南荒商队头领', 境界: (save as any).角色?.属性?.境界 },
    货币: inventory?.货币 || {}, 关键物品: inventoryItemEntries(inventory?.物品).map(([id, i]) => {
      const item = resolveItemPresentation(save, i.物品ID || id, i);
      return { 名称: item.name, 数量: i.数量, 描述: item.description };
    }),
    人物状态: { ...Object.fromEntries(Object.entries(ledger?.actors||{}).map(([id,value])=>[runtimeEntityName(runtime,id),value])), ...(yiHuState ? { 易虎: yiHuState } : {}) }, 伤病: Object.fromEntries(Object.entries(ledger?.injuries||{}).map(([id,value])=>[runtimeEntityName(runtime,id),value])),
    群体伤病: Object.values(ledger?.groupInjuries || {}),
    已故: [...new Set([runtimeEntityName(runtime,"lcq.character.duan_qiang"), runtimeEntityName(runtime,"lcq.character.wang_zhe"), ...Object.entries(ledger?.actors || {}).filter(([, v]) => v.status === 'dead').map(([id]) => runtimeEntityName(runtime,id))])],
    世界事实: [...(runtime?.completedEventIds?.includes('lcq.event.ghost_king_swallowed') ? [] : ['鬼王峒未平定，鬼巫王在世']), ...(ledger?.worldFacts || [])],
    上一拍要点: ledger?.lastBeat?.facts || runtime?.chronicle?.at(-1)?.summary || '',
    // 随机遇敌事实包（危区／遇敌）；没有待演出的遇敌时为空，返回对象与原来一致。
    ...encounterPromptFacts(save),
  };
}
