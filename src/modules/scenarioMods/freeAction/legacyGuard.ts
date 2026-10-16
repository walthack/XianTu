/**
 * 旧关键词判定的让位：玩家原话含某个启用变体声明的 legacyGuardWords（词表在 game-numbers 的变体行里，代码不写词）时，
 * 这句话归该变体自己的票据与结算；没出票也不再回落旧关键词预检——
 * 旧的 cultivate 预检会把句子里的“运功/修炼”判成玩家自己的修炼并写 角色.属性.境界。
 * 判断只在自由行动范围内（freeAction 开启 + 试玩范围存档）才生效，范围由调用方（naturalIntentRouter.freeActionOwnsText）把关。
 */
import { enabledVariants, variantSpecOf } from './config';
import { squash } from './ticket';

export function freeActionOwnerOf(text: string): { actionClass: string; variant: string } | undefined {
  const hay = squash(text);
  if (!hay) return undefined;
  for (const row of enabledVariants()) {
    const words = variantSpecOf(row.actionClass, row.variant)?.legacyGuardWords || [];
    if (words.some(word => { const needle = squash(word); return needle !== '' && hay.includes(needle); })) {
      return { actionClass: row.actionClass, variant: row.variant };
    }
  }
  return undefined;
}
