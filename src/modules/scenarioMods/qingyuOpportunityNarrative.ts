import { isScopedPlaytestSave } from './playtestNarrativeScope';
import {
  getTrackedStoryOpportunityActions,
  recordStoryOpportunityStructuredAction,
  type ScenarioOpportunityActionSelection,
} from './runtime';
import type { SaveData } from '@/types/game';

const QINGYU_OPPORTUNITY_STALE_TEXT = '当前选择已经过期。请重新选一次眼前行动。';

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function selectionActionText(selection: unknown): string {
  const rec = asRecord(selection);
  return readText(rec?.actionText) || readText(rec?.label) || readText(rec?.text) || readText(rec?.description);
}

function readPublicLocation(saveData: SaveData): string {
  const location = asRecord((saveData as any)?.角色)?.位置;
  if (typeof location === 'string') return location.trim();
  return readText(asRecord(location)?.描述);
}

function stripTerminalPunctuation(text: string): string {
  return text.replace(/[。！？!?]+$/g, '').trim();
}

function stripOpportunityChrome(label: string): string {
  return String(label || '')
    .replace(/^【推进·\d+\/\d+】/, '')
    .replace(/[·•]\s*耗时.*$/, '')
    .trim();
}

function opportunityGrantLines(settlements: unknown): string[] {
  if (!Array.isArray(settlements)) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const item of settlements) {
    const name = readText(asRecord(asRecord(item)?.receipt)?.itemName);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    lines.push(`${name}已经到手`);
  }
  return lines;
}

function remainingOpportunityLabels(saveData: SaveData): string[] {
  return [...new Set(
    getTrackedStoryOpportunityActions(saveData)
      .map(item => stripOpportunityChrome(item.label))
      .filter(Boolean),
  )];
}

function composeQingyuOpportunityNarrative(
  saveData: SaveData,
  exact: ScenarioOpportunityActionSelection,
  grants: string[],
  remaining: string[],
): string {
  const location = readPublicLocation(saveData) || '现场';
  const action = stripTerminalPunctuation(selectionActionText(exact) || '你继续推进眼前这一步');
  const parts = [location, action, ...grants];
  parts.push(remaining.length ? `接下来需要${remaining.join('，')}` : '眼前这一步已经做完');
  return `${parts.filter(Boolean).join('。')}。`.replace(/。+/g, '。');
}

/**
 * Qingyu Demo structured opportunityAction: settle the contract on a clone,
 * then render only from that receipt. Never a 156KB Legacy path.
 */
export function previewQingyuOpportunityNarrative(
  saveData: SaveData,
  opportunityAction?: ScenarioOpportunityActionSelection,
): string {
  if (!isScopedPlaytestSave(saveData)) return '';
  if (!opportunityAction || opportunityAction.source !== 'opportunity_engine') return '';
  const clone = JSON.parse(JSON.stringify(saveData)) as SaveData;
  const exact = getTrackedStoryOpportunityActions(clone)
    .find(item => JSON.stringify(item) === JSON.stringify(opportunityAction));
  if (!exact) return QINGYU_OPPORTUNITY_STALE_TEXT;
  const preview = recordStoryOpportunityStructuredAction(clone, exact);
  if (!preview?.progressed) return QINGYU_OPPORTUNITY_STALE_TEXT;
  return composeQingyuOpportunityNarrative(
    saveData,
    exact,
    opportunityGrantLines(preview.inventorySettlements),
    remainingOpportunityLabels(clone),
  );
}
