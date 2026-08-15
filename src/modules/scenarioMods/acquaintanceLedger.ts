/**
 * 相识账本（R3-12）——"玩家有没有在某个节点认识这个人"的持久事实。
 *
 * 规格：docs/R3-12-ACQUAINTANCE-LEDGER-DRAFT-2026-08-15.md
 *
 * 立项理由：`stage-projection` 是**原著轨迹的静态快照**，它假定玩家走了原著线。
 * 于是孙寿在燕歌的 role 写死为「程宗扬内宅侍婢」——哪怕玩家整条云龙线从未见过她。
 * 而 R2-0 分歧账本整套就是为"玩家可以不走原著"建的，两者在设计上互相冲突。
 *
 * 既有的 `collectIntroducedCharacterIds` 不能替代本账本，三个限制：
 *   ① 不持久化——只写进 `createScenarioPromptState` 产出的 structuredClone 副本；
 *   ② 不跨关——runtime 与两个 initializer 都不带它，切关后从零重推；
 *   ③ 不是相遇记录——推导自"事件是否激活/完成"，记的是剧情走到哪、不是玩家见过谁。
 *
 * 本账本**持久化进存档、跨关继承**（照 divergences 的快照模式）。
 */

/**
 * 相识程度。**刻意分级而非布尔**：传闻找人那套闭环需要"听说过"也能记账，
 * 否则玩家循线索去找一个素未谋面的人时，账本无从表达他"知道有这么个人"。
 */
export type AcquaintanceKind = 'rumored' | 'introduced' | 'encountered' | 'joined';

/** 相遇时对方的处境。由世界状态推导，**不由 LLM 声明**。 */
export type AcquaintanceCircumstance =
  | 'in_power' | 'neutral' | 'fallen' | 'captive' | 'fugitive' | 'deceased';

const KIND_RANK: Record<AcquaintanceKind, number> = {
  rumored: 1,
  introduced: 2,
  encountered: 3,
  joined: 4,
};

export interface AcquaintanceRecord {
  characterId: string;
  name: string;
  kind: AcquaintanceKind;
  /** 首次达到当前程度的时点。升级时更新，降级不发生。 */
  atStageId?: string;
  atEventId?: string;
  atWorldTurn?: number;
  /**
   * 相遇时对方的处境。孙寿在吕氏当权时是襄城君、倒台后是死囚——
   * 同一个人，两条完全不同的关系曲线。
   * ⚠️ 本轮**不做自动推导**（需与分歧账本联动），字段先留位。
   */
  circumstance?: AcquaintanceCircumstance;
  /** 相遇当时她是谁——不是她后来是谁。 */
  identityAtMeeting?: string;
  /** 旧档回填的近似记录，证据强度低于实时写入。 */
  backfilled?: boolean;
}

export type AcquaintanceLedger = Record<string, AcquaintanceRecord>;

/**
 * 关系标签表明**已归入阵营/后宫** → 视为 `joined`。
 *
 * 这是全项目该判据的**唯一定义**，`affinityCaps` 的 cap 解除也引用它——此前两处各写一份，
 * 且都漏了「主仆」（存档里小紫的实际标签正是它）。
 *
 * 刻意**不含**「朋友／战友／兄弟／合作／伙伴」：那些是友好但独立的关系，
 * 武二郎是兄弟不是部下，谢艺是战友不是家臣。他们算 `encountered`，不算归属。
 */
export const JOINED_RELATION_RE = /后宫|侍妾|妾室|侍婢|侍奴|女奴|内宅|主仆|主从|心腹|部属|下属|属下|奴婢|道侣|伴侣|夫妻|夫君|情人|效忠|臣服|投靠|归顺/;

export function rankOf(kind: AcquaintanceKind): number {
  return KIND_RANK[kind] || 0;
}

/**
 * 只升不降地写入一条记录。
 *
 * 相识是**单调**的：见过就是见过，后来疏远也不会变回没见过。降级只可能来自数据错误，
 * 所以这里直接忽略更低的程度，而不是覆盖。
 */
export function upgradeAcquaintance(ledger: AcquaintanceLedger, record: AcquaintanceRecord): boolean {
  const existing = ledger[record.characterId];
  if (existing && rankOf(existing.kind) >= rankOf(record.kind)) return false;
  ledger[record.characterId] = existing
    ? { ...existing, ...record, backfilled: existing.backfilled && record.backfilled }
    : { ...record };
  return true;
}

export function acquaintanceOf(ledger: AcquaintanceLedger | undefined, characterId: string): AcquaintanceRecord | undefined {
  return ledger?.[characterId];
}

