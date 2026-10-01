import { matchModuleExcerpt, parseModuleObject } from './modularTurn';

/**
 * 后台审计的纯逻辑：检查点判定、输入编译、结果验证、日志与预算。
 * 不读写存档与 store，所有持久化经注入的 storage，便于测试与证明"零写入"。
 */
export const AUDIT_CATEGORIES = ['fact_drift', 'knowledge_leak', 'state_mismatch', 'player_agency', 'dangling_hook', 'voice_drift'] as const;
export type AuditCategory = typeof AUDIT_CATEGORIES[number];

export const AUDIT_CHECKPOINT_TURNS = 5;
export const AUDIT_MAX_TURNS_PER_RUN = 8;
export const AUDIT_MAX_INPUT_CHARS = 12000;
export const AUDIT_MAX_ENTRY_CHARS = 1500;
export const AUDIT_MAX_CALLS_PER_HOUR = 12;
export const AUDIT_LOG_LIMIT = 200;
export const AUDIT_LOG_KEY = 'xiantu.backgroundAudit.log.v1';
export const AUDIT_STATE_KEY = 'xiantu.backgroundAudit.state.v1';

export interface AuditStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export interface AuditSlotState { auditedTurns: number; modId?: string; }
export interface AuditState { slots: Record<string, AuditSlotState>; calls: number[]; }
export interface AuditTurn { turn: number; text: string; }
export interface AuditFinding { category: AuditCategory; turn: number; quote: string; issue: string; }
export interface AuditLogEntry {
  id: string; at: string; slotKey: string; modId?: string; turns: [number, number];
  status: 'accepted' | 'rejected' | 'failed';
  route?: { configId: string; provider: string; model: string; inherited?: boolean };
  findings: AuditFinding[]; rejectedFindings: number; elapsedMs: number; error?: string;
}

function readJson<T>(storage: AuditStorage, key: string, fallback: T): T {
  try { const raw = storage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

export function readAuditState(storage: AuditStorage): AuditState {
  const state = readJson<AuditState>(storage, AUDIT_STATE_KEY, { slots: {}, calls: [] });
  return { slots: state?.slots && typeof state.slots === 'object' ? state.slots : {}, calls: Array.isArray(state?.calls) ? state.calls : [] };
}

export function writeAuditState(storage: AuditStorage, state: AuditState): void {
  try { storage.setItem(AUDIT_STATE_KEY, JSON.stringify(state)); } catch { /* 存储不可用时不影响游戏 */ }
}

export function readAuditLog(storage: AuditStorage): AuditLogEntry[] {
  const log = readJson<AuditLogEntry[]>(storage, AUDIT_LOG_KEY, []);
  return Array.isArray(log) ? log : [];
}

export function appendAuditLog(storage: AuditStorage, entry: AuditLogEntry): void {
  const log = [...readAuditLog(storage), entry].slice(-AUDIT_LOG_LIMIT);
  try { storage.setItem(AUDIT_LOG_KEY, JSON.stringify(log)); } catch { /* 同上 */ }
}

/** 检查点：自上次审计后累计 N 个叙事回合，或换关后至少有 1 个新回合。 */
export function isAuditCheckpoint(slot: AuditSlotState | undefined, narrativeTurns: number, modId: string | undefined): boolean {
  const audited = slot?.auditedTurns ?? 0;
  const fresh = narrativeTurns - audited;
  if (fresh <= 0) return false;
  if (fresh >= AUDIT_CHECKPOINT_TURNS) return true;
  return !!slot && !!modId && !!slot.modId && slot.modId !== modId;
}

/** 每小时调用上限；返回 false 表示本检查点跳过。 */
export function withinHourlyBudget(calls: readonly number[], now: number): boolean {
  return calls.filter(at => now - at < 3600_000).length < AUDIT_MAX_CALLS_PER_HOUR;
}

/** 取上次审计之后的回合（最多 8 个、总量 ≤12000 字，超量丢最旧的）。 */
export function selectAuditTurns(narrativeTexts: readonly string[], auditedTurns: number): AuditTurn[] {
  const start = Math.max(auditedTurns, narrativeTexts.length - AUDIT_MAX_TURNS_PER_RUN);
  const turns = narrativeTexts.slice(start).map((text, index) => ({
    turn: start + index + 1,
    text: text.length > AUDIT_MAX_ENTRY_CHARS ? text.slice(-AUDIT_MAX_ENTRY_CHARS) : text,
  }));
  while (turns.length > 1 && turns.reduce((sum, item) => sum + item.text.length, 0) > AUDIT_MAX_INPUT_CHARS) turns.shift();
  return turns;
}

export function buildAuditInput(turns: readonly AuditTurn[], stateSummary: Record<string, unknown>): string {
  return JSON.stringify({ 回合正文: turns.map(item => ({ 回合: item.turn, 正文: item.text })), 本地确认状态: stateSummary });
}

/** 逐条验证：类别合法、回合在本次范围内、quote 是该回合连续原文。不合格的条目单独丢弃并计数。 */
export function validateAuditFindings(raw: string, turns: readonly AuditTurn[]): { findings: AuditFinding[]; rejected: number } {
  const object = parseModuleObject(raw);
  if (!Array.isArray(object.findings)) throw new Error('审计格式错误：缺少 findings 数组');
  const byTurn = new Map(turns.map(item => [item.turn, item.text]));
  const findings: AuditFinding[] = [];
  let rejected = 0;
  for (const item of object.findings.slice(0, 6) as any[]) {
    const text = byTurn.get(item?.turn);
    const quote = typeof item?.quote === 'string' && text ? matchModuleExcerpt(text, item.quote) : null;
    if (!AUDIT_CATEGORIES.includes(item?.category) || !quote || typeof item?.issue !== 'string'
      || !item.issue.trim() || item.issue.length > 200) { rejected += 1; continue; }
    findings.push({ category: item.category, turn: item.turn, quote, issue: item.issue.trim() });
  }
  rejected += Math.max(0, object.findings.length - 6);
  return { findings, rejected };
}
