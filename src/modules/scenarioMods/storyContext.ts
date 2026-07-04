import type { SaveData } from '@/types/game';
import { formatEarnedTitles } from './milestoneRewards';

import type {
  ScenarioCondition,
  ScenarioModChapter,
  ScenarioModCharacter,
  ScenarioModCharacterRelationship,
  ScenarioModEvent,
  ScenarioModOpening,
  ScenarioModPlayerRelationship,
} from './schema';

interface StoryRuntime {
  modId: string;
  modName?: string;
  mode: 'strict' | 'expand';
  axisVersion?: string;
  axisOrder?: number;
  axisSeqLo?: number | null;
  axisSeqHi?: number | null;
  prevStageId?: string | null;
  prevStageName?: string | null;
  nextStageId?: string | null;
  nextStageName?: string | null;
  currentChapterId: string | null;
  flags: Record<string, unknown>;
  chapters: ScenarioModChapter[];
  events: ScenarioModEvent[];
  activeEventIds: string[];
  completedChapterIds: string[];
  completedEventIds: string[];
  canon?: {
    characters?: ScenarioModCharacter[];
    factions?: Array<{ id: string; name: string }>;
    locations?: Array<{ id: string; name: string }>;
    playerRelationships?: ScenarioModPlayerRelationship[];
    relationships?: ScenarioModCharacterRelationship[];
  };
  opening?: ScenarioModOpening;
}

function readPath(root: unknown, path: string[]): unknown {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getRuntime(saveData: SaveData): StoryRuntime | null {
  const value = readPath(saveData, ['世界', '状态', '剧本模组']);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.modId !== 'string') return null;
  return record as unknown as StoryRuntime;
}

function formatConditions(conditions: ScenarioCondition[] | undefined): string {
  if (!conditions?.length) return '无显式条件';
  return conditions
    .map(condition => `${condition.path} ${condition.operator}${condition.value !== undefined ? ` ${JSON.stringify(condition.value)}` : ''}`)
    .join('；');
}

function formatAxisBeat(event: ScenarioModEvent, prefix = '主轴拍点'): string {
  const beat = compactText(event.axisBeat, 120);
  if (beat) return `${prefix}：${beat}`;
  if (event.axisId) return `${prefix}：${event.axisId}`;
  return '';
}

function isCriticalStoryEvent(event: ScenarioModEvent): boolean {
  if (event.critical !== undefined) return event.critical;
  if (event.axisMethod === 'reviewed-no-anchor' || event.axisId === null) return false;
  return Boolean(event.axisBeat || event.axisId || typeof event.axisSeq === 'number');
}

function namesForIds(
  ids: string[] | undefined,
  entities: Array<{ id: string; name: string }> | undefined,
): string {
  if (!ids?.length) return '';
  return ids.map(id => entities?.find(entity => entity.id === id)?.name || id).join('、');
}

