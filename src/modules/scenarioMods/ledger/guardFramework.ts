import type { SaveData } from '@/types/game';
import { validateNanhuangCanonNarrative } from '../narrativeBoundaries';

export type GuardMode = 'enforce' | 'shadow' | 'off';
export interface GuardFinding {
  ruleId: string; severity: 'hard' | 'soft'; mode: GuardMode;
  quote: string; context: 'narration' | 'dialogue' | 'unknown';
  eventId?: string; draft?: number; wouldReject: boolean; rejected: boolean;
}
export interface GuardRule {
  id: string; severity: 'hard' | 'soft'; mode: GuardMode;
  inspect: (text: string) => Array<{ quote: string; context: GuardFinding['context'] }>;
}
export const LEDGER_GUARD_SWITCH = 'xiantu.entityLedger.guard.v1';
export function evaluateGuardRules(text: string, rules: GuardRule[], context: { eventId?: string; draft?: number; enabled?: boolean } = {}, log: (line: string) => void = console.info): GuardFinding[] {
  if (context.enabled === false) return [];
  return rules.filter(rule => rule.mode !== 'off').flatMap(rule => rule.inspect(text).map(hit => {
    const finding: GuardFinding = { ruleId: rule.id, severity: rule.severity, mode: rule.mode,
      quote: hit.quote.slice(0, 60), context: hit.context, eventId: context.eventId, draft: context.draft,
      wouldReject: rule.severity === 'hard', rejected: rule.severity === 'hard' && rule.mode === 'enforce' };
    log(JSON.stringify({ kind: 'ledger_guard', ...finding })); return finding;
  }));
}
/** Gender candidates are semantic-only. No approval for deterministic gender rejection yet. */
export function genderShadowFindings(text: string, actors: Array<{ name: string; gender?: string }>, eventId?: string, draft?: number): GuardFinding[] {
  const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return evaluateGuardRules(text, [{ id: 'gender.named-pronoun', severity: 'soft', mode: 'shadow', inspect: value => {
    // Ignore quoted speech rather than guessing its referent. This is a candidate, never a rejection.
    const narration = value.replace(/[“「"][^”」"]*[”」"]/g, '');
    return actors.flatMap(actor => {
      const wrong = actor.gender === '男' ? '她' : actor.gender === '女' ? '他' : '';
      if (!wrong) return [];
      const hits = [...narration.matchAll(new RegExp(escaped(actor.name) + '[，,\\s]*' + wrong + '(?:说|问|看|走|抬|转|伸|点|摇|笑|的(?:脸|手|目光))', 'g'))];
      return hits.map(hit => ({ quote: hit[0], context: 'narration' as const }));
    });
  } }], { eventId, draft, enabled: globalThis.localStorage?.getItem?.(LEDGER_GUARD_SWITCH) !== 'off' });
}
/** P0 adapter reuses the existing canon gate. P1 replaces its source, not a second secret table. */
export function filterLedgerMemory(text: string, save: SaveData | null | undefined, findings: GuardFinding[] = []): string {
  const runtime = (save as any)?.世界?.状态?.剧本模组;
  const fragments = text.match(/[^。！？\n]+[。！？]?|\n+/g) || [];
  return fragments.filter(fragment => {
    if (findings.some(hit => hit.quote && fragment.includes(hit.quote))) return false;
    if (!runtime) return true;
    try { validateNanhuangCanonNarrative(fragment, runtime.modId || '', '', runtime.completedEventIds || [], runtime); return true; }
    catch { return false; }
  }).join('').trim();
}
