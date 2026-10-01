export class PlayerAgencyViolationError extends Error {
  readonly code = 'PLAYER_AGENCY_VIOLATION';
  constructor(readonly actions: string[]) {
    super(`正文擅自替你${actions.join('、')}，已停止本轮结算。请明确你的行动后重试。`);
    this.name = 'PlayerAgencyViolationError';
  }
}

// Consequential actions observed in Run4. Merely observing/asking is not consent to perform them.
const ACTIONS = [
  { label: '杀人', re: /杀死|杀了|杀掉|杀害|捅死|刺死|斩杀|斩首|砍死|击杀/ },
  { label: '解甲脱衣', re: /解[^，。！？\n]{0,8}甲|脱[^，。！？\n]{0,8}(?:衣|裙|裳)|褪[^，。！？\n]{0,8}(?:衣|裙|裳)/ },
  { label: '喂药', re: /喂[^，。！？\n]{0,8}药|给[^，。！？\n]{0,8}喂服|灌[^，。！？\n]{0,8}药/ },
  { label: '报名字', re: /报出[^，。！？\n]{0,8}(?:姓名|名字)|报上[^，。！？\n]{0,8}(?:姓名|名字|名号)|自报(?:姓名|家门)|告诉[^，。！？\n]{0,8}(?:姓名|名字)|说出[^，。！？\n]{0,8}(?:姓名|名字)/ },
  { label: '亲密接触', re: /亲吻|吻上|吻了|接吻|抚摸[^，。！？\n]{0,8}(?:胸|乳|下体)|拥吻/ },
  { label: '签约', re: /签下|签署|签了|画押|按下手印/ },
] as const;
const NEGATIVE_OR_QUESTION = /不(?:要|会|想|能|去|曾)?|没有|未曾|别|如果|假如|是否|要不要|能不能|[？?]/;

export function unauthorizedPlayerActions(narrative: string, playerIntent: string): string[] {
  const intentClauses = playerIntent.split(/[，,。！!？?；;\n]/);
  const prose = narrative.replace(/[“「『][^”」』]*[”」』]/g, '');
  const clauses = prose.split(/[。！？；\n]/);
  return ACTIONS.filter(action => {
    const acted = clauses.some(clause => {
      const match = clause.match(/(?:你(?!们)|程宗扬)([^。！？\n]*)/);
      if (!match || !action.re.test(match[1])) return false;
      const before = match[1].slice(0, match[1].search(action.re));
      return !NEGATIVE_OR_QUESTION.test(before.slice(-6)) && !/听说|看到|看见|看着|听见|观察|判断|问/.test(before);
    });
    if (!acted) return false;
    return !intentClauses.some(clause => {
      const index = clause.search(action.re);
      return index >= 0 && !NEGATIVE_OR_QUESTION.test(clause.slice(0, index));
    });
  }).map(action => action.label);
}

export function assertPlayerAgency(narrative: string, playerIntent: string): void {
  const actions = unauthorizedPlayerActions(narrative, playerIntent);
  if (actions.length) throw new PlayerAgencyViolationError(actions);
}
