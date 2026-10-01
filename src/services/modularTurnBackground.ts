import { useCharacterStore } from '@/stores/characterStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useAPIManagementStore } from '@/stores/apiManagementStore';
import { useUIStore } from '@/stores/uiStore';
import { getPrompt, MODULE_MEMORY_INSTRUCTION_PROMPT } from './defaultPrompts';
import { runGameModelModule } from './gameModelModules';
import {
  MODULE_TURN_KEY, getModuleReceipts, moduleMemorySentences, replaceShortTermEntry, validateModuleSide,
  type ModuleSideResult,
} from '@/modules/scenarioMods/modularTurn';

/**
 * 回合记忆模块（derive 阶段，onLate=apply_next_turn）。
 * 记忆摘录是该回合短期记忆的唯一来源：被采纳后替换掉该回合的原文短期记忆条目。
 * 玩家在结果返回前已开始下一回合时，结果先排队，等下一次前台提交后再落账，而不是丢弃。
 */
let epoch = 0;
const controllers = new Set<AbortController>();
const jobs = new Set<string>();
interface PendingResult { characterId: string; slotId: string; epoch: number; receiptId: string; receiptText: string; result: ModuleSideResult; }
const pending: PendingResult[] = [];
let persistQueue: Promise<unknown> = Promise.resolve();

/** 切档/卸载：硬取消并作废全部在途与排队结果。 */
export function cancelModuleBackground(): void {
  epoch += 1;
  pending.length = 0;
  for (const controller of controllers) controller.abort();
  controllers.clear();
}

function currentScope() {
  const active = useCharacterStore().rootState.当前激活存档;
  return { characterId: active?.角色ID || '', slotId: active?.存档槽位 || '', epoch };
}

function findReceipt(receiptId: string) {
  return useGameStateStore().systemExtensions?.[MODULE_TURN_KEY]?.receipts?.find((item: any) => item.id === receiptId);
}

/** 只在前台空闲时落账；返回是否写入。 */
function applyResult(item: PendingResult): boolean {
  const scope = currentScope();
  if (item.characterId !== scope.characterId || item.slotId !== scope.slotId || item.epoch !== scope.epoch) return false;
  const receipt = findReceipt(item.receiptId);
  if (!receipt || receipt.text !== item.receiptText) return false;
  receipt.memory = item.result;
  if (item.result.status === 'accepted' && item.result.value) {
    const memory = useGameStateStore().memory;
    if (replaceShortTermEntry(memory?.短期记忆, receipt.shortTermEntry, item.result.value)) {
      receipt.memory = { ...item.result, appliedToShortTerm: true };
    }
  }
  return true;
}

function persist(item: PendingResult): void {
  persistQueue = persistQueue.catch(() => {}).then(async () => {
    if (useUIStore().isAIProcessing) { pending.push(item); return; }
    if (applyResult(item)) await useCharacterStore().saveCurrentGame();
  }).catch(error => console.warn('[模块后台] 本地保存失败', error));
}

/** 前台提交并存档后调用：先落账排队结果，再为最新模块回执启动记忆整理。 */
export function startModuleBackground(): void {
  const character = useCharacterStore();
  const state = useGameStateStore();
  if (!character.activeCharacterProfile?.隔离试玩信息?.localOnly || useUIStore().isAIProcessing) return;
  if (pending.length) {
    const queued = pending.splice(0);
    persistQueue = persistQueue.catch(() => {}).then(async () => {
      if (queued.map(applyResult).some(Boolean)) await character.saveCurrentGame();
    }).catch(error => console.warn('[模块后台] 排队结果落账失败', error));
  }
  const receipt = getModuleReceipts(state.toSaveData()).at(-1);
  if (!receipt || receipt.path !== 'modular') return;
  const scope = currentScope();
  const key = `${scope.characterId}:${scope.slotId}:${receipt.id}:memory`;
  if (jobs.has(key) || receipt.memory?.status === 'accepted') return;
  const base = { ...scope, receiptId: receipt.id, receiptText: receipt.text };
  if (!useAPIManagementStore().isFunctionEnabled('memory_summary')) {
    if (receipt.memory?.status !== 'disabled') persist({ ...base, result: { status: 'disabled' } });
    return;
  }
  jobs.add(key);
  const controller = new AbortController();
  controllers.add(controller);
  const started = Date.now();
  void (async () => {
    const instruction = (await getPrompt('moduleMemoryInstruction')).trim() || MODULE_MEMORY_INSTRUCTION_PROMPT;
    return runGameModelModule('memory', {
      generationId: `module_${receipt.id}_memory`, signal: controller.signal, system: instruction,
      input: JSON.stringify(moduleMemorySentences(receipt.text)),
    });
  })().then(({ raw, route }) => {
    try { persist({ ...base, result: { status: 'accepted', route, value: validateModuleSide(raw, receipt.text, 'memory'), elapsedMs: Date.now() - started } }); }
    catch (error) { persist({ ...base, result: { status: 'rejected', route, error: String((error as Error).message), elapsedMs: Date.now() - started } }); }
  }).catch(error => {
    if (!controller.signal.aborted) persist({ ...base, result: { status: 'failed', route: error?.moduleModelRoute, error: String((error as Error)?.message || error).slice(0, 200), elapsedMs: Date.now() - started } });
  }).finally(() => { jobs.delete(key); controllers.delete(controller); });
}
