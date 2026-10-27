/**
 * 二级线入口显示（太泉解锁设计稿 2026-10-27 §5）：给右栏和测试共用，回答「这条线的入口现在怎么写」。
 * - 接不接得到仍只由锚回答（secondaryLines.resolveAvailableLines），锁住的线照样显示，不隐藏。
 * - 带 `unlock` 的线：没解锁时标题＋缺项句（顺序 realm → lines → deadline，方案 二-4）；解锁后按说法变体取句。
 * - 文案全在 contentPacks texts（entryHintKeys 只放键）；键缺失记 LCQ-PCK-005 并用兜底：
 *   标题退回「{线名} · 时机未到」，缺项句／附句只跳过那一句，说法主句缺失退回 entryHint 原文。
 * 单独成文件是为了不成环：本模块要读账本条件（附句的 when），而账本条件的 unlock.* 要读 secondaryLines 的本线节点。
 */
import { CONTENT_PACKS } from '../contentPacks';
import { logEventOnce } from '../diagnostics/log';
import { evaluateLedgerCondition } from './ledgerConditions';
import { lineUnlockStatus, taiquanEntryVariant } from './lineUnlock';
import { secondaryLineUnlockOptions, type SecondaryLine } from './secondaryLines';

export interface SecondaryLineEntryView {
  /** 有 unlock 且没解锁：右栏灰显（不隐藏） */
  locked: boolean;
  /** 锁住时＝「时机未到」标题；否则＝线名（显示名另由 secondaryLineDisplayName 决定） */
  title: string;
  /** 入口指引，一句一行 */
  hintLines: string[];
}

/** 各线的说法判定（键＝unlock 配置键）。没登记的线用 variants.default。 */
const VARIANT_OF: Record<string, (runtime: unknown) => string> = {
  taiquan: taiquanEntryVariant,
};

const runtimeOf = (save: unknown): unknown => (save as any)?.世界?.状态?.剧本模组;

export function secondaryLineEntryView(
  line: SecondaryLine,
  save: unknown,
  texts: Readonly<Record<string, string>> = CONTENT_PACKS.texts,
): SecondaryLineEntryView {
  const plain: SecondaryLineEntryView = { locked: false, title: line.name, hintLines: [line.entryHint] };
  if (!line.unlock) return plain;
  const keys = line.entryHintKeys;
  const text = (key: string): string | undefined => {
    const value = texts[key];
    if (typeof value === 'string' && value.trim()) return value;
    // 文案缺失不挡入口：用兜底，带码写持久日志（同一键本会话只记一次）
    logEventOnce(`LCQ-PCK-005:${key}`, { code: 'LCQ-PCK-005', msg: `二级线 ${line.id} 入口文案键 ${key} 缺失，本次用兜底`, detail: { lineId: line.id, textKey: key } });
    return undefined;
  };
  const runtime = runtimeOf(save);
  const status = lineUnlockStatus(save, line.unlock, secondaryLineUnlockOptions(line));
  if (status && !status.unlocked) {
    const title = (keys && text(keys.locked.title)) || `${line.name} · 时机未到`;
    const hintLines: string[] = [];
    for (const gap of status.missing) {
      if (!keys) break;
      if (gap === 'realm') hintLines.push(text(keys.locked.realm) ?? '');
      if (gap === 'lines') hintLines.push(text(keys.locked.lines)?.split('{X}').join(String(status.lines.short)) ?? '');
      if (gap === 'deadline') {
        for (const d of status.deadlines.filter(d => !d.pass)) hintLines.push(text(`${keys.locked.deadlinePrefix}.${d.id}`) ?? '');
      }
    }
    return { locked: true, title, hintLines: hintLines.filter(Boolean) };
  }
  const variant = (VARIANT_OF[line.unlock] ?? (() => 'default'))(runtime);
  const parts = keys?.variants[variant];
  if (!parts?.length) return plain;
  const hintLines: string[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      const value = text(part);
      if (!value) return plain;
      hintLines.push(value);
    } else if (part.when.every(c => evaluateLedgerCondition(c, runtime) === true)) {
      const value = text(part.key);
      if (value) hintLines.push(value);
    }
  }
  return { locked: false, title: line.name, hintLines };
}
