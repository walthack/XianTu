/**
 * 同场人物正等回应的提示（交接 2026-11-09 需求二）。
 * 只在宿主正文成功提交之后由界面调用；每拍只提示一次，记在 系统.扩展.linePrompted（随存档持久，读档、重发不再提示）。
 * 生成失败、取消、撤回时界面不调用，也就不留提示记录。
 */
import type { SaveData } from '@/types/game';
import { CONTENT_PACKS } from '../contentPacks';
import { LINE_PROMPTED_KEY, questLineView } from './questLineView';

/** 改入参：给新开场、带提示文案、还没提示过的人物拍记下提示回合；返回要弹的提示文案。 */
export function noteLinePrompts(save: SaveData | null | undefined): string[] {
  const ext = (save as any)?.系统?.扩展;
  if (!ext) return [];
  const prompted: Record<string, number> = ext[LINE_PROMPTED_KEY] || {};
  const turn = Number((save as any)?.世界?.状态?.剧本模组?.worldTurn) || 0;
  const notices: string[] = [];
  for (const beat of questLineView(save).character) {
    const text = CONTENT_PACKS.texts[`text.prompt.${beat.beatId}`];
    if (!text || prompted[beat.beatId] !== undefined || !beat.actions.length) continue;
    prompted[beat.beatId] = turn;
    notices.push(text);
  }
  if (notices.length) ext[LINE_PROMPTED_KEY] = prompted;
  return notices;
}
