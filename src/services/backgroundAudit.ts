import { watch } from 'vue';
import { useCharacterStore } from '@/stores/characterStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useUIStore } from '@/stores/uiStore';
import { getPrompt, BACKGROUND_AUDIT_INSTRUCTION_PROMPT } from './defaultPrompts';
import { isGameModuleEnabled, runGameModelModule } from './gameModelModules';
import { GAME_MODEL_MODULES } from './moduleModelRuntime';
import {
  appendAuditLog, buildAuditInput, isAuditCheckpoint, readAuditLog, readAuditState, selectAuditTurns,
  validateAuditFindings, withinHourlyBudget, writeAuditState, type AuditLogEntry,
} from '@/modules/scenarioMods/backgroundAuditCore';

/**
 * 后台只读审计（用户裁定 2026-10-01，Q1/Q5）。
 * - 零写入：不写存档、flag、关系、记忆，结果不进任何 prompt，只进本地审计日志（localStorage，不随存档）。
 * - 让路：前台忙时不发起；审计在途时前台开始，立即取消（本检查点不记已审，下次再审）。
 * - 预算：单次输入 ≤12000 字、每小时 ≤12 次；失败只记日志，不重试、不提示玩家。
 */
const auditDefinition = GAME_MODEL_MODULES.find(item => item.id === 'audit')!;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight: { controller: AbortController; stopWatch: () => void } | null = null;

function storage() {
  return globalThis.localStorage;
}

/** 前台开始时调用：取消在途审计。 */
export function yieldBackgroundAudit(): void {
  clearTimeout(idleTimer); idleTimer = undefined;
  if (!inFlight) return;
  inFlight.controller.abort();
  inFlight.stopWatch();
  inFlight = null;
}

function summarizeState(save: any): Record<string, unknown> {
  const items = save?.角色?.背包?.物品;
  const inventory = items && typeof items === 'object'
    ? Object.values(items).map((item: any) => `${item?.名称 || ''}${item?.数量 > 1 ? `×${item.数量}` : ''}`).filter(Boolean).slice(0, 30) : [];
  const relations = save?.社交?.关系 && typeof save.社交.关系 === 'object'
    ? Object.entries(save.社交.关系).slice(0, 12).map(([name, value]: [string, any]) => ({ 名字: name, 当前状态: value?.当前状态 || undefined, 与玩家关系: value?.与玩家关系 || undefined }))
    : [];
  const scenario = save?.世界?.状态?.剧本模组;
  return {
    位置: save?.角色?.位置?.描述 || undefined,
    背包: inventory,
    关系: relations,
    当前关卡: scenario?.modId || undefined,
    进行中事件: Array.isArray(scenario?.activeEventIds) ? scenario.activeEventIds.slice(0, 8) : undefined,
  };
}

/** 前台提交并存档后调用；只在检查点、开关开启、预算内、前台空闲时发起。 */
export function scheduleBackgroundAudit(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { idleTimer = undefined; runIdleAudit(); }, 5000);
}

function runIdleAudit(): void {
  if (inFlight || useUIStore().isAIProcessing) return;
  if (!isGameModuleEnabled(auditDefinition)) return;
  const store = storage();
  if (!store) return;
  const active = useCharacterStore().rootState.当前激活存档;
  if (!active?.角色ID || !active?.存档槽位) return;
  const slotKey = `${active.角色ID}:${active.存档槽位}`;
  const save: any = useGameStateStore().toSaveData();
  const narrative: string[] = (save?.系统?.历史?.叙事 || [])
    .filter((item: any) => item?.type === 'gm' && typeof item?.content === 'string' && item.content.trim())
    .map((item: any) => item.content);
  const modId: string | undefined = save?.世界?.状态?.剧本模组?.modId;
  const state = readAuditState(store);
  const slot = state.slots[slotKey];
  if (!slot) {
    // 首次见到该档：从当前进度起算，不回审历史。
    state.slots[slotKey] = { auditedTurns: Math.max(0, narrative.length - 1), modId };
    writeAuditState(store, state);
    return;
  }
  if (!isAuditCheckpoint(slot, narrative.length, modId)) return;
  const now = Date.now();
  if (!withinHourlyBudget(state.calls, now)) return;
  const turns = selectAuditTurns(narrative, slot.auditedTurns);
  if (!turns.length) return;
  state.calls = [...state.calls.filter(at => now - at < 3600_000), now];
  writeAuditState(store, state);

  const controller = new AbortController();
  const stopWatch = watch(() => useUIStore().isAIProcessing, busy => { if (busy) yieldBackgroundAudit(); });
  inFlight = { controller, stopWatch };
  const started = Date.now();
  const id = `audit_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const range: [number, number] = [turns[0].turn, turns[turns.length - 1].turn];
  const finish = (entry: Omit<AuditLogEntry, 'id' | 'at' | 'slotKey' | 'modId' | 'turns' | 'elapsedMs'>) => {
    appendAuditLog(store, { id, at: new Date().toISOString(), slotKey, modId, turns: range, elapsedMs: Date.now() - started, ...entry });
    const latest = readAuditState(store);
    latest.slots[slotKey] = { auditedTurns: range[1], modId };
    writeAuditState(store, latest);
  };
  void (async () => {
    const instruction = (await getPrompt('backgroundAuditInstruction')).trim() || BACKGROUND_AUDIT_INSTRUCTION_PROMPT;
    return runGameModelModule('audit', {
      system: instruction, input: buildAuditInput(turns, summarizeState(save)), generationId: id, signal: controller.signal,
    });
  })().then(({ raw, route }) => {
    if (controller.signal.aborted) return;
    try {
      const { findings, rejected } = validateAuditFindings(raw, turns);
      finish({ status: 'accepted', route, findings, rejectedFindings: rejected });
    } catch (error) {
      finish({ status: 'rejected', route, findings: [], rejectedFindings: 0, error: String((error as Error).message).slice(0, 200) });
    }
  }).catch(error => {
    if (controller.signal.aborted) return; // 让路取消：不记已审，下个检查点重来
    finish({ status: 'failed', route: error?.moduleModelRoute, findings: [], rejectedFindings: 0, error: String((error as Error)?.message || error).slice(0, 200) });
  }).finally(() => {
    if (inFlight?.controller === controller) { inFlight.stopWatch(); inFlight = null; }
  });
}

export function getBackgroundAuditLog(): AuditLogEntry[] {
  const store = storage();
  return store ? readAuditLog(store) : [];
}

/** 导出本地审计日志（只含路由公开信息，不含 API Key）。 */
export function exportBackgroundAuditLog(): void {
  const data = { version: 1, exportedAt: new Date().toISOString(), entries: getBackgroundAuditLog() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `background-audit-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
