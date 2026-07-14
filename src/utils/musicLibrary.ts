import themeUrl from '@/assets/music/01-theme-cangmang.mp3';
import dailyUrl from '@/assets/music/02-daily-shijing.mp3';
import exploreUrl from '@/assets/music/03-explore-mijing.mp3';
import courtUrl from '@/assets/music/04-court-anyong.mp3';
import dangerUrl from '@/assets/music/04b-court-anliu.mp3';
import battleUrl from '@/assets/music/05-battle-aozhan.mp3';
import battleMatouqinUrl from '@/assets/music/05-battle-matouqin.mp3';
import arcTightUrl from '@/assets/music/05-battle-matouqin-arc-tight.mp3';
import khoomeiUrl from '@/assets/music/05-battle-matouqin-khoomei.mp3';
import battleWuxiaUrl from '@/assets/music/05-battle-wuxia.mp3';
import nihonUrl from '@/assets/music/05-battle-nihon.mp3';
import battlePipaUrl from '@/assets/music/05-battle-pipa.mp3';
import climaxUrl from '@/assets/music/07-climax-juezhan-vocal.mp3';
import horrorUrl from '@/assets/music/06-horror-moying.mp3';
import emotionUrl from '@/assets/music/08-emotion-matouqin.mp3';
import aspireUrl from '@/assets/music/09-aspire-zhuangzhi.mp3';
import intrigueUrl from '@/assets/music/11-intrigue-quanmou.mp3';
import lamentUrl from '@/assets/music/12-lament-wange.mp3';
import sensualUrl from '@/assets/music/13-sensual-aimei.mp3';

export type MusicMood =
  | 'theme'
  | 'daily'
  | 'explore'
  | 'court'
  | 'danger'
  | 'battle'
  | 'horror'
  | 'climax'
  | 'emotion'
  | 'aspire'
  | 'intrigue'
  | 'lament'
  | 'sensual'
  | 'blacksea';

export interface MusicTrack {
  id: MusicMood;
  title: string;
  url: string;
}

export interface ScenarioMusicEvent {
  id?: string;
  name?: string;
  description?: string;
  summary?: string;
  axisBeat?: string;
}

// 每个 mood 可挂多首变体；进入该 mood 时随机挑一首（mood 不变则不打断，见 App.vue）。
export const MUSIC_TRACKS: Record<MusicMood, MusicTrack[]> = {
  theme: [{ id: 'theme', title: '苍茫·仙途主题', url: themeUrl }],
  daily: [{ id: 'daily', title: '江湖日常·市井', url: dailyUrl }],
  explore: [{ id: 'explore', title: '秘境探幽', url: exploreUrl }],
  court: [{ id: 'court', title: '朝堂公务/集会', url: courtUrl }],
  danger: [
    { id: 'danger', title: '暗流·危机', url: dangerUrl },
    { id: 'danger', title: '暗流·马头琴弧', url: arcTightUrl },
    { id: 'danger', title: '暗流·琵琶', url: battlePipaUrl },
  ],
  battle: [
    { id: 'battle', title: '斗法·国风交响', url: battleUrl },
    { id: 'battle', title: '斗法·马头琴', url: battleMatouqinUrl },
    { id: 'battle', title: '斗法·快节奏武侠', url: battleWuxiaUrl },
  ],
  horror: [{ id: 'horror', title: '魔影·尸氛', url: horrorUrl }],
  climax: [
    { id: 'climax', title: '决战·惊变', url: climaxUrl },
    { id: 'climax', title: '决战·呼麦万马', url: khoomeiUrl },
    { id: 'climax', title: '决战·马头琴弧', url: arcTightUrl },
  ],
  emotion: [{ id: 'emotion', title: '情牵·别离', url: emotionUrl }],
  aspire: [{ id: 'aspire', title: '壮志·砺行', url: aspireUrl }],
  intrigue: [
    { id: 'intrigue', title: '诡谲·权谋智斗', url: intrigueUrl },
    { id: 'intrigue', title: '诡谲·马头琴弧', url: arcTightUrl },
  ],
  lament: [{ id: 'lament', title: '悲壮·牺牲挽歌', url: lamentUrl }],
  sensual: [{ id: 'sensual', title: '暧昧·欲望张力', url: sensualUrl }],
  blacksea: [{ id: 'blacksea', title: '塞外·东瀛/黑魔海', url: nihonUrl }],
};

