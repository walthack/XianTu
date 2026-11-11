import {entityTemplateText} from './namedEntities';
/**
 * 二级线入口（R3-10）——把"能不能接到这条线"从模型自觉改成引擎确定性。
 *
 * 立项理由（2026-08-16 用户裁定）：
 *   「二级主线的发展不能靠 LLM 自己发挥，而是稳定可靠、随着玩家自己随时能够触发的
 *    （类似上古卷轴走到一个地方触发事件，接到派系主线任务）。
 *    LLM 的发挥尽量安排在那些非重要小支线或者流言这种程度。」
 *
 * 【锚是什么】**锚＝你知道那件事的那一拍**（用户裁定 2026-08-16，收窄了原规则）。
 *   原来的规则是「国家线锚地点、宗派线锚人」——用户指出那两种**都太宽泛**：
 *   走进建康只是"你到了能知道的位置"，不等于知道宫里闹鬼；见到谢艺也不等于知道星月湖是什么。
 *   **线是被"知道"打开的，不是被"到场"打开的。**
 *   地点与人退为指引落点说明（指向哪里／谁），不再参与判定。
 *   样板是黑魔海：云苍峰把空白羊皮纸解读成秘法传讯的那一刻——用户类比上古卷轴的血手信。
 *
 * 【锚只能落 event，"知道"却是 beat 层的事实】beat 1399 条、event 396 条，约 3.5 : 1；
 *   引擎能观测的只有 `completedEventIds`，所以锚必须落 event。两层对得上的线就精确锚，
 *   对不上的要**为那一拍补 event**——八条里有两条如此（晋国闹鬼 seq 241–242、
 *   唐国主家小姐旧事 seq 1061），见 `anchorEventPending`。
 *
 * 【为什么不锚关卡】`canonRail.DEFAULT_LINE_QUARANTINED_STAGE_IDS` 让默认路线静默跳过
 * 8 个关卡。主轴已经因此死过 3 条节点。关卡编排会变，地点与人不会。
 *
 * 【为什么人物锚比地点锚还稳】它读相识账本（`acquaintanceLedger`，持久化＋跨关继承），
 * 而"见没见过某人"是**引擎落账的事实**，不是模型说了算。地点则依赖模型写的
 * `角色.位置.描述`，再由 `resolveCurrentScenarioLocation` 反查——多一道解析。
 *
 * 【纪律】本模块只回答"这条线现在接得到吗"，**不回答"玩家加入了没有"**。
 * 锚一满足就把入口指引作为**待办**显示——不设"接受任务"这道手续（用户裁定 2026-08-16）：
 * 与主线轴的长期方向同一口径，引擎只把话说清楚，照着做就是加入，不做也不损失什么。
 *
 * 归属与入口调研见 `docs/R3-10-SECONDARY-LINES-2026-08-16.md`
 * 与 `docs/R3-10-LINE-ENTRY-ANCHORS-2026-08-16.md`。
 */

import { acquaintanceOf, rankOf, type AcquaintanceLedger } from './acquaintanceLedger';
import type { LineUnlockOptions } from './lineUnlock';
import type { ScenarioCondition } from './schema';
import ledgerOverrides from '../../../mod-kit/entity-ledger/overrides.json';
import { CONTENT_PACKS, type PackSecondaryLine } from '../contentPacks';
import type { PackLineCriticalEvent } from '../contentPacks/coreFormats';

export type SecondaryLineKind = 'sect' | 'nation' | 'commerce' | 'expedition';

