import type { SaveData } from '@/types/game';
import { getRegistryNamesById } from './characterResolver';
import { mergeFixedScenarioStarterInventory } from './fixedInventoryContracts';

import type {
  ScenarioModCharacter,
  ScenarioModCharacterRelationship,
  ScenarioModFaction,
  ScenarioModLocation,
  ScenarioModItem,
  ScenarioModPlayerRelationship,
  ScenarioModScenario,
  ScenarioModSkill,
  ScenarioModTechnique,
} from './schema';

interface ScenarioRelationshipSource {
  factions?: ScenarioModFaction[];
  locations?: ScenarioModLocation[];
  characters?: ScenarioModCharacter[];
  playerRelationships?: ScenarioModPlayerRelationship[];
  relationships?: ScenarioModCharacterRelationship[];
  skills?: ScenarioModSkill[];
  techniques?: ScenarioModTechnique[];
  items?: ScenarioModItem[];
  opening: ScenarioModScenario['opening'];
}

function gender(value?: string): '男' | '女' | '其他' {
  if (value === '男' || value === 'male') return '男';
  if (value === '女' || value === 'female') return '女';
  return '其他';
}

// mod canon 不含年龄字段，按境界估龄：六朝是寿命压缩的低武世界（寿元上限约 85-130，境界≠长寿），
// 区间取人间尺度；name-hash 抖动避免同档雷同。孩童/少年 role 关键词给绝对年龄段、优先于境界区间
// （幼帝不因高境界变老，内测台账 #6/#7）。出生年由调用方用「当前游戏年 - 估龄」反推（见 createNpcProfile）。
const REALM_AGE_RANGE: Record<string, [number, number]> = {
  凡人: [16, 45], 练气: [18, 50], 筑基: [25, 60], 金丹: [30, 70],
  元婴: [40, 80], 化神: [50, 90], 炼虚: [60, 95], 合体: [65, 95], 渡劫: [70, 95],
};
// 与投影默认 属性.寿元上限:100 对齐；估龄恒低于寿元上限，避免"年龄>寿元"的自相矛盾卡片。
const NPC_LIFESPAN_CAP = 100;
// 绝对年龄段（命中即返回，不受境界地板影响）。关键词取窄词避免误伤（"幼妹"是辈分不是孩童）。
const ABSOLUTE_AGE_BANDS: Array<[RegExp, [number, number]]> = [
  [/幼帝|幼子|幼女|幼童|孩童|婴孩|稚童|年幼/, [4, 12]],
  [/少年|少女|童子|学徒/, [13, 18]],
];
export function estimateNpcAge(character: ScenarioModCharacter): number {
  const key = character.id || character.name || '';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const role = `${character.role || ''}${character.profile?.origin || ''}`;
  for (const [pattern, [bandLo, bandHi]] of ABSOLUTE_AGE_BANDS) {
    if (pattern.test(role)) return bandLo + (h % (bandHi - bandLo + 1));
  }
  const [lo, hi] = REALM_AGE_RANGE[character.realm || ''] || [18, 50];
  let age = lo + (h % (hi - lo + 1));
  if (/老祖|祖师|太上|前辈|老者|老妪|老怪|宿老/.test(role)) age = Math.round((age + hi) / 2);
  if (/弟子|侍女|丫鬟/.test(role)) age = Math.max(16, Math.round(age * 0.6));
  return Math.min(age, NPC_LIFESPAN_CAP - 5);
}

function itemType(type: ScenarioModItem['type']): '装备' | '丹药' | '材料' | '其他' {
  if (type === 'weapon' || type === 'armor') return '装备';
  if (type === 'consumable') return '丹药';
  if (type === 'material') return '材料';
  return '其他';
}