function compactText(value: string | undefined, maxLength = 90): string {
  const compacted = (value || '').replace(/\s+/g, ' ').trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength)}...` : compacted;
}

function formatList(values: string[] | undefined, maxItems = 4, maxLen = 48): string {
  if (!values?.length) return '';
  return values.map(value => compactText(value, maxLen)).filter(Boolean).slice(0, maxItems).join('、');
}

function formatCharacterRelationship(
  character: ScenarioModCharacter,
  playerRelationships: ScenarioModPlayerRelationship[] | undefined,
  relationships: ScenarioModCharacterRelationship[] | undefined,
  characters: ScenarioModCharacter[],
): string {
  const lines: string[] = [];
  const playerRelation = playerRelationships?.find(item => item.characterId === character.id);
  if (playerRelation) {
    lines.push(`与玩家：${playerRelation.relation}（好感 ${playerRelation.favorability}）`);
    const memories = formatList(playerRelation.memories, 2);
    if (memories) lines.push(`共同记忆：${memories}`);
  }
  const relationLines = (relationships || [])
    .filter(item => item.fromCharacterId === character.id || item.toCharacterId === character.id)
    .slice(0, 3)
    .map(item => {
      const otherId = item.fromCharacterId === character.id ? item.toCharacterId : item.fromCharacterId;
      const otherName = characters.find(entity => entity.id === otherId)?.name || otherId;
      return `${otherName}:${item.relation}`;
    });
  if (relationLines.length) lines.push(`人物关系：${relationLines.join('；')}`);
  return lines.join('；');
}

function formatFocusedCharacter(character: ScenarioModCharacter, runtime: StoryRuntime): string {
  const profile = character.profile || {};
  const lines: string[] = [`- ${character.name}（${[character.gender, character.role, character.realm].filter(Boolean).join('；') || '正典人物'}）`];
  const base = compactText(character.description || profile.origin || '');
  if (base) lines.push(`  身份/定位：${base}`);
  // 归属(P3投影的 affiliations)——跨国称谓/同门认知的消费点
  const affiliations = (character as { affiliations?: Array<{ factionId?: string; role?: string }> }).affiliations || [];
  if (affiliations.length) {
    const factionNames = new Map((runtime.canon?.factions || []).map(f => [f.id, f.name]));
    const line = affiliations.slice(0, 4)
      .map(a => `${factionNames.get(a.factionId || '') || ''}${a.role ? `(${compactText(a.role, 16)})` : ''}`)
      .filter(t => t && !t.startsWith('(')).join('、');
    if (line) lines.push(`  归属：${line}`);
  }
  const personality = formatList(profile.personality);
  if (personality) lines.push(`  性格：${personality}`);
  if (profile.appearance) lines.push(`  外貌：${compactText(profile.appearance)}`);
  if (profile.currentAppearance) lines.push(`  当前外貌：${compactText(profile.currentAppearance)}`);
  if (profile.currentThought) lines.push(`  当前心思：${compactText(profile.currentThought)}`);
  const memories = formatList(profile.memories, 3);
  if (memories) lines.push(`  记忆：${memories}`);
  const notes = formatList(profile.notes, 8, 220);
  if (notes) lines.push(`  正典备注：${notes}`);
  const relation = formatCharacterRelationship(
    character,
    runtime.canon?.playerRelationships,
    runtime.canon?.relationships,
    runtime.canon?.characters || [],
  );
  if (relation) lines.push(`  关系：${relation}`);
  return lines.join('\n');
}

function reputationTier(value: number): string {
  if (value < 0) return value <= -5000 ? '恶名昭彰' : value <= -1000 ? '臭名远扬' : value <= -500 ? '声名狼藉' : value <= -100 ? '恶名在外' : '小有恶名';
  if (value >= 10000) return '传说人物';
  if (value >= 5000) return '名满天下';
  if (value >= 3000) return '威震四方';
  if (value >= 1000) return '名动一方';
  if (value >= 500) return '声名远播';
  if (value >= 100) return '小有名气';
  return '籍籍无名';
}

function buildFocusedCharacterPrompt(runtime: StoryRuntime, activeEvents: ScenarioModEvent[], contextText = ''): string {
  const characters = runtime.canon?.characters || [];
  if (!characters.length) return '';
  const focusedIds = new Set<string>();
  for (const id of runtime.opening?.featuredCharacterIds || []) focusedIds.add(id);
  for (const event of activeEvents) {
    for (const id of event.relatedCharacterIds || []) focusedIds.add(id);
  }
  if (runtime.opening?.playerCharacterId) focusedIds.add(runtime.opening.playerCharacterId);
  const focusedCharacters = [...focusedIds]
    .map(id => characters.find(character => character.id === id))
    .filter((character): character is ScenarioModCharacter => !!character)
    .slice(0, 8);
  // 确定性名字召回：玩家输入/近期叙事按名字（或别名）点到的在场角色也纳入聚焦，
  // 否则自由找不在活跃事件里的 NPC 闲聊时零档案注入 → LLM 只能靠猜（OOC 主源之一）。
  if (contextText) {
    const already = new Set(focusedCharacters.map(character => character.id));
    for (const character of characters) {
      if (focusedCharacters.length >= 12) break;
      if (already.has(character.id)) continue;
      const keys = [character.name, ...((character as { aliases?: string[] }).aliases || [])]
        .filter(key => typeof key === 'string' && key.length >= 2);
      if (keys.some(key => contextText.includes(key))) {
        focusedCharacters.push(character);
        already.add(character.id);
      }
    }
  }
  if (!focusedCharacters.length) return '';
  return `## 当前相关人物正典约束（防 OOC）
${focusedCharacters.map(character => formatFocusedCharacter(character, runtime)).join('\n')}