const CHAPTER_MOOD_MAP: Record<string, MusicMood> = {
  'lcq.chapter.stage_01': 'theme',
  'lcq.chapter.stage_02': 'daily',
  'lcq.chapter.stage_03': 'court',
  'lcq.chapter.stage_04': 'battle',
  'lcq.chapter.stage_05': 'explore',
  'lcq.chapter.stage_06': 'climax',

  'lyl.chapter.jiangzhou_retreat': 'daily',
  'lyl.chapter.luoyang_cloud_secret': 'court',
  'lyl.chapter.luoyang_coup': 'climax',
  'lyl.chapter.lin_an_bridge_intel': 'court',

  'lyg.chapter.changgan_begins': 'daily',
  'lyg.chapter.dingtao_beijing': 'court',
  'lyg.chapter.liangzhou_league': 'battle',
  'lyg.chapter.mijing_rumen': 'explore',
};

const EVENT_MOOD_MAP: Record<string, MusicMood> = {
  'lcq.event.s01_01': 'theme',
  'lcq.event.s01_02': 'danger',
  'lcq.event.s01_03': 'battle',
  'lcq.event.s01_04': 'battle',
  'lcq.event.s01_05': 'aspire',
  'lcq.event.s01_06': 'emotion',

  'lcq.event.s02_01': 'aspire',
  'lcq.event.s02_02': 'climax',
  'lcq.event.s02_03': 'danger',
  'lcq.event.s02_04': 'danger',
  'lcq.event.s02_05': 'battle',
  'lcq.event.s02_06': 'court',

  'lcq.event.s03_02': 'danger',
  'lcq.event.s03_03': 'danger',
  'lcq.event.s03_04': 'emotion',

  'lcq.event.s04_01': 'danger',
  'lcq.event.s04_03': 'aspire',
  'lcq.event.s04_06': 'emotion',

  'lcq.event.s03b_snake_flower_bridge_07': 'danger',
  'lcq.event.s04b_lingfei_baiyi_crisis_05': 'explore',
  'lcq.event.s04b_lingfei_baiyi_crisis_14': 'court',
  'lcq.event.s04b_lingfei_baiyi_crisis_01': 'danger',
  'lcq.event.s04b_lingfei_baiyi_crisis_04': 'explore',

  'lcq.event.s05_03': 'explore',
  'lcq.event.s05_05': 'battle',
  'lcq.event.s05_08': 'battle',
  'lcq.event.s06_01': 'climax',
  'lcq.event.s06_03': 'emotion',
  'lcq.event.s09_04_weaving_trade': 'court',
  'lcq.event.s10_01_jiangzhou_order': 'court',
  'lcq.event.s12_14_chenxing_appears': 'danger',
  'lcq.event.s12_17_shanghou_stays': 'aspire',
  'lcq.event.s11_04_xingyue_appears': 'aspire',

  'lyg.event.s01_01': 'battle',
  'lyg.event.s01_08': 'court',
  'lyg.event.s02_09': 'aspire',
  'lyg.event.release_jingnian': 'court',
  'lyg.event.s03_01': 'daily',
  'lyg.event.s03_04': 'danger',
  'lyg.event.s06_03': 'emotion',
  'lyg.event.s06_07': 'aspire',

  'liuchao.event.final_preparations': 'aspire',

  'lyl.event.s01_01': 'danger',
  'lyl.event.s01_02': 'daily',
  'lyl.event.s01_03': 'battle',
  'lyl.event.s01_04': 'court',
  'lyl.event.s01_05': 'danger',
  'lyg.event.s02_04': 'danger',
  'lyl.event.s05_05': 'danger',
  'lyl.event.yin_fulan_aid': 'aspire',
  'lyl.event.taiquan_sacred_fruit_08': 'battle',
  'lyl.event.taiquan_afterfall_06_beat': 'emotion',
  'lyl.event.taiquan_sacred_fruit_07': 'daily',
  'lyl.event.find_exit': 'explore',
  'lyl.event.xiaoyingzhou_blacksea_trap_02_beat': 'court',
  'lyl.event.xiaoyingzhou_blacksea_trap_06_beat': 'danger',
};

const EVENT_MOOD_PRIORITY: MusicMood[] = ['climax', 'horror', 'lament', 'blacksea', 'battle', 'danger', 'intrigue', 'explore', 'court', 'sensual', 'emotion', 'aspire', 'daily', 'theme'];

