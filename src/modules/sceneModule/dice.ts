// 骰子：存档里只存种子和游标，第 i 颗骰由 (种子, 骰流, i) 派生。
// 读档、回滚回到某一拍之前，该拍的骰面不变，所以不能靠回滚换骰面；玩家检定和防御检定各有独立的骰流，
// 增减防御检定不会挪动玩家检定的骰面。

import { GAME_NUMBERS } from './numbers';
import type { SceneState } from './types';

export type DiceStream = 'action' | 'action2' | 'defense';

const STREAM_SALT: Record<DiceStream, number> = { action: 0x9e3779b1, action2: 0x85ebca6b, defense: 0xc2b2ae35 };

function mix32(value: number): number {
  let z = (value + 0x6d2b79f5) >>> 0;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return (z ^ (z >>> 14)) >>> 0;
}

/** 第 index 颗骰（1–sides）。拒绝采样，保证 sides 个面等概率；sides 读 judgement.dice.sides。 */
export function dieAt(seed: number, stream: DiceStream, index: number): number {
  const sides = GAME_NUMBERS.judgement.dice.sides;
  const limit = Math.floor(0x100000000 / sides) * sides;
  for (let attempt = 0; attempt < 64; attempt++) {
    const h = mix32((seed >>> 0) ^ mix32(STREAM_SALT[stream] + Math.imul(index + 1, 0x27d4eb2d) + attempt));
    if (h < limit) return (h % sides) + 1;
  }
  return (mix32(seed ^ index) % sides) + 1;
}

export function newSeed(): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0];
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

/** 当前游标处的玩家检定骰（含优势 / 劣势用的第二颗）。不推进游标。 */
export function peekActionDice(state: Pick<SceneState, 'seed' | 'cursors' | 'forced'>): [number, number] {
  const index = state.cursors.action;
  const forced = state.forced?.action?.[index];
  if (forced !== undefined) return Array.isArray(forced) ? [forced[0], forced[1]] : [forced, dieAt(state.seed, 'action2', index)];
  return [dieAt(state.seed, 'action', index), dieAt(state.seed, 'action2', index)];
}

export function peekDefenseDie(state: Pick<SceneState, 'seed' | 'cursors' | 'forced'>): number {
  const index = state.cursors.defense;
  const forced = state.forced?.defense?.[index];
  return forced !== undefined ? forced : dieAt(state.seed, 'defense', index);
}
