/**
 * 行动选项 POV 守卫（内测台账 #14）。
 *
 * 选项=玩家所扮演主角本人将执行的行动；主角不会在自己的行动选项里以名字称呼自己。
 * 因此选项文本一旦包含主角名（如「跟上程宗扬」「提醒程宗扬…」），即为视角漂移到
 * 同伴 NPC 的确定性信号，直接拒收——零误报的代码层守卫，不依赖提示词遵从。
 */
export function filterActionOptionsByPov(
  options: string[],
  playerName: string,
): { kept: string[]; dropped: string[] } {
  const name = (playerName || '').trim();
  // 名字过短(单字)误伤风险高，不启用过滤
  if (name.length < 2) return { kept: [...options], dropped: [] };
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const opt of options) {
    (opt.includes(name) ? dropped : kept).push(opt);
  }
  return { kept, dropped };
}