// 把剧本里五花八门的品级字符串映射到原版品质系统 { quality:神仙天地玄黄凡, grade:0-10 }，
// 兼容原生物品/功法 UI（按 quality 取颜色稀有度、按 grade 排序）。
const QUALITY_MAP: Record<string, { quality: string; grade: number }> = {
  神器: { quality: '神', grade: 10 }, 神级: { quality: '神', grade: 10 }, 神品: { quality: '神', grade: 9 }, 神器碎片: { quality: '神', grade: 7 },
  仙品: { quality: '仙', grade: 9 }, 唯一: { quality: '仙', grade: 9 }, 极品: { quality: '仙', grade: 8 }, 法宝: { quality: '仙', grade: 8 }, 灵宝: { quality: '仙', grade: 8 },
  天品: { quality: '天', grade: 7 }, 天级: { quality: '天', grade: 7 }, 上品: { quality: '天', grade: 6 }, 高阶: { quality: '天', grade: 6 },
  地品: { quality: '地', grade: 5 }, 地级: { quality: '地', grade: 5 }, 秘法: { quality: '地', grade: 5 },
  玄品: { quality: '玄', grade: 4 }, 玄级: { quality: '玄', grade: 4 }, 灵品: { quality: '玄', grade: 4 }, 秘术: { quality: '玄', grade: 4 }, 特殊: { quality: '玄', grade: 3 },
  中品: { quality: '黄', grade: 3 }, 黄品: { quality: '黄', grade: 3 }, 黄级: { quality: '黄', grade: 3 }, 非凡: { quality: '黄', grade: 3 }, 法器: { quality: '黄', grade: 2 }, 精良: { quality: '黄', grade: 2 },
  下品: { quality: '凡', grade: 1 }, 凡品: { quality: '凡', grade: 0 }, 凡: { quality: '凡', grade: 0 },
};
function parseQuality(grade?: string): { quality: string; grade: number } {
  if (grade && QUALITY_MAP[grade]) return { ...QUALITY_MAP[grade] };
  for (const q of ['神', '仙', '天', '地', '玄', '黄', '凡']) if (grade?.includes(q)) return { quality: q, grade: 3 };
  return { quality: '凡', grade: 0 };
}

function buildNativeCharacterContent(source: ScenarioRelationshipSource, character: ScenarioModCharacter) {
  const skills = source.skills || [];
  const techniques = source.techniques || [];
  const items = source.items || [];
  const characterTechniques = (character.techniqueIds || [])
    .map(id => techniques.find(item => item.id === id))
    .filter((item): item is ScenarioModTechnique => Boolean(item));
  const characterSkills = (character.skillIds || [])
    .map(id => skills.find(item => item.id === id))
    .filter((item): item is ScenarioModSkill => Boolean(item));
  const nativeSkills = characterSkills.map(skill => ({
    技能名称: skill.name,
    技能描述: skill.description || '',
    来源: characterTechniques.find(technique => technique.skillIds?.includes(skill.id))?.name || '剧本正典',
    熟练度: 0,
    使用次数: 0,
  }));
  const nativeItems: Record<string, Record<string, unknown>> = {};
  for (const technique of characterTechniques) {
    nativeItems[technique.id] = {
      物品ID: technique.id,
      名称: technique.name,
      类型: '功法',
      品质: parseQuality(technique.grade),
      数量: 1,
      描述: technique.description || '',
      已装备: false,
      功法技能: (technique.skillIds || []).flatMap(id => {
        const skill = skills.find(item => item.id === id);
        return skill ? [{ 技能名称: skill.name, 技能描述: skill.description || '', 熟练度要求: 0 }] : [];
      }),
      ...(technique.techniqueEffects ? { 功法效果: technique.techniqueEffects } : {}),
    };
  }
  for (const id of character.itemIds || []) {
    const item = items.find(entry => entry.id === id);
    if (!item) continue;
    nativeItems[item.id] = {
      物品ID: item.id,
      名称: item.name,
      类型: itemType(item.type),
      品质: parseQuality(item.grade),
      数量: 1,
      描述: item.description || '',
      已装备: false,
      ...(item.attributeBonus ? { 装备增幅: item.attributeBonus } : {}),
    };
  }
  return {
    skills: nativeSkills,
    items: nativeItems,
    primaryTechnique: characterTechniques[0]
      ? { 物品ID: characterTechniques[0].id, 名称: characterTechniques[0].name }
      : null,
  };
}

