import type { ScenarioModEvent } from './schema';
import { isScopedPlayerPresentationEvent } from './playtestNarrativeScope';

const PLAYER_LINES: Record<string, string> = {
  'lcq.event.s01_01::advance_declared_objective': '我稳住自己并弄清身在何处。',
  'lcq.event.s01_02::advance_declared_objective': '我先保住自己和身边的人。',
  'lcq.event.s01_03::advance_declared_objective': '我上前查看那位伤者。',
  'lcq.event.s01_04::advance_declared_objective': '我设法带着伤者脱险。',
  'lcq.event.s01_05::advance_declared_objective': '我请他先诊治我的伤。',
  'lcq.event.s01_06::advance_declared_objective': '我应对眼前危局。',
  'lcq.event.s02_01::advance_declared_objective': '我接过锦囊，听清并认下王哲的托付。',
  'lcq.event.s02_03::advance_declared_objective': '我在乱军中求生并观察战局。',
  'lcq.event.s02_02::hold_left_army_line': '我先看清左武军为何覆灭。',
  'lcq.event.s02_02::witness_wang_zhe_nine_suns': '我守在王哲身边，看他施展九阳。',
  'lcq.event.s02_02::record_battlefield_aftermath': '我查看焦土余波，看清王哲和左武军的结局。',
  'lcq.event.s02_04::advance_declared_objective': '我先应付眼前的盘问与拉扯。',
  'lcq.event.s02_05::advance_declared_objective': '我判断她要带我去哪。',
  'lcq.event.s02_06::advance_declared_objective': '我与馆主周旋，看清她是谁。',
  'lcq.event.ningyu_enters_gamble::see_ningyu_sent_into_gamble': '我看清凝羽奉命进入这场赌局。',
  'lcq.event.ningyu_enters_gamble::answer_ningyu_on_debut': '我当面回应凝羽，接下这场赌局。',
  'lcq.event.sudaji_south_pact::offer_nylon_clue_for_term': '我用霓龙丝产地线索换三个月期限。',
  'lcq.event.sudaji_south_pact::seal_three_month_south_pact': '我当面订下三个月南荒之约。',
  'lcq.event.sudaji_south_pact::refuse_term_take_paolao': '我不接三个月的条件。',
  'lcq.event.gamble_bond_signed::confirm_rigged_wager_loss': '我当面核对刻香和时限。',
  'lcq.event.gamble_bond_signed::sign_the_bond': '我签下眼前这份契书。',
  'lcq.event.charge_sudaji_fee::name_sixty_zhu_before_help': '我先开出六十金铢工价。',
  'lcq.event.charge_sudaji_fee::lock_fee_then_remove_device': '谈定报酬后，我才按约取出器物。',
  'lcq.event.free_ajiman::take_ajiman_bond_in_hand': '我用五十金铢买下阿姬曼，将她的身契拿在手里。',
  'lcq.event.free_ajiman::tear_bond_and_face_blockade': '我当着阿姬曼的面撕毁身契，还她自由；遇到封锁后改道出城。',
  'lcq.event.baihu_shangguan_escape::walk_out_wuyuan_shangguan': '我走出五原商馆。',
};

const AUTHOR_LEAK = /不把|完整落账|先帮忙后|不让旁人|不借登场|不提前|只认眼前|不得|禁止|事件完成真值|结构化步骤/;

export function scopedPlayerLineKey(eventId: string, actionId: string): string {
  return `${eventId}::${actionId}`;
}

export function lookupScopedPlayerLine(eventId: string, actionId: string): string | undefined {
  return PLAYER_LINES[scopedPlayerLineKey(eventId, actionId)];
}

export function resolveScopedPlayerLine(
  event: Pick<ScenarioModEvent, 'id' | 'presentation' | 'playerCompletionContract'>,
  action: { id: string; label?: string; actionText?: string },
  storyMode?: string,
): string | undefined {
  if (!isScopedPlayerPresentationEvent(event.id, storyMode)) return undefined;
  if ((event.playerCompletionContract?.actions.length || 0) > 1) return lookupScopedPlayerLine(event.id, action.id) || action.actionText;
  const explicitLine = event.presentation?.playerLine?.trim();
  if (explicitLine) return explicitLine;
  return lookupScopedPlayerLine(event.id, action.id);
}

export function playerLineLeaksAuthorNotes(text: string): boolean {
  return AUTHOR_LEAK.test(String(text || ''));
}


/** 展示投影不改变合同actionText；作者约束仍留在模型侧。 */
export function playerFacingActionLine(line: string): string {
  if (!/不把尚未|不提前宣告|不走进下一章|不装作无事|不得|禁止|事件完成真值|结构化步骤|走投无路返回|我按当前主线目标行动[：:]/.test(line)) return line.trim();
  const clauses = String(line || '').split(/[，,。；;]/).map(s => s.trim()).filter(Boolean);
  const kept = clauses.filter(s => !/不把尚未|不提前宣告|不走进下一章|不装作无事|不得|禁止|事件完成真值|结构化步骤/.test(s));
  const result = kept.join('，').replace(/^我按当前主线目标行动[：:]/, '我');
  const firstPerson = result.indexOf('我');
  return result ? (firstPerson > 0 ? result.slice(firstPerson) : result).replace(/[。]+$/, '') + '。' : '我查看眼前的情况。';
}

/** 旧合同在玩家面前不重复预设“离开后返回”，也不提前念阿葭死讯。 */
export function playerActionDisplayOverride(eventId: string, actionId: string): { line: string; label?: string } | undefined {
  // 武二郎工钱已改入源合同，不再由显示投影缩写。
  if (eventId === 'lcq.event.huamiao_coop_boundary') return { line: '我跟云苍峰谈清进鬼王峒的合作边界。', label: '与云苍峰谈合作边界' };
  if (eventId === 'lcq.event.weapon_deal_with_geluo' && actionId === 'open_weapon_talk_with_geluo') return { line: '我向鬼王峒使者提出兵器生意。', label: '同使者谈兵器生意' };
  if (eventId === 'lcq.event.s03b_yinzhu_xiongerpu' && actionId === 'yinzhu_strikes_ajia') return { line: '我听见阿葭那边的蕨丛里有异响，提刀赶了过去。', label: '赶去阿葭身边查看异动' };
  if (eventId === 'lcq.event.s03b_yinzhu_xiongerpu' && actionId === 'burn_yinzhu_victim') return { line: '我照祁远的吩咐，和花苗人一起把阿葭、阴蛛和那具蛇彝遇害者焚化。', label: '焚化阿葭的遗体和阴蛛' };
  if (eventId === 'lcq.event.ningyu_regicide_offer' && actionId === 'hear_ningyu_regicide_price') return { line: '我听她说明条件。', label: '听她说明条件' };
  return undefined;
}
