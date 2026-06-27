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
/** 功法效果(运行时直接映射到原版 功法效果 TechniqueEffects)。 */
export interface ScenarioModTechniqueEffects {
  修炼速度加成?: number;
  属性加成?: ScenarioModSixFaculties;
  特殊能力?: string[];
}

export interface ScenarioModTechnique {
  id: string;
  name: string;
  description?: string;
  grade?: string;
  skillIds?: string[];
  /** 机制数值：修炼速度/属性加成(按品级类型确定性赋值)。 */
  techniqueEffects?: ScenarioModTechniqueEffects;
}

export type ScenarioModItemType = 'weapon' | 'armor' | 'consumable' | 'material' | 'other';

export interface ScenarioModItem {
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
