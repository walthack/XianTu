export interface NarrativePerformanceCheck {
  valid: boolean;
  issues: string[];
}

const DECISION_SCENE = /情报|敌情|局势|侦察|探子|计划|打算|安排|怎么办|如何行动|下一步|计策|谋划|决策/;
const ACTIVE_PLAN = /我已|我让|我命|我先|我会|已经安排|你现在|你只需|先[^。！？]{0,24}再|退路|后手|备用|若[^。！？]{0,24}便/;

function namedSpeech(text: string, name: string): string {
  const start = text.indexOf(name);
  return start >= 0 ? text.slice(start) : text;
}

/** 只检查已接 Voice Card 的点名决策场景；普通闲聊与生活戏不加谋略 KPI。 */
export function validateNarrativePerformance(
  narrative: string,
  userInput: string,
  scenarioPrompt: string,
): NarrativePerformanceCheck {
  const issues: string[] = [];
  if (!DECISION_SCENE.test(userInput)) return { valid: true, issues };
  for (const name of ['小紫', '贾文和']) {
    if (!scenarioPrompt.includes(`【${name}·角色表演卡`) || !narrative.includes(name)) continue;
    const speech = namedSpeech(narrative, name);
    if (!ACTIVE_PLAN.test(speech)) {
      issues.push(`${name}只汇报/等待，没有亲自提出或实施会改变本轮选择的具体方案`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function performanceRetryInstruction(issues: string[]): string {
  return `【表演门禁退回重写】上稿未通过：${issues.join('；')}。保留已接地事实，整段重写；必须让被点名角色亲口说出或亲自实施一个具体可行动方案（含先手、后手、代价或退出条件之一），随后把选择留给玩家。不得让主角代为分析/下令，不得新增存档与正典没有的兵力、伤亡、人物或事件。`;
}
