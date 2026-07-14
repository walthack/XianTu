import { cleanCommand, validateRepairCommand } from '@/utils/commandValidator';
import { validateAndRepairCommandValue } from '@/utils/commandValueValidator';
import { debug } from '@/utils/debug';
import { guardScenarioModCommands } from '@/modules/scenarioMods/canonGuard';
import type { TavernCommand as ValidatedTavernCommand } from '@/types/AIGameMaster';
import type { CharacterProfile, SaveData } from '@/types/game';

type RepairCommand = { action: string; key: string; value?: unknown };

/** AI 存档修复的唯一“校验→清洗→写入”入口，可脱离 UI 做集成测试。 */
export async function executeValidatedRepairCommands(
  saveData: SaveData,
  profile: CharacterProfile,
  commands: RepairCommand[],
): Promise<string[]> {
  const errors: string[] = [];
  const scenarioResult = guardScenarioModCommands(saveData, commands);
  scenarioResult.rejected.forEach(({ reason }) => errors.push(`修复指令已拒绝: ${reason}`));
  const safeCommands: RepairCommand[] = [];
  for (const rawCommand of scenarioResult.accepted) {
    const command = rawCommand as RepairCommand;
    const key = typeof command?.key === 'string' ? command.key.trim() : '';
    if (
      key === '世界.状态.剧本模组' || key.startsWith('世界.状态.剧本模组.') ||
      key === '系统.扩展.剧本模组' || key.startsWith('系统.扩展.剧本模组.')
    ) {
      errors.push(`修复指令已拒绝: 不得修改剧本运行时（${key || '无路径'}）`);
      continue;
    }
    const format = validateRepairCommand(command, safeCommands.length);
    const value = validateAndRepairCommandValue(command as ValidatedTavernCommand);
    if (!format.valid || !value.valid) {
      errors.push(`修复指令已拒绝: ${[...format.errors, ...value.errors].join('；')}`);
      continue;
    }
    safeCommands.push(cleanCommand(command as ValidatedTavernCommand));
  }

  const setNestedValue = (target: Record<string, unknown> | SaveData | CharacterProfile, path: string, value: unknown) => {
    const keys = path.split('.');
    let current = target as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] === undefined || typeof current[keys[i]] !== 'object') current[keys[i]] = {};
      current = current[keys[i]] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = value;
  };

  for (const command of safeCommands) {
    try {
      const { action, key, value } = command;
      if (action !== 'set') {
        errors.push(`修复指令已拒绝: 不支持 action ${action}`);
        continue;
      }
      const writesProfile = key.startsWith('character.profile.');
      setNestedValue(writesProfile ? profile : saveData, writesProfile ? key.substring('character.profile.'.length) : key, value);
      debug.log('AI修复', `执行 set: ${key} =`, value);
    } catch (e) {
      errors.push(`执行指令失败: ${JSON.stringify(command)}`);
      debug.error('AI修复', '执行指令时出错', e);
    }
  }
  return errors;
}