export interface SecondaryLine {
  id: string;
  name: string;
  kind: SecondaryLineKind;
  /** 宗派线：引你进门的人。多个＝任一见过即可（如星月湖的八骏，见谁都算搭上线）。 */
  anchorCharacterIds?: string[];
  /**
   * 国家／地区线：走到就算到了的那个地方。
   *
   * **多个＝同一地方的孪生 id 全收。** 孪生不是"二选一挑对的那个"，而是同一处地方在不同关卡
   * 用了不同 id——只填一个，锚就只在那批关里响。实测洛都：`liuchao.location.luoyang` 覆盖 24 关、
   * `lyl.location.luoyang` 覆盖 6 关，早先只填后者，导致汉国锚在 6 关里只有 3 关能响
   * （`dingtao_beijing`／`han_succession` 玩家人在洛都却触发不了）。
   */
  anchorLocationIds?: string[];
  /**
   * **锚：你知道了那件事的那一拍。**
   *
   * 这不是"第三种锚"——是原来那两种太宽泛（用户裁定 2026-08-16）。
   * 走进建康只是"你到了能知道的位置"，不等于知道宫里闹鬼；见到谢艺也不等于知道星月湖是什么。
   * 线是被"知道"打开的，不是被"到场"打开的。
   *
   * 样板是黑魔海：云苍峰把那张空白羊皮纸解读成秘法传讯的瞬间，玩家才第一次知道这个名字。
   * 用户类比上古卷轴的血手信——你不是被派去查它，是有人把它塞进了你手里。
   * 注意它落在第 2 拍而非第 1 拍：见到朱老头（发蛊那关）更早，拿他当门会让线在你知道名字之前就开。
   * 所以是逐条判断"哪一拍是知道"，不是机械取第一个节点。
   *
   * **声明了它就由它单独判定**；`anchorLocationIds`／`anchorCharacterIds` 退为指引落点说明，
   * 只回答"指引把玩家指向哪里／谁"，不参与判定。
   */
  anchorEventIds?: string[];
  /**
   * 锚事件还没写出来——**在它落地之前，退回地点／人这类粗锚**。
   *
   * 八条线里有两条的「知道那一刻」在 beat 层有、event 层没有（实测 2026-08-16）：
   * 晋国的宫城闹鬼（seq 241–242，事件层最近的 seq 264 已经是"去夜探"了）、
   * 唐国的主家小姐旧事（seq 1061，seq 1059–1065 整段事件层空白）。
   * 锚到不存在的 id 上＝这条线永远打不开——主轴已经这么死过 3 条节点，不重蹈。
   *
   * 所以这两条先挂 `new` 节点把 event 补上，锚 id 照写，用本标志声明"暂用粗锚"。
   * event 一旦补出来，去掉本标志即自动切到精确锚。
   */
  anchorEventPending?: true;
  /**
   * 玩家可见的入口指引：**去哪里找谁**。
   *
   * 锚一满足就作为待办显示，**不需要玩家点击确认**（用户裁定 2026-08-16）——
   * 与主线轴的长期方向同一口径：引擎只把话说清楚，不替玩家签字，也不设"接受任务"这道手续。
   * 照着做就是加入，不做也不损失什么。
   */
  entryHint: string;
  /**
   * 整线解锁（太泉解锁设计稿 2026-10-27 §5）：值＝配置键 `story.lineUnlock.<id>`。
   * 填了它，锚满足后入口**照样显示**，没解锁时标题写「时机未到」并按缺项出句（`secondaryLineEntry.ts`）；
   * 不填的线行为不变。是否接得到仍只由锚回答（`resolveAvailableLines`），锁不锁由解锁判定回答。
   */
  unlock?: string;
  /** 带 `unlock` 的线的入口文案键（contentPacks texts）；`entryHint` 退为说法缺失时的兜底原文。 */
  entryHintKeys?: SecondaryLineEntryHintKeys;
  /** 锚为什么是这个——正典依据，便于日后复核。 */
  basis: string;
  /** 线内节点。骨架先搭齐，缺内容的标 `pending` 待扩。 */
  nodes: LineNode[];
  /** 这条线还缺什么（beat 级盘点结论）。空＝原著段已够打穿。 */
  pendingExpansion?: string;
}

/** 入口说法里的一句：文本键，或带账本条件的附句（条件只用账本路径，全满足才出）。 */
export type SecondaryLineHintPart = string | { key: string; when: ScenarioCondition[] };

export interface SecondaryLineEntryHintKeys {
  /**
   * 没解锁时：标题总出；缺项句按 realm → lines → deadline 顺序出。
   * `lines` 句里的 `{X}` 换成还差几条；`deadlinePrefix` ＋ `.` ＋ 期限 id＝该期限没了结时的句子（期限 id 只读配置 requireDeadlinesCleared）。
   */
  locked: { title: string; realm: string; lines: string; deadlinePrefix: string };
  /** 解锁后按说法变体取句（太泉：taiquanEntryVariant）。 */
  variants: Record<string, SecondaryLineHintPart[]>;
}

