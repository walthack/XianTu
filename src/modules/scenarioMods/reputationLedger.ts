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
export const REPUTATION_EVENT_GRANT = {
  /** 承重剧情事件（critical）。 */
  critical: 20,
  /** 普通事件。 */
  normal: 6,
} as const;

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
 */
export const STAGE_REGION: Record<string, string> = {
  // 塞外：五原城一带
  'lcq.stage_01': '塞外',
  'lcq.stage_02': '塞外',
  'lcq.stage_03': '塞外',
  // 昭南（含南荒腹地）
  'lcq.stage_03b_snake_flower_bridge': '昭南',
  'lcq.stage_04': '昭南',
  'lcq.stage_04b_lingfei_baiyi_crisis': '昭南',
  'lcq.stage_05': '昭南',
  'lcq.stage_05b': '昭南',
  'lcq.stage_06': '昭南',
  // 晋国：清远至建康
  'lcq.stage_07_qingyuan_jiankang': '晋国',
  'lcq.stage_08_jiankang_coup': '晋国',
  'lcq.stage_09_trade_and_escape': '晋国',
  // 宋国：江州与临安
  'lcq.stage_10_jiangzhou_shadow_war': '宋国',
  'lcq.stage_11_lieshan_battle': '宋国',
  'lcq.stage_12_jiangzhou_counterwar': '宋国',
  'lyl.jiangzhou_retreat': '宋国',
  'lyl.lin_an_black_sea': '宋国',
  'lyl.lin_an_bridge': '宋国',
  'lyl.taiquan_expedition': '宋国',
  'lyl.xiaoyingzhou_blacksea_trap': '宋国',
  // 太泉：古阵内外
  'lyl.taiquan_sacred_fruit': '太泉',
  'lyl.taiquan_core_conflict': '太泉',
  'lyl.taiquan_afterfall': '太泉',
  // 汉国：洛都与汉宫
  'lyl.luoyang_cloud_secret': '汉国',
  'lyl.luoyang_coup': '汉国',
  'lyl.han_palace_endgame': '汉国',
  'lyg.dingtao_beijing': '汉国',
  'lyg.mijing_rumen': '汉国',
  'lyg.han_succession': '汉国',
  // 唐国：长安一线
  'lyg.changgan_begins': '唐国',
  'lyg.shixiang_ambush': '唐国',
  'lyg.changgan_interlude': '唐国',
  'lyg.ganlu_bian': '唐国',
  'lyg.liangzhou_league': '唐国',
  'lyg.buddhist_conspiracy': '唐国',
  'lyg.ganlu_aftershock': '唐国',
  'lyg.shituolin_endgame': '唐国',
};

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
