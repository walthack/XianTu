// 战斗流程（纯函数，存档进、存档出）：遇敌后开战、掷一步、落账、回到战前重打。
// 战斗卡片（CombatEncounterCard.vue）只负责展示和把结果存回 store；所有规则都在这里，可以在 node 里完整测。
import type { SaveData } from '@/types/game';
import { runtimeEntityId, runtimeEntityName } from '@/modules/scenarioMods/ledger/affinityIdentity';
import {
  TIER_OF,
  createDice,
  createPhasedBattle,
  createRoundBattle,
  finalPlayerWound,
  outcomeForTotal,
  phasedTactics,
  resolvePhase,
  resolveRound,
  roundActions,
  type BattleMode,
  type BattleScenario,
  type BattleState,
  type Factor,
  type PhasedState,
  type Resolution,
  type RoundState,
  type Tier,
  type Wound,
} from './engine';
import {
  ENCOUNTER_TEXT,
  EPILOGUES,
  F03_CARD,
  F03_EVENT_ID,
  F03_IDS,
  F03_UI,
  FINALE_TEXT,
  PHASED_INTERLUDES,
  UNPROTECTED_INJURY_NOTE,
  WOUND_LINE_PREFIX,
  f03Scenario,
  narratePhase,
  narrateRound,
} from './f03Scenario';
import { realBaseFactors } from './realFactors';
import {
  COMBAT_TRIAL_FLAG_MODE,
  COMBAT_TRIAL_FLAG_RESULT,
  isCombatEngaged,
  readTrialState,
  trialRuntime,
  writeTrialState,
  type CombatTrialState,
} from './trialState';

export function scenarioForSave(save: SaveData): BattleScenario {
  return f03Scenario(kind => realBaseFactors(save, kind));
}

// ---------- 视图（卡片渲染用，纯读） ----------

export interface ChoiceView {
  id: string;
  label: string;
  kindLabel: string;
  difficulty: number;
  modifier: number;
  /** 需要掷到几以上才算「胜」。 */
  needed: number;
  hint: string;
  factors: Factor[];
  chance: Record<Tier, number>;
}

export interface BattleView {
  mode: BattleMode;
  status: CombatTrialState['status'];
  title: string;
  prompt: string;
  /** B：第几阶段 / 共几阶段；A：第几回合 / 最多几回合。 */
  progress: { index: number; total: number };
  choices: ChoiceView[];
  resolutions: Resolution[];
  ledger: Array<{ step: string; text: string }>;
  /** chip：同伴护住状态的文案，称呼从角色数据 / 账本解析，不在代码里写死。 */
  hp?: { player: number; playerMax: number; enemy: number; enemyMax: number; protectedNingyu: boolean; chip: string };
  tier: Tier | null;
  wound: Wound | null;
  rematches: number;
  card: typeof F03_CARD;
}

const KIND_LABEL: Record<string, string> = {
  combat: '战斗', escape: '身法', scheme: '谋略', stealth: '潜行', social: '交涉', explore: '探查', cultivate: '修炼', craft: '炼制',
};

function chanceOf(scenario: BattleScenario, difficulty: number, modifier: number): Record<Tier, number> {
  const counts: Record<Tier, number> = { 胜: 0, 败: 0, 大败: 0 };
  for (let roll = 1; roll <= 20; roll++) counts[TIER_OF[outcomeForTotal(roll + modifier, difficulty)]]++;
  return { 胜: counts.胜 / 20, 败: counts.败 / 20, 大败: counts.大败 / 20 };
}