/**
 * 线内节点。粒度同主轴 `MAIN_QUEST_NODES`——任务节点，不是逐拍。
 *
 * `status` 三档：
 *   · `ready`   已有 stage＋event 承载，玩家现在就走得到；
 *   · `new`     内容在原著里有、游戏里没落地，**需新增 event**（已给建议 id）；
 *   · `pending` **待扩**：这一段还没规划，占位而已。
 */
export interface LineNode {
  /**
   * 制作侧事件结果摘要。玩家当前目标读取 `eventId` 所绑定 event 的固定 `objective`，
   * 不得把本字段直接投到 UI 或主叙事提示词。
   */
  reviewSummary: string;
  status: 'ready' | 'new' | 'pending';
  /** `ready` 必填；`new` 填建议挂载关。 */
  stageId?: string;
  /** `ready` 填现有 event id；`new` 填建议 id。 */
  eventId?: string;
  /**
   * 解锁门之前的本线节点：完成它**不算已走进本线**（整线解锁的追认只认门后的节点）。
   * 太泉：迷楼两拍在临安收束章（门在苍澜章），线性默认路线上一定先于门完成——算进去门就形同虚设。
   */
  beforeUnlock?: true;
}

/** 当前 event 属于哪些已落地二级线节点。 */
export function secondaryLinesAtEvent(eventId: string | undefined): SecondaryLine[] {
  if (!eventId) return [];
  return SECONDARY_LINES.filter(line => line.nodes.some(node =>
    node.status === 'ready' && node.eventId === eventId));
}

/**
 * 八条二级线的入口锚。
 *
 * ⚠ **孪生 id 陷阱**：同一个地方常有多个 id，各自只在一部分关卡里出现。
 * **处置是"全收"，不是"挑对的那个"**——只填一个，锚就只在那批关里响。
 * 实测各地 id 覆盖：临安 `linan` 30 关／`lin_an` 1 关（均收）；洛都 `liuchao.location.luoyang` 24 关／
 * `lyl.location.luoyang` 6 关（均收）；建康、长安各只有一个 id。
 * 确实该排除的只有两类：只在隔离关出现的（临安 `linan_city` 在 `taiquan_expedition`）、
 * 以及 live 关查无的（`lyg.location.changan`）。
 * 太乙山门「龙池」两个 id 都不可达，故太乙改走人物锚。
 */
export const TS_SECONDARY_LINES: SecondaryLine[] = [];

/**
 * 把内容包的二级线（manifest.secondaryLines）插进 TS 表：每条插在 after 指向的线后面（after 可指向 TS 线或另一条包线）。
 * 两条包线不能 after 同一条线；线 id 不能重复；after 找不到（含成环）报错。包线为空时原样返回 TS 表的拷贝顺序。
 */
export function mergeSecondaryLines(tsLines: readonly SecondaryLine[], packLines: readonly PackSecondaryLine[]): SecondaryLine[] {
  const out: SecondaryLine[] = [...tsLines];
  const ids = new Set(out.map(line => line.id));
  const afters = new Set<string>();
  // F0a：全部包线里至多一条不写 after，它排最前；只在 TS 表为空时允许（否则「最前」与 TS 首条冲突）
  let head: PackSecondaryLine | undefined;
  for (const line of packLines) {
    if (ids.has(line.id)) throw new Error(`secondary line ${line.id}: duplicate id`);
    if (line.after === undefined) {
      if (head) throw new Error(`secondary line ${line.id}: only one pack line may omit after (${head.id} already does)`);
      if (tsLines.length) throw new Error(`secondary line ${line.id}: omits after, but TS_SECONDARY_LINES is not empty`);
      head = line;
    } else if (afters.has(line.after)) throw new Error(`secondary line ${line.id}: another pack line is already after ${line.after}`);
    ids.add(line.id); if (line.after !== undefined) afters.add(line.after);
  }
  if (head) { const { after: _after, ...rest } = head; out.unshift(rest); }
  let pending = packLines.filter(line => line !== head);
  while (pending.length) {
    const next = pending.filter(line => !out.some(placed => placed.id === line.after));
    if (next.length === pending.length) throw new Error(`secondary line ${pending[0].id}: after ${pending[0].after} not found`);
    for (const line of pending.filter(item => !next.includes(item))) {
      const { after, ...rest } = line;
      out.splice(out.findIndex(placed => placed.id === after) + 1, 0, rest);
    }
    pending = next;
  }
  return out;
}

