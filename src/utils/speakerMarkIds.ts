import { resolveNamedEntityId } from '@/modules/scenarioMods/namedEntities';

/**
 * 说话人记号里的名字 → 角色总表 id（含别名，复用 namedEntities 的查询）。
 * 对不上、或一个叫法对应多个角色时返回 null；主角 `你` 不在总表里，同样返回 null。
 * 与 speakerMarks.ts 分开放，是为了让显示端的纯函数模块不连带加载角色总表。
 */
export function resolveSpeakerId(name: string): string | null {
  const label = String(name || '').trim();
  return (label && resolveNamedEntityId('character', label)) || null;
}