export function battleView(save: SaveData | null | undefined): BattleView | null {
  const ext = readTrialState(save);
  if (!ext || !save || !ext.battle || ext.status === 'idle') return null;
  const scenario = scenarioForSave(save);
  const state = ext.battle;
  const base = {
    mode: ext.mode,
    status: ext.status,
    resolutions: state.resolutions,
    ledger: state.ledger,
    tier: state.finalTier,
    wound: state.done ? finalPlayerWound(scenario, state) : null,
    rematches: ext.rematches,
    card: F03_CARD,
  };
  if (state.mode === 'B') {
    const phase = scenario.phased.phases[Math.min(state.phaseIndex, scenario.phased.phases.length - 1)];
    return {
      ...base,
      title: phase.title,
      prompt: phase.prompt,
      progress: { index: Math.min(state.phaseIndex + 1, scenario.phased.phases.length), total: scenario.phased.phases.length },
      choices: phasedTactics(scenario, state).map(item => ({
        id: item.id, label: item.label, kindLabel: KIND_LABEL[item.kind] || item.kind, difficulty: item.difficulty,
        modifier: item.previewModifier, needed: item.needed, hint: item.hint, factors: item.previewFactors,
        chance: chanceOf(scenario, item.difficulty, item.previewModifier),
      })),
    };
  }
  const r = scenario.rounds;
  return {
    ...base,
    title: `第 ${Math.min(state.round, r.rescueRound)} 回合`,
    prompt: F03_UI.roundsPrompt,
    progress: { index: Math.min(state.round, r.rescueRound), total: r.rescueRound },
    choices: roundActions(scenario, state).map(item => ({
      id: item.id, label: item.label, kindLabel: KIND_LABEL[item.kind] || item.kind, difficulty: item.difficulty,
      modifier: item.previewModifier, needed: item.needed, hint: item.hint, factors: item.previewFactors,
      chance: chanceOf(scenario, item.difficulty, item.previewModifier),
    })),
    hp: {
      player: state.playerHp, playerMax: r.playerHp, enemy: state.enemyHp, enemyMax: r.enemyHp, protectedNingyu: state.protectedNingyu,
      chip: (state.protectedNingyu ? F03_UI.protectedChip : F03_UI.unprotectedChip)
        .replace('{ningyu}', runtimeEntityName(trialRuntime(save), F03_IDS.ningyu)),
    },
  };
}

// ---------- 叙事追加 ----------

/** 遇敌固定文本落账后所在的叙事条目（从后往前找）；管线可能晚于存档状态写入这条，没找到就先不开战。 */
function findEncounterEntry(history: any[] | undefined): number {
  const marker = ENCOUNTER_TEXT.slice(0, 30);
  for (let i = (history?.length || 0) - 1; i >= 0; i--) {
    if (String(history![i]?.content || '').includes(marker)) return i;
  }
  return -1;
}

/** 遇敌文字是否已经写进叙事（卡片据此决定何时自动开战；状态与叙事条目由管线分两步写入）。 */
export function encounterLogged(save: SaveData | null | undefined): boolean {
  return findEncounterEntry((save as any)?.系统?.历史?.叙事) >= 0;
}

function appendNarrative(save: any, ext: CombatTrialState, text: string): void {
  const history = save.系统?.历史?.叙事;
  const entry = Array.isArray(history) && ext.narrativeIndex !== null ? history[ext.narrativeIndex] : null;
  if (!entry) throw new Error('战斗实录所在的叙事条目不见了');
  entry.content = `${String(entry.content || '').replace(/\s+$/, '')}\n\n${text}`;
}

// ---------- 开战 ----------

/** 玩家点过「迎向雾里」且战斗卡片还没开战：存战前快照、建战斗状态。返回 null 表示无事可做。 */
export function beginBattle(input: SaveData): SaveData | null {
  const ext = readTrialState(input);
  if (!ext || ext.status !== 'idle' || !isCombatEngaged(input, F03_EVENT_ID)) return null;
  const save = structuredClone(input) as any;
  const next = readTrialState(save)!;
  const scenario = scenarioForSave(save);
  const narrativeIndex = findEncounterEntry(save.系统?.历史?.叙事);
  if (narrativeIndex < 0) return null;
  const snapshot = structuredClone(input) as SaveData; // ext 仍是 idle，快照里不含自己
  const battle: BattleState = next.mode === 'B' ? createPhasedBattle() : createRoundBattle(scenario);
  Object.assign(next, {
    status: 'engaged', battle, diceUsed: 0, tier: null, snapshot,
    narrativeIndex,
  } satisfies Partial<CombatTrialState>);
  if (battle.mode === 'B') {
    const phase = scenario.phased.phases[0];
    appendNarrative(save, next, `${phase.title}\n${phase.prompt}`);
  }
  writeTrialState(save, next);
  return save;
}

// ---------- 掷一步 ----------

export interface RollResult { save: SaveData; resolution: Resolution; finished: boolean }

