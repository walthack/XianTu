import { logEvent } from '@/modules/diagnostics/log';
/** 清洗路径后判断：祖先替换同样能覆盖日历/本地回执。 */
export function localTimeCommandViolation(command: any): string | undefined {
  const path = String(command?.key ?? '').replace(/\[\s*["']?([^\]"']+)["']?\s*\]/g, '.$1').replace(/["'\s]/g, '').replace(/^\.+|\.+$/g, '');
  const blocked = ['元数据.时间', '元数据.calendarVersion', '系统.扩展.actionTime'];
  if (path === '时间' || path.startsWith('时间.') || blocked.some(p => path === p || path.startsWith(p + '.') || (path && p.startsWith(path + '.')))) {
    logEvent({ code: 'LCQ-SAV-037', detail: { path } });
    return 'LCQ-SAV-037：日历与耗时回执仅由本地代码写入';
  }
}
