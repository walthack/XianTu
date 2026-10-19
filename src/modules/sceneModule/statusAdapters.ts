// 状态适配器：把场面里留下来的状态，转成游戏现有的两种载体，定义从统一目录解析。
//  A. 主角：角色.效果（StatusEffect[]）；B. 同伴 / NPC：sceneLedger.statusRecords（结构化）与 injuries（兼容文本）。

import type { StatusEffect } from '@/types/game';
import type { WriteBack } from './scene';
import type { StatusDef } from './types';

type Persisted = WriteBack['persistent'][number];

function describe(def: StatusDef | undefined, item: Persisted): string {
  const notes = (def?.effects || []).filter(e => e.kind === 'note').map(e => (e as { text: string }).text);
  const where = item.params?.bodyPart ? [`部位：${item.params.bodyPart}`] : [];
  return [...new Set([...where, item.source || item.label, ...notes, ...(item.minutes === null ? ['修复后解除，不按时间消退'] : [])])].join('；');
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

/** 道具效果标签 → 玩家看到的名字（宿主从效果标签词表传入；没传就只说“对应道具”）。 */
export type TagLabel = (tag: string) => string | undefined;

/** 按状态自己的 remove 规则写“怎么解除”：休整、用某类道具、剧情；时间规则由分钟数体现，不在这里重复。 */
export function removeHint(remove: StatusDef['remove'], tagLabel?: TagLabel): string[] {
  const parts: string[] = [];
  for (const rule of remove || []) {
    if (rule.kind === 'rest') parts.push('休整');
    else if (rule.kind === 'item') { const name = tagLabel?.(rule.ref); parts.push(name ? `${name}类道具` : '对应道具'); }
    else if (rule.kind === 'story') parts.push('剧情推进');
  }
  return [...new Set(parts)];
}

/** 同伴 / NPC 的状态 → 一行伤病文字（按角色库 id 为键写进 sceneLedger.injuries）。解除方式取自状态的 remove 规则。 */
export function toInjuryNote(item: Persisted, def?: StatusDef, tagLabel?: TagLabel): string {
  const ways = removeHint(def?.remove, tagLabel), how = ways.length ? `${ways.join('/')}可解除` : '';
  const suffix = item.minutes === null ? (how ? `（${how}）` : '') : `（${item.minutes}分钟${how ? `，${how}` : ''}）`;
  return `${item.label}：${describe(def, item)}${suffix}`;
}