/**
 * 包线文案里的动态名字（F0a 搬迁预检：TS 线里有 entityText 模板）：{{entity:<kind>:<id>}}、{{entityLabel:<kind>:<id>:<labelId>}}，
 * 运行时解析（同包 rail），catalog 留模板原样；没有模板的包线原样返回。
 */
function withEntityTemplates<T>(value: T): T {
  if (typeof value === 'string') return entityTemplateText(value) as T;
  if (Array.isArray(value)) return value.map(withEntityTemplates) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withEntityTemplates(v)])) as T;
  return value;
}
export function resolvePackSecondaryLineTemplates(lines: readonly PackSecondaryLine[]): PackSecondaryLine[] {
  return lines.map(line => JSON.stringify(line).includes('{{') ? withEntityTemplates(line) : line);
}

/** 全部二级线：TS 表加内容包的线（顺序由 after 决定；旧 catalog 没有这一段时等于 TS 表）。 */
export const SECONDARY_LINES: SecondaryLine[] = mergeSecondaryLines(TS_SECONDARY_LINES, resolvePackSecondaryLineTemplates(CONTENT_PACKS.secondaryLines || []));

/**
 * 人物锚的门槛：**真的见过**才算接得到。
 * 相识账本四档 `rumored | introduced | encountered | joined`——只听过传闻不算，
 * 否则"世上有这么个人"就能开线，那又回到了模型说了算。
 */
/** 121章书信揭出名号之前只显示黑魔海；按当前原著章节锚点开放后缀，不按认识朱老头解锁。 */
export function secondaryLineDisplayName(line: SecondaryLine, event?: { axisAnchor?: string }): string {
  const chapter = Number(event?.axisAnchor?.match(/第(\d+)章/)?.[1] || 0);
  return line.id === 'heimohai' && chapter >= ledgerOverrides.chapterGates.poisonSectName ? '黑魔海／毒宗' : line.name;
}

export const LINE_ANCHOR_MIN_ACQUAINTANCE = 'encountered' as const;

/**
 * 带 `unlock` 的线交给整线解锁判定的参数：本线必有配置（缺了记码并锁住），
 * 门后任一 ready 节点完成＝已走进（`beforeUnlock` 的节点不算）。没有 `unlock` 的线返回 undefined。
 */
export function secondaryLineUnlockOptions(line: SecondaryLine): LineUnlockOptions | undefined {
  if (!line.unlock) return undefined;
  const enteredEventIds = line.nodes
    .filter(node => node.status === 'ready' && !node.beforeUnlock && node.eventId)
    .map(node => node.eventId!);
  return { required: true, enteredEventIds };
}

/**
 * 当前接得到哪些二级线。纯函数：只看地点与相识账本，不读别的存档字段、不产生副作用。
 * `completedEventIds` 须是跨关口径（编年史）；读存档的调用方用 `secondaryLineEntry.knownSecondaryLines`，不要传本关的 `rt.completedEventIds`。
 *
 * 只回答"接得到"，不回答"加入了"——见模块头纪律。返回的每条都带 `entryHint`，
 * 上层直接当待办显示即可，无需玩家确认。
 */
export function resolveAvailableLines(
  currentLocationId: string | undefined,
  ledger: AcquaintanceLedger | undefined,
  completedEventIds?: readonly string[],
): SecondaryLine[] {
  const threshold = rankOf(LINE_ANCHOR_MIN_ACQUAINTANCE);
  const done = completedEventIds?.length ? new Set(completedEventIds) : undefined;
  return SECONDARY_LINES.filter(line => {
    // 事件锚优先：声明了它就由它单独判定，见 `anchorEventIds` 的说明。
    // `anchorEventPending` ＝ 那条 event 还没写出来，此时不能用它判定（否则线永远打不开），
    // 落回下面的粗锚。
    if (line.anchorEventIds?.length && !line.anchorEventPending) {
      return Boolean(done) && line.anchorEventIds.some(id => done!.has(id));
    }
    if (line.anchorLocationIds?.length) {
      return Boolean(currentLocationId) && line.anchorLocationIds.includes(currentLocationId!);
    }
    if (line.anchorCharacterIds?.length) {
      // 任一锚人见过即算搭上线——八骏见谁都算。
      return line.anchorCharacterIds.some(id => {
        const record = acquaintanceOf(ledger, id);
        return record ? rankOf(record.kind) >= threshold : false;
      });
    }
    return false;
  });
}

