/**
 * 玩家侧固定任务目标覆盖。
 *
 * 三级任务表中的 `reviewSummary` 是制作侧结果摘要；玩家目标默认读取 event.objective。
 * 本表只收经 Grok 全量筛查、Codex 逐条复审后仍需去剧透／去元语言的少数 event。
 * 它只改表现，不改 event、completion contract、hash、payload 或 Canon Rail 结果。
 */

export interface QuestObjectiveEventLike {
  id?: string;
  objective?: unknown;
}

export const FIXED_QUEST_OBJECTIVE_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  'lcq.event.s03_12': '进入这座无灯火的蛇彝村，先安置商队',
  'lcq.event.debut_lemingzhu': '看清商队里那个被扯掉头饰的新娘',
  'lcq.event.debut_panjinlian': '应对突然闯进来找乐明珠的人',
  'lcq.event.s07_debut_qinhui': '接住这个深夜来报北地有讯的文士',
  'lcq.event.s08_debut_xiaoyaoyi': '接待上门来访的少陵侯嫡子',
  'lyg.event.debut_bainichang': '看清赵归真引进静室的白衣女子',
  'lyg.event.debut_chengguang': '听清席上把江都王王后扯进哪段旧事',
  'lyg.event.debut_daiqisi': '看清佛堂废墟里被禁锢的那位妇人',
  'lyg.event.debut_jiawenhe': '听清战车上那位谋士对当前局势怎么说',
  'lyg.event.debut_lvzhi': '看清长秋宫前凤辇里坐着的人',
  'lyg.event.debut_qiyuxian': '应对翠微园门外阶下那位黑衣来客',
  'lyg.event.debut_quanyuji': '看清徐府内院勘查女尸的女捕头',
  'lyg.event.debut_shefuren': '看清卧室里挽鞭出场的黑衣侍奴',
  'lyg.event.debut_yangyuhuan': '看清当庭挽弓施射的那位戎装女子',
  'lyl.event.debut_jianyuji': '听清游婵转述的那封来信在说什么',
  'lyl.event.debut_jingli': '在庭院遇袭时看清小紫点破的那个人',
  'lyl.event.debut_yinfulan': '在宴席上把这个从五原来的人认清楚',
  'lyl.event.debut_yundanliu': '应付翻墙逃匿时身后那声喝问',
  'lyl.event.debut_yunruyao': '看清楼上独坐的那位披裘少女',
  'lyl.event.debut_zhaohede': '看清榻边喂药的人，再决定如何开口',
  'lyl.event.debut_zhuoyunjun': '把被点到的这个名字先问清楚',
  'lyg.event.highlight_banchao_lamb_leg': '看清班超如何压住这场议价',
  'lcq.event.blacksea_vault_split': '与孟非卿当面谈清银库这笔钱怎么分',
  'lcq.event.blank_letter_and_dagu': '当面核这封白纸信笺，并应对小紫当着阁罗说的话',
  'lcq.event.hongmiao_controlled': '看清红苗此刻的状态，并把苏荔从阁罗手里暂时保下',
  'lcq.event.jin_vacate_jiangzhou': '听清晋相就要腾出江州的定计',
  'lcq.event.pengyi_takeover': '向孟非卿请示鹏翼社与暗产此后由谁经营',
  'lcq.event.s04b_lingfei_baiyi_crisis_19': '从被巨浪淹没的竹楼里脱身',
  'lcq.event.s05b_10_slave_revolt_and_phoenix_change': '趁集会大乱，设法潜入鬼王宫',
  'lcq.event.s07_03_xiaozi_appears': '应对突然现身的小紫与被制住的局面',
  'lcq.event.s07_09_hengtang_ambush': '先应对横塘别墅突遭的围攻',
  'lcq.event.wuerlang_joins': '问清走投无路的武二郎是否随队南行',
  'lcq.event.wuerlang_slays_dagu': '撑住达古这一波围攻，看清武二郎能否打开缺口',
  'lcq.event.s05b_02_xiaozi_exposed': '质问小紫，把阿夕身上的异常问清楚',
  'lcq.event.s04_03': '听清乐明珠为什么要假扮新娘',
  'lcq.event.xiao_opens_resources': '当面听清萧遥逸代表星月湖要给你什么',
  'lcq.event.palace_haunting_rumor': '用灵飞镜窥探宫城，记下眼前异常',
  'lcq.event.palm_oath_shanghou': '与萧遥逸谈清对殇侯应持什么立场',
  'lyg.event.han_succession_09_beat': '在登基典仪中先稳住失控的真气',
  'lyg.event.mijing_superuser_roster': '触碰龙珠，听清它如何点验在场之人',
  'lyl.event.han_palace_endgame_10_beat': '赶到阙楼，看清刘建这一场如何收场',
  'lyl.event.han_power_vacuum': '打听宫里忽然乱起来的消息',
  'lyl.event.liujian_takes_nangong': '打听南宫方向忽然动兵的消息',
  'lyl.event.lvji_defiles_consort': '与赵合德藏在含光殿藻井上，屏息看清殿中变故',
  'lyl.event.s06_01b': '在藻井上藏住自己与赵合德，看清殿中变故',
  'lyl.event.rescue_yu_sisters': '从天井困兽处救出虞氏姐妹',
  'lyl.event.xingyin_beast_traps': '查明天井里困兽与被困者的情况',
  'lyl.event.siying_lane_saber_ambush': '在司营巷看清林冲买刀这一场',
  'lyl.event.xiaoyingzhou_lin_takes_seat': '到鹤林观，看清太乙真宗此刻由谁主事',
  'lyl.event.xiaoyingzhou_blacksea_trap_01_beat': '应对前往梵天寺途中的伏击',
  'lyl.event.xiaoyingzhou_blacksea_trap_04_beat': '在野猪林里先保住自己和身边的人',
  'lyl.event.xiaoyingzhou_blacksea_trap_08_beat': '在小瀛洲先应对眼前的杀局',
});

export function resolveFixedQuestObjective(event: QuestObjectiveEventLike | null | undefined): string {
  const eventId = String(event?.id || '').trim();
  if (eventId && FIXED_QUEST_OBJECTIVE_OVERRIDES[eventId]) {
    return FIXED_QUEST_OBJECTIVE_OVERRIDES[eventId];
  }
  return typeof event?.objective === 'string' ? event.objective.trim() : '';
}
