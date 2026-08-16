/**
 * 二级线入口（R3-10）——把"能不能接到这条线"从模型自觉改成引擎确定性。
 *
 * 立项理由（2026-08-16 用户裁定）：
 *   「二级主线的发展不能靠 LLM 自己发挥，而是稳定可靠、随着玩家自己随时能够触发的
 *    （类似上古卷轴走到一个地方触发事件，接到派系主线任务）。
 *    LLM 的发挥尽量安排在那些非重要小支线或者流言这种程度。」
 *
 * 【锚的分类】用户裁定的规则，直接落在既有两类线上：
 *   · **国家／地区线 → 锚地点**：国家就是一片地，走到就算到了；
 *   · **宗派线 → 锚相关人**：宗派是一群人，得有人引你进门。
 *   秘密组织尤其如此——黑魔海不可能靠走进总坛加入，正典里程宗扬是毒宗系「被庇护者」，
 *   那层关系从殇侯（朱老头）来，不是从地理来。
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

export type SecondaryLineKind = 'sect' | 'nation';

export interface SecondaryLine {
  id: string;
  name: string;
  kind: SecondaryLineKind;
  /** 宗派线：引你进门的人。多个＝任一见过即可（如星月湖的八骏，见谁都算搭上线）。 */
  anchorCharacterIds?: string[];
  /** 国家／地区线：走到就算到了的那个地方。 */
  anchorLocationId?: string;
  /**
   * 玩家可见的入口指引：**去哪里找谁**。
   *
   * 锚一满足就作为待办显示，**不需要玩家点击确认**（用户裁定 2026-08-16）——
   * 与主线轴的长期方向同一口径：引擎只把话说清楚，不替玩家签字，也不设"接受任务"这道手续。
   * 照着做就是加入，不做也不损失什么。
   */
  entryHint: string;
  /** 锚为什么是这个——正典依据，便于日后复核。 */
  basis: string;
}

/**
 * 八条二级线的入口锚。
 *
 * ⚠ **孪生 id 陷阱**：同一个地方常有多个 id，选错就是死锚（名字对、id 错，触发器一样不响）。
 * 已实测的坑：临安 `lin_an`／`linan_city` 只在隔离关，须用 `linan`；
 * 长安 `lyg.location.changan` 在 live 关查无；洛都须用 `lyl.location.luoyang`
 * 而非 atlas 孪生；太乙山门「龙池」两个 id 都不可达，故太乙改走人物锚。
 */
