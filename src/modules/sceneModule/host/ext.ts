// 场面模块接入游戏的存档扩展与开关。场面状态是纯 JSON，随存档走：读档、回滚、刷新都能原样接着打。
import type { SaveData } from '@/types/game';
import type { ActionPlan, ActionPreview, BeatResult, SceneState } from '../index';
import { newInputLog, type InputLog } from '../inputPolicy';

export const SCENE_HOST_KEY = '场面模块';
/** 旧战斗路径开关（localStorage）：'off' 退回旧路径；也可用 URL 参数 ?sceneModule=off|on 切换并记住。 */
export const SCENE_MODULE_SWITCH = 'xiantu.sceneModule.v1';
/** 本场合同里写的旗标前缀，如 scene.f03.result。 */
export const SCENE_DONE_FLAG = (contractId: string): string => `scene.${contractId}.done`;

export type ScenePhase = 'fighting' | 'closing';

export interface PendingChoice {
  choiceId: string;
  label: string;
  confirmText: string;
  endingId: string;
}

export interface PendingAction {
  plan: ActionPlan;
  text: string;
  preview: ActionPreview;
  by: 'model' | 'rules';
  dropped: string[];
  /** 预览时的玩家检定骰游标；确认时必须一致，防止过期预览被重放。 */
  cursor: number;
}

export interface ActiveScene {
  recognitionCache?: Array<{ key: string; recognized: { plan: ActionPlan | null; dropped: string[]; by: 'model' | 'rules' }; modelClass?: 'chat' | 'action' | 'unclear' }>;
  contractId: string;
  eventId: string;
  actionId: string;
  /** 触发这场的事件动作原句，收束回合用它对回事件。 */
  playerLine: string;
  phase: ScenePhase;
  state: SceneState;
  /** 场面实录写在 narrativeHistory 的哪一条上（同一条原地追加）。 */
  narrativeIndex: number;
  pending: PendingAction | null;
  choice: PendingChoice | null;
  notice: string;
  last: { playerText: string; result: BeatResult; lines: string[]; text: string } | null;
  closing: { text: string; outcome: 'win' | 'lose' | 'timeout'; reason: string } | null;
  inputLog: InputLog;
  trial?: boolean;
}

export interface SceneRecord {
  contractId: string;
  eventId: string;
  outcome: 'win' | 'lose' | 'timeout';
  endingId?: string;
  beats: number;
  memoryNote: string;
  state: SceneState;
  inputLog: InputLog;
}

export interface SceneHostExt {
  version: 1;
  active: ActiveScene | null;
  history: SceneRecord[];
  /** 必经场面开始前，玩家在场却没有迎战的回合数（到合同的 ambushAfterStall 就强制遇敌）。 */
  stall: Record<string, number>;
}

export function emptyExt(): SceneHostExt {
  return { version: 1, active: null, history: [], stall: {} };
}

export function readExt(save: SaveData | null | undefined): SceneHostExt {
  const raw = (save as any)?.系统?.扩展?.[SCENE_HOST_KEY] as SceneHostExt | undefined;
  return raw && raw.version === 1 ? raw : emptyExt();
}

export function writeExt(save: SaveData, ext: SceneHostExt): void {
  const sys = (save as any).系统 ||= {};
  (sys.扩展 ||= {})[SCENE_HOST_KEY] = ext;
}

export function activeScene(save: SaveData | null | undefined): ActiveScene | null {
  return readExt(save).active;
}

export function newActive(partial: Omit<ActiveScene, 'pending' | 'choice' | 'notice' | 'last' | 'closing' | 'inputLog' | 'phase'>): ActiveScene {
  return { ...partial, phase: 'fighting', pending: null, choice: null, notice: '', last: null, closing: null, inputLog: newInputLog() };
}

/** 存档可能是带响应式代理的对象，structuredClone 会失败时退回 JSON 往返。 */
export function cloneSave<T>(save: T): T {
  try { return structuredClone(save); } catch { return JSON.parse(JSON.stringify(save)) as T; }
}

export function sceneModuleEnabled(): boolean {
  const param = new URLSearchParams(globalThis.location?.search || '').get('sceneModule');
  if (param === 'off' || param === 'on') {
    try { globalThis.localStorage?.setItem(SCENE_MODULE_SWITCH,param); } catch { /* URL remains authoritative without storage. */ }
    return param === 'on';
  }
  try {
    const stored = globalThis.localStorage?.getItem(SCENE_MODULE_SWITCH);
    return stored === 'on' || (stored !== 'off' && typeof globalThis.location !== 'undefined');
  } catch { return typeof globalThis.location !== 'undefined'; }
}

export function setSceneModuleEnabled(enabled: boolean): void {
  try { globalThis.localStorage?.setItem(SCENE_MODULE_SWITCH, enabled ? 'on' : 'off'); } catch { /* 无存储环境 */ }
}
