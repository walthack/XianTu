/**
 * “玩家原文”调试通道：记录没出票 / 归入其他的玩家原文、模型报的类别、丢弃原因、当前场景。
 * 与 requestLifecycleDiagnostics.noteTicketDiscard 相互独立——那条有意不记原文，不得改动或复用。
 * 仅本机、仅 freeAction.debug.playerTextLog 打开时输出：写 console.info 与内存环形缓冲，不落盘、不进存档、不发网络。
 * 纯观察，不改任何结算或界面行为。
 */
import type { SaveData } from '@/types/game';
import { activeScene } from '../../sceneModule/host/ext';
import { freeActionConfig } from './config';

export type PlayerTextSite = 'ticket_validation' | 'tickets_not_collected' | 'ui_unhandled';
export interface PlayerTextRow {
  at: number;
  site: PlayerTextSite;
  text: string;
  /** 模型报的票类别（actionClass.variant）；null = 模型没给 tickets 字段，[] = 给了空数组。 */
  reported: string[] | null;
  /** 校验丢弃原因 / 路由原因（intent.reason、tickets_not_collected 的原路由原因）。 */
  reasons: string[];
  /** 当前场景：交锋是否进行中（及其合同 id）、进行中的事件 id。 */
  scene: { sceneActive: boolean; sceneId: string | null; activeEventIds: string[] };
  /** 仅 ui_unhandled：路由结果摘要。 */
  route?: { kind: string; usedModel: boolean; skipKeywordPreflight: boolean };
}

const rows: PlayerTextRow[] = [];
export const playerTextDebugEnabled = (): boolean => freeActionConfig().debug?.playerTextLog === true;

function sceneOf(save: SaveData | null | undefined): PlayerTextRow['scene'] {
  const active = activeScene(save);
  const ids = (save as any)?.世界?.状态?.剧本模组?.activeEventIds;
  return { sceneActive: Boolean(active), sceneId: active?.contractId ?? null, activeEventIds: Array.isArray(ids) ? ids.map(String) : [] };
}

/** 模型原始票 → 类别标签；只取字符串字段，不带证据原文以外的任何内容。 */
export function reportedTicketLabels(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map(item => {
    const t = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return `${typeof t.actionClass === 'string' ? t.actionClass : '?'}.${typeof t.variant === 'string' ? t.variant : '?'}`;
  });
}

export function notePlayerText(save: SaveData | null | undefined, input: Pick<PlayerTextRow, 'site' | 'reported' | 'reasons'> & { text: string; route?: PlayerTextRow['route'] }): void {
  if (!playerTextDebugEnabled()) return;
  const { keep, textChars } = freeActionConfig().debug;
  const row: PlayerTextRow = {
    at: Date.now(), site: input.site, text: [...String(input.text ?? '')].slice(0, textChars).join(''),
    reported: input.reported, reasons: input.reasons, scene: sceneOf(save), ...(input.route ? { route: input.route } : {}),
  };
  rows.push(row);
  while (rows.length > keep) rows.shift();
  try { console.info('[玩家原文]', row); } catch { /* 调试输出不得影响回合 */ }
}

export function peekPlayerTextDebug(): PlayerTextRow[] { return rows.map(row => ({ ...row })); }
export function clearPlayerTextDebug(): void { rows.length = 0; }
