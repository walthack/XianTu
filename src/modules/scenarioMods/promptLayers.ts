/**
 * 角色设定分层（设计稿 2026-11-03-角色设定分层.md §1.1／§1.4／§二；用户 18:07 拍板 P1=B）。
 *
 * 纯函数，只读 mod-kit/prompt-layers.json 与 affinityLadder 阈值，由 storyContext 接线：
 *   - fieldLayer：staticProfile 字段归哪一层（base／gated／secret），最长路径优先，
 *     所以 `visualIdentity.trueForm` 归 secret、其余 `visualIdentity.*` 归 base。
 *   - privateGateOpen：私密层门＝（玩家输入命中 OR 拍子 scene.intimate）AND 在场 AND 关系已确立，三项同时满足才开（P3）。
 *   - beatIntimateFor：当前激活拍是否对该角色标了 scene.intimate（拍子入口；characters 省略取 relatedCharacterIds）。
 *   - intimateInputHit：玩家本轮输入是否命中配置词表（原 intimacyProfiles.ts 写死的正则，原样搬入配置）。
 *   - pickPrivacyFields：私密信息门开时只留配置清单里的倾向类字段（P5）。
 *   - projectNpcMemory：NPC 记忆只取最近 npcPromptLimit 条（P6；不截条目本身，P9 不做写入时截断）。
 *   - pickAbsentRelationFields：不在场 NPC 的 社交.关系 条目只留 absentRelationFields（设计稿 §二、风险 1）。
 */
import config from '../../../mod-kit/prompt-layers.json';
import { AFFINITY_THRESHOLDS } from './affinityLadder';
import type { IntimacyProfile } from './intimacyProfiles';
import type { ScenarioModEventScene } from './schema/scenario';

export type PromptLayer = 'base' | 'gated' | 'secret';

export interface PromptLayersConfig {
  layers: {
    base: { fields: string[] };
    gated: { fields: string[]; gate: string };
    secret: { fields: string[]; gate: string };
    private: { source: string; gate: string };
  };
  private: { requirePresent: boolean; maxLinesPerCharacter: number; favorTiers: string };
  noteFields: Record<string, string>;
  derivedNotePrefixes: string[];
  privacyAllowedFields: string[];
  absentRelationFields: string[];
  intimateInputPatterns: string[];
  memory: { npcEntryMaxChars: number; npcPromptLimit: number; npcDegradedPromptLimit: number };
}

export const PROMPT_LAYERS = config as PromptLayersConfig;

const FIELD_LAYERS: ReadonlyArray<readonly [string, PromptLayer]> = (['base', 'gated', 'secret'] as const)
  .flatMap(layer => PROMPT_LAYERS.layers[layer].fields.map(field => [field, layer] as const))
  .sort((a, b) => b[0].length - a[0].length);

/** 字段所属层；未登记返回 null。`a.b` 先找 `a.b`，再回落 `a`。 */
export function fieldLayer(field: string): PromptLayer | null {
  const hit = FIELD_LAYERS.find(([path]) => field === path || field.startsWith(`${path}.`));
  return hit ? hit[1] : null;
}

const escapeRe = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 由配置词表拼成的亲密场景正则；宁漏不误，只认强信号词（判定口径见 intimacyProfiles.ts）。 */
export const INTIMATE_INPUT_RE = new RegExp(PROMPT_LAYERS.intimateInputPatterns.map(escapeRe).join('|'));

export function intimateInputHit(input: string | null | undefined): boolean {
  return !!input && INTIMATE_INPUT_RE.test(input);
}

/** 只读事件上判定所需的三个字段，便于测试与运行时事件共用。 */
export interface IntimateBeatLike {
  relatedCharacterIds?: string[];
  scene?: ScenarioModEventScene;
}

/**
 * 拍子入口：激活拍 scene.intimate === true 且角色在 scene.characters（省略取 relatedCharacterIds）里。
 * 只是入口之一，在场与关系确立仍由 privateGateOpen 判。
 */
export function beatIntimateFor(activeEvent: IntimateBeatLike | null | undefined, characterId: string | null | undefined): boolean {
  if (!activeEvent || !characterId || activeEvent.scene?.intimate !== true) return false;
  const characters = Array.isArray(activeEvent.scene.characters)
    ? activeEvent.scene.characters
    : activeEvent.relatedCharacterIds;
  return Array.isArray(characters) && characters.includes(characterId);
}

export interface PrivateGateInput {
  /** 玩家本轮输入命中词表 */
  inputHit?: boolean;
  /** 当前激活拍 scene.intimate === true（与 inputHit 并列的入口） */
  beatIntimate?: boolean;
  /** 角色在场 */
  present: boolean;
  /** 该角色当前好感 */
  favor: number;
  /** 关系确立阈值；省略取 affinityLadder 的 intimacyShallow */
  thresholds?: { intimacyShallow: number };
}

export function privateGateOpen(input: PrivateGateInput): boolean {
  const entry = !!input.inputHit || !!input.beatIntimate;
  const present = !PROMPT_LAYERS.private.requirePresent || !!input.present;
  const threshold = (input.thresholds || AFFINITY_THRESHOLDS).intimacyShallow;
  const established = Number.isFinite(input.favor) && input.favor >= threshold;
  return entry && present && established;
}

/** 私密信息只留清单字段；非对象返回 null。 */
export function pickPrivacyFields(privacy: unknown): Record<string, unknown> | null {
  if (!privacy || typeof privacy !== 'object' || Array.isArray(privacy)) return null;
  const source = privacy as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const field of PROMPT_LAYERS.privacyAllowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) picked[field] = source[field];
  }
  return picked;
}

