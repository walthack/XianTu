import { rankOf, type AcquaintanceLedger } from './acquaintanceLedger';
import { computePresentNames } from './presence';
import {
  FAST_NARRATIVE_DEMO_STORAGE_KEY,
  readFastNarrativeDemoAdjudicationView,
  type FastNarrativeDemoAdjudicationView,
} from './fastNarrativeDemoAdjudication';
import { isQingyuOpeningPlaytestSave, QINGYU_OPENING_PLAYTEST_MOD_ID } from './qingyuOpeningPlaytest';
import { stripModelThinking } from '@/utils/jsonExtract';
import { describeJudgementEffect, getJudgementState, type JudgementResolution } from '@/utils/judgementEngine';
import type { GM_Response } from '@/types/AIGameMaster';
import type { SaveData } from '@/types/game';

export { FAST_NARRATIVE_DEMO_STORAGE_KEY };
/** Call-level output cap. 768 truncated MiniMax Highspeed in 3/5 direct-API samples; 1024 completed 5/5 and covers observed DeepSeek successes through 632 tokens. */
export const FAST_NARRATIVE_MAX_TOKENS = 1024;
export const FAST_NARRATIVE_PROMPT_BUDGET_BYTES = 12 * 1024;
export const FAST_NARRATIVE_DEADLINE_MS = 35_000;
export const FAST_NARRATIVE_A_B_ACTION =
  '我猛地扑向最近的一具尸体，抢下他手里的短刀，然后借着草丛翻滚躲开射来的箭。';

export const FAST_NARRATIVE_GENERATE_OPTIONS = {
  usageType: 'main' as const,
  maxTokens: FAST_NARRATIVE_MAX_TOKENS,
  requestMaxRetries: 0,
  responseMode: 'text' as const,
  should_stream: false,
};

type StorageLike = { getItem(key: string): string | null };

export interface FastNarrativeResolutionView {
  id: string;
  kind: JudgementResolution['kind'];
  roll?: number;
  total?: number;
  difficulty: JudgementResolution['difficulty'];
  outcome?: JudgementResolution['outcome'];
  settledOutcomeText: string;
  canonPolicy: JudgementResolution['canonPolicy'];
  appliedEffects: JudgementResolution['appliedEffects'];
}

export interface FastNarrativeRenderPacket {
  playerAction: string;
  playerName: string;
  publicScene: {
    location: string;
    time: string;
    continuity: string;
  };
  resolution: FastNarrativeResolutionView;
  adjudication: FastNarrativeDemoAdjudicationView;
  presentNames: string[];
  processBoundary: string[];
}

export interface FastNarrativePlan {
  packet: FastNarrativeRenderPacket;
  /** Local-only validation guard; never serialized into the model prompt. */
  forbiddenNames: string[];
  systemPrompt: string;
  userPrompt: string;
}