【人物正典优先级】：
1. 上述身份、关系、性格、谈吐/底线/目标、以及【身世】【情节】等正典备注是硬约束；不得改写、否定或让角色无因突变。
2. 角色的**深层往事/身世/渊源以【身世】【情节】备注为准**：叙述其过往必须与备注一致；备注**未载**的过往，让角色含糊带过、回避、或按其性格搪塞试探，**严禁凭空编造跨角色的血缘、师承、结拜、年代等起源设定**（例：不得杜撰某角色是另一角色的兄弟/父女/师徒）。
3. “补充细节”仅限无关紧要的当下场景描写（动作、神态、环境），**不含身世渊源与人物关系**。
4. 【族裔与地域文化一致】服饰、装束、礼俗、饮食须符合角色的族裔文化：花苗/兽蛮/碧鲮/鬼王峒/波斯/东瀛等**非中原角色不得默认穿中原长袍、儒衫、汉家衣冠**；换装应取其自身文化样式（如花苗银饰短装），并保留刺青、饰物、发式等族裔特征。**环境同理**：南荒（鬼王峒/花苗寨/碧鲮村）等异域场景的建筑、植被、气候、市井风物须符合当地风貌（峒寨/吊脚楼/雨林瘴气/巫蛊图腾），不得写成中原城镇的街市楼阁。
5. 【主角机密】生死根、穿越者来历等主角核心秘密：仅正典中**明确知情**的人物（如殇侯、王哲、月霜、蔺采泉等确有相关交集者）可在私密场合提及；**其余 NPC 根本不知道其存在，不得说出、议论或暗示**。上文档案里出现的这类信息是给你的背景知识，**不等于场内人物的知识**。
6. 【称谓语域】蔑称、敬称、私昵称呼只能出自对应关系人物之口（例：「碧奴」是鬼王峒/黑魔海中人对碧姬的役奴蔑称，仅这些人使用，其他人一律称「碧姬」）；以各角色档案中的称谓标注为准。
7. 【叙事连续性】续写（含读档后）时，先前已确立的即兴目标、物品用途、约定（例：说好“打破蛇蛋取令牌”）以近期记忆为准，**不得悄然翻转或重设**；确需改变须由剧情事件明确推动并在叙事中交代原因。
8. 用户要求角色违背正典时，以角色内方式拒绝、回避、误解或转移；不得承认“设定已被修改”。
9. 角色成长必须由已发生剧情、关系变化或明确事件支撑；不得为了迎合单轮输入突然 OOC。`;
}

export function createScenarioPromptState<T extends SaveData>(saveData: T): T {
  const promptState = structuredClone(saveData);
  const runtime = getRuntime(promptState);
  if (!runtime) return promptState;

  runtime.chapters = runtime.chapters.filter(chapter => chapter.id === runtime.currentChapterId);
  const activeIds = new Set(runtime.activeEventIds || []);
  runtime.events = runtime.events.filter(event => activeIds.has(event.id));
  return promptState;
}

export function buildScenarioStoryPrompt(saveData: SaveData, contextText = ''): string {
  const runtime = getRuntime(saveData);
  if (!runtime) return '';

  const chapter = runtime.chapters.find(item => item.id === runtime.currentChapterId);
  const activeIds = new Set(runtime.activeEventIds || []);
  const activeEvents = runtime.events.filter(event => activeIds.has(event.id));
  const characters = runtime.canon?.characters || [];
  const factions = runtime.canon?.factions || [];
  const locations = runtime.canon?.locations || [];

  const chapterSection = chapter
    ? `## 当前章节：${chapter.title}\n${chapter.summary}\n章节完成条件：${formatConditions(chapter.completion)}`
    : '## 当前章节\n暂无已激活章节。不要自行使用或透露后续章节内容。';
  // 当前地域风貌：活跃事件所在地点的正典描述（否则 LLM 查看环境时裸猜，南荒写成中原样）
  const activeLocationIds = [...new Set(activeEvents.map(event => event.locationId).filter(Boolean))] as string[];
  const locationLine = activeLocationIds
    .map(id => {
      const loc = locations.find(item => item.id === id) as { name?: string; description?: string } | undefined;
      return loc?.description ? `- ${loc.name}：${compactText(loc.description, 160)}` : '';
    })
    .filter(Boolean)
    .join('\n');

  const eventSection = activeEvents.length
    ? activeEvents.map(event => {
        const context = [
          namesForIds(event.relatedCharacterIds, characters),
          namesForIds(event.relatedFactionIds, factions),
          namesForIds(event.locationId ? [event.locationId] : [], locations),
        ].filter(Boolean).join('；');
        const axisLine = formatAxisBeat(event);
        return `- ${event.name}：${event.description}\n  ${axisLine ? `${axisLine}\n  ` : ''}相关正典：${context || '无'}\n  完成条件：${formatConditions(event.completion)}`;
      }).join('\n')
    : '- 当前没有已触发事件，不要提前引入未触发事件。';

  // 主轴下一拍：找出依赖"当前事件完成条件"的后续事件，作为前进方向喂给 AI（避免 AI 停在原地等玩家）
  const activeCompletionPaths = new Set(
    activeEvents.flatMap(event => (event.completion || []).map(c => c.path)),
  );
  const completedIds = new Set(runtime.completedEventIds || []);
  const nextEvents = runtime.events.filter(event =>
    !activeIds.has(event.id) &&
    !completedIds.has(event.id) &&
    ((event as any).conditions || []).some((c: ScenarioCondition) => activeCompletionPaths.has(c.path)),
  );
  const pendingCriticalEvents = runtime.events.filter(event =>
    isCriticalStoryEvent(event) &&
    !completedIds.has(event.id) &&
    !activeIds.has(event.id),
  );
  // 仅给出下一拍事件名称作为推进方向，不带 description，避免提前泄露未来剧情细节
  const nextSection = nextEvents.length
    ? nextEvents.map(event => {
        const axisLine = formatAxisBeat(event, '下一拍');
        return `- ${event.name}${axisLine ? `（${axisLine}）` : ''}`;
      }).join('\n')
    : pendingCriticalEvents.length
      ? `- 本关仍有关键剧情未触发，不能切换下一关。继续围绕当前章节完成条件制造线索、调度相关人物，促成最近的关键剧情节点。`
    : runtime.nextStageId
      ? `- 本关收束后，建议切换到下一关：${runtime.nextStageName || runtime.nextStageId}（${runtime.nextStageId}）。不要在当前关提前展开下一关正文。`
      : '- （当前事件完成后将进入新章节或迎来结局）';
  const focusedCharacterSection = buildFocusedCharacterPrompt(runtime, activeEvents, contextText);

  // 声望与认知闭环：当前值+档位醒目注入（静态 REPUTATION_GUIDE 埋在 worldStandards 里 LLM 不消费——
  // 实测籍籍无名的主角被唐使"底细尽在掌握"）
  const repValue = Number(readPath(saveData, ['角色', '属性', '声望']) ?? 0) || 0;
  const reputationLine = `【声望与认知】主角当前声望：${repValue}（${reputationTier(repValue)}）。NPC 对主角的认知必须匹配声望档位：籍籍无名＝陌生人不识其名、不知其过往事迹与底细；势力若声称"掌握其底细"，必须有情报来源并在剧情中交代（且这类调查本身就是值得叙述的事件）；亲历者与同行者除外。主角做出扬名（或败坏名声）之事时，必须用 set 更新 角色.属性.声望（参考：救人除害+30~300、斩强敌+100~1000、震动一方的大事件+200~2000；恶行记负值）。`;

  // 关系-好感失配检测：与玩家关系 是静态标签(物化写一次),从不随好感演进——
  // 实测 噬心 挂"敌对"却好感35且主动双修。确定性检出失配,交 LLM 剧情内收敛。
  const relations = readPath(saveData, ['社交', '关系']) as Record<string, { 与玩家关系?: string; 好感度?: number }> | undefined;
  const mismatches: string[] = [];
  if (relations && typeof relations === 'object') {
    for (const [key, npc] of Object.entries(relations)) {
      if (!npc || typeof npc !== 'object') continue;
      const label = String(npc.与玩家关系 || '');
      const fav = Number(npc.好感度);
      if (!label || !Number.isFinite(fav)) continue;
      const hostile = /敌对|仇|死敌|敌人/.test(label);
      const intimate = /亲密|爱慕|情人|道侣|挚友|伴侣/.test(label);
      if ((hostile && fav >= 20) || (intimate && fav <= 0)) mismatches.push(`${(npc as { 名字?: string }).名字 || key}（${label}，好感 ${fav}）`);
      if (mismatches.length >= 4) break;
    }
  }
  const relationLine = mismatches.length
    ? `【关系-好感失配修正】以下 NPC 的关系标签与好感度明显失配：${mismatches.join('、')}。本轮起以角色内方式收敛：要么让关系随剧情演进并用 set 更新 社交.关系.<名字>.与玩家关系（如"敌对"→"亦敌亦友/表面敌对暗生情愫"），要么在叙事中交代表里不一的原因并把标签改为体现这种复杂性的表述。此后好感度跨档变化时必须同步演进关系标签，不得让标签僵死。`
    : '';

  // 即兴目标槽（跨轮追踪，读档不翻转的治本一环）
  const improvGoals = readPath(saveData, ['系统', '扩展', '任务追踪', '即兴目标']);
  const improvLine = Array.isArray(improvGoals) && improvGoals.length
    ? `【即兴目标·跨轮追踪（读档续写以此为准，不得悄然翻转）】\n${improvGoals.slice(0, 3).map((g: any) => `- ${typeof g === 'string' ? g : g?.标题 || ''}`).filter(Boolean).join('\n')}\n维护规则：目标达成或失效时，必须用 set 更新 系统.扩展.任务追踪.即兴目标（整组重写，上限 3 条）；只记录跨轮仍需追踪的目标，场景内小动作不记。`
    : `【即兴目标槽】当叙事确立了需跨轮追踪的临时目标（如"取回某物""赴某约"），用 set 写入 系统.扩展.任务追踪.即兴目标（数组，元素 {"标题":"..."}，上限 3 条）；达成/失效必须清除。`;

  // 承重角色保护：尚未完成的关键剧情事件所系人物，不得被即兴写死/永久失能（只报名字，不泄事件细节）
  const loadBearingIds = new Set<string>(
    runtime.events
      .filter(event => isCriticalStoryEvent(event) && !completedIds.has(event.id))
      .flatMap(event => event.relatedCharacterIds || []),
  );
  if (runtime.opening?.playerCharacterId) loadBearingIds.delete(runtime.opening.playerCharacterId);
  const loadBearingNames = [...loadBearingIds]
    .map(id => characters.find(character => character.id === id)?.name)
    .filter((name): name is string => !!name)
    .slice(0, 20);
  const loadBearingLine = loadBearingNames.length
    ? `【承重角色保护】以下人物承担本关尚未完成的关键剧情：${loadBearingNames.join('、')}。他们不得死亡、永久残疾、被永久囚禁或从此无法寻见；可以受挫、遇险、暂时离场，但必须保留后续登场能力。`
    : '';

  // 偏离收束：剧情停滞分档提示（≤3 轮自由发挥；4-6 软收束；≥7 硬收束）
  const stallTurns = (runtime as { stallTurns?: number }).stallTurns || 0;
  const steeringLine = stallTurns >= 7
    ? '【硬收束】剧情已停滞多轮：本轮必须让“当前事件”的直接引子登场（相关人物现身、事态迫近），把叙事拉回主线，不得继续发散。'
    : stallTurns >= 4
      ? '【软收束】剧情已数轮未推进：请借在场人物、既有伏笔或事件余波，自然地把叙事引向“当前事件”的达成，避免开新的无关支线。'
      : '';
  const stageLine = [
    runtime.modName || runtime.modId,
    typeof runtime.axisSeqLo === 'number' && typeof runtime.axisSeqHi === 'number' ? `主轴范围 #${runtime.axisSeqLo}~#${runtime.axisSeqHi}` : '',
    runtime.nextStageId ? `下一关 ${runtime.nextStageName || runtime.nextStageId}` : '',
    // 称号=里程碑奖励的运行时状态（引擎授予）：从存档读，未获得的头衔不进 prompt → 结构上防"未卜先知"
    formatEarnedTitles(saveData),
  ].filter(Boolean).join('；');

  return `# 当前剧本进度（仅限可见内容）
${stageLine ? `## 当前关卡\n${stageLine}\n\n` : ''}${chapterSection}