function createNpcProfile(source: ScenarioRelationshipSource, character: ScenarioModCharacter, relation: string, favorability: number, currentYear: number) {
  const locations = source.locations || [];
  const factions = source.factions || [];
  const location = locations.find(item => item.id === character.locationId);
  const affiliation = character.affiliations?.[0];
  const faction = factions.find(item => item.id === (affiliation?.factionId || character.factionId));
  const affiliationNames = (character.affiliations || [])
    .map(item => factions.find(factionEntry => factionEntry.id === item.factionId)?.name)
    .filter((name): name is string => Boolean(name));
  const sect = (character.affiliations || []).find(item => item.category === 'sect');
  const nativeContent = buildNativeCharacterContent(source, character);
  const profile = character.profile || {};
  const attributes = profile.attributes || {};
  const locationCoordinates = location?.coordinates;
  return {
    名字: character.name,
    性别: gender(character.gender),
    出生日期: { 年: currentYear - estimateNpcAge(character), 月: 1, 日: 1 },
    种族: profile.race || '人族',
    出生: profile.origin || character.role || '原作人物',
    外貌描述: profile.appearance || character.description || character.role || character.name,
    性格特征: profile.personality || [],
    境界: { 名称: character.realm || '凡人', 阶段: '初期', 当前进度: 0, 下一级所需: 100, 突破描述: '依剧情发展' },
    灵根: {
      name: profile.spiritRoot?.name || '原作未载',
      tier: profile.spiritRoot?.tier || '凡品',
      描述: profile.spiritRoot?.description || '由剧本正典保留，原作未载。',
    },
    天赋: (profile.talents || []).map(talent => ({ name: talent.name, description: talent.description || '' })),
    先天六司: {
      根骨: attributes.rootBone ?? 5,
      灵性: attributes.spirituality ?? 5,
      悟性: attributes.comprehension ?? 5,
      气运: attributes.fortune ?? 5,
      魅力: attributes.charm ?? 5,
      心性: attributes.temperament ?? 5,
    },
    属性: {
      气血: { 当前: 100, 上限: 100 },
      灵气: { 当前: 100, 上限: 100 },
      神识: { 当前: 100, 上限: 100 },
      寿元上限: 100,
    },
    与玩家关系: relation,
    好感度: favorability,
    当前位置: { 描述: location?.name || '位置未定', ...(locationCoordinates ? structuredClone(locationCoordinates) : {}) },
    势力归属: faction?.name,
    势力归属列表: affiliationNames,
    宗门: factions.find(item => item.id === sect?.factionId)?.name,
    技能: { 掌握技能: nativeContent.skills },
    功法: { 修炼功法: nativeContent.primaryTechnique },
    人格底线: [],
    记忆: [...(profile.memories || []), ...(profile.notes || [])],
    当前外貌状态: profile.currentAppearance || '状态正常',
    当前内心想法: profile.currentThought || '依照剧本关系与当前事件行动。',
    头像: profile.avatar || '',
    立绘: profile.portrait || '',
    背包: { 灵石: { 下品: 0, 中品: 0, 上品: 0, 极品: 0 }, 物品: nativeContent.items },
    实时关注: true,
  };
}

export function ensureEncounteredScenarioCharacter(saveData: SaveData, source: ScenarioRelationshipSource, characterId: string, encountered?: { name: string; gender: string }): void {
  const character = source.characters?.find(item => item.id === characterId)
    || (encountered ? { id: characterId, name: getRegistryNamesById(characterId)[0] || encountered.name, gender: encountered.gender } : undefined);
  if (!character || saveData.社交?.关系?.[character.name]) return;
  const profile = createNpcProfile(source, character, '相识', 0, saveData.元数据?.时间?.年 ?? 1000);
  // 初识只登记人物，不把角色卡的背景/未来经历当作玩家已知或 NPC 已说的话。
  profile.记忆 = [];
  profile.当前内心想法 = '未记录';
  (saveData as any).社交 ||= {};
  saveData.社交.关系 ||= {};
  saveData.社交.关系[character.name] = profile as any;
}

