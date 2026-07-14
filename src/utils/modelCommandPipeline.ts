import { guardScenarioModCommands } from '@/modules/scenarioMods/canonGuard';
import type { TavernCommand } from '@/types/AIGameMaster';
import type { SaveData } from '@/types/game';

/**
 * 模型命令进入执行器前的唯一校验链。保护模式不得参与此函数，skeleton 也不能
 * 跳过 runtime/canon 护栏、值校验或字段清洗。
 */
export async function validateModelCommandPipeline(commands: unknown[], saveData: SaveData): Promise<{
  validCommands: TavernCommand[];
  rejectedCommands: Array<{ command: unknown; errors: string[] }>;
  warnings: string[];
}> {
  const scenarioGuardResult = guardScenarioModCommands(saveData, commands as any[]);
  const validCommands: TavernCommand[] = [];
  const rejectedCommands = scenarioGuardResult.rejected.map(item => ({ command: item.command, errors: [item.reason] }));
  const warnings: string[] = [];
  const { validateCommand, cleanCommands } = await import('./commandValidator');
  const { validateAndRepairCommandValue } = await import('./commandValueValidator');

  scenarioGuardResult.accepted.forEach((cmd, index) => {
    const formatResult = validateCommand(cmd, index);
    warnings.push(...formatResult.warnings);
    if (!formatResult.valid) {
      rejectedCommands.push({ command: cmd, errors: formatResult.errors });
      return;
    }
    try {
      const valueResult = validateAndRepairCommandValue(cmd as TavernCommand);
      if (!valueResult.valid) {
        rejectedCommands.push({ command: cmd, errors: valueResult.errors.map(e => `指令${index}: ${e}`) });
        return;
      }
    } catch (e) {
      rejectedCommands.push({ command: cmd, errors: [`指令${index}: value 校验异常: ${e instanceof Error ? e.message : String(e)}`] });
      return;
    }
    validCommands.push(cmd as TavernCommand);
  });

  return { validCommands: cleanCommands(validCommands), rejectedCommands, warnings };
}