const EVENT_TEXT_MOOD_RULES: Array<[RegExp, MusicMood]> = [
  [/决战|终局|终战|惊变|甘露|政变|宫变|弑君|弑母|夺舍|暴毙|驾崩|真身|八臂|龙吟|单骑破阵|长秋宫守卫战|吕巨君自焚|攻入/i, 'climax'],
  [/阴煞|魔影|血符|发蛊|血虎|魔化|尸氛|失序|屠村痕迹|惨案|女尸|枯骨|深井|招魂|疑冢|金身法王|返老/i, 'horror'],
  [/自爆|自尽殉|以身殉|殉国|殉道|阵亡|战殁|马革裹尸|忠烈|忠魂|挽歌|哀荣|壮烈殉|全军覆没/i, 'lament'],
  [/东瀛|倭|忍者|塞外|鲛人|剑玉姬|小瀛洲/i, 'blacksea'],
  [/激战|鏖战|战斗|伏击|袭击|遇袭|围杀|围攻|攻占|守卫战|破阵|追击|追杀|刺杀|斩杀|击杀|救援|乱战|反击|突围|突袭|奇袭|夺宝|争夺|混战|杀局|下毒乱战|屠杀|被屠|斩乡兵|救下|救险|劫走|比武|之死|劫掠|暗战|火攻/i, 'battle'],
  [/危机|暗流|疑云|阴谋|陷阱|设伏|下毒|中毒|剧毒|毒杀|毒计|逼近|警告|威胁|暴露|败退|被困|危局|失火|火计|上钩|被查|对峙|劫持|挟持|压力|黑魔海逼近|落棋|夜袭|受制|压制|戒严|报警|失踪|刺配|生变|密约谈崩|众叛|审问|调动.*围|认出|杀.*议|夺取.*兵权|怀疑/i, 'danger'],
  [/权谋|算计|布局|谋划|设局|挑拨|离间|栽赃|嫁祸|操控|操盘|周旋|收买|拉拢|勾结|密谋|智斗|城府|做局|下套|借刀|反间/i, 'intrigue'],
  [/秘境|古阵|神庙|海底|迷窟|探索|侦察|潜入|秘道|机关|地宫|洞穴|入口|寻找|线索|情报|太泉|魔墟|迷楼|钥匙|调查|追索|旧案|旧事|复盘/i, 'explore'],
  [/朝堂|宫廷|议事|商议|谈判|交易|买官|卖官|注册|情报收集|皇城司|诏|口谕|股东大会|渠道|名单|召见|密谈|公务|集会|高俅|西邸|吏部|工部|拜访|军资|粮战|粮仓|粮战令|供认|审判|分权|宗室|帝陵|拥立|赐死|兵器生意|见吕雉/i, 'court'],
  [/暧昧|情欲|欲望|春宵|云雨|媚术|媚惑|勾引|诱惑|风月|承欢|侍寝|采补|欢好|交合|榻上|身体控制/i, 'sensual'],
  [/重逢|私奔|托付|送葬|痛哭|悲|哀|安抚|战后|余波|重伤|寒毒|相雅|凝羽.*双修|月霜强取|双修|输血救|做媒|病线|收尾/i, 'emotion'],
  [/传功|突破|启程|集结|准备|壮志|砺行|筑基|晋级|出发|离开.*赴|同行|合作|联手|计划完成|护月霜|坚城|星月湖现身/i, 'aspire'],
  [/日常|市井|抵达|安顿|初遇|相识|欢迎|会面|饮酒|游|农居|瓦棚|拜祭|初探/i, 'daily'],
];

const PATTERN_MOOD_RULES: Array<[RegExp, MusicMood]> = [
  [/stage_03b_snake_flower_bridge|stage_04b_lingfei_baiyi_crisis/i, 'battle'],
  [/stage_05b|ganlu_aftershock/i, 'horror'],
  [/stage_07_qingyuan_jiankang|lin_an|taiquan_afterfall|changgan_interlude|han_succession|ganlu_crisis|manipulation|power_gathering/i, 'court'],
  [/stage_08_jiankang_coup|stage_09_trade_and_escape|stage_10_jiangzhou_shadow_war|stage_11_lieshan_battle|stage_12_jiangzhou_counterwar/i, 'battle'],
  [/taiquan_core_conflict|escape_ant_hill|yin_fulan|pan_jinlian|arrival_in_canglan|taiquan_exploration|alliance_and_conflict/i, 'explore'],
  [/xiaoyingzhou_blacksea_trap/i, 'blacksea'],
  [/hunt_for_fruit|taiquan_sacred_fruit|shixiang|ambush|multiple_enemies|final_move/i, 'battle'],
  [/buddhist_conspiracy|shituolin_endgame|han_palace_endgame|luoyang_coup|final_showdown/i, 'climax'],
  [/arrival|retreat|begins/i, 'daily'],
];