## 六朝国别风貌基准（虚构五国对应华夏朝代，环境/服饰/礼仪描写以此为准）
- 唐国＝唐朝：长安气象，朱雀大街、坊市制、胡商胡姬；男子幞头圆领袍、女子高髻襦裙披帛；乐舞胡风华贵开放；称谓如“郎君/娘子/圣人（皇帝）”。
- 汉国＝汉朝：古朴雄浑，宫阙台榭、闾里；深衣曲裾、宽袖束发；席地跪坐、分餐制、礼法尊经；称谓如“君侯/足下/陛下”。
- 宋国＝宋朝：市井极繁，瓦舍勾栏、夜市酒楼、河桥漕运；男子交领襕衫、女子褙子；点茶焚香文士风雅、重文轻武；称谓如“官人/娘子/相公”。
- 秦国＝秦朝：肃杀尚黑，夯土城垣、驰道；黑衣玄甲；军功爵制、法度森严、言行简峻；称谓如“君上/大人”。
- 晋国＝晋朝：门阀气象，园林清雅、乌衣巷第宅；宽衣博带、麈尾清谈；士庶天隔、重门第郡望；称谓如“郎/使君/明公”。
- 昭南＝南洋/东南亚：热带海国，港埠番舶、香料象牙贸易；干栏式木楼、椰林水寨；筒裙纱笼、赤足佩花；驯象乘舟、信巫祀海。
- 南荒＝百越苗疆：峒寨吊脚楼、雨林瘴气；银饰苗绣、文身跣足；巫蛊图腾、歌垣风俗。
【硬约束】建筑、街市、服饰、礼节、官称随所在国切换，**不得跨国混用**（宋国街头不该满是唐式幞头胡乐，汉国不该出现宋式瓦舍勾栏）。**君臣称谓按人物「归属」判断**：只对本国君主称陛下/太后/圣人，提及他国君主冠国号（唐国官员称宋国太后应为「宋国太后」而非「太后娘娘」）；跨国人物相见按各自国籍行礼致称。

