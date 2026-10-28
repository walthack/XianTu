import { existsSync } from 'node:fs';

export const GENERATED_ROOT = new URL('../mod-kit/generated/deepseek-v4-flash/', import.meta.url);
const has = rel => existsSync(new URL(rel, GENERATED_ROOT));
export const HAS_GENERATED_STAGES = ['qingyu', 'yunlong', 'yange'].every(b => has(`${b}/stages/`));
export const HAS_CHARACTER_CARDS_V3 = has('character-canon/character-cards-v3.json');
export const HAS_AXIS_BINDING = has('character-canon/axis-binding.json');
// 返回 false＝照跑；返回字符串＝node:test 的 skip 原因（TAP 里显示 # SKIP <原因>）
export const skipUnless = (ok, what) => ok ? false
  : `无源树：缺 mod-kit/generated/deepseek-v4-flash/${what}（gitignored，仅 Mac/NAS 有），跳过源树↔投影一致性校验`;