export interface PlanFastNarrativeDemoInput {
  saveData: SaveData | null | undefined;
  playerAction: string;
  judgementResolution?: JudgementResolution;
  aborted?: boolean;
  hasOtherActionContract?: boolean;
  storage?: StorageLike;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isFastNarrativeDemoEnabled(storage?: StorageLike): boolean {
  try {
    const source = storage ?? (typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage);
    return source?.getItem(FAST_NARRATIVE_DEMO_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function extractRawPlayerAction(playerAction: string, resolution?: JudgementResolution): string {
  const text = String(playerAction || '').trim();
  const tagged = text.match(/<行动趋向>([\s\S]*?)<\/行动趋向>/);
  const core = (tagged ? tagged[1] : text).trim();
  const withoutReceipt = core.replace(/\n?【本地判定已结算】[\s\S]*$/, '').trim();
  return withoutReceipt || readText(resolution?.actionText);
}

function settledOutcomeText(resolution: JudgementResolution): string {
  const stakes = resolution.stakes;
  if (resolution.outcome === 'perfect') return readText(stakes.perfect) || readText(stakes.greatSuccess) || readText(stakes.success);
  if (resolution.outcome === 'great_success') return readText(stakes.greatSuccess) || readText(stakes.success);
  if (resolution.outcome === 'success') return readText(stakes.success);
  if (resolution.outcome === 'partial') return readText(stakes.partial);
  if (resolution.outcome === 'critical_failure') return readText(stakes.criticalFailure) || readText(stakes.failure);
  return readText(stakes.failure);
}

function resolutionView(resolution: JudgementResolution): FastNarrativeResolutionView {
  return {
    id: resolution.id,
    kind: resolution.kind,
    ...(typeof resolution.roll === 'number' ? { roll: resolution.roll } : {}),
    ...(typeof resolution.total === 'number' ? { total: resolution.total } : {}),
    difficulty: cloneJson(resolution.difficulty),
    ...(resolution.outcome ? { outcome: resolution.outcome } : {}),
    settledOutcomeText: settledOutcomeText(resolution),
    canonPolicy: resolution.canonPolicy,
    appliedEffects: cloneJson(resolution.appliedEffects || []),
  };
}

function resolutionReceiptMatches(saveData: unknown, resolution: JudgementResolution): boolean {
  if (!resolution || resolution.status !== 'resolved') return false;
  const state = getJudgementState(saveData);
  if (state.pending) return false;
  const recent = state.recent.find(item => item.id === resolution.id);
  if (!recent || recent.status !== 'resolved') return false;
  return JSON.stringify(resolutionView(recent)) === JSON.stringify(resolutionView(resolution));
}

function readPublicLocation(saveData: SaveData): string {
  const location = asRecord((saveData as any)?.角色)?.位置;
  if (typeof location === 'string') return location.trim();
  return readText(asRecord(location)?.描述);
}

function readPublicTime(saveData: SaveData): string {
  const time = asRecord((saveData as any)?.元数据)?.时间;
  if (!time) return '';
  const year = Number(time.年);
  const month = Number(time.月);
  const day = Number(time.日);
  const hour = Number(time.小时);
  if (![year, month, day].every(Number.isFinite)) return '';
  const hourText = Number.isFinite(hour) ? ` ${String(Math.max(0, Math.floor(hour))).padStart(2, '0')}时` : '';
  return `${Math.floor(year)}年${Math.floor(month)}月${Math.floor(day)}日${hourText}`;
}

function readSceneContinuity(saveData: SaveData): string {
  const history = (saveData as any)?.系统?.历史?.叙事;
  if (!Array.isArray(history)) return '';
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (!entry || entry.type === 'player') continue;
    const content = readText(entry.content);
    if (content) return content.slice(0, 60);
  }
  return '';
}

function readPresentRevealedNames(saveData: SaveData): string[] {
  const runtime = asRecord((saveData as any)?.世界?.状态)?.剧本模组;
  if (!runtime) return [];
  const ledger: AcquaintanceLedger = asRecord(runtime.acquaintances) || {};
  const playerName = readText((saveData as any)?.角色?.身份?.名字);
  const revealed = new Set<string>();
  for (const record of Object.values(ledger)) {
    if (!record || typeof record !== 'object') continue;
    const name = readText(record.name);
    if (!name || name === playerName) continue;
    if (rankOf(record.kind) >= rankOf('encountered')) revealed.add(name);
  }
  if (!revealed.size) return [];

  const activeIds = new Set(Array.isArray(runtime.activeEventIds) ? runtime.activeEventIds : []);
  const eventNames: string[] = [];
  for (const event of Array.isArray(runtime.events) ? runtime.events : []) {
    if (!activeIds.has(event?.id)) continue;
    for (const id of event.relatedCharacterIds || []) {
      const record = ledger[id] || Object.values(ledger).find(item => item?.characterId === id);
      const name = readText(record?.name);
      if (name && revealed.has(name)) eventNames.push(name);
    }
  }
  const featuredNames: string[] = [];
  for (const id of runtime.opening?.featuredCharacterIds || []) {
    const name = readText(ledger[id]?.name);
    if (name && revealed.has(name)) featuredNames.push(name);
  }
  const present = computePresentNames({
    playerLocation: readPublicLocation(saveData),
    eventCharacterNames: eventNames,
    featuredCharacterNames: featuredNames,
  });
  return [...present].filter(name => revealed.has(name) && name !== playerName).sort();
}

function readForbiddenKnownNames(saveData: SaveData, presentNames: string[]): string[] {
  const runtime = asRecord((saveData as any)?.世界?.状态)?.剧本模组;
  const characters = Array.isArray(runtime?.canon?.characters) ? runtime.canon.characters : [];
  const allowed = new Set(presentNames);
  const playerName = readText((saveData as any)?.角色?.身份?.名字);
  const names: string[] = characters
    .map((character: unknown) => readText(asRecord(character)?.name))
    .filter((name: string) => !!name && name !== playerName && !allowed.has(name));
  return [...new Set<string>(names)].sort();
}

function readProcessBoundary(saveData: SaveData, resolution: JudgementResolution): string[] {
  const lines = ['本轮只叙述已经落账的判定结果，不得重骰、改写既定数字、补发物品、完成或 void 事件。'];
  if (resolution.canonPolicy === 'route_process_only') {
    lines.push('正典策略：route_process_only。判定只影响过程代价，不得完成、void 或改写当前正典事件。');
  } else if (resolution.canonPolicy === 'if_only') {
    lines.push('正典策略：if_only。默认线不得执行改写命运的意图。');
  }
  const runtime = asRecord((saveData as any)?.世界?.状态)?.剧本模组;
  const activeIds = new Set(Array.isArray(runtime?.activeEventIds) ? runtime.activeEventIds : []);
  const completed = new Set(Array.isArray(runtime?.completedEventIds) ? runtime.completedEventIds : []);
  const current = Array.isArray(runtime?.events)
    ? runtime.events.find((event: any) => activeIds.has(event?.id) && !completed.has(event?.id))
    : null;
  const objective = readText(current?.objective);
  if (objective) lines.push(`当前可见处境：${objective}`);
  return lines;
}

export function buildFastNarrativeRenderPacket(
  saveData: SaveData,
  playerAction: string,
  resolution: JudgementResolution,
): FastNarrativeRenderPacket {
  const view = resolutionView(resolution);
  const adjudication = readFastNarrativeDemoAdjudicationView(saveData);
  if (!adjudication || adjudication.judgementId !== resolution.id) {
    throw new Error('快速叙事 Demo 缺少与本地判定一致的场景回执');
  }
  return {
    playerAction: extractRawPlayerAction(playerAction, resolution),
    playerName: readText((saveData as any)?.角色?.身份?.名字),
    publicScene: {
      location: readPublicLocation(saveData),
      time: readPublicTime(saveData),
      continuity: readSceneContinuity(saveData),
    },
    resolution: view,
    adjudication: cloneJson(adjudication),
    presentNames: readPresentRevealedNames(saveData),
    processBoundary: [...readProcessBoundary(saveData, resolution), adjudication.processBoundary],
  };
}

function formatEffects(resolution: FastNarrativeResolutionView): string {
  if (!resolution.appliedEffects.length) return '无';
  return resolution.appliedEffects.map(effect => describeJudgementEffect(effect)).join('；') || '无';
}

function shortKnifeLocationText(packet: FastNarrativeRenderPacket): string {
  if (packet.adjudication.location === 'scene_held') return '你在现场握持，尚未进入正式背包';
  if (packet.adjudication.location === 'on_ground') return '已从尸体处带离，但脱手落在乱草与泥地间';
  return '仍在最近的尸体手中';
}

function hasSettledBodilyHarm(packet: FastNarrativeRenderPacket): boolean {
  return packet.resolution.appliedEffects.some(effect => {
    if (effect.key === '角色.属性.气血.当前' && effect.action === 'add' && Number(effect.value) < 0) return true;
    const described = describeJudgementEffect(effect);
    const blob = `${described}\n${JSON.stringify(effect)}`;
    return /气血\s*-/.test(described) || /受伤|伤势|伤口|流血/.test(blob);
  });
}

const GENERIC_NON_PLAYER_ACTOR_RE = /半兽人|兽人|弓手|骑兵|追兵|敌人|敌军|同伴|队友|人影|狼骑/;
const EXTRA_LOOT_RE = /皮甲护腕|护腕|(?:捡到|搜出|别着|挂着).{0,10}(?:皮甲|箭袋|钱袋|腰包)/;
const UNSUPPORTED_PLAYER_HARM_RE = /(?:受伤|中箭|流血|伤口|血痕|鲜血|出血|渗血|创口)|(?:撕破|撕裂|割破|划破|割开|划开).{0,8}(?:衣|袖|袍|布|身|肤|浅口|浅痕)|(?:衣袖|袖口|衣袍|衣襟|布料).{0,8}(?:破|裂|撕|割)|(?:割进你|蹭出了血)|(?:掌心全是血|手心全是血)|(?:小臂.{0,8}血)|(?:身上多了几道)|(?:^|[。！？\n])血[。！？]/;
const EXACT_COUNT_OR_DISTANCE_RE = /[一二三四五六七八九十两\d]+(?:步|丈|尺)(?:外|之外|开外)?|几步(?:外|之外|开外)?|(?:约|大约)\s*[一二三四五六七八九十两\d]+步|[两二三四五六七八九十\d]+个方向|不止一个|包围圈|阵列|[两二三四五六七八九十\d]+具/;
function shortKnifeTerminalCoda(packet: FastNarrativeRenderPacket): string {
  if (packet.adjudication.location === 'scene_held') {
    return '这一阵动作过去，那柄从尸体手中夺来的凡品短刀仍被你握在手中，但尚未收进正式背包。';
  }
  if (packet.adjudication.location === 'on_ground') {
    return '这一阵动作过去，那柄凡品短刀已从你手中脱落，留在身后的乱草与泥地间。';
  }
  return '这一阵动作过去，那柄凡品短刀仍留在最近的尸体手中，你没能将它取走。';
}

function leaksUntrustedActors(text: string, packet: FastNarrativeRenderPacket): boolean {
  if (packet.presentNames.some(name => name.length >= 2 && text.includes(name))) return true;
  return GENERIC_NON_PLAYER_ACTOR_RE.test(text);
}

function containsStandaloneActorPronoun(text: string): boolean {
  return /他们|她们|他|她/.test(text.replace(/其他/g, ''));
}

function promptSafeContinuity(packet: FastNarrativeRenderPacket): string {
  const raw = packet.publicScene.continuity || '';
  if (!raw || leaksUntrustedActors(raw, packet)) return '无';
  return raw;
}

function promptProcessBoundary(packet: FastNarrativeRenderPacket): string {
  const lines = packet.processBoundary.filter(line => !leaksUntrustedActors(line, packet));
  return lines.map(line => `- ${line}`).join('\n');
}

function buildPresenceCoda(packet: FastNarrativeRenderPacket): string {
  const names = packet.presentNames.filter(Boolean).slice(0, 3);
  if (!names.length) {
    return '乱草的缝隙里再看不见更多身影，只有周围的风声和紧迫的动静还在逼近。';
  }
  return `乱草的缝隙里，${names.join('、')}仍在你视线可及之处，却谁也没有替你做出下一步选择。`;
}

function listTrustedCodas(packet: FastNarrativeRenderPacket): string[] {
  return [buildPresenceCoda(packet), shortKnifeTerminalCoda(packet)];
}

function stripTrustedCodas(text: string, packet: FastNarrativeRenderPacket): string {
  let remaining = normalizeFastNarrativeText(text);
  const codas = listTrustedCodas(packet);
  let changed = true;
  while (changed) {
    changed = false;
    for (const coda of [...codas].reverse()) {
      const trimmed = remaining.replace(/[\s\n]+$/g, '');
      if (coda && trimmed.endsWith(coda)) {
        remaining = trimmed.slice(0, -coda.length).replace(/[\s\n]+$/g, '');
        changed = true;
      }
    }
  }
  return remaining.trim();
}

function appendTrustedCodas(text: string, packet: FastNarrativeRenderPacket): string {
  const core = stripTrustedCodas(text, packet);
  const codas = listTrustedCodas(packet);
  return [core, ...codas].filter(Boolean).join('\n\n');
}

export function buildFastNarrativePrompts(packet: FastNarrativeRenderPacket): { systemPrompt: string; userPrompt: string } {
  const playerName = packet.playerName || '玩家';
  const settledItemBoundary = [
    '# 已落账场景物品',
    `来源：${packet.adjudication.sourceText}`,
    `本轮终态：${shortKnifeLocationText(packet)}。`,
    '只可按该终态叙述抢取和闪避过程；不得把短刀写成永久获得、正式背包物品或与终态冲突的位置。',
  ].join('\n');
  const systemPrompt = [
    '你是现场旁白。只把已经落账的本地判定写成一段连贯的场景正文。',
    '只输出纯中文叙事正文，不要标题、解释、JSON、命令、选项或记忆字段。',
    '禁止输出任何结构化命令、行动选项、记忆摘要、代码块或内部 ID。',
    '禁止重新掷骰、改写既定数字、完成/void 事件、凭空发物品或引入未给出的人物。',
    '没有出现在已写入效果里的物品或状态，不得写成已经持久获得。',
    '不要总结机制，不要写出判定卡。过程代价可以写，世界真值已经定了。',
    '只写第二人称“你”在这一瞬间的身体动作与直接感官，以及由该行动直接引起的可感知环境。',
    '不得提及任何其他人、生物或行动者，也不得写他们的对白、动作、位置、姿态或状态。',
    '不得写未给出的新物品、未落账的伤势或衣物破损，也不得写精确人数或精确距离。',
  ].join('\n');
  const userPrompt = [
    `# 玩家主体\n玩家名：${playerName}。下方“玩家行动”中的“我/玩家”只指该玩家；必须用第二人称“你”叙述玩家动作，不得把这些动作转移给任何其他人、生物或行动者。`,
    `# 写作边界\n只写“你”和由该行动直接引起的可感知环境。不要写任何其他人物、生物、同伴、敌人或人影，不要写他们的言语、动作、位置或状态。不要新增物品，不要写未落账的伤势或衣物破损，不要写精确人数或精确距离。在场去留由本地系统收束，你不要交代任何人。`,
    `# 玩家行动\n${packet.playerAction}`,
    `# 公开场景\n地点：${packet.publicScene.location || '现场'}\n时间：${packet.publicScene.time || '当前'}\n连续性：${promptSafeContinuity(packet)}`,
    `# 已落账判定\n类型=${packet.resolution.kind}；骰点=${packet.resolution.roll ?? '无'}；总值=${packet.resolution.total ?? '无'}；难度=${packet.resolution.difficulty.value}；结果=${packet.resolution.outcome ?? '已定'}；既定直接结果=${packet.resolution.settledOutcomeText || '只按结果等级演出'}；策略=${packet.resolution.canonPolicy}；已写入=${formatEffects(packet.resolution)}`,
    settledItemBoundary,
    `# 本轮过程边界\n${promptProcessBoundary(packet)}`,
    '现在只写 180-280 字的现场正文，写完即停。',
  ].filter(Boolean).join('\n\n');
  return { systemPrompt, userPrompt };
}

export function estimateFastNarrativePromptBytes(plan: Pick<FastNarrativePlan, 'systemPrompt' | 'userPrompt'>): number {
  return new TextEncoder().encode(`${plan.systemPrompt}\n${plan.userPrompt}`).length;
}

export function planFastNarrativeDemo(input: PlanFastNarrativeDemoInput): FastNarrativePlan | null {
  if (!isFastNarrativeDemoEnabled(input.storage)) return null;
  if (input.aborted) return null;
  if (input.hasOtherActionContract) return null;
  if (!input.judgementResolution || input.judgementResolution.status !== 'resolved') return null;
  if (!input.saveData || !isQingyuOpeningPlaytestSave(input.saveData)) return null;
  const saveData = input.saveData;
  const modId = readText(asRecord(asRecord((saveData as any)?.世界)?.状态)?.剧本模组?.modId);
  if (modId !== QINGYU_OPENING_PLAYTEST_MOD_ID) return null;
  if (!resolutionReceiptMatches(saveData, input.judgementResolution)) return null;
  const adjudication = readFastNarrativeDemoAdjudicationView(saveData);
  if (!adjudication || adjudication.judgementId !== input.judgementResolution.id) return null;
  const packet = buildFastNarrativeRenderPacket(saveData, input.playerAction, input.judgementResolution);
  const forbiddenNames = readForbiddenKnownNames(saveData, packet.presentNames);
  const prompts = buildFastNarrativePrompts(packet);
  return { packet, forbiddenNames, ...prompts };
}

export function normalizeFastNarrativeText(raw: string): string {
  return stripModelThinking(String(raw || '')).replace(/\r\n/g, '\n').trim();
}

const INTERNAL_ID_RE = /lcq\.(?:event|item|location|character)\.|liuchao\.character\.|judge-\d/i;
const COMMAND_JSON_RE = /"action"\s*:\s*"(set|add|remove|delete|upsert)"/i;
const NEGATED_DURABLE_SHORT_KNIFE_RE = /(?:并未|未曾|没有|并没有|没能|未能|不曾|没).{0,18}(?:将|把)?(?:那把|这把)?(?:短刀|刀).{0,18}(?:带走|拿走|收起|藏起|藏好|留下|据为己有)|(?:短刀|刀).{0,18}(?:并未|未曾|没有|并没有|没能|未能|不曾|没).{0,10}(?:被你)?(?:带走|拿走|收起|藏起|藏好|留下|据为己有)/g;
const DURABLE_SHORT_KNIFE_RE = /(?:收起|藏起|藏好|带走|拿走|留下|据为己有|收为己用).{0,12}(?:短刀|刀)|(?:把|将)?(?:那把|这把)?(?:短刀|刀).{0,18}(?:收起|藏起|藏好|带走|拿走|留下|归你|归其|成了你的|据为己有|收为己用)/;

function conflictsWithSettledShortKnife(text: string, packet: FastNarrativeRenderPacket): boolean {
  const withoutNegatedDurableClaim = text.replace(NEGATED_DURABLE_SHORT_KNIFE_RE, '');
  if (DURABLE_SHORT_KNIFE_RE.test(withoutNegatedDurableClaim)) return true;
  if (packet.adjudication.location === 'scene_held') {
    return /(?:短刀|刀).{0,12}(?:脱手|脱了手|脱落|落地|掉落|落进|掷出|掷了出去|扔出|仍在尸体|留在尸体)|(?:没能|未能|没有).{0,12}(?:抢到|取到|拿到|夺到)(?:短刀|刀)/.test(text);
  }
  if (packet.adjudication.location === 'on_ground') {
    return /(?:握紧|攥紧|拿稳|持着|握着).{0,10}(?:短刀|刀)|(?:短刀|刀).{0,10}(?:仍被你握|还在手中|仍在手中|仍在尸体|留在尸体)/.test(text);
  }
  const withoutNegatedAcquisition = text.replace(
    /(?:没能|未能|没有|并未).{0,10}(?:抢到|夺到|拿到|取到|抽出)(?:短刀|刀)?/g,
    '',
  );
  return /(?:抢到|夺过|夺下|抽出|拿到|取到|握紧|攥紧).{0,12}(?:短刀|刀)|(?:短刀|刀).{0,10}(?:落在手中|握在手中|被你握住|脱手|落地)/.test(withoutNegatedAcquisition);
}

export function isValidFastNarrativeText(
  raw: string,
  packet: FastNarrativeRenderPacket,
  forbiddenNames: string[] = [],
): boolean {
  const text = stripTrustedCodas(raw, packet);
  if (!text) return false;
  if (/tavern_commands|mid_term_memory|action_options/i.test(text)) return false;
  if (/```json/i.test(text) || /^\s*[{[]/.test(text) || COMMAND_JSON_RE.test(text)) return false;
  if (INTERNAL_ID_RE.test(text) || /flags\.event\./.test(text)) return false;
  if (/事件已完成|完成事件|void\s*事件|void事件/.test(text)) return false;
  if (/重新掷骰|再掷一次|改写判定|骰点改为/.test(text)) return false;
  if (forbiddenNames.some(name => name.length >= 2 && text.includes(name))) return false;
  if (!text.includes('你')) return false;
  if (packet.presentNames.some(name => name.length >= 2 && text.includes(name))) return false;
  if (GENERIC_NON_PLAYER_ACTOR_RE.test(text) || containsStandaloneActorPronoun(text)) return false;
  if (EXTRA_LOOT_RE.test(text)) return false;
  if (!hasSettledBodilyHarm(packet) && UNSUPPORTED_PLAYER_HARM_RE.test(text)) return false;
  if (EXACT_COUNT_OR_DISTANCE_RE.test(text)) return false;
  if (conflictsWithSettledShortKnife(text, packet)) return false;
  if (typeof packet.resolution.roll === 'number') {
    const claimed = text.match(/骰点\s*[为是：:=]?\s*(\d+)/);
    if (claimed && Number(claimed[1]) !== packet.resolution.roll) return false;
  }
  return true;
}

const OUTCOME_LABEL: Record<string, string> = {
  critical_failure: '局面比刚才更加凶险',
  failure: '你没能照原意做成这一下',
  partial: '你带着代价做成了眼前这一步',
  success: '你做成了眼前这一步',
  great_success: '你把眼前这一步做得比预想更利落',
  perfect: '这一连串动作几乎没有留下破绽',
};

function stripTerminalPunctuation(text: string): string {
  return text.replace(/[。！？!?]+$/g, '').trim();
}

export function buildFastNarrativeFallback(packet: FastNarrativeRenderPacket): string {
  const action = stripTerminalPunctuation(
    (extractRawPlayerAction(packet.playerAction).slice(0, 80) || '你依着当下的判断行动')
      .replace(/^我/, '你')
      .replace(/他手里/g, '尸体手里')
      .replace(/他手中/g, '尸体手中'),
  );
  const settledOutcome = stripTerminalPunctuation(packet.resolution.settledOutcomeText);
  const outcome = settledOutcome && !/(当前目标|额外收益|进度|判定|成功)/.test(settledOutcome)
    ? settledOutcome
    : OUTCOME_LABEL[String(packet.resolution.outcome || '')] || '你已经撑过了眼前这一下';
  const location = packet.publicScene.location || '现场';
  const core = `${location}的风贴着草尖掠过，尘土与碎叶被急促的动静一道卷起。你没有停下等待，${action}。身体伏低、转折，再顺着地势滚开，原本直逼而来的危险从身侧擦过。${outcome}。你来不及细看身上的尘泥，只能先借草丛遮住身形，听清外面追来的动静。`
    .replace(/\s+/g, ' ')
    .trim();
  return appendTrustedCodas(core, packet);
}

export function finalizeFastNarrativeText(
  raw: string,
  packet: FastNarrativeRenderPacket,
  forbiddenNames: string[] = [],
): string {
  const text = normalizeFastNarrativeText(raw);
  if (!isValidFastNarrativeText(text, packet, forbiddenNames)) {
    return buildFastNarrativeFallback(packet);
  }
  return appendTrustedCodas(text, packet);
}

export function wrapFastNarrativeGmResponse(text: string): GM_Response {
  return {
    text,
    mid_term_memory: '',
    tavern_commands: [],
    action_options: [],
  };
}
