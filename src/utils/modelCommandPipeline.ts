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
  // 时间只进不退(内测追加):模型可推进时间(含闭关跳年),但不得把年份写回过去——
  // 曾把开局 220 年写回 200,致关系投影出生年错位、孩童显示负岁。起始年=年龄纯函数,由代码定。
  const currentYear = Number((saveData as any)?.元数据?.时间?.年);

  scenarioGuardResult.accepted.forEach((cmd, index) => {
    const formatResult = validateCommand(cmd, index);
    warnings.push(...formatResult.warnings);
    if (!formatResult.valid) {
      rejectedCommands.push({ command: cmd, errors: formatResult.errors });
      return;
    }
    if (Number.isFinite(currentYear)) {
      const key = typeof (cmd as any).key === 'string' ? (cmd as any).key : '';
      const action = String((cmd as any).action);
      const value = (cmd as any).value;
      const backwardYear =
        (key === '元数据.时间.年' && action === 'set' && Number.isFinite(Number(value)) && Number(value) < currentYear) ||
        (key === '元数据.时间.年' && action === 'add' && Number.isFinite(Number(value)) && Number(value) < 0) ||
        (key === '元数据.时间' && action === 'set' && !!value && typeof value === 'object' &&
          Number.isFinite(Number((value as Record<string, unknown>).年)) && Number((value as Record<string, unknown>).年) < currentYear);
      if (backwardYear) {
        rejectedCommands.push({ command: cmd, errors: [`指令${index}: 游戏时间只进不退,不得把年份从 ${currentYear} 写回过去`] });
        return;
      }
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
