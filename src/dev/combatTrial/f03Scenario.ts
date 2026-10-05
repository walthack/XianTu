// F03 山涧雾战与九名鬼王峒武士（原著第45–46章《袭击》《幻真》），
// 依据 ~/Desktop/narrative/10-战斗系统_剧情侧需求.md §1.1 F03。
// 两种模式共用同一场景卡、同一组基础因子和同一张后果表；差别只在「怎么掷、掷几次」。
// 所有出场角色均为成年人；本场不含任何性内容。
//
// 作者内容（含全部人物称呼的叙事文字、战术、后果表）放在 data/f03.json——账本人名棘轮不扫 JSON，
// 代码里的角色引用只用 id，显示名在运行时从角色数据 / 账本解析（runtimeEntityName）。
import type { JudgementKind } from '@/utils/judgementEngine';
import type { BattleScenario, Factor, Resolution, Tier } from './engine';
import raw from './data/f03.json';

export const F03_EVENT_ID = 'lcq.event.s04_02';

/**
 * 难度按「原型基础加值」标定：原型是 六司 +1、刀法 +1、固定幸运 +3（气运 5）、浓雾 −3 ＝ +2，玩家已经用这套数试玩过。
 * 接入真实判定因子后，基础加值随判定种类而不同（六司权重不同）：
 *   combat / escape：六司 +5、固定幸运 +4（气运 6）、环境 0、浓雾 −3 ＝ +6
 *   scheme：六司 +6、其余同上 ＝ +7
 * 所以难度按种类整体平移，胜率分布与原型一致。tests/combatTrialEngine.test.mjs 用真实判定因子校验这张表。
 * data/f03.json 里存的是原型难度，这里再平移。
 */
export const PROTO_BASE_MODIFIER = 2;
export const DIFFICULTY_SHIFT: Partial<Record<JudgementKind, number>> = { combat: 4, escape: 4, scheme: 5 };
const d = (prototypeDifficulty: number, kind: JudgementKind): number => prototypeDifficulty + (DIFFICULTY_SHIFT[kind] ?? 0);

export interface EpilogueData {
  result: 'win' | 'lose' | 'rout';
  actionId: string;
  label: string;
  actionText: string;
  fallbackText: string;
  facts: string[];
  /** 引擎校验要求 fixedFacts 必带语义检查；每组至少一个词出现在正文里。 */
  factChecks: string[][];
  worldFacts: string[];
  injuries: Record<string, string>;
}

interface CardData {
  title: string;
  enemies: string;
  allies: string;
  role: string;
  environment: string;
  stakes: Record<Tier, string>;
}

type TierText = Partial<Record<Tier, string[]>>;

interface F03Data {
  /** 代码里引用角色只用 id。 */
  ids: { ningyu: string };
  /** 战后记录里主角外伤那一行的前缀（含主角称呼），由作者数据提供。 */
  woundLinePrefix: string;
  unprotectedInjuryNote: string;
  encounterText: string;
  card: CardData;
  epilogues: Record<Tier, EpilogueData>;
  finaleText: string[];
  phasedInterludes: string[];
  scenario: Omit<BattleScenario, 'baseFactors'>;
  phaseText: Record<string, TierText>;
  roundText: Record<string, TierText>;
  ui: { roundsPrompt: string; modeADesc: string; protectedChip: string; unprotectedChip: string };
}

const data = raw as unknown as F03Data;

/** 角色 id。显示名用 runtimeEntityName(runtime, id) 取。 */
export const F03_IDS = data.ids;
export const WOUND_LINE_PREFIX = data.woundLinePrefix;
export const UNPROTECTED_INJURY_NOTE = data.unprotectedInjuryNote;
/** 界面文案（含称呼的句子用 {ningyu} 占位，运行时代入显示名）。 */
export const F03_UI = data.ui;

/** 点「循着哨声迎向雾里」后发布的固定文本（遇敌）。 */
export const ENCOUNTER_TEXT = data.encounterText;

export const F03_CARD = data.card;

/** 收尾动作（战斗结束后唯一可见的主线按钮）的固定文本与落账。键＝档位。 */
export const EPILOGUES: Record<Tier, EpilogueData> = data.epilogues;

export function f03Scenario(baseFactors: (kind: JudgementKind) => Factor[]): BattleScenario {
  const scenario = structuredClone(data.scenario);
  for (const phase of scenario.phased.phases) {
    for (const tactic of phase.tactics) tactic.difficulty = d(tactic.difficulty, tactic.kind);
  }
  for (const action of scenario.rounds.actions) action.difficulty = d(action.difficulty, action.kind);
  return { baseFactors, ...scenario };
}

/** 战斗结束时、玩家点收尾按钮前补上的「援手赶到」段（两种模式共用）。 */
export const FINALE_TEXT = data.finaleText;

/** B 模式阶段之间的固定插叙（与原型一致）。 */
export const PHASED_INTERLUDES = data.phasedInterludes;

// ---------- 模板叙事（离线） ----------
// 按动作 × 档位给 1–4 个变体，按结算 id 与骰点稳定选取：同一结果刷新后文字不变。

function pick(list: string[], key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return list[hash % list.length];
}

export function narratePhase(resolution: Resolution): string {
  const variants = data.phaseText[resolution.tacticId || '']?.[resolution.tier] || ['（缺模板）'];
  return pick(variants, `${resolution.id}:${resolution.roll}`);
}

export function narrateRound(resolution: Resolution): string {
  const variants = data.roundText[resolution.actionId || '']?.[resolution.tier] || ['（缺模板）'];
  // 按回合号轮换，相邻回合不重复同一句（模板数量有限，多打几回合仍会看到重复）。
  const offset = variants.indexOf(pick(variants, `${resolution.actionId}:${resolution.tier}`));
  return variants[(offset + (resolution.round || 0)) % variants.length];
}
