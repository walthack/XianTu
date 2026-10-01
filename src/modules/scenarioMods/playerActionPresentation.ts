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
  'lcq.event.ningyu_enters_gamble::answer_ningyu_on_debut': '我当面回应凝羽。',
  'lcq.event.sudaji_south_pact::offer_nylon_clue_for_term': '我用霓龙丝产地线索换三个月期限。',
  'lcq.event.sudaji_south_pact::seal_three_month_south_pact': '我当面订下三个月南荒之约。',
  'lcq.event.sudaji_south_pact::refuse_term_take_paolao': '我不接三个月的条件。',
  'lcq.event.gamble_bond_signed::confirm_rigged_wager_loss': '我当面核对刻香和时限。',
  'lcq.event.gamble_bond_signed::sign_the_bond': '我签下眼前这份契书。',
  'lcq.event.charge_sudaji_fee::name_sixty_zhu_before_help': '我先开出六十金铢工价。',
  'lcq.event.charge_sudaji_fee::lock_fee_then_remove_device': '谈定报酬后，我才按约取出器物。',
  'lcq.event.free_ajiman::take_ajiman_bond_in_hand': '我把阿姬曼的身契拿到手里。',
  'lcq.event.free_ajiman::tear_bond_and_face_blockade': '我当面撕契并改道出城。',
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
  event: Pick<ScenarioModEvent, 'id' | 'presentation'>,
  action: { id: string; label?: string; actionText?: string },
  storyMode?: string,
): string | undefined {
  if (!isScopedPlayerPresentationEvent(event.id, storyMode)) return undefined;
  const explicitLine = event.presentation?.playerLine?.trim();
  if (explicitLine) return explicitLine;
  return lookupScopedPlayerLine(event.id, action.id);
}

export function playerLineLeaksAuthorNotes(text: string): boolean {
  return AUTHOR_LEAK.test(String(text || ''));
}