export function applyScenarioRelationshipsToSave(saveData: SaveData, source: ScenarioRelationshipSource, generatedAt: string): SaveData {
  const next = saveData as SaveData & { 社交?: Record<string, any>; 元数据?: { 时间?: { 年?: number } } };
  const currentYear = next.元数据?.时间?.年 ?? 1000;
  const characters = source.characters || [];
  const byId = new Map(characters.map(character => [character.id, character]));
  const playerRelations = source.playerRelationships || [];
  const npcEdges = source.relationships || [];
  const participantIds = new Set<string>([
    ...playerRelations.map(item => item.characterId),
    ...npcEdges.flatMap(item => [item.fromCharacterId, item.toCharacterId]),
  ]);

  next.社交 = next.社交 || {};
  next.社交.关系 = next.社交.关系 || {};
  for (const characterId of participantIds) {
    if (characterId === source.opening.playerCharacterId) continue;
    const character = byId.get(characterId);
    if (!character) continue;
    const declared = playerRelations.find(item => item.characterId === characterId);
    const existing = next.社交.关系[character.name] || {};
    const profile = createNpcProfile(source, character, declared?.relation || '陌生人', declared?.favorability || 0, currentYear);
    next.社交.关系[character.name] = { ...profile, ...existing, 名字: character.name };
    if (declared) {
      next.社交.关系[character.name].与玩家关系 = declared.relation;
      next.社交.关系[character.name].好感度 = declared.favorability;
      next.社交.关系[character.name].记忆 = [...(next.社交.关系[character.name].记忆 || []), ...(declared.memories || [])];
    }
  }

  const nodes = Array.from(new Set(Object.keys(next.社交.关系)));
  const edges = npcEdges.flatMap(edge => {
    const from = byId.get(edge.fromCharacterId)?.name;
    const to = byId.get(edge.toCharacterId)?.name;
    if (!from || !to || edge.fromCharacterId === source.opening.playerCharacterId || edge.toCharacterId === source.opening.playerCharacterId) return [];
    return [{
      from,
      to,
      relation: edge.relation,
      score: edge.score,
      type: edge.direction === 'bidirectional' ? '双向' : '单向',
      tags: edge.tags,
      events: edge.events,
      updatedAt: generatedAt,
    }];
  });
  next.社交.关系矩阵 = { version: 1, nodes, edges };

  const playerCharacter = byId.get(source.opening.playerCharacterId || '');
  if (playerCharacter) {
    const nativeContent = buildNativeCharacterContent(source, playerCharacter);
    next.角色.技能 = next.角色.技能 || { 掌握技能: [], 装备栏: [], 冷却: {} };
    next.角色.技能.掌握技能 = nativeContent.skills;
    next.角色.背包 = next.角色.背包 || { 灵石: { 下品: 0, 中品: 0, 上品: 0, 极品: 0 }, 物品: {} };
    next.角色.背包.物品 = mergeFixedScenarioStarterInventory(next.角色.背包.物品 || {}, nativeContent.items);
    next.角色.修炼 = next.角色.修炼 || {};
    next.角色.修炼.修炼功法 = nativeContent.primaryTechnique;

    const sectAffiliation = playerCharacter.affiliations?.find(item => item.category === 'sect');
    const sectFaction = (source.factions || []).find(item => item.id === sectAffiliation?.factionId);
    if (sectAffiliation && sectFaction) {
      next.社交.宗门 = {
        版本: 2,
        当前宗门: sectFaction.name,
        成员信息: {
          宗门名称: sectFaction.name,
          宗门类型: sectFaction.type || '正道宗门',
          职位: sectAffiliation.role || '外门弟子',
          贡献: 0,
          关系: '友好',
          声望: 0,
          加入日期: generatedAt,
          描述: sectFaction.description || '',
        },
        宗门档案: {
          [sectFaction.name]: {
            id: sectFaction.id,
            名称: sectFaction.name,
            类型: sectFaction.type || '正道宗门',
            等级: '一流',
            描述: sectFaction.description || '',
            特色: [],
          },
        },
        宗门成员: {},
        宗门藏经阁: {},
        宗门贡献商店: {},
        宗门任务: {},
        宗门任务状态: {},
      };
    }
  }
  return next;
}
