import { xiaoziDisclosure, isDisclosureFactAllowed } from './characterResolver';
/**
 * 事件级叙事边界（数据表）。
 *
 * 多步事件在合同尚未完成时，演出模型不得把结果写成已成立。边界按事件声明，
 * 由通用演出提示与通用验证器读取——通用代码里不再出现具体事件 ID。
 * 新增承重拍时只在此表追加一条，由剧情策划提供 sceneNote，系统策划提供判定式。
 */
export interface NarrativeBoundary {
  /** 合同未完成时追加进场景材料的演出边界（给模型看）。 */
  sceneNote: string;
  /** 命中即判定"把未完成的结果写成已成立"。 */
  forbidden: RegExp;
  /** 先从子句中剥除的否定表达（如"尚未答应"），避免误杀。 */
  negations?: RegExp;
  /** 拒收正文时的原因（进回执与回落记录）。 */
  rejectMessage: string;
}

const NARRATIVE_BOUNDARIES: Readonly<Record<string, NarrativeBoundary>> = {
  'lcq.event.sudaji_south_pact': {
    sceneNote: '只演提出交换，苏妲己尚未确认三个月期限。不能写期限从今日算起、达成协议或行动自由。',
    // 复测 fx-pact2 原话「三个月，我准了」曾漏过；补上口头应允类说法。
    forbidden: /从(?:今日|今天)算起|给你三个月|三个月.{0,8}(?:订死|定下|算起)|南荒之约.{0,8}(?:说死|达成|确定)|苏妲己.{0,12}(?:答应|同意|应允)|期限.{0,8}(?:确定|订下|定下|达成)|准了|准你|依你|成交|一言为定|就这么(?:定|说定|办)/,
    negations: /(?:没有|尚未|还未|并未|不曾|未曾|未能|不会|还没有)(?:立刻)?(?:答应|同意|应允|确认|达成|定下|准)/g,
    rejectMessage: '本轮只完成提议，正文提前确认了期限；没有提交，请重试',
  },
};

export function getNarrativeBoundary(eventId: string | undefined): NarrativeBoundary | null {
  return eventId ? NARRATIVE_BOUNDARIES[eventId] || null : null;
}

/** 合同未完成时给演出模型的边界文本；已完成或无声明时为 undefined。 */
export function narrativeBoundaryNote(eventId: string | undefined, completed: boolean): string | undefined {
  if (completed) return undefined;
  return getNarrativeBoundary(eventId)?.sceneNote;
}

/** 通用验证：未完成的合同被正文写成已成立时抛错。 */
export function validateNarrativeBoundary(text: string, eventId: string | undefined, completed: boolean): void {
  const boundary = completed ? null : getNarrativeBoundary(eventId);
  if (!boundary) return;
  const clauses = text.split(/[。！？\n]/);
  const strip = (clause: string) => boundary.negations ? clause.replace(boundary.negations, '') : clause;
  if (clauses.some(clause => boundary.forbidden.test(strip(clause)))) throw new Error(boundary.rejectMessage);
}

/**
 * 自由回合兜底：未完成的合同被正文写成已成立时，只删命中的句子，保留其余正文。
 * 返回 removed 为空表示未命中。用于重要桥段的"幕间"回合（不推进事件时，正文不得写出结果）。
 */
