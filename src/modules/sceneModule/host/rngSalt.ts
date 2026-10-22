import { mix32 } from '../dice';
import { readExt, writeExt } from './ext';
import { logError } from '@/modules/diagnostics/log';

/**
 * RNG 游标放在存档外（2026-10-20 用户定）：场面骰由 state.seed + 拍游标决定，种子跟着存档走，
 * 同一个存档读回重试会掷出完全一样的骰面（fee4 F13 三次 12/8/6，1aae 回滚后重放）。
 * 每次读档 / 回滚，用存档外（localStorage）的计数器给进行中的场面换一个种子；
 * 同一次会话内不换，预览与结算仍一致。没有进行中的场面时什么也不改（新场面本来就用真随机种子）。
 */
export const RNG_SALT_STORAGE_KEY = 'lcq.sceneRngSalt';

interface SaltStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** 退回的随机源：有 crypto 用 crypto.getRandomValues，否则 Math.random。 */
function fallbackSource(): string { return typeof globalThis.crypto?.getRandomValues === 'function' ? 'crypto.getRandomValues' : 'Math.random'; }
/** LCQ-SAV-022 的 detail：哪一步失败、退回了哪种随机源。 */
function saltFailure(op: 'access' | 'read' | 'write'): { detail: { op: string; key: string; fallback: string } } {
  return { detail: { op, key: RNG_SALT_STORAGE_KEY, fallback: op === 'write' ? `本次游标照用，未写回；下次仍从 ${fallbackSource()} 起` : fallbackSource() } };
}
function store(): SaltStore | undefined {
  try { return (globalThis as any).localStorage as SaltStore | undefined; } catch (e) { logError('LCQ-SAV-022', e, saltFailure('access')); return undefined; }
}

/** 取下一个存档外游标并写回；拿不到 localStorage 时退回真随机。 */
export function nextOutOfSaveSalt(s: SaltStore | undefined = store()): number {
  const fresh = () => { const c = globalThis.crypto; if (c?.getRandomValues) { const b = new Uint32Array(1); c.getRandomValues(b); return b[0]; } return Math.floor(Math.random() * 0x100000000); };
  if (!s) return fresh();
  let cur: number;
  try { cur = Number(s.getItem(RNG_SALT_STORAGE_KEY)); } catch (e) { logError('LCQ-SAV-022', e, saltFailure('read')); return fresh(); }
  if (!Number.isFinite(cur) || cur <= 0) cur = fresh();
  const next = (mix32((cur >>> 0) + 0x9e3779b9) >>> 0) || 1;
  try { s.setItem(RNG_SALT_STORAGE_KEY, String(next)); } catch (e) { logError('LCQ-SAV-022', e, saltFailure('write')); }
  return next;
}

/** 读档 / 回滚后调用：给存档里打到一半的场面换种子。返回是否换了。 */
export function reseedActiveSceneAfterLoad(save: any, s: SaltStore | undefined = store()): boolean {
  const ext = readExt(save);
  const st = ext.active?.state as any;
  if (!st || typeof st.seed !== 'number') return false;
  st.seed = (mix32((st.seed >>> 0) ^ nextOutOfSaveSalt(s)) >>> 0);
  writeExt(save, ext);
  return true;
}
