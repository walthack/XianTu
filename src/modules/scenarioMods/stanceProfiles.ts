import {entityAliases} from './namedEntities';
/**
 * 角色专属姿态档案（R3-9 增补）——让同一个好感档在不同角色身上长出不同的样子。
 *
 * 立项理由（2026-08-15 用户点名）：通用三档文案天然会把所有人拉向同一种"温柔化"，
 * 于是**小紫在高好感下会退化成普通少女恋爱脑**——而她的正典是"对天下绝对冷酷算计，
 * 唯独对程宗扬病娇般倾注占有"，那份深情从来不是依赖，是占有与掌控。
 *
 * 与 `relationStance` 的分工：
 *   · `relationStance` 给**五个维度的框架**（哪些方面可以变），全库通用；
 *   · 本模块给**这个人在该档位的具体形态**（变成什么样），逐角色人工正典。
 *   两者叠加注入，冲突时**本模块优先**——它更接近角色本人。
 *
 * 与 `voiceCards` 的分工：表演卡管声线与称谓（怎么说话），本模块管关系深浅如何改变
 * 投入程度（对玩家给到什么份上）。表演卡在声线上始终优先。
 *
 * 【为什么不按性别设外显度】用户最初的直觉是"女性角色更容易体现一点"。实测正典否定了
 * 这个规则：乐明珠（娇憨、小鸟依人、纯真依赖）高好感确实更外露，而月霜（傲娇、双标、
 * 正典明写"每次结束都想杀了他"）与凝羽（从不口头承认、冷言冷语字数极少）即便高好感
 * 也几乎不外露——三人同为女性，差异却在两极。**变量是角色本色，不是性别。**
 * 按性别一刀切会直接违反"本色不能破"这条最高原则，故不做。
 *
 * 纪律：小名单、人工正典、来源可溯。不给 315 人全铺；无专属档案的角色回落通用五维。
 */

import type { AffinityStance } from './affinityLadder';
import { CONTENT_PACKS } from '../contentPacks';
import type { PackEntityNames, PackStanceProfile } from '../contentPacks/coreFormats';

export interface StanceProfile {
  names: string[];
  /** 任何档位都不变的本色锚。姿态层不得改写这些。 */
  constant: string[];
  /** 该档位在此人身上的**具体形态**。缺省的档位表示无特殊形态，走通用五维。 */
  bands: Partial<Record<AffinityStance, string[]>>;
}

/**
 * 名单与选择标准。
 *
 * 首批六人＝**最容易被高/低好感写崩**，各代表一种崩法：小紫（深情→恋爱脑）／
 * 凝羽（口是心非→直白示爱）／月霜（敌意→和解）／吕雉（交易性顺从→情欲）／
 * 贾文和（冷硬→热络）／乐明珠（对照组：本色就外露）。
 *
 * 第二批（2026-08-15）按**事件出场频率**补 top 20 缺口，不按 tier 标签——registry 里
 * 172 人挂着"主要"，但实际出现在事件 `relatedCharacterIds` 里的只有 131 人，且分布极陡：
 * 主角 375 次之后是小紫 53、秦桧 25、凝羽 19、谢艺 16，到第 28 名只剩 5 次。姿态只在
 * 角色在场且被 focus 时注入（实测每轮 prompt 仅 2–3 份），为长尾角色铺档案产出的是
 * token 成本而非体验。
 *
 * 刻意不收录：**苏妲己**（收编弧线留白，裁定 #113，任何 agent 不得代为续写）。
 * 材料过薄不收：俞子元（registry 仅"忠诚/尽职/情感丰富"三词，写出来必然是通用套话）。
 *
 * 数据（B4 起）：49 条档案在人物包 `contentPacks/packs/characters/profiles.json` 的 `stance`，
 * 权威来源是那份 JSON；`TS_STANCE_PROFILES` 为空表，导出名与查询函数不变。
 */
export const TS_STANCE_PROFILES: StanceProfile[] = [];

/** 包档案的 names：实体别名按 entities 顺序展开（可重复，保留原表的重复别名），再接 extraNames（F0a）。 */
export function packEntityNames(entry: PackEntityNames): string[] {
  return [...entry.entities.flatMap(e => entityAliases(e.kind, e.id)), ...(entry.extraNames || [])];
}

/** TS 表在前、包档案按 catalog 顺序在后（formatStanceProfile 用 find 取第一条命中，顺序即优先级）。 */
export function mergeStanceProfiles(ts: readonly StanceProfile[], pack: readonly PackStanceProfile[]): StanceProfile[] {
  return [...ts, ...pack.map(entry => ({ names: packEntityNames(entry), constant: entry.constant, bands: entry.bands }))];
}

/** 全部姿态档案：TS 表加内容包 characterProfiles.stance（catalog 没有这一段时等于 TS 表）。 */
export const STANCE_PROFILES: StanceProfile[] = mergeStanceProfiles(TS_STANCE_PROFILES, CONTENT_PACKS.characterProfiles?.stance || []);

/**
 * 取该角色在当前档位的专属条款。无档案返回空串，调用方回落通用五维。
 */
export function formatStanceProfile(name: string, stance: AffinityStance): string {
  const profile = STANCE_PROFILES.find(item => item.names.includes(name));
  if (!profile) return '';
  const band = profile.bands[stance] || [];
  const lines = [
    ...profile.constant.map(line => `  · 本色（任何档位不变）：${line}`),
    ...band.map(line => `  · 本档形态：${line}`),
  ];
  if (!lines.length) return '';
  return [`  【${name}·本人姿态形态·优先于上面的通用条款】`, ...lines].join('\n');
}

export function hasStanceProfile(name: string): boolean {
  return STANCE_PROFILES.some(item => item.names.includes(name));
}
