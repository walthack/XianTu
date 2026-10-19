/**
 * 本期结束后「继续到下一期」按钮能不能点（2026-10-20 1aae 真机：自动推进时点了没反应）。
 * 本期结束卡出现时剧情已经收束，残留的「生成中」标记（自动推进、记忆整理）不该挡住这个按钮；只有本按钮自己的请求在途才挡。
 */
export function phaseContinueBlocked(state: { pending: boolean; processing: boolean; finished: boolean }): boolean {
  if (state.pending) return true;
  return state.processing && !state.finished;
}