/** 按名字查（存档关系表以名字为键，故两种查法都要）。 */
export function acquaintanceByName(ledger: AcquaintanceLedger | undefined, name: string): AcquaintanceRecord | undefined {
  if (!ledger || !name) return undefined;
  return Object.values(ledger).find(record => record.name === name);
}

/** 是否已实际见过（`encountered` 及以上）。仅"听说过"不算。 */
export function hasMet(ledger: AcquaintanceLedger | undefined, name: string): boolean {
  const record = acquaintanceByName(ledger, name);
  return !!record && rankOf(record.kind) >= KIND_RANK.encountered;
}

/** 是否已归入阵营（`joined`）。这是 affinityCaps 解除上限的判据。 */
export function hasJoined(ledger: AcquaintanceLedger | undefined, name: string): boolean {
  const record = acquaintanceByName(ledger, name);
  return record?.kind === 'joined';
}

export interface LedgerSyncInput {
  ledger: AcquaintanceLedger;
  stageId?: string;
  worldTurn?: number;
  /** 角色 id → 名字（来自 canon.characters）。 */
  characterNames: Map<string, string>;
  /** 已激活/已完成事件的 relatedCharacterIds。 */
  metCharacterIds?: Iterable<string>;
  /** 开场声明的角色。 */
  featuredCharacterIds?: Iterable<string>;
  /** 存档 社交.关系：名字 → { 与玩家关系 }。用于判定 joined。 */
  relations?: Record<string, unknown>;
  /** 标记为回填（旧档首次载入时用）。 */
  backfilled?: boolean;
  /**
   * 玩家自己的名字，用于排除主角。
   * 主角不该出现在"我认识谁"的账本里——他就是那个"我"。
   * （真机实测漏过一次：程宗扬以 encountered 入账。）
   */
  playerName?: string;
}

/**
 * 从运行时状态同步账本。**只增不减**，且只补更高的程度。
 *
 * 注意事件推导的局限：它记的是"剧情走到哪"。事件被 void（玩家用别的方式绕过）时，
 * 相关角色未必真的见过——这是回填与事件推导共有的近似性，故 `backfilled` 会标出来。
 */
export function syncAcquaintanceLedger(input: LedgerSyncInput): number {
  const { ledger, characterNames } = input;
  let changed = 0;

  const note = (characterId: string, kind: AcquaintanceKind) => {
    const name = characterNames.get(characterId);
    if (!name) return;
    if (input.playerName && name === input.playerName) return;
    if (upgradeAcquaintance(ledger, {
      characterId,
      name,
      kind,
      atStageId: input.stageId,
      atWorldTurn: input.worldTurn,
      backfilled: input.backfilled,
    })) changed += 1;
  };

  for (const id of input.featuredCharacterIds || []) note(id, 'encountered');
  for (const id of input.metCharacterIds || []) note(id, 'encountered');

  // 存档关系表：有条目即至少见过；标签表明归属则升到 joined。
  if (input.relations && typeof input.relations === 'object') {
    const idByName = new Map<string, string>();
    for (const [id, name] of characterNames) if (!idByName.has(name)) idByName.set(name, id);
    for (const [key, npc] of Object.entries(input.relations)) {
      if (!npc || typeof npc !== 'object') continue;
      const name = String((npc as { 名字?: unknown }).名字 || key);
      const characterId = idByName.get(name) || idByName.get(key);
      if (!characterId) continue;
      const label = String((npc as { 与玩家关系?: unknown }).与玩家关系 || '');
      note(characterId, JOINED_RELATION_RE.test(label) ? 'joined' : 'encountered');
    }
  }
  return changed;
}

/** 供 prompt 注入：说明玩家与此人的相识程度，避免模型按原著快照假定熟识。 */
export function formatAcquaintance(ledger: AcquaintanceLedger | undefined, name: string): string {
  const record = acquaintanceByName(ledger, name);
  if (!record) {
    return `  【素未谋面】玩家从未见过${name}，也未听说过。不得以旧识、故人或既有交情的方式相处；对方同样不认识玩家。`;
  }
  if (record.kind === 'rumored') {
    return `  【仅闻其名】玩家只听过关于${name}的传闻，**尚未见过本人**。不得写成旧识；初次照面应有初次照面的样子。`;
  }
  if (record.kind === 'introduced') {
    return `  【一面之缘】玩家与${name}只是照过面或被引荐过，没有实质交往。交情尚浅，不得写成熟稔。`;
  }
  return '';
}
