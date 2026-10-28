/** 普通世界入口显示开关 ui.worldSelection.showGenericWorlds（numbers-runtime.json；用户 2026-10-28 定先隐藏不删，默认 false）。只管 UI 入口，不影响 generateWorld 与旧存档。 */
import { GAME_NUMBERS } from '../sceneModule/numbers';
export const showGenericWorldEntries = (): boolean => GAME_NUMBERS.ui.worldSelection.showGenericWorlds === true;
