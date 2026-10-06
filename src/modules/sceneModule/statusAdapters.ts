// 状态适配器：把场面里留下来的状态，转成游戏现有的两种载体，定义从统一目录解析。
//  A. 主角：角色.效果（StatusEffect[]）；B. 同伴 / NPC：sceneLedger.statusRecords（结构化）与 injuries（兼容文本）。

import type { StatusEffect } from '@/types/game';
import type { WriteBack } from './scene';
import type { StatusDef } from './types';

type Persisted = WriteBack['persistent'][number];

function describe(def: StatusDef | undefined, item: Persisted): string {
  const notes = (def?.effects || []).filter(e => e.kind === 'note').map(e => (e as { text: string }).text);
  return [...new Set([item.source || item.label, ...notes, ...(item.minutes === null ? ['修复后解除，不按时间消退'] : [])])].join('；');
}

/** 主角的状态 → 角色.效果 的一项。minutes 为 null 不按时间消退，沿用游戏已有负数时长表示，修复后解除。 */
export function toPlayerStatusEffect(item: Persisted, now: StatusEffect['生成时间'], def?: StatusDef): StatusEffect {
  return {
    状态名称: item.label,
    类型: def?.kind ?? 'debuff',
    生成时间: { ...now },
    持续时间分钟: item.minutes ?? -1,
    状态描述: describe(def, item),
    强度: 1,
    来源: item.source || item.cause,
  };
}

/** 同伴 / NPC 的状态 → 一行伤病文字（按角色库 id 为键写进 sceneLedger.injuries）。 */
export function toInjuryNote(item: Persisted, def?: StatusDef): string {
  return `${item.label}：${describe(def, item)}${item.minutes===null?'':`（${item.minutes}分钟，休整/疗伤可解除）`}`;
}
