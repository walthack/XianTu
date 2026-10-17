/**
 * 判定卡的技能/天赋因子：按行动类（变体 kind / 类）匹配玩家已学的正典技能和身上的天赋。
 * 沿用旧关键词预检（judgementPreflight.scenarioSkillFactors / explicitTalentFactors）的语义——技能须是运行时正典里存在、存档里已掌握、描述没写“不能用”，
 * 天赋看名称和描述——差别只有一处：不再看玩家原话有没有点名，改看行动类对应的标签词（配置 freeAction.skillMatch.tags）出现在技能/天赋的名称与描述里。
 * 命中给正常加成（数值在配置）；都不命中只在卡上放一行“未掌握”的提示因子（值 0，无加成）。玩家原话不参与。
 */
import type { SaveData } from '@/types/game';
import type { JudgementFactor } from '@/utils/judgementEngine';
import { packText } from '@/modules/contentPacks';
import { freeActionConfig, resolveNumberRef, type VariantSpec } from './config';

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const fill = (template: string, name: string): string => template.split('{name}').join(name);

function masteredNames(save: any): Set<string> {
  const raw = save?.角色?.技能?.掌握技能;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.flatMap((entry: any) => { const name = text(typeof entry === 'string' ? entry : entry?.技能名称); return name ? [name] : []; }));
}

export function skillTalentFactors(save: SaveData, spec: VariantSpec): JudgementFactor[] {
  const match = freeActionConfig().skillMatch, root = save as any;
  const words = match.tags[`${spec.actionClass}.${spec.variant}`] ?? match.tags[spec.actionClass] ?? match.tags[spec.kind!] ?? [];
  const fits = (haystack: string): boolean => words.some(word => haystack.includes(word));
  const factors: JudgementFactor[] = [];

  const mastered = masteredNames(root), canonSkills = root?.世界?.状态?.剧本模组?.canon?.skills;
  if (Array.isArray(canonSkills) && match.maxSkill > 0) {
    const bonus = resolveNumberRef(match.skillBonus);
    for (const skill of canonSkills) {
      const name = text(skill?.name);
      const description = [skill?.description, skill?.type, ...(Array.isArray(skill?.effects) ? skill.effects : [])].filter((value): value is string => typeof value === 'string').join('；');
      if (name.length < 2 || !mastered.has(name) || match.unavailableMarks.some(mark => description.includes(mark)) || !fits(`${name}；${description}`)) continue;
      factors.push({ label: fill(packText('free.skill.label'), name), value: bonus, source: 'skill' });
      if (factors.length >= match.maxSkill) break;
    }
  }

  const talents = root?.角色?.身份?.天赋;
  if (Array.isArray(talents) && match.maxTalent > 0) {
    let used = 0;
    for (const entry of talents) {
      const name = text(typeof entry === 'string' ? entry : entry?.name || entry?.名称);
      const description = typeof entry === 'object' && entry ? String(entry.description || entry.描述 || entry.effect || entry.效果 || '') : '';
      if (name.length < 2 || !fits(`${name}；${description}`)) continue;
      factors.push({ label: fill(packText('free.talent.label'), name), value: match.talentBonus, source: 'talent' });
      if (++used >= match.maxTalent) break;
    }
  }

  return factors.length ? factors : [{ label: packText('free.skill.none'), value: 0, source: 'skill' }];
}