function normalizeEventText(event: ScenarioMusicEvent): string {
  return [event.id, event.name, event.description, event.summary, event.axisBeat]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
}

export function resolveMusicMoodForChapter(chapterId: string | null | undefined): MusicMood {
  if (!chapterId) return 'theme';
  const exactMood = CHAPTER_MOOD_MAP[chapterId];
  if (exactMood) return exactMood;

  return PATTERN_MOOD_RULES.find(([pattern]) => pattern.test(chapterId))?.[1] || 'daily';
}

// mood 的优先级序号（越小越高），供切换防抖判断升/降档。
export function musicMoodRank(mood: MusicMood): number {
  const rank = EVENT_MOOD_PRIORITY.indexOf(mood);
  return rank === -1 ? EVENT_MOOD_PRIORITY.length : rank;
}

// L0.5 正文规则：匹配最新一轮 AI 叙事正文，捕捉事件元数据必然缺失的"玩家自发行为"
// （双修/调查/疗愈/休整）。只放高特异性词；战斗/危机类宽词不进正文层——
// 事件元数据已覆盖，正文误命中代价高。数组顺序即命中优先。
const NARRATIVE_MOOD_RULES: Array<[RegExp, MusicMood]> = [
  [/双修|欢好|云雨|侍寝|春宵|交合|承欢|缠绵|宽衣解带/i, 'sensual'],
  [/疗伤|施针|调养|温元丹|把脉|敷药|上药|包扎/i, 'emotion'],
  [/调查|查探|勘察|搜查|搜证|排查|追查线索|翻检/i, 'explore'],
  [/休整|歇息|安歇|设宴|宴饮|沐浴|梳洗/i, 'daily'],
];

export function resolveMoodFromNarrative(narrative: string | null | undefined): MusicMood | null {
  if (!narrative) return null;
  return NARRATIVE_MOOD_RULES.find(([pattern]) => pattern.test(narrative))?.[1] || null;
}

// 分层判定（信号新鲜度：正文=当下这一拍 > 事件元数据 > 章节）：
// L1   人工锚点 override（EVENT_MOOD_MAP）无条件最高；
// L0.5 最新叙事正文的高特异性规则（玩家自发行为：双修/调查/疗愈/休整）；
// L2   正则推出的事件 mood 与章节 mood 一起按优先级竞争
//      ——避免决战章节(climax)被普通战斗事件(battle)拉低（鬼巫王案例）。
export function resolveMusicMoodForScenario(
  chapterId: string | null | undefined,
  activeEvents: ScenarioMusicEvent[] = [],
  latestNarrative?: string | null,
): MusicMood {
  const exactMoods: MusicMood[] = [];
  const ruleMoods: MusicMood[] = [];

  for (const event of activeEvents) {
    if (event.id && EVENT_MOOD_MAP[event.id]) {
      exactMoods.push(EVENT_MOOD_MAP[event.id]);
      continue;
    }
    const text = normalizeEventText(event);
    const mood = text ? EVENT_TEXT_MOOD_RULES.find(([pattern]) => pattern.test(text))?.[1] : null;
    if (mood) ruleMoods.push(mood);
  }

  if (exactMoods.length > 0) {
    return EVENT_MOOD_PRIORITY.find(priority => exactMoods.includes(priority)) || exactMoods[0];
  }

  const narrativeMood = resolveMoodFromNarrative(latestNarrative);
  if (narrativeMood) return narrativeMood;

  const chapterMood = resolveMusicMoodForChapter(chapterId);
  const candidates = [...ruleMoods, chapterMood];
  return EVENT_MOOD_PRIORITY.find(priority => candidates.includes(priority)) || chapterMood;
}

// 从该 mood 的曲库随机挑一首（多首变体时降低听觉疲劳）。
export function pickTrackForMood(mood: MusicMood): MusicTrack {
  const variants = MUSIC_TRACKS[mood];
  return variants[Math.floor(Math.random() * variants.length)];
}
