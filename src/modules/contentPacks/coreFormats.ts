/**
 * 内容包核心轨与人物轨的新段（F0a，2026-11-11）：catalog 里的形状（作者 note 编译时已剥掉）。
 * 只放类型；合并函数在各读取模块里（secondaryLines／characterQuests／mainQuestAxis／travel/locationIds／
 * stanceProfiles／affinityCaps／divergenceLedger），读取方传入 CONTENT_PACKS 的这几段，测试与编译器可传合成数据。
 * 编译期校验见 scripts/content-pack-core-formats.mjs。
 */
import type { CharacterHighlight, CharacterQuest } from '../scenarioMods/characterQuests';
import type { MainQuestLayerDef, MainQuestNode, MainQuestRequirement, MainQuestStageRole } from '../scenarioMods/mainQuestAxis';
import type { AffinityStance } from '../scenarioMods/affinityLadder';

/** 线承重事件：与 secondaryLines.ts 的 TS_LINE_CRITICAL_EVENTS 合并（eventId → lineId）。 */
export interface PackLineCriticalEvent { eventId: string; lineId: string }

/** 人物任务与高光：与 characterQuests.ts 的 TS 表合并（TS 在前、包按 catalog 顺序在后）。 */
export interface PackCharacterBeats { quests: CharacterQuest[]; highlights: CharacterHighlight[] }

/** 主轴：全局至多一份；有包声明时 mainQuestAxis.ts 的五张 TS 表必须为空（二选一，不逐条合并）。 */
export interface PackStoryAxis {
  stageOrder: string[];
  layers: MainQuestLayerDef[];
  stages: MainQuestStageRole[];
  nodes: MainQuestNode[];
  requirements: MainQuestRequirement[];
}

/** 地点别名、父子关系与规范名：与 travel/locationIds.ts 的 TS 表合并（包的键排在 TS 之后，编译期禁止重复）。 */
export interface PackLocationAliases {
  canonical: Record<string, string>;
  parents: Record<string, string>;
  display: Record<string, { name: string; displayAliases?: string[] }>;
}

/** 名字来源：实体（运行时 entityAliases 展开，可重复以保留原表的重复别名）＋额外名字（接在后面）。 */
export interface PackEntityNames { entities: Array<{ kind: 'character' | 'enemy'; id: string }>; extraNames?: string[] }
export interface PackStanceProfile extends PackEntityNames { constant: string[]; bands: Partial<Record<AffinityStance, string[]>> }
/** cap 存档位 id，运行时取 AFFINITY_TIERS 该档的 max。 */
export interface PackAffinityCap extends PackEntityNames { capTier: string; reason: string; liftedBy: string }
export interface PackCharacterProfiles { stance: PackStanceProfile[]; affinityCaps: PackAffinityCap[] }

/** IF 分歧：acceptedStatuses 是小写字母串，运行时编译成与原表等价的不分大小写整串匹配。 */
export interface PackIfBranch {
  eventId: string; branchId: string; requiredCharacterId: string; acceptedStatuses: string[];
  flagCharacterSlug: string; normalizedStatus: string; prompt?: string;
}
export interface PackIfConsequence {
  eventId: string; requiredCharacterId: string; acceptedStatuses: string[];
  flagKey: string; flagValue: string | number | boolean; prompt?: string;
}
export interface PackIfBranches { branches: PackIfBranch[]; consequences: PackIfConsequence[]; prompts: Record<string, string> }

/** 合同哈希迁移（BZ1）：存档里 eventId 的合同哈希为 from、当前合同为 to 时承接（runtime.ts BATCH6_TEXT_CONTRACT_REVISIONS 由本段构造）。 */
export interface PackContractRevision { eventId: string; from: string; to: string }
