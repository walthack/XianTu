import { getPrompt } from '@/services/defaultPrompts';
import { SAVE_DATA_STRUCTURE, stripNsfwContent } from './definitions/dataDefinitions';
import { isTavernEnv } from '@/utils/tavern';
import { getNsfwSettingsFromStorage } from '@/utils/nsfw';
import { GAOSHOUBANG_NARRATION_RULE } from '@/utils/realmUtils';

// 导出常用的规则常量
export { SAVE_DATA_STRUCTURE as DATA_STRUCTURE_DEFINITIONS };

/**
 * 组装最终的系统Prompt（异步版本，支持自定义提示词）
 * 所有提示词都通过 getPrompt() 获取，支持用户自定义
 * @param activePrompts - 一个包含了当前需要激活的prompt模块名称的数组
 * @param customActionPrompt - 自定义行动选项提示词（可选）
 * @param gameState - 游戏状态（可选，用于读取运行时设置）
 * @returns {Promise<string>} - 拼接好的完整prompt字符串
 */
export async function assembleSystemPrompt(
  activePrompts: string[],
  customActionPrompt?: string,
  gameState?: any
): Promise<string> {
  // 所有提示词都使用 getPrompt() 获取，支持用户自定义
  const [
    coreRulesPrompt,
    businessRulesPrompt,
    playerPersonalityPrompt,
    dataDefinitionsPrompt,
    textFormatsPrompt,
    worldStandardsPrompt
  ] = await Promise.all([
    getPrompt('coreOutputRules'),
    getPrompt('businessRules'),
    getPrompt('playerPersonality'),
    getPrompt('dataDefinitions'),
    getPrompt('textFormatRules'),
    getPrompt('worldStandards')
  ]);

  const tavernEnv = isTavernEnv();
  const sanitizedDataDefinitionsPrompt = tavernEnv ? dataDefinitionsPrompt : stripNsfwContent(dataDefinitionsPrompt);
  const sanitizedBusinessRulesPrompt = tavernEnv ? businessRulesPrompt : stripNsfwContent(businessRulesPrompt);

  const promptSections = [
    // 1. 核心规则（JSON格式、响应格式、数据结构严格性）
    coreRulesPrompt,
    // 2. 业务规则
    sanitizedBusinessRulesPrompt,
    // 2.1 主角性格（可自定义）
    playerPersonalityPrompt,
    // 3. 数据结构定义
    sanitizedDataDefinitionsPrompt,
    // 4. 文本格式与命名
    textFormatsPrompt,
    // 5. 世界设定参考
    worldStandardsPrompt,
    // 5.1 修为称谓：叙事用高手榜名，数据字段仍用修仙名
    GAOSHOUBANG_NARRATION_RULE,
  ];

  // 根据激活列表来添加可选模块
  if (activePrompts.includes('actionOptions')) {
    const actionOptionsPrompt = (await getPrompt('actionOptions')).trim();
    const customPromptSection = customActionPrompt
      ? `**用户自定义要求**：${customActionPrompt}

请严格按照以上自定义要求生成行动选项。`
      : '（无特殊要求，按默认规则生成）';
    if (actionOptionsPrompt) {
      promptSections.push(actionOptionsPrompt.replace('{{CUSTOM_ACTION_PROMPT}}', customPromptSection));
    }
  }

  if (activePrompts.includes('eventSystem')) {
    const eventRules = (await getPrompt('eventSystemRules')).trim();
    if (eventRules) {
      promptSections.push(eventRules);
    }
  }

  // 🔞 NSFW 设置（酒馆端专用）
  if (tavernEnv) {
    const settingsFromStore = getNsfwSettingsFromStorage();
    const cfg = (gameState?.系统?.配置 ?? {}) as Record<string, unknown>;
    const nsfwMode = typeof cfg.nsfwMode === 'boolean' ? cfg.nsfwMode : settingsFromStore.nsfwMode;
    const nsfwGenderFilter =
      typeof cfg.nsfwGenderFilter === 'string' ? cfg.nsfwGenderFilter : settingsFromStore.nsfwGenderFilter;
    promptSections.push(
      [
        '# NSFW设置（酒馆端）',
        `- nsfwMode: ${nsfwMode ? 'true' : 'false'}`,
        `- nsfwGenderFilter: ${nsfwGenderFilter}`,
        '- 当 nsfwMode=true 且 NPC性别符合过滤条件时，创建NPC必须生成完整私密信息(PrivacyProfile)',
        '- 若 NPC 已存在但私密信息缺失，需用 set 写入 社交.关系.[NPC名].私密信息 完整对象',
        '- 当 nsfwMode=false 或 性别不匹配 时，禁止生成私密信息'
      ].join('\n')
    );
  }

  const normalizedSections = promptSections
    .map(section => section.trim())
    .filter(Boolean);

  return normalizedSections.join('\n\n---\n\n');
}