/**
 * 线承重事件：**玩家没接这条线之前，世界不许替他把这件事办了。**
 *
 * 立项理由（用户裁定 2026-08-16）：
 *   「如果没启动汉国线，汉国线相关事件就不能自动发生并且推进。」
 *   「world_sim 的『世界自行推进』是需要审核而且小范围限定死的，不是全部事件。」
 *
 * 【现状核实】全库 396 个事件里只有 **24 条**带 `offscreenResolution`（会自行结算），
 * 占 6%；`deadlineTurns` 一条没有。所以"自行推进"本来就是小集合，问题不在范围大，
 * 在于**这 24 条不是一类东西**。
 *
 * **本轮只处置其中一类：权力格局级**——帝统归谁、谁被拥立、谁被赐死，**玩家该有得选**，
 * 故列入本表，所属线未开启时不结算。
 *
 * ⏳ **其余 14 条尚未审核，先留空**（用户裁定 2026-08-16）。曾把它们归为"世界背景级、
 * 保留自行推进"，但那个分法站不住：「旱洪与易虎之死」是队伍共同经历、「捧日军抵烈山」
 * 直接牵动江州战局，说"玩家在不在都一样"太草率。**未审核的一律维持现状**（照旧自行结算），
 * 不要因为没进本表就当成已经判过。
 *
 * 【世界背景级的去向】用户给了方向（2026-08-16）：这一类不是"要不要自行推进"的分类问题，
 * 而是**环境事件层的种子，可以自行扩写**——类比上古卷轴加入军团／风暴斗篷之后，
 * 各地随之爆发战斗。它是玩家选边的回响，不是主线。
 * 这一档正好落在既有的分工线上：**LLM 的发挥留给小支线与流言**（见模块头立项理由），
 * 环境层就是那一档。故它与本表是两件事：本表管"世界不许替玩家做决定"，
 * 环境层管"玩家的选择在世界里有回响"。实现另排。
 *
 * 典型反例是「吕冀赐死」，它的 worldDelta 自己写着「**你未在时限内前往永巷**」——
 * 这话默认玩家知道有这回事、只是没去。可玩家若从没接过汉国线，他连永巷有个时限都不知道，
 * 这句就成了凭空的责备。
 *
 * 【纪律】只收**审核过**的事件。别为了省事把整批塞进来——世界该转还得转，
 * 冻住整个世界等玩家，比替玩家做决定更糟。
 */
export const LINE_CRITICAL_EVENTS: Record<string, string> = {
};
/** 上表本身（并入内容包 lineCriticalEvents 之前的拷贝，F0a）：编译期查重读它。上表随后就地并入包条目，导出名与对象不变。 */
export const TS_LINE_CRITICAL_EVENTS: Record<string, string> = { ...LINE_CRITICAL_EVENTS };
/** TS 表在前、包条目按 catalog 顺序在后；同一事件两边都有即报错（编译期已查，这里兜底）。 */
export function mergeLineCriticalEvents(ts: Readonly<Record<string, string>>, pack: readonly PackLineCriticalEvent[]): Record<string, string> {
  const out = { ...ts };
  for (const { eventId, lineId } of pack) {
    if (eventId in out) throw new Error(`line critical event ${eventId}: duplicate`);
    out[eventId] = lineId;
  }
  return out;
}
Object.assign(LINE_CRITICAL_EVENTS, mergeLineCriticalEvents(TS_LINE_CRITICAL_EVENTS, CONTENT_PACKS.lineCriticalEvents || []));

/**
 * 从存档的位置描述反查地点 id。
 *
 * 存档里存的是中文串（如「中州·白湖商馆」），与 `storyContext.resolveCurrentScenarioLocation`
 * 同口径：按地点名做**最长匹配**，处理「白夷」／「白夷谷」这类互相包含。
 * 放在本模块而不是 import storyContext——后者依赖 runtime，反向 import 会成环。
 */