${locationLine ? `## 当前地域风貌（环境/建筑/民俗描写以此为准）\n${locationLine}\n\n` : ''}## 当前事件（玩家此刻所处的剧情节点）
${eventSection}

## 下一步（达成当前完成条件后，剧情将推进到）
${nextSection}

## 剧情标记
${JSON.stringify(runtime.flags || {})}

${focusedCharacterSection ? `${focusedCharacterSection}\n\n` : ''}${loadBearingLine ? `${loadBearingLine}\n\n` : ''}${steeringLine ? `${steeringLine}\n\n` : ''}${reputationLine}\n\n${relationLine ? `${relationLine}\n\n` : ''}${improvLine}\n\n【主动推进剧情，不要停在原地等玩家】：

1. 每一段叙事都要朝“当前事件”的完成条件前进——主动设置场景、引入相关人物、制造契机，引导玩家走向该事件的达成，而不是只描述当前一幕然后停下。
2. 【每轮必做的收尾核对——叙事与数据必须同步】逐项检查本轮叙事，凡发生以下情况**必须**输出对应指令（只写在正文不发指令＝东西凭空消失，实测：云苍峰赠玉简正文收下了背包却没有）：
   ① 事件达成 → set 世界.状态.剧本模组.flags.event.<id>.done = true（布尔，漏标卡死推进）
   ② 获得物品（受赠/缴获/拾取/购买/接过/收下）→ set 角色.背包.物品.<稳定物品ID> = {物品ID:"<同key末段>",名称,类型,品质:{quality,grade},数量,描述}（例：收下云苍峰玉简 → set 角色.背包.物品.item_yuncangfeng_yujian）；消耗 → add 数量(-1)；用尽 → delete
   ③ 货币收支 → add 角色.背包.货币.<币种>.数量
   ④ 学会功法/技能 → 对应功法/技能指令；伤势/中毒/增益 → push 角色.效果
   ⑤ 扬名/败名 → set 角色.属性.声望；NPC 好感/记忆变化 → add 好感度 / push 记忆
3. 关键剧情事件未完成时，不要建议切换下一关；先推动当前关内关键剧情触发。
4. 避免反复描写同一幕或原地打转；玩家若无明确行动，由你主动顺着主轴往下带。
5. 不要猜测、引用或泄露后续章节，以及“下一步”之后尚未触发的事件细节。`;
}
