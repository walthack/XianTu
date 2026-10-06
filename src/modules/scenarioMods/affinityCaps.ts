import {entityAliases} from './namedEntities';
import { canonicalIdentityName } from './ledger/affinityIdentity';
/**
 * 好感天花板（R3-9 规格 §3.5 待拍板项 C，2026-08-15 用户批准）。
 *
 * 解决两个不同的问题，但用同一套机制——因为它们本质都是"这个人现在不可能跟你更近"：
 *
 *   1. **立场先于情感**：吕雉在飞羽族拿到实质保障前、义姁在太后仍是她主君时，
 *      好感再刷也不会把她们变成你的人。她们的忠诚有明确的排序，感情排在后面。
 *   2. **未触发加入事件**：惊理、蛇夫人这类**非剧情承重**角色，正典里都有明确的加入
 *      经过（registry `joining` 字段）。事件没发生就不该"刷好感刷成自己人"——
 *      用户口径：**没有触发的话不做入队**。
 *
 * 与 `affinityLadder` 的分工：阶梯说"这个数值是什么档"，本模块说"这个数值最高能到几"。
 * cap 由 `createAffinityCommandGate` 在命令层执行——模型加好感时超出部分直接削掉，
 * 而不是让数值涨上去再在表现层假装不亲近（那样存档与叙事会脱节）。
 *
 * 解除方式：**看关系标签**。当 `与玩家关系` 已表明其归属（阵营/后宫/心腹等），
 * 说明正典事件已经发生，cap 自动失效。不另建 flag，因为标签本来就是这件事的既有载体。
 */

import { AFFINITY_TIERS } from './affinityLadder';
import { JOINED_RELATION_RE as SETTLED_RELATION_RE } from './acquaintanceLedger';

export interface AffinityCap {
  names: string[];
  /** 好感上限（含）。取阶梯档位上界，不要写任意数字。 */
  cap: number;
  /** 为什么有上限——注入 prompt，让模型知道该怎么演这份距离感。 */
  reason: string;
  /** 什么条件解除。用于 prompt 说明与人工检索，不参与运行时判断。 */
  liftedBy: string;
}

const tierMax = (id: string) => AFFINITY_TIERS.find(t => t.id === id)!.max;

// 关系标签一旦表明归属，即视为正典加入事件已发生，cap 失效。
// 判据引用相识账本的唯一定义——此前本文件自带一份，与账本那份各自漏词（都漏了「主仆」）。

