export interface ScenarioModSkill {
  id: string;
  name: string;
  description?: string;
  type?: string;
  effects?: string[];
}

/** 六司加成(原版后天六司键)。 */
export interface ScenarioModSixFaculties {
  根骨?: number; 灵性?: number; 悟性?: number; 气运?: number; 魅力?: number; 心性?: number;
}
/** 装备增幅(运行时直接映射到原版 装备增幅 AttributeBonus)。 */
export interface ScenarioModAttributeBonus {
  气血上限?: number;
  灵气上限?: number;
  神识上限?: number;
  后天六司?: ScenarioModSixFaculties;
}
/** 数值加成：与装备 attributeBonus 同构，功法另可带修炼速度加成（口径见 game-numbers.techniques.cultivationSpeedBonus）。 */
export interface ScenarioModBonus extends ScenarioModAttributeBonus {
  修炼速度加成?: number;
}

/** 生效方式（词表见 mod-kit/entity-catalog/effect-tags.json）：consumable 使用即生效，equipped 装备期间生效，active 功法运行期间生效。 */
export type ScenarioModActivation = 'consumable' | 'equipped' | 'active';

export interface ScenarioModTechnique {
  id: string;
  name: string;
  description?: string;
  grade?: string;
  skillIds?: string[];
  /** 缺省即 active（目录里必填，自定义 mod 可省）。 */
  activation?: ScenarioModActivation;
  /** 效果标签，与道具共用词表。 */
  effectTags?: string[];
  /** 机制数值：与装备 attributeBonus 同构（目前是按品级生成的占位值）。 */
  bonus?: ScenarioModBonus;
  /** 可同时装备多部的功法；缺省取 game-numbers.techniques.allowMultiEquipDefault。 */
  allowMultiEquip?: boolean;
}

export type ScenarioModItemType = 'weapon' | 'armor' | 'consumable' | 'material' | 'other';

/** 使用物品时挂到目标身上的状态（状态 id 必须在状态目录里，canon:build 校验）。 */
export interface ScenarioModItemUse {
  statusId: string;
  /** 剂量（带下限计数的状态用），缺省 1，上限 game-numbers.status.onUse.maxDoses。 */
  doses?: number;
  /** 持续分钟，缺省按状态目录。 */
  minutes?: number;
}

export interface ScenarioModItem {
  /** 缺省按 type 推：consumable→consumable，weapon/armor→equipped；填了必须与类型一致。 */
  activation?: ScenarioModActivation;
  /** 剧情道具仅由剧情结算定向发放，不进入随机拾取/掉落。 */
  storyItem?: boolean;
  /** 效果标签，词表见 mod-kit/entity-catalog/effect-tags.json（解除类对应状态目录 remove 规则里的 item 标签，毒性/药性见 game-numbers.status.itemTags）。只给毒/药相关物品标，其余留空。 */
  effectTags?: string[];
  /** 使用时挂状态。毒性物品必须有。 */
  onUse?: ScenarioModItemUse[];
  id: string;
  name: string;
  description?: string;
  type: ScenarioModItemType;
  grade?: string;
  skillIds?: string[];
  techniqueId?: string;
  /** 机制数值：装备增幅(按品级类型确定性赋值；仅装备类有效)。 */
  attributeBonus?: ScenarioModAttributeBonus;
}

export interface ScenarioModContent {
  skills?: ScenarioModSkill[];
  techniques?: ScenarioModTechnique[];
  items?: ScenarioModItem[];
}

/** Published project stages reference the master tables; runtime initialization resolves full definitions. */
export interface ScenarioContentReference {
 id:string; availableWhen?:import('./scenario').ScenarioCondition[]; revealWhen?:import('./scenario').ScenarioCondition[];
}
export interface ScenarioModContentReferences {items?:ScenarioContentReference[];skills?:ScenarioContentReference[];techniques?:ScenarioContentReference[]}
