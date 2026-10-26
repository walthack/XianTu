/**
 * 账本结论块（身份账补充设计稿 2026-10-26 §5；措辞用户 2026-10-27 拍板，裁定簿 #238）：只给 storyContext.ts 的 buildScenarioStoryPrompt 用。
 * - 主角身份：只取 status=active、身份表（entity-catalog/identities.json）查得到、不是 secret 的身份；secret 交提示词第 5 条机密护栏（#109）。
 *   排序 rank 从高到低（没填的排最后）→ 入账先后（acquiredAtEventId 在 orderedDoneEventIds 里的位置）→ id，最多 story.identity.prompt.maxItems 个。
 * - 期限征兆（同稿 §4.5）：deadline.<id> 为 urgent / due 且规则表 promptCue 对应文字已填才出一行，不输出剩余数、不预告后果（#155）。
 * - 与里程碑称号（formatEarnedTitles，角色.身份.称号）互不合并（原稿 §1-8）。
 * - 无可注入内容返回空串（prompt 与改前逐字相同）；出错返回空串并记 LCQ-SAV-028，不阻断提示词生成。
 */
import { orderedDoneEventIds, playerIdentityDefs, playerLedgerRules, type PlayerIdentityDef, type PlayerLedgerRules } from './playerLedgerRules';
import type { PlayerIdentityLedger } from './identityLedger';
import { deadlineState, type DeadlineLimits } from './progressDeadlines';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { logError, logEventOnce } from '../diagnostics/log';
import { debugLog } from '../diagnostics/debugLog';

export const IDENTITY_PROMPT_HEADER = '【主角身份·引擎账本】';
export const DEADLINE_CUE_HEADER = '【局势征兆】';

export interface LedgerPromptOptions {
  /** 测试夹具可替换身份表；缺省读 entity-catalog/identities.json */
  defs?: PlayerIdentityDef[];
  /** 测试夹具可替换规则表；缺省读 mod-kit/player-ledger-rules.json */
  rules?: PlayerLedgerRules;
  /** 测试夹具可替换期限数值；缺省读 story.progressDeadline.limits */
  limits?: DeadlineLimits;
  /** 缺省读 story.identity.prompt.maxItems（可热改） */
  maxItems?: number;
}

interface LedgerPromptRuntime { modId?: string; playerIdentities?: PlayerIdentityLedger }

/** 身份结论行（用户 2026-10-27 拍板措辞）。names 已按位次排好，至少一个。 */
export function formatIdentityLine(names: readonly string[]): string {
  const held = names.length > 1 ? `${names.join('、')}（按位次，${names[0]}最高）` : names[0];
  return `${IDENTITY_PROMPT_HEADER}主角眼下持有的公开身份：${held}。本账以外的身份、官职、商号不得自行授予或改换。`
    + '熟人对主角的专用称呼（以角色档案与称谓设定为准）不受身份影响，照旧。'
    + '身份只影响不熟的人、官面场合对主角的称呼，以及人物对主角的态度：无专用称呼者按其所知的最高身份称呼，不知情者按亲眼所见写。';
}

/** 期限征兆行：只演可见征兆，不写剩余数（#155）。 */
export const formatDeadlineCue = (cue: string): string => `${DEADLINE_CUE_HEADER}${cue}（只借可见征兆演出，不写剩余期限，不预告后果。）`;

interface HeldIdentity { def: PlayerIdentityDef; at: number }

function heldIdentities(runtime: LedgerPromptRuntime, defs: PlayerIdentityDef[]): { held: HeldIdentity[]; secret: number } {
  const ledger = runtime.playerIdentities;
  if (ledger === undefined) return { held: [], secret: 0 };
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) throw new Error('runtime.playerIdentities 不是对象');
  const records = Object.entries(ledger).filter(([, record]) => record?.status === 'active');
  if (!records.length) return { held: [], secret: 0 };
  const position = new Map(orderedDoneEventIds(runtime).map((id, i) => [id, i]));
  const held: HeldIdentity[] = [];
  let secret = 0;
  for (const [identityId, record] of records) {
    const def = defs.find(d => d.id === identityId);
    if (!def) {
      logEventOnce(`LCQ-SAV-028:unknown_identity:${identityId}`, {
        code: 'LCQ-SAV-028', msg: `存档持有未登记的身份 ${identityId}，已跳过不注入`,
        detail: { reason: 'unknown_identity', identityId, modId: runtime.modId },
      });
      continue;
    }
    if (def.secret) { secret += 1; continue; }
    held.push({ def, at: position.get(record.acquiredAtEventId) ?? Number.POSITIVE_INFINITY });
  }
  held.sort((a, b) => (b.def.rank ?? Number.NEGATIVE_INFINITY) - (a.def.rank ?? Number.NEGATIVE_INFINITY)
    || (a.at === b.at ? 0 : a.at < b.at ? -1 : 1)
    || (a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0));
  return { held, secret };
}

function deadlineCues(runtime: unknown, rules: PlayerLedgerRules, limits: DeadlineLimits | undefined): string[] {
  const cues: string[] = [];
  for (const def of rules.progressDeadlines ?? []) {
    if (!def.promptCue) continue;
    const state = deadlineState(runtime, def.id, { rules, ...(limits ? { limits } : {}) });
    const cue = state === 'urgent' || state === 'due' ? def.promptCue[state]?.trim() : undefined;
    if (cue) cues.push(formatDeadlineCue(cue));
  }
  return cues;
}

/** 主角身份结论块＋期限征兆行；没有可注入内容时返回空串，失败返回空串并记 LCQ-SAV-028 build_failed。 */
export function formatLedgerPrompt(runtime: unknown, opts: LedgerPromptOptions = {}): string {
  try {
    const rt = (runtime || {}) as LedgerPromptRuntime;
    const { held, secret } = heldIdentities(rt, opts.defs ?? playerIdentityDefs());
    const rules = opts.rules ?? playerLedgerRules();
    const cues = deadlineCues(runtime, rules, opts.limits);
    if (!held.length && !secret && !cues.length) return '';
    const maxItems = opts.maxItems ?? GAME_NUMBERS.story.identity.prompt.maxItems;
    const names = held.slice(0, maxItems).map(item => item.def.name);
    debugLog('identity', `[身份注入] 注入 ${names.length} 个：${names.join('、') || '无'}；跳过 secret ${secret} 个；期限征兆 ${cues.length} 行`);
    return [...(names.length ? [formatIdentityLine(names)] : []), ...cues].join('\n');
  } catch (error) {
    // 结论块生成失败不阻断提示词，本轮不注入；下一轮现生成
    logError('LCQ-SAV-028', error, { detail: { reason: 'build_failed', modId: (runtime as LedgerPromptRuntime | null)?.modId } });
    return '';
  }
}