export function rollChoice(input: SaveData, choiceId: string): RollResult {
  const ext0 = readTrialState(input);
  if (!ext0 || ext0.status !== 'engaged' || !ext0.battle || ext0.battle.done) throw new Error('当前没有进行中的战斗');
  const save = structuredClone(input) as any;
  const ext = readTrialState(save)!;
  const scenario = scenarioForSave(save);
  const dice = createDice({ seed: ext.seed, forced: ext.forced, skip: ext.diceUsed });
  const die = dice.next();
  ext.diceUsed = dice.used();

  const state = ext.battle!;
  let result: { state: BattleState; resolution: Resolution };
  const lines: string[] = [];
  if (state.mode === 'B') {
    result = resolvePhase(scenario, state as PhasedState, choiceId, die);
    lines.push(narratePhase(result.resolution));
    const after = result.state as PhasedState;
    if (!after.done) {
      lines.push(...PHASED_INTERLUDES);
      const phase = scenario.phased.phases[after.phaseIndex];
      lines.push(`${phase.title}\n${phase.prompt}`);
    }
  } else {
    result = resolveRound(scenario, state as RoundState, choiceId, die);
    lines.push(narrateRound(result.resolution));
    lines.push(...(result.resolution.scripted || []));
  }
  ext.battle = result.state;
  const finished = result.state.done;
  if (finished) lines.push(...FINALE_TEXT);
  appendNarrative(save, ext, lines.join('\n\n'));
  if (finished) settleBattle(save, ext, scenario);
  writeTrialState(save, ext);
  return { save, resolution: result.resolution, finished };
}

// ---------- 落账 ----------

const WOUND_RATIO: Record<Wound, number> = { 无: 0, 轻: 0.05, 中: 0.15, 重: 0.4 };
const WOUND_STRENGTH: Record<Wound, number> = { 无: 0, 轻: 1, 中: 3, 重: 5 };

function settleBattle(save: any, ext: CombatTrialState, scenario: BattleScenario): void {
  const state = ext.battle!;
  const tier = state.finalTier!;
  const epilogue = EPILOGUES[tier];
  const runtime = trialRuntime(save);
  runtime.flags[COMBAT_TRIAL_FLAG_RESULT] = epilogue.result;
  runtime.flags[COMBAT_TRIAL_FLAG_MODE] = ext.mode;
  ext.tier = tier;
  ext.status = 'resolved';

  // 战后记录里主角的外伤行以最终伤势为准：静态后果表按档位写死了一个档，
  // 但 A 模式的伤势还取决于气血、B 模式取各阶段累计的最重者，两者可能不同。
  const woundLine = new RegExp(`^${WOUND_LINE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}（(.)）`);
  const finalWound = finalPlayerWound(scenario, state);
  const stale = state.ledger.filter(line => line.step === '战后' && woundLine.test(line.text));
  state.ledger = state.ledger.filter(line => !stale.includes(line));
  if (finalWound !== '无') {
    const keep = stale.find(line => line.text.match(woundLine)?.[1] === finalWound);
    state.ledger.push({ step: '战后', text: keep?.text || `${WOUND_LINE_PREFIX}（${finalWound}）` });
  }

  // 主角：外伤状态 + 气血按比例扣（不低于 1），比例对齐 judgementEngine 里战斗失败的结算。
  const wound = finalPlayerWound(scenario, state);
  if (wound !== '无') {
    const hp = save.角色?.属性?.气血;
    const max = Number(hp?.上限);
    const current = Number(hp?.当前);
    if (Number.isFinite(max) && Number.isFinite(current) && current > 1 && max > 0) {
      hp.当前 = Math.max(1, current - Math.max(1, Math.round(max * WOUND_RATIO[wound])));
    }
    save.角色.效果 = (save.角色.效果 || []).filter((item: any) => item?.来源 !== '山涧雾战');
    save.角色.效果.push({
      状态名称: `外伤（${wound}）`,
      类型: 'debuff',
      生成时间: structuredClone(save.元数据?.时间 || {}),
      持续时间分钟: 7 * 24 * 60,
      状态描述: `山涧雾战中受的外伤（${wound}）。`,
      强度: WOUND_STRENGTH[wound],
      来源: '山涧雾战',
    });
  }

  // A 模式特有：没护住同伴且战局不利，该同伴战后带内伤（B 模式的同伴伤势已在静态收尾里按档位写）。
  if (state.mode === 'A' && !state.protectedNingyu && tier !== '胜') {
    const ledger = (runtime.sceneLedger ||= { receipts: [], actors: {}, injuries: {}, names: {}, worldFacts: [] });
    ledger.injuries[runtimeEntityId(runtime, F03_IDS.ningyu)] = UNPROTECTED_INJURY_NOTE;
  }
}

// ---------- 回到战前重打 ----------

/** 恢复战前快照，换一种模式（或同一种）再打。无快照返回 null。 */
export function restartFromSnapshot(input: SaveData, mode: BattleMode): SaveData | null {
  const ext = readTrialState(input);
  if (!ext?.snapshot) return null;
  const save = structuredClone(ext.snapshot) as any;
  const restored = readTrialState(save);
  if (!restored) return null;
  writeTrialState(save, { ...restored, mode, status: 'idle', battle: null, snapshot: null, tier: null, diceUsed: 0, rematches: ext.rematches + 1 });
  return save;
}