export const AFFINITY_CAPS: readonly AffinityCap[] = [
  // —— 立场先于情感：忠诚有明确排序，感情排在后面 ——
  {
    names: [...entityAliases("character","liuchao.character.lv_zhi")],
    cap: tierMax('acquainted'),
    reason: '她的唯一动机锚是飞羽族存续；在你被确认为对族群有实质价值之前，一切亲近都只是权衡中的选项。',
    liftedBy: '飞羽族存续获得实质保障（非口头承诺）后，由剧情裁定解除。',
  },
  {
    names: [...entityAliases("character","liuchao.character.yi_xin")],
    cap: tierMax('acquainted'),
    reason: '她是医者，主君是太后而不是你；医事上可以尽心，私人关系到此为止。',
    liftedBy: '其与太后的从属关系发生正典变更后。',
  },
  {
    names: [...entityAliases("character","liuchao.character.hu_fu_ren")],
    cap: tierMax('acquainted'),
    reason: '坚守主仆名分、绝不逾矩攀附是她的原则；忠于太后，危及太后利益者必除。',
    liftedBy: '太后一线的政治格局发生正典变更后。',
  },
  {
    names: [...entityAliases("character","liuchao.character.jian_yu_ji")],
    cap: tierMax('acquainted'),
    reason: '黑魔海高层，与你和小紫是隔空博弈的对手；棋逢对手不等于站到你这边。',
    liftedBy: '亲密线属正典留白，未开启前不解除（不得代为补全）。',
  },
  {
    names: [...entityAliases("character","liuchao.character.qi_yu_xian")],
    cap: tierMax('trusted'),
    reason: '曾以双面间谍身份混入，被小紫看穿反制后才被收服——这段前史让她的位置始终隔一层。',
    liftedBy: '收服之后的长期共事可继续推进，但不会抹掉前史。',
  },
  {
    names: [...entityAliases("character","liuchao.character.su_daji")],
    cap: tierMax('acquainted'),
    reason: '与你是「驯兽师与妖魔」的拉锯，不是从属；她随时在算这笔账划不划算。',
    liftedBy: '收编弧线属正典留白（裁定 #113），不得续写、不得据此解除。',
  },
  {
    names: [...entityAliases("character","lyg.character.np060")],
    cap: tierMax('trusted'),
    reason: '拜火教光明圣母，教门利益永远是她的第一顺位；她是合作者，不是你的人。',
    liftedBy: '拜火教与你的结盟关系深化后可再议。',
  },
  {
    names: [...entityAliases("character","liuchao.character.a_jiman_bana"), ...entityAliases("character","liuchao.character.a_jiman_bana"), ...entityAliases("character","liuchao.character.a_jiman_bana")],
    cap: tierMax('trusted'),
    reason: '你撕毁卖身契还了她自由，她因此敬重你——但她的路在自己族人那边，正典中她其后离开去寻家园。',
    liftedBy: '不解除；她不是留下侍奉的角色。',
  },
  {
    names: [...entityAliases("character","lcq.character.yue_shuang")],
    cap: tierMax('trusted'),
    reason: '正典明写关系不因次数增加而缓和，事后仍动杀心；僵持是这段关系的稳定态。',
    liftedBy: '不解除——软化即 OOC。',
  },
  {
    names: [...entityAliases("enemy","lcq.enemy.gui_wu_wang")],
    cap: tierMax('wary'),
    reason: '主线敌人，自视为南荒救世主，视他人为需要被赐予秩序的一类；不存在与你交好的路径。',
    liftedBy: '不解除。',
  },

  // —— 未触发加入事件：正典有明确加入经过，事件没发生就不该刷成自己人 ——
  {
    names: [...entityAliases("character","liuchao.character.jing_li")],
    cap: tierMax('stranger'),
    reason: '尚未归入你的阵营。她服从的是"绝对强者"而非交情，认主之前宁受辱也不开口。',
    liftedBy: '正典加入事件：清羽记第三章「猛虎出柙」被小紫用计擒住后归入阵营。',
  },
  {
    names: [...entityAliases("character","lyg.character.she_fu_ren"), ...entityAliases("character","lyg.character.she_fu_ren")],
    cap: tierMax('stranger'),
    reason: '尚未投奔。此前她是黑魔海边缘的老鸨兼情报贩子，见风使舵是本能，交情不构成理由。',
    liftedBy: '正典加入事件：见你崛起到能与剑玉姬等分庭抗礼后，带姁奴与秘药财富主动投奔。',
  },
  {
    names: [...entityAliases("character","liuchao.character.quan_yu_ji"), ...entityAliases("character","liuchao.character.quan_yu_ji")],
    cap: tierMax('stranger'),
    reason: '尚未被收服。此前她是六扇门派来伪装教坊女子的监视者，立场在对面。',
    liftedBy: '正典加入事件：被收服、魂丹被掌控之后。',
  },
] as const;

/**
 * 取该角色当前的好感上限。返回 `null` 表示无上限。
 *
 * `relationLabel` 传入存档里的 `与玩家关系`：一旦标签已表明归属，说明正典加入事件
 * 已经发生，cap 自动失效——避免"人都进后宫了好感还卡在陌路"这种自相矛盾。
 */
export function affinityCapFor(name: string, relationLabel?: string, displayName?: string): AffinityCap | null {
  const entry = AFFINITY_CAPS.find(item => item.names.includes(canonicalIdentityName(name) || displayName || name));
  if (!entry) return null;
  if (relationLabel && SETTLED_RELATION_RE.test(relationLabel)) return null;
  return entry;
}

/** 供 prompt 注入：说明这份距离感的由来，让模型演得出而不是硬顶着。 */
export function formatAffinityCap(name: string, relationLabel?: string): string {
  const entry = affinityCapFor(name, relationLabel);
  if (!entry) return '';
  const tier = AFFINITY_TIERS.find(t => entry.cap >= t.min && entry.cap <= t.max);
  return `  【关系上限】当前最多到「${tier?.name || ''}」（好感 ${entry.cap}）：${entry.reason}再多的好意也只会停在这条线上——不得写成她已归属于你，也不得让她主动越过这层。`;
}