export const SECONDARY_LINES: SecondaryLine[] = [
  // —— 宗派线：锚人 ——
  {
    id: 'taiyi',
    name: '太乙真宗',
    kind: 'sect',
    anchorCharacterIds: ['lcq.character.wang_zhe'],
    entryHint: '王哲既已传功托付，太乙真宗的门就对你开着——去找他，或日后去找教御蔺采泉。',
    basis: '王哲是把程宗扬拉进太乙的人——`lcq.event.s01_04` objective 字面即「加入太乙真宗阵营」，'
      + '并在 `stage_02` 传功托付。**开局强制剧情就会见到他，等于自动开启**（用户确认 2026-08-16）。'
      + '（山门龙池两个 id 均不可达，故不用地点锚。）',
  },
  {
    id: 'xingyuehu',
    name: '星月湖',
    kind: 'sect',
    anchorCharacterIds: [
      'liuchao.character.xie_yi',      // 谢艺　 第 4 关（最早）·护岳帅父女
      'liuchao.character.xiao_yao_yi', // 萧遥逸 第 10 关·掌谍报商网
    ],
    entryHint: '想搭上星月湖，去找八骏——先是谢艺，江州之后可找萧遥逸。',
    basis: '**用八骏，不用月霜**（用户裁定 2026-08-16）：月霜是要护的人，不是引你进门的人；'
      + '八骏才是星月湖建制（蓝图 §10：孟非卿掌军／萧遥逸掌谍报商网／谢艺护岳帅父女）。'
      + '**八骏里只取谢艺与萧遥逸**（用户裁定 2026-08-16）：这两人才是程宗扬实际打交道的，'
      + '孟非卿／卢景／王韬／斯明信不作入口，崔茂在默认线事件层不可达。'
      + '任一见过即开线，最早由谢艺第 4 关触发——比月霜第 1 关合理，开局就开星月湖太早。',
  },
  {
    id: 'heimohai',
    name: '黑魔海／毒宗',
    kind: 'sect',
    anchorCharacterIds: ['liuchao.character.shang_zhen_yu'],
    entryHint: '毒宗的名分不在总坛里，在人身上——去找殇侯（你先认识的那位朱老头）。',
    basis: '秘密组织不靠走进总坛加入（蓝图总坛在昭南，事件层从未落地）。正典里程宗扬是毒宗系'
      + '「被庇护者」，蓝图 §13-C 定案「名义天命侯＝殇侯，毒宗实推的继承人＝程宗扬」。'
      + '同一 id 两个名字：第 5 关以「朱老头」现身，第 10 关以「殇侯」现身。'
      + '**用殇侯不用小紫**（用户授权判断 2026-08-16）：小紫第 8 关才可达（首现关 `stage_05` 被隔离），'
      + '且她已是主轴血脉线核心承重（层三解锁门／遗孤名册／大祭备用容器），'
      + '兼作黑魔海入口会让玩家分不清"认识小紫"是在推血脉还是在入毒宗。',
  },
  // —— 国家／地区线：锚地 ——
  {
    id: 'zhaonan',
    name: '昭南',
    kind: 'nation',
    // ⚠ 唯一用人物锚的国家／地区线。破例的理由是数据给的，不是随手定的——见 basis。
    anchorCharacterIds: [
      'liuchao.character.yun_cang_feng', // 云苍峰 第 4 关·商队带你进南荒
      'liuchao.character.wu_er_lang',    // 武二郎 第 5 关·南荒队伍成员
    ],
    entryHint: '南荒没有可投的朝廷，只有带你进去的人——跟云苍峰的商队同行，队里还有武二郎。',
    basis: '**破例用人物锚**（用户提出 2026-08-16）：其余四条国家线都能走进都城，昭南不能——'
      + '麟趾／昭南城在事件层从未抵达，玩家到的全是部族聚落。'
      + '**不变量是"进南荒得跟商队"**：`stage_03b` 的 `云氏同行` objective 字面即'
      + '「与云苍峰商队同行，前往白夷族」；那片地方没有别的进法。'
      + '⚠ 冰蛊胁迫（`stage_03`：苏妲己订下三个月南荒之约 → 以冰蛊逼迫南行 → 两日内组织南荒队伍）'
      + '**只是正典默认路径，不是结构必然**——它前面那串（流落街头→落进苏妲己手里→赌局卖身）'
      + '每一环都可能不发生，本作又有 IF 分歧。故锚取"带路的商队人"而非"被谁逼的"：'
      + '不论玩家是被押去的还是自己走通商路去的，商队这一条都成立。'
      + '（原锚熊耳铺已废：它是 `stage_03b` 最后一个事件「龙神新娘｜前往熊耳铺」的落点，'
      + '在南荒之行的尾巴上，是深处不是门。）',
  },
  {
    id: 'jin',
    name: '晋国',
    kind: 'nation',
    anchorLocationId: 'liuchao.location.jiankang',
    entryHint: '想插手晋国朝局，去建康。',
    basis: '建康＝晋国都城（官方附录地图 jin-nanzhao 幅在场；描述「晋国都城」）。第 10 关可达。',
  },
  {
    id: 'song',
    name: '宋国',
    kind: 'nation',
    anchorLocationId: 'liuchao.location.linan',
    entryHint: '想插手宋国朝局，去临安。',
    basis: '临安＝宋国都城。须用 `linan`——`lin_an` 与 `linan_city` 都只在隔离关，是死锚。',
  },
  {
    id: 'han',
    name: '汉国',
    kind: 'nation',
    anchorLocationId: 'lyl.location.luoyang',
    entryHint: '想插手汉国朝局，去洛都。',
    basis: '洛都＝汉国都城。须用 `lyl.location.luoyang`——atlas 孪生 `liuchao.location.luoyang` '
      + '在抵达关 `luoyang_cloud_secret` 不在场。',
  },
  {
    id: 'tang',
    name: '唐国',
    kind: 'nation',
    anchorLocationId: 'liuchao.location.changan',
    entryHint: '想插手唐国朝局，去长安。',
    basis: '长安＝唐国都城。须用 `liuchao.location.changan`——`lyg.location.changan`（名「长安城」）'
      + '在抽查的 live 关查无。第 30 关可达。',
  },
];

/**
 * 人物锚的门槛：**真的见过**才算接得到。
 * 相识账本四档 `rumored | introduced | encountered | joined`——只听过传闻不算，
 * 否则"世上有这么个人"就能开线，那又回到了模型说了算。
 */
export const LINE_ANCHOR_MIN_ACQUAINTANCE = 'encountered' as const;

/**
 * 当前接得到哪些二级线。纯函数：只看地点与相识账本，不读别的存档字段、不产生副作用。
 *
 * 只回答"接得到"，不回答"加入了"——见模块头纪律。返回的每条都带 `entryHint`，
 * 上层直接当待办显示即可，无需玩家确认。
 */
export function resolveAvailableLines(
  currentLocationId: string | undefined,
  ledger: AcquaintanceLedger | undefined,
): SecondaryLine[] {
  const threshold = rankOf(LINE_ANCHOR_MIN_ACQUAINTANCE);
  return SECONDARY_LINES.filter(line => {
    if (line.anchorLocationId) return Boolean(currentLocationId) && line.anchorLocationId === currentLocationId;
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
