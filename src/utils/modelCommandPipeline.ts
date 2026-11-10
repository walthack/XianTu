import { localTimeCommandViolation } from './timeCommandGuard';
import { guardScenarioModCommands } from '@/modules/scenarioMods/canonGuard';
import type { TavernCommand } from '@/types/AIGameMaster';
import type { SaveData } from '@/types/game';
import { debugLog } from '@/modules/diagnostics/debugLog';

/**
 * 模型命令进入执行器前的唯一校验链。保护模式不得参与此函数，skeleton 也不能
 * 跳过 runtime/canon 护栏、值校验或字段清洗。
 */
export async function validateModelCommandPipeline(commands: unknown[], saveData: SaveData): Promise<{
  validCommands: TavernCommand[];
  rejectedCommands: Array<{ command: unknown; errors: string[] }>;
  warnings: string[];
}> {
  const { validateCommand, cleanCommands, normalizeCommandPaths } = await import('./commandValidator');
  // 路径规范化先于时间／剧情／权限护栏，点与括号写法受同一套检查。
  normalizeCommandPaths(commands);
  const timeRejected = commands.filter(cmd => localTimeCommandViolation(cmd));
  const scenarioGuardResult = guardScenarioModCommands(saveData, commands.filter(cmd => !timeRejected.includes(cmd)) as any[]);
  const validCommands: TavernCommand[] = [];
  const rejectedCommands = timeRejected.map(command => ({ command, errors: ['LCQ-SAV-037：模型不得写入日历或时间回执'] })).concat(scenarioGuardResult.rejected.map(item => ({ command: item.command, errors: [item.reason] })));
  const warnings: string[] = [];
  const { validateAndRepairCommandValue } = await import('./commandValueValidator');

  scenarioGuardResult.accepted.forEach((cmd, index) => {
    const formatResult = validateCommand(cmd, index, saveData);
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

/**
 * 模型没有治疗授权；本地治疗（场面疗伤、白尾豹等）在命令链之外独立结算，不受此检查影响。
 * 只回滚该条命令对玩家气血的抬升，不抛错：抛错会记为执行失败，连带跳过本拍进度审计/事件对账。
 */
export function rejectModelHealthIncrease(save: SaveData, before: unknown): boolean {
  const previous = before as { 当前?: unknown; 上限?: unknown } | undefined;
  if (typeof previous?.当前 !== 'number' || !Number.isFinite(previous.当前)) return false;
  const s = save as any;
  const current = s.角色?.属性?.气血?.当前;
  if (typeof current === 'number' && Number.isFinite(current) && current <= previous.当前) return false;
  // 删除后重建、整对象替换也不能绕过；恢复该命令前的完整气血对象。
  s.角色 ||= {}; s.角色.属性 ||= {}; s.角色.属性.气血 = structuredClone(previous);
  debugLog('ai', '[模型命令] 气血恢复只能由本地治疗规则结算，已拒绝模型回血或删除气血', { before: previous.当前, attempted: current });
  return true;
}