/** 不在场 NPC 只留清单字段（名字、关系、好感、位置等），省记忆与私密信息；非对象返回 null。 */
export function pickAbsentRelationFields(npc: unknown): Record<string, unknown> | null {
  if (!npc || typeof npc !== 'object' || Array.isArray(npc)) return null;
  const source = npc as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const field of PROMPT_LAYERS.absentRelationFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) picked[field] = source[field];
  }
  return picked;
}

/** NPC 记忆取最近 npcPromptLimit 条（数组尾部为最新）；非数组返回空数组。 */
export function projectNpcMemory<T>(list: T[] | null | undefined): T[] {
  if (!Array.isArray(list)) return [];
  const limit = PROMPT_LAYERS.memory.npcPromptLimit;
  return limit > 0 ? list.slice(-limit) : [];
}

const isPositiveInt = (value: unknown) => Number.isInteger(value) && (value as number) > 0;
const isStringList = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim() !== '');

/** 配置体检：返回错误列表，空数组＝通过。 */
export function validatePromptLayersConfig(cfg: unknown): string[] {
  const errors: string[] = [];
  const c = (cfg || {}) as Partial<PromptLayersConfig>;
  const layers = (c.layers || {}) as Partial<PromptLayersConfig['layers']>;
  const seen = new Map<string, string>();
  for (const layer of ['base', 'gated', 'secret'] as const) {
    const fields = layers[layer]?.fields;
    if (!isStringList(fields)) { errors.push(`layers.${layer}.fields 须为非空字符串数组`); continue; }
    for (const field of fields as string[]) {
      if (seen.has(field)) errors.push(`字段 ${field} 同时登记在 ${seen.get(field)} 与 ${layer}`);
      seen.set(field, layer);
    }
  }
  if (typeof layers.gated?.gate !== 'string') errors.push('layers.gated.gate 须为字符串');
  if (typeof layers.secret?.gate !== 'string') errors.push('layers.secret.gate 须为字符串');
  if (typeof layers.private?.source !== 'string' || typeof layers.private?.gate !== 'string') errors.push('layers.private 须有 source 与 gate');
  if (typeof c.private?.requirePresent !== 'boolean') errors.push('private.requirePresent 须为布尔');
  if (!isPositiveInt(c.private?.maxLinesPerCharacter)) errors.push('private.maxLinesPerCharacter 须为正整数');
  if (c.private?.favorTiers !== 'affinityLadder') errors.push('private.favorTiers 只支持 affinityLadder');
  if (!c.noteFields || typeof c.noteFields !== 'object' || Array.isArray(c.noteFields)
    || Object.entries(c.noteFields).some(([tag, field]) => !tag || typeof field !== 'string'
      || ![...seen.keys()].some(path => field === path || field.startsWith(`${path}.`)))) {
    errors.push('noteFields 须映射备注标签到已登记层级字段');
  }
  if (!isStringList(c.derivedNotePrefixes) || !c.derivedNotePrefixes?.length) errors.push('derivedNotePrefixes 须为非空字符串数组');
  if (!isStringList(c.privacyAllowedFields)) errors.push('privacyAllowedFields 须为字符串数组');
  if (!isStringList(c.absentRelationFields) || !c.absentRelationFields?.length
    || c.absentRelationFields.some(field => field === '记忆' || field === '私密信息')) {
    errors.push('absentRelationFields 须为非空字符串数组，且不含 记忆／私密信息');
  }
  if (!isStringList(c.intimateInputPatterns) || !c.intimateInputPatterns?.length) errors.push('intimateInputPatterns 须为非空字符串数组');
  if (!isPositiveInt(c.memory?.npcDegradedPromptLimit)) errors.push('memory.npcDegradedPromptLimit 须为正整数');
  if (!isPositiveInt(c.memory?.npcEntryMaxChars)) errors.push('memory.npcEntryMaxChars 须为正整数');
  if (!Number.isInteger(c.memory?.npcPromptLimit) || (c.memory?.npcPromptLimit as number) < 0) errors.push('memory.npcPromptLimit 须为非负整数');
  return errors;
}

/** 未登记的阶段/内部约束备注保留；secret 继续携带源备注已有的显露与知情门。 */
export function projectProfileNotes(notes: string[], favorGate: boolean, hiddenNote: string): string[] {
  let hidden = false;
  const projected = notes.filter(note => {
    const field = Object.entries(PROMPT_LAYERS.noteFields).find(([tag]) => note.startsWith(tag))?.[1];
    if (field && fieldLayer(field) === 'gated' && !favorGate) {
      hidden = true;
      return false;
    }
    return true;
  });
  if (hidden) projected.push(hiddenNote);
  return projected;
}

/** hardLimits 不参与私密内容预算，由调用方随基础档案发送。 */
export function projectIntimacyLines(profile: IntimacyProfile, gate: PrivateGateInput): string[] {
  if (!privateGateOpen(gate)) return [];
  const revealed = (profile.tiers || [])
    .filter(tier => gate.favor >= tier.minFavor)
    .flatMap(tier => tier.reveals);
  return [
    ...(profile.physical ? [`身体：${profile.physical}`] : []),
    ...profile.preferences,
    ...(revealed.length ? [`当前关系可见：${revealed.join(' ')}`] : []),
  ].slice(0, PROMPT_LAYERS.private.maxLinesPerCharacter);
}
