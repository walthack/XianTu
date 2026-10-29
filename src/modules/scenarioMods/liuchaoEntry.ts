/** 首页「入六朝」入口：直接以内置剧本模组 LIUCHAO_ENTRY_MOD_ID 进创角第 7 步预览；「初入仙途」显示开关 ui.modeSelection.showGenericStart（numbers-runtime.json；用户 2026-10-29 定先隐藏不删，默认 false）。 */
import { GAME_NUMBERS } from '../sceneModule/numbers';
export const LIUCHAO_ENTRY_MOD_ID = 'lcq.stage_01';
export const showGenericStartEntry = (): boolean => GAME_NUMBERS.ui.modeSelection.showGenericStart === true;
