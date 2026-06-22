import type { SaveData } from '@/types/game';

import type {
  ScenarioModCharacter,
  ScenarioModCharacterRelationship,
  ScenarioModFaction,
  ScenarioModLocation,
  ScenarioModPlayerRelationship,
  ScenarioModScenario,
} from './schema';

interface ScenarioRelationshipSource {
  factions?: ScenarioModFaction[];
  locations?: ScenarioModLocation[];
  characters?: ScenarioModCharacter[];
  playerRelationships?: ScenarioModPlayerRelationship[];
  relationships?: ScenarioModCharacterRelationship[];
  opening: ScenarioModScenario['opening'];
}

function gender(value?: string): '男' | '女' | '其他' {
  if (value === '男' || value === 'male') return '男';
  if (value === '女' || value === 'female') return '女';
  return '其他';
}

function createNpcProfile(source: ScenarioRelationshipSource, character: ScenarioModCharacter, relation: string, favorability: number) {
  const locations = source.locations || [];
  const factions = source.factions || [];
  const location = locations.find(item => item.id === character.locationId);
  const affiliation = character.affiliations?.[0];
  const faction = factions.find(item => item.id === (affiliation?.factionId || character.factionId));
  return {
    名字: character.name,
    性别: gender(character.gender),
    出生日期: { 年: 0, 月: 1, 日: 1 },
    种族: '人族',
    出生: character.role || '原作人物',
    外貌描述: character.description || character.role || character.name,
    性格特征: [],
    境界: { 名称: character.realm || '凡人', 阶段: '初期', 当前进度: 0, 下一级所需: 100, 突破描述: '依剧情发展' },
    灵根: { name: '原作未载', tier: '凡品', 描述: '由剧本正典保留，原作未载。' },
    天赋: [],
    先天六司: { 根骨: 5, 灵性: 5, 悟性: 5, 气运: 5, 魅力: 5, 心性: 5 },
    属性: {
      气血: { 当前: 100, 上限: 100 },
      灵气: { 当前: 100, 上限: 100 },
      神识: { 当前: 100, 上限: 100 },
      寿元上限: 100,
    },
    与玩家关系: relation,
    好感度: favorability,
    当前位置: { 描述: location?.name || '位置未定' },
    势力归属: faction?.name,
    人格底线: [],
    记忆: [],
    当前外貌状态: '状态正常',
    当前内心想法: '依照剧本关系与当前事件行动。',
    背包: { 灵石: { 下品: 0, 中品: 0, 上品: 0, 极品: 0 }, 物品: {} },
    实时关注: true,
  };
}

export function applyScenarioRelationshipsToSave(saveData: SaveData, source: ScenarioRelationshipSource, generatedAt: string): SaveData {
  const next = saveData as SaveData & { 社交?: Record<string, any> };
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
    const profile = createNpcProfile(source, character, declared?.relation || '陌生人', declared?.favorability || 0);
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
  return next;
}
