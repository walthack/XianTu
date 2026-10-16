import { GAME_NUMBERS } from '../sceneModule/numbers';
import ledgerOverrides from '../../../mod-kit/entity-ledger/overrides.json';
/**
 * 声望的确定性锚点（P1-4）——把"扬名"从模型自觉改成引擎因果。
 *
 * 立项理由（2026-08-16 用户点出）：声望**怎么变全凭 LLM 自觉**。全仓核实过：
 * 引擎里没有任何确定性写入点（所有出现处都是初始化 0），`commandValidator` 把
 * `角色.属性.声望` 列为模型可写路径，唯一约束是 `storyContext` 里那段文字指引
 * （救人除害 +30~300、斩强敌 +100~1000、震动一方 +200~2000），`reputationTier`
 * 只负责把数字翻译成档位。**给多少由模型当场决定。**
 *
 * 这违反项目自己的原则——确定性调度定"发生什么"，LLM 只管"怎么讲"。
 * 同一仓库里好感已经做对了（`AFFINITY_EVENT_GRANT` ＋ `settleSharedExperienceAffinity`），
 * 本模块照抄那套：**承重事件完成 → 引擎给确定性增量**，模型只负责叙述扬名的过程。
 *
 * 【为什么必须先做】它是商队经营层的前置。经营层的定义是「别处的地位在此处折现」，
 * 若地位本身由模型随手给出，折现出来的就是模型心情，不是玩家的经营成果。
 *
 * 【数值标定】按档位曲线倒推，不是拍脑袋：
 *   档位（`reputationTier`）＝籍籍无名 <100｜小有名气 100｜声名远播 500｜名动一方 1000｜
 *   威震四方 3000｜名满天下 5000｜传说人物 10000。
 *   全书约 370 个事件、约半数承重。按下列取值：
 *     · 头两关（约 12 个事件，多为承重）→ 约 240 ＝ **小有名气**——刚穿越、打完一场败仗的人
 *       该是这个分量，不该已经"声名远播"；
 *     · 走完原著全部 → 约 4800 ＝ **名满天下**，给续写段留出到"传说人物"的空间。
 *   数值是初值，按实玩手感调整——机制有没有是结构问题，涨多快是数值问题。
 *   （与 `AFFINITY_EVENT_GRANT` 同一句免责，那边也是这么写的。）
 */
export const REPUTATION_EVENT_GRANT = GAME_NUMBERS.reputation.eventGrant;

/**
 * 关卡 → 地区／国家。声望必须**落到地区**，不能只有一个全局数
 * （用户裁定 2026-08-16：「要绑入到地区/国家级」）。
 *
 * 【为什么是手工映射而不是从数据推】实测全 37 关 396 个事件：
 * 只有 147 个（37%）带 `locationId`，只有 50 个（13%）能解析出 `region`，
 * 能推出主地区的关卡仅 13/37。**87% 的事件会落不了账**，自动推导不可用。
 *
 * 键沿用已提交的国家／地区线（`docs/R3-10-SECONDARY-LINES-2026-08-16.md`），
 * 这样商队经营层可以直接消费同一套键，不必再做一次归属。
 * 南荒并入昭南（地图：昭南三地坐标全在南荒大陆内；蓝图 §6 昭南底牌明写「鬼王峒／南荒」）。
 * 塞外与太泉不是国家线，但地理上独立，单列。
 * 数据在 `mod-kit/entity-ledger/overrides.json` 的 `stageRegions`（2026-10-14 自此处字面量迁入，顺序与内容不变）。
 */
export const STAGE_REGION: Record<string, string> = ledgerOverrides.stageRegions;

/** 引擎侧一次声望结算的明细，供调用方推进玩家可见的状态流。 */
export interface ReputationGrant {
  from: number;
  to: number;
  eventId: string;
  eventName?: string;
  amount: number;
}

/**
 * 地区立足度——**派生量，不是累加的账**（用户裁定 2026-08-16）。
 *
 * 【为什么不累加】最初做成"每个事件把声望加到所在地区"，于是必须解析每笔加在哪，
 * 而实测 396 个事件里只有 13% 能从 `locationId` 解出 `region`——87% 会落不了账。
 * 用户点破：主轴与地区线都已建好，**走完某地区的故事线，在该地区的立足度就该到顶**。
 *
 * 改成派生后三个问题一起消失：不需要事件级地点数据；旧档没有补发／重复计算问题
 * （派生量没有历史包袱）；也不会和模型写的全局声望打架。而且它是**状态的函数**，幂等。
 *
 * 【与全局声望的分工】
 *   · `角色.属性.声望`（全局，累加）回答"天下知不知道你"——事件结算 ＋ 模型为事件外扬名所加；
 *   · 本函数（分地区，派生）回答"在这一国你是什么分量"——商队经营层消费的是这个。
 *
 * 【算法】`STAGE_ORDER` 是无分叉单链，故"已走过"＝下标 ≤ 当前关下标。
 * 某地区立足度 ＝ 该地区已走过的关卡数 ÷ 该地区关卡总数 × 100。走完即 100。
 */
export function regionStanding(
  currentStageId: string | undefined,
  stageOrder: string[],
): Record<string, number> {
  const standing: Record<string, number> = {};
  const currentIdx = currentStageId ? stageOrder.indexOf(currentStageId) : -1;
  const totals: Record<string, number> = {};
  const passed: Record<string, number> = {};
  for (const [stageId, region] of Object.entries(STAGE_REGION)) {
    totals[region] = (totals[region] || 0) + 1;
    const idx = stageOrder.indexOf(stageId);
    if (idx >= 0 && currentIdx >= 0 && idx <= currentIdx) passed[region] = (passed[region] || 0) + 1;
  }
  for (const region of Object.keys(totals)) {
    standing[region] = Math.round(((passed[region] || 0) / totals[region]) * 100);
  }
  return standing;
}