export function resolveLocationIdFromPosition(
  positionDescription: unknown,
  locations: ReadonlyArray<{ id: string; name: string }> | undefined,
): string | undefined {
  const desc = String(positionDescription || '').replace(/\s+/g, '');
  if (!desc || !locations?.length) return undefined;
  // 同样长的名字（「中立边陲·草原·帅帐」里的草原／帅帐）取在描述里更靠后的那段：三段式描述越往后越具体
  // （REPORT-8091-a4a451cf s01_05：原来按正典顺序取到草原，人在帅帐却被当成不在场，动作表只剩前往）。
  const at = (name: string) => desc.lastIndexOf(name.replace(/\s+/g, ''));
  return locations
    .filter(l => l.name && l.name.length >= 2 && desc.includes(l.name.replace(/\s+/g, '')))
    .sort((a, b) => b.name.length - a.name.length || at(b.name) - at(a.name))[0]?.id;
}

/**
 * 线承重事件的冻结判据：**玩家没到现场，这件事就不许自行推进**（用户裁定 2026-08-16）。
 *
 * 「到现场」两级判定，因为并非每条事件都带地点——实测 10 条里 7 条有 `locationId`，
 * 「秦桧斩刘建」「吕冀赐死」「吕奉先单骑破阵」三条没有：
 *
 *   1. 事件带 `locationId` → 玩家当前地点与之相同才算到场；
 *   2. 事件无 `locationId` → 退到关卡级：玩家人在该事件所属关卡即算到场。
 *
 * 到场之后不再特殊照顾——照常规规则走，玩家可以介入，也可以放着让它场外结算。
 * **冻结只保证"玩家有得选"，不保证"玩家一定参与"。**
 *
 * 【裁定原文】用户 2026-08-16：「任务指引玩家去皇宫，玩家不去，剧情就不推进，
 * 也没有汉帝被杀需要拥立新王的事情。如果玩家在董卓到来的时候临时起意跑到唐国，
 * 那用例时间也就停着等玩家回来再继续。」
 * 即：**不是"发生了而玩家没赶上"，是那件事根本没发生**；整条链停着等人，不设超时。
 *
 * ⚠ **与 R2-10／R2-11 既有验收冲突，尚未解决**（5 条测试红）。那批断言的是
 * 「玩家不介入 → 到期场外结算，世界不因缺席而冻结」，与本规则相反。分歧实质是
 * "玩家缺席"算不算"玩家的选择"——旧验收假定玩家知道有这回事而选择不去，
 * 本规则针对的是玩家人在这一关、却从没被告知昭阳宫今晚要拥立新帝，那不叫选择叫没通知。
 *
 * ⏳ **时效性 objective 待做过滤**（用户 2026-08-16）：确有一些 objective 需要时效、
 * 玩家没选择就该自动发生。那批要单独过滤出来豁免本闸，**做完之后再回头重判上述 5 条**。
 * 在此之前二级主线按本写法默认冻结。
 */
export function lineCriticalFrozen(
  event: { id: string; locationId?: string },
  currentStageId: string | undefined,
  currentLocationId: string | undefined,
  locationDataAvailable = true,
): boolean {
  if (!LINE_CRITICAL_EVENTS[event.id]) return false;
  // **判定不了就不判**：没有 `canon.locations` 时无从知道玩家在不在现场，
  // 此时冻结等于凭一个测不出来的条件卡住世界。真实存档一定带 locations（共享正典注入到每关），
  // 缺失的只有手搭 fixture，那些用例本就不在验证到场与否。
  if (!locationDataAvailable) return false;
  // 「现场」＝**那个地点**，不是那一关（用户裁定 2026-08-16）。
  // 关卡级判定在此处是空转：`runtime.events` 本就只装当前关的事件（`runtime.ts:2091`
  // `structuredClone(mod.scenario.events)`），玩家没到那一关，这些事件根本不在候选里。
  // 故只有地点级才真正拦得住"人在这一关、却没去那座殿，帝统就自行定了"。
  if (!event.locationId) return !currentStageId; // 无地点的退到关卡级（10 条里有 3 条）
  return event.locationId !== currentLocationId;
}
