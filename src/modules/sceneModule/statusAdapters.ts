// 状态适配器：把场面里留下来的状态，转成游戏现有的两种载体，等总策划的统一状态目录落地后只换这一层。
//  A. 主角：角色.效果（StatusEffect[]）；B. 同伴 / NPC：sceneLedger.injuries（自由文本）。

import type { StatusEffect } from '@/types/game';
import type { WriteBack } from './scene';
import type { StatusDef } from './types';

type Persisted = WriteBack['persistent'][number];

function describe(def: StatusDef | undefined, item: Persisted): string {
  const notes = (def?.effects || []).filter(e => e.kind === 'note').map(e => (e as { text: string }).text);
  return [item.source || item.label, ...notes].join('；');
}

/** 主角的状态 → 角色.效果 的一项。minutes 为 null 视为永久（沿用游戏里 ≥ 99999 的约定）。 */
export function toPlayerStatusEffect(item: Persisted, now: StatusEffect['生成时间'], def?: StatusDef): StatusEffect {
  return {
    状态名称: item.label,
    类型: def?.kind ?? 'debuff',
    生成时间: { ...now },
    持续时间分钟: item.minutes ?? 99999,
    状态描述: describe(def, item),
    强度: 1,
    来源: item.source || item.cause,
  };
}

/** 同伴 / NPC 的状态 → 一行伤病文字（按角色库 id 为键写进 sceneLedger.injuries）。 */
export function toInjuryNote(item: Persisted, def?: StatusDef): string {
  return `${item.label}：${describe(def, item)}`;
}