export function stripNarrativeBoundaryClauses(text: string, eventId: string | undefined): { text: string; removed: string[] } {
  const boundary = getNarrativeBoundary(eventId);
  if (!boundary || !text) return { text, removed: [] };
  const segments = text.match(/[^。！？!?\n]+[。！？!?]*[”’」』"]*|\n+/g) || [];
  const removed: string[] = [];
  const kept = segments.filter(segment => {
    if (/^\n+$/.test(segment)) return true;
    const stripped = boundary.negations ? segment.replace(boundary.negations, '') : segment;
    if (boundary.forbidden.test(stripped)) { removed.push(segment.trim()); return false; }
    return true;
  });
  return { text: kept.join('').replace(/\n{3,}/g, '\n\n').trim(), removed };
}

/** 南荒当前现场与未揭身份约束；只退稿，不改变状态。 */
export function validateNanhuangCanonNarrative(text: string, stageId: string, location: string, completed: string[], disclosureContext?: Parameters<typeof xiaoziDisclosure>[0]): void {
  if (!/^lcq\.stage_0(?:3b|4|4b|5b)/.test(stageId)) return;
  if (/岳帅|岳鹏举/.test(text) && /(?:岳帅|岳鹏举)[^。！？\n]{0,35}(?:她(?:不|的|是|有|说)|丈夫|女性|女人)|(?:岳帅|岳鹏举)[\s\S]{0,80}(?:她不喜见血|她有一女|她在丈夫死后)|她[^。！？\n]{0,12}(?:遗腹女|生下)/.test(text)) throw new Error('岳帅性别冲突：岳帅名岳鹏举，是男性');
  if (/蛇彝村|蛇彝领地/.test(location) && /(?:老彝婆|蛇彝斥候|蛇彝村民|蛇祖)[^。！？\n]{0,20}(?:躲|走|说|开口|挥|现身|出现|看着|递|活着)|(?:你|程宗扬)[^。！？\n]{0,12}(?:被白蛇咬|白蛇咬伤)/.test(text)) throw new Error('蛇彝村现场冲突：空村不新增活村民或无回执伤势');
  if (/灵飞镜[^。！？\n]{0,20}(?:阿夕性命相连|前朝名将遗物)|(?:潘师姐|潘掌门)[^。！？\n]{0,12}(?:不同意|点了头)/.test(text)) throw new Error('南荒事实冲突：不得编造灵飞镜来历、性命绑定或潘金莲许可');
  const ghostKingDead = completed.includes('lcq.event.ghost_king_swallowed');
  const sentences = text.split(/[。！？\n]/);
  if (!ghostKingDead && sentences.some(s => !/尚未|并未|没有|未曾|如果|假如|若是|一旦|待到/.test(s)
    && /鬼王峒[^。！？]{0,12}(?:已|既已|已经)(?:平定|攻破|覆灭)|(?:峒主|鬼巫王)[^。！？]{0,5}(?:已死|一死|死了|被杀|身亡)/.test(s))) {
    throw new Error('正典时序冲突：鬼王峒尚未平定，鬼巫王未死');
  }
  if (sentences.some(s => !/像|仿佛|不同|不是|并非|想起|回忆/.test(s)
    && /(?:那是|这里|此地|这片|眼前)[^。！？]{0,30}王哲[^。！？]{0,25}十里焦土/.test(s))) {
    throw new Error(`正典地点冲突：${location || '南荒战场'}不是王哲殉身的十里焦土`);
  }
  if (stageId === 'lcq.stage_04b_lingfei_baiyi_crisis' && sentences.some(sentence => !/当年|旧时|曾经|回忆|往事|过去/.test(sentence)
    && /(?:碧奴|碧姬)[^。！？\n]{0,20}(?:说是|说过|说这|解释|打翻|村里|粮仓|村务)/.test(sentence))) {
    throw new Error('正典在场冲突：碧姬不在当前碧鲮村现场，不编造她最近处理村务的言行');
  }
  const xiaozi = xiaoziDisclosure({ ...disclosureContext, modId: stageId, completedEventIds: completed });
  for (const sentence of sentences) {
    if (!isDisclosureFactAllowed(sentence, { ...disclosureContext, modId: stageId, completedEventIds: completed })) throw new Error('父系身世秘密尚未揭露：一般旧事须到72章，具体父系须经105章确证');
    if (/小紫/.test(sentence) && /毒宗|殇侯[^，。]{0,10}(?:弟子|传人)|唯一[^，。]{0,10}(?:嫡传|传人)/.test(sentence)) throw new Error('小紫师承在南荒尚未公开，清羽范围不开放唯一传人');
    if (!/小紫/.test(sentence) || !/神似|肖似|相似|女儿|父亲|母亲|亲生|血缘/.test(sentence)) continue;
    const fatherConflict = !xiaozi.father && /岳帅|岳鹏举/.test(sentence)
      && !(xiaozi.suspectedFather && /怀疑|猜测|未证实/.test(sentence));
    if (fatherConflict || (!xiaozi.mother && /碧姬|碧奴/.test(sentence))) throw new Error('小紫身世尚未揭露，不能描写与碧姬或岳帅的亲缘相似');
  }
}

export function validateQingyuNarrativeFacts(text: string, eventId?: string): void {
  if (/苏荔[^。！？\n]{0,12}(?:是|正是|担任|身为)?碧鲮族长|碧鲮族长苏荔|小紫[^。！？\n]{0,20}(?:叫|喊|唤)苏荔[^。！？\n]{0,8}娘|小紫[^。！？\n]{0,30}(?:叫|喊)[^。！？\n]{0,8}娘[^。！？\n]{0,100}苏荔/.test(text)) throw new Error('正典关系冲突：苏荔是花苗族长，不是小紫的母亲');
  if (/黑魔海(?:的)?(?:海底|海水|海域|水脉|封印)|(?:整片|一片|那片)黑魔海/.test(text)) throw new Error('黑魔海是宗派，不是海域或封印之物');
  if (/血虎[^。！？\n]{0,60}虎斑[^。！？\n]{0,35}武二郎[^。！？\n]{0,12}(?:如出一辙|相似|一样)|死老头留下的遗物/.test(text)) throw new Error('南荒事实冲突：不编血虎与武二郎外貌同源或死老头遗物');
  if (eventId === 'lcq.event.ningyu_regicide_offer') {
    if (/天竺/.test(text)) throw new Error('凝羽旧事地点冲突：本拍不编天竺往事');
    const nameAt = text.indexOf('西门庆');
    if (nameAt >= 0 && !/凝羽[^。！？\n]{0,80}(?:说|道|开口|吐出|答|提起)[^。！？\n]*$/.test(text.slice(Math.max(0,nameAt-100), nameAt))) throw new Error('姓名揭示顺序冲突：先由凝羽说西门庆，主角再反应');
  }
}
