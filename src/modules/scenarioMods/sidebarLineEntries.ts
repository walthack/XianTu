/**
 * 右栏「可投的门路」列表：secondaryLines 二级线入口＋questLineView(save).secondary（kind side／secondary 的支线）。
 * 从 RightSidebar.vue 原样抽出，给右栏和测试共用。
 * 显示开关 ui.rightSidebar.showSecondaryLines（numbers-runtime.json；用户 2026-10-27 08:53 定：UI 先隐藏不删，默认 false）：
 * 关＝整块返回空、右栏不渲染；开＝与抽出前同一结果。人物任务（characterBeats）与主线不经这里，不受开关影响。
 */
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { questLineView } from './questLineView';
import { knownSecondaryLines, secondaryLineEntryView } from './secondaryLineEntry';
import { secondaryLineDisplayName, secondaryLinesAtEvent } from './secondaryLines';

export interface SidebarLineEntry {
  id: string;
  name: string;
  kind: string;
  hint: string;
  hintLines: string[];
  locked: boolean;
  objective: string;
}

// 与当前线卡（ui.rightSidebar.showLineCompass）两块不并存：当前线卡开着时本块不显示（用户 2026-10-27 09:26）。
export const showSecondaryLines = (): boolean =>
  GAME_NUMBERS.ui.rightSidebar.showSecondaryLines === true && GAME_NUMBERS.ui.rightSidebar.showLineCompass !== true;

// 二级线：锚一满足就作为待办显示，不需要玩家确认（用户裁定 2026-08-16）。
// 整线解锁的线（太泉）没解锁也照样显示：标题「时机未到」＋缺项句，灰显不隐藏（太泉解锁设计稿 2026-10-27 §5）。
// 锚读编年史（knownSecondaryLines），切关后照样已知（分析稿 2026-10-27 §3-1）。
// objectiveOf：当前拍属于这条线时的「当前目标」（右栏的指南针句），只在用到时才算。
export function sidebarAvailableLines(
  rt: any,
  save: unknown,
  locationId: string | undefined,
  event: any,
  objectiveOf: () => string,
): SidebarLineEntry[] {
  if (!showSecondaryLines()) return [];
  if (!rt || typeof rt !== 'object') return [];
  const activeLineIds = new Set(secondaryLinesAtEvent(event?.id).map(line => line.id));
  return knownSecondaryLines(rt, locationId).map((line): SidebarLineEntry => {
    const view = secondaryLineEntryView(line, save);
    return {
      id: line.id,
      name: view.locked ? view.title : secondaryLineDisplayName(line, event),
      kind: line.kind === 'sect'
        ? '宗派'
        : line.kind === 'commerce'
          ? '商道'
          : line.kind === 'expedition'
            ? '远征'
            : '国家',
      hint: view.hintLines.join('\n'),
      hintLines: view.hintLines,
      locked: view.locked,
      objective: activeLineIds.has(line.id) ? objectiveOf() : '',
    };
  }).concat(questLineView(save).secondary.map(line => ({ ...line, hintLines: [line.hint], locked: false })));
}
