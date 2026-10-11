import {CONTENT_PACKS} from '../contentPacks';
import {applyStoryLevel} from './levelProgression';

import { canonicalEndingId, endingPresentation } from './endingPresentation';
import { runtimeEntityId, runtimeEntityName, migrateRuntimePersonRecords } from './ledger/affinityIdentity';
import type { SaveData } from '@/types/game';
import type { ScenarioStepScene } from './schema';
import { advanceClock } from './travel/travelLedger';
import { visibleModuleText } from './modularTurn';
/** 剧情交接 2026-10-02：固定死亡正文；配图由 endingPresentation 提供。 */
const ENDING_TEXTS: Readonly<Record<string,string>> = CONTENT_PACKS.texts;

// 战斗正式接入时消费此表；此处只录数据，不由LLM写tier触发，也不重复判slay_dragon/s06_02。
export const BATTLE_LOSS_ENDINGS = ([
  {
    "endingId": "lcq.ending.death.ghost_king_skull",
    "title": "天命的指引",
    "kind": "death",
    "sourceEventId": "lcq.event.s05b_05b_ideology_duel_and_defeat",
    "tierFlag": "lcq.encounter.f10.tier",
    "tier": "rout",
    "facts": [
      "程宗扬被封回龛窟，血没能沾上骨虎",
      "鬼巫王剖开天命者的头颅",
      "银镜中的同伴未能找到他",
      "龙神照常吞下鬼巫王"
    ]
  },
  {
    "endingId": "lcq.ending.death.dragon_well",
    "title": "龙首无人",
    "kind": "death",
    "sourceEventId": "lcq.event.ghost_king_swallowed",
    "tierFlag": "lcq.encounter.f13.tier",
    "tier": "lose",
    "facts": [
      "你带乐明珠逃往洞窟裂缝时滚下碎石坡，背脊重伤",
      "乐明珠被推进龙角下的空隙",
      "程宗扬被埋在鬼王峒地底",
      "龙神吞下鬼巫王，龙首无人号令反击"
    ]
  },
  {
    "endingId": "lcq.ending.fail.dragon_essence",
    "title": "龙精入体",
    "kind": "failure",
    "sourceEventId": "lcq.event.slay_dragon",
    "tierFlag": "lcq.encounter.f14.tier",
    "tier": "lose",
    "facts": [
      "龙神死去",
      "龙精携鬼巫王残念进入程宗扬丹田",
      "程宗扬存活，原来的自我不再主宰身体",
      "本局结束，不可续玩"
    ]
  }
] as const).map(ending => ({ ...ending, presentation: endingPresentation(ending) }));

export function fixedEndingNarrative(ending: { endingId: string; sourceEventId: string } | undefined): string | undefined {
  if (!ending) return undefined;
  return ENDING_TEXTS[canonicalEndingId(ending)];
}

/** 关键动作已由引擎预结算；不让写手追加条件、选择或道具。 */
export function fixedBeatNarrative(eventId: string | undefined, actionId: string | undefined): string | undefined {
  return ({
    'lcq.event.s04_06::advance_declared_objective': '凝羽被麻古毒瘾折磨得难以安坐。她强撑着不肯出声，额上却沁出了冷汗。你向乐明珠求助，请她替凝羽解毒。乐明珠点头应下，取出针具，小心察看凝羽的状况；她对这种毒瘾还缺乏经验，你留在一旁照应。',
    'lcq.event.s04_05::respond_to_flash_flood': '山洪骤然涌下。易虎先把易彪送到安全处，随即转身救起那名年轻军士，将他也推离洪流。你看清了这先后两次救援，救起两人的都是易虎。',
    'lcq.event.s03b_yinzhu_xiongerpu::burn_yinzhu_victim': '祁远认出阴蛛，说它吸血、怕火，还可能产卵，必须烧尸。花苗人用蕉叶包住阿葭的遗体，阿夕抱着她痛哭，苏荔双眉紧锁。你认定是鬼王峒豢养的阴蛛。武二郎从林中回来，拎着被他拧断腿的阴蛛；腿上还有你留下的刀痕。他听清原委，把阴蛛踢给苏荔。你随众人在营地焚化阿葭的遗体。',
    'lcq.event.s03b_yinzhu_xiongerpu::pick_zhu88_as_guide': '你在熊耳铺找向导。秦桧与吴三桂分别上前，你没有选他们，而是请自称朱八八的老向导带路。送亲队的新娘仍戴着面纱，鬼王峒使者已先走；你与商队收拾行装，同送亲队继续前行。',
    'lcq.event.s02_02::witness_wang_zhe_nine_suns': '你抬头望向战场上空。王哲脱去甲胄，天青道袍在风中展开，他的身形离开地面，升上高空。金冠爆散，声音从天上传来，九阳随真言依次点亮，光芒逐渐汇成日轮。你眼前再也不是帐中的师帅，而是悬在战场上方、以自身撑起最后一击的人。日轮的光芒照在你脸上，你仰头看着他，四周的喊声被天上传来的真言压了下去。',
    'lcq.event.charge_sudaji_fee::name_sixty_zhu_before_help': '你没有立刻动手，先向苏妲己开出六十金铢工价。苏妲己就在面前，器物也还留在原处；你把价钱说清，等她当面答复。她看着你，尚未作答，你也没有抢先动手。',
    'lcq.event.charge_sudaji_fee::lock_fee_then_remove_device': '苏妲己当面应下六十金铢的报酬，将钱交到你手里。你收下报酬，才按说定的办法帮她取出那件新奇器物。苏妲己亲自接下器物，你收回手，这件事至此办完。',
    'lcq.event.baihu_shangguan_escape::walk_out_wuyuan_shangguan': '你走过白湖商馆的大门，来到五原城里的街上。囚室和内院已经在身后；下一步去向仍由你决定。',
    'lcq.event.wuerlang_joins::confirm_wuerlang_no_prior_promise': '眼前这名汉子是武二郎。你向他问清先前的条件：他当时只求解开镣铐，并未答应随队南行。同行的事还要另谈。',
    'lcq.event.wuerlang_joins::secure_wuerlang_southbound': '你同武二郎把报酬和南行的事谈清。武二郎当面答应加入南荒队伍，这一句话终于不再含糊。他留在队伍里，你也有了一个明确答应同行的人。',
    'lcq.event.sudaji_south_pact::offer_nylon_clue_for_term': '你向苏妲己提出，用霓龙丝的产地线索换取三个月行动期限。苏妲己听过条件，等你当面订约。',
    'lcq.event.sudaji_south_pact::seal_three_month_south_pact': '你当面与苏妲己订下南荒之约：三个月内前往南荒采集霓龙丝，逾期受炮烙。这份约定成为你南下的由头。',
    'lcq.event.free_ajiman::take_ajiman_bond_in_hand': '你用五十金铢从祁老四手里买下阿姬曼，接过她的身契。阿姬曼就在眼前；契纸仍拿在你手中，你尚未决定如何处置。',
    'lcq.event.free_ajiman::tear_bond_and_face_blockade': '你在阿姬曼面前展开身契，把它撕成两半。纸张裂开的声音落下，你将她的自由还给她。阿姬曼盯着你手里的两半契纸，神色却没有软下来。她生气地别开脸，没有道谢，也没有立刻相信这场赎身会改变她的处境。你们随后遇上商馆侍卫封住出城岔路，只得改道避开搜查。',
    'lcq.event.free_ajiman::pocket_ajiman_bond': '你把阿姬曼的身契收进怀里，决定出城后再说。阿姬曼看着你，没有答应跟你离开。',
    'lcq.event.shanghou_revealed::follow_yeao_to_shanghou': '你随叶媪进堂。主人打开裹着鲨皮的红木箱，里面的物件上有黄底黑边的三角和红色拐弯箭头。他说，先前一百六十七人触碰它后化为火球，埋骨路边；他要你也伸手一试。你尚未碰它。',
    'lcq.event.s05b_shanghou_reads_letter::hand_blank_letter_to_shanghou': '你喝下殇侯用一斤三两精盐兑成的盐水，玄冰掌随即落下。你吐出裹着蛊虫的冰块，冰蛊终于被解除。喘息稍定，你把黑鸦使者的白纸信交给殇侯，等他辨认。',
    'lcq.event.shanghou_revealed::confirm_zhu_is_shanghou': '主人终于现出熟悉的面孔。你认出他就是一路同行的朱老头，也当面听清了殇侯与天命之人的说法。',
    'lcq.event.shanghou_revealed::refuse_shanghou_relic_test': '你把手缩了回来：这是高压危险的警示标记，你不碰。堂中主人的目光沉了下来。',
    'lcq.event.ningyu_enters_gamble::answer_ningyu_on_debut': '你当面回应凝羽，接下苏妲己提出的赌局。凝羽奉命上场，赌局就此开始。',
  } as Record<string, string>)[`${eventId}::${actionId}`];
}

/** 结局承接只保留1–2个完整句；长句/格式异常直接舍弃，固定结局始终可发布。 */
export function endingBridge(raw: string, endingId?: string): string {
  if (endingId === 'lcq.ending.death.ghost_king_skull') return '你听见自己说「好」。武士的铁斧柄随即敲在你膝弯上。';
  if (endingId === 'lcq.ending.death.dragon_well') return '你抓起乐明珠的手，转身往洞窟深处的裂缝跑去。';
  if (endingId === 'lcq.ending.fail.dragon_essence') return '你双手握紧匕首，再一次朝龙颅的裂缝压了下去。';
  if (endingId === 'lcq.ending.death.shanghou_relic') return '你伸出手，指尖朝那块黄底黑边的三角落了下去。';
  if (endingId === 'lcq.ending.death.wangzhe_blast') return '你仍留在战场上，天光刺得你难以睁眼。';
  try {
    let text = visibleModuleText(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    if (text.startsWith('{')) text = String(JSON.parse(text).text || '');
    const sentences = text.match(/[^。！？!?]+[。！？!?][”’」』"]?/g) || [];
    const kept: string[] = [];
    for (const sentence of sentences.slice(0, 2)) {
      if (kept.join('').length + sentence.trim().length > 220) break;
      kept.push(sentence.trim());
    }
    return kept.join('');
  } catch { return ''; }
}


export interface SceneLedger {
  receipts: string[]; actors: Record<string, { status: 'dead' | 'missing' | 'departed' | 'present'; eventId: string; actionId: string; name?: string; characterId?: string }>;
  injuries: Record<string, string>; names: Record<string, string>; worldFacts: string[];
  groupInjuries?: Record<string, { label: string; text: string }>;
  lastBeat?: { eventId: string; actionId: string; facts: string[] };
}
export function stepScene(runtime: any, eventId?: string, actionId?: string): ScenarioStepScene | undefined {
  const event = runtime?.events?.find((e: any) => e.id === eventId);
  const actions = event?.playerCompletionContract?.actions || [];
  const prepared = runtime?.eventActionStates?.[eventId || '']?.preparations || [];
  return actionId ? actions.find((a: any) => a.id === actionId) : actions.find((a: any) => (a.requiresPreparation || []).every((p: string) => prepared.includes(p)) && !(a.kind === 'prepare' && prepared.includes(a.grantsPreparation)));
}
export function sceneDayPart(time: any): string {
  const hour = Number(time?.小时) || 0;
  return hour < 5 ? '深夜' : hour < 8 ? '清晨' : hour < 12 ? '上午' : hour < 17 ? '白天' : hour < 20 ? '黄昏' : '夜';
}
export function isNanhuangSceneStage(id?: string): boolean { return /^lcq\.stage_0(?:3b|4|4b)/.test(id || ''); }

/** 只由成功的本地步骤调用；同一步重复回执不重复改生死、物品或时间。 */
export function applyStepSceneLedger(save: SaveData, runtime: any, eventId: string, actionId: string, sceneOverride?: Partial<ScenarioStepScene>): void {
  const base=stepScene(runtime,eventId,actionId);
  const scene=base && sceneOverride ? {...base,...sceneOverride} : base;
  if (!scene || !isNanhuangSceneStage(runtime.modId)) return;
  const ledger: SceneLedger = runtime.sceneLedger ||= { receipts: [], actors: {}, injuries: {}, names: {}, worldFacts: [] };
  const receipt = `${eventId}::${actionId}`;
  if (ledger.receipts.includes(receipt)) return;
  ledger.receipts.push(receipt);
  for (const person of scene.cast?.exit || []) {
    const id=runtimeEntityId(runtime,person.name);
    ledger.actors[id] = { name:person.name, characterId:id, status: person.status, eventId, actionId };
    runtime.departedCast = person.status === 'dead'
      ? [...new Set([...(runtime.departedCast || []), id])]
      : (runtime.departedCast || []).filter((name: string) => name !== id);
  }
  for (const name of scene.ledgerEffects?.returnActors || []) {
    const id=runtimeEntityId(runtime,name);
    ledger.actors[id] = { name, characterId:id, status: 'present', eventId, actionId };
    runtime.departedCast = (runtime.departedCast || []).filter((n: string) => n !== id);
  }
  for(const [name,value] of Object.entries(scene.ledgerEffects?.names||{}))ledger.names[runtimeEntityId(runtime,name)]=value;
  for(const [name,value] of Object.entries(scene.ledgerEffects?.injuries||{}))ledger.injuries[runtimeEntityId(runtime,name)]=value;
  migrateRuntimePersonRecords(runtime);
  ledger.worldFacts = [...new Set([...ledger.worldFacts, ...(scene.ledgerEffects?.worldFacts || [])])];
  if (scene.ledgerEffects?.level) applyStoryLevel(save, scene.ledgerEffects.level.to);
  if (scene.ledgerEffects?.jiuyang) {
    const realm = (save as any).角色.属性.境界;
    // 九阳层次没有通用等级换算记录；保留现有高手榜等级，只记原著已有层次。
    if (realm && typeof realm === 'object') realm.九阳层次 = scene.ledgerEffects.jiuyang;
  }
  ledger.lastBeat = { eventId, actionId, facts: scene.fixedFacts?.length ? [...scene.fixedFacts] : [scene.fallbackText || scene.previousBeat || '本步已经落账。'] };
  if (scene.dayPart && (save as any).元数据?.时间) {
    const hours: Record<string, number> = { 清晨: 6, 上午: 9, 白天: 12, 黄昏: 18, 傍晚: 18, 夜: 21, 深夜: 0, 正午: 12 };
    const time = (save as any).元数据.时间;
    const target = hours[scene.dayPart] * 60;
    const current = (Number(time.小时) || 0) * 60 + (Number(time.分钟) || 0);
    const samePart = sceneDayPart(time) === scene.dayPart || (scene.dayPart === '正午' && Number(time.小时) === 12);
    if (!samePart) advanceClock(save, { minutes: (target - current + 1440) % 1440 }, receipt);
  }
}

/** 运行时事实摘要，缺字段的旧档按已有回执推导，不从模型文字反填。 */
export function sceneLedgerSummary(save: SaveData): Record<string, unknown> {
  const runtime = (save as any).世界?.状态?.剧本模组;
  const ledger: SceneLedger | undefined = runtime?.sceneLedger;
  const inventory = (save as any).角色?.背包;
  const done = new Set([...(runtime?.completedEventIds || []), ...(runtime?.travelLedger?.doneEventIds || [])]);
  const transformed = done.has('lcq.event.s04b_lingfei_baiyi_crisis_11') || done.has('lcq.event.s04b_xi_furen_trade_route');
  const yiHuState = transformed ? { status: 'transformed', detail: '被炼成血虎的怪物，不可当普通活人使用' }
    : done.has('lcq.event.s04_05') || /^lcq\.stage_0(?:4b|5b)/.test(runtime?.modId || '') ? { status: 'missing', detail: '山洪卷走后失踪' } : ledger?.actors?.易虎;
  return {
    日期: (save as any).元数据?.时间, 时段: sceneDayPart((save as any).元数据?.时间),
    主角: { 姓名: '程宗扬', 性别: '男', 身份: '白湖商馆南荒商队头领', 境界: (save as any).角色?.属性?.境界 },
    货币: inventory?.货币 || {}, 关键物品: Object.values(inventory?.物品 || {}).map((i: any) => ({ 名称: i.名称, 数量: i.数量 })),
    人物状态: { ...Object.fromEntries(Object.entries(ledger?.actors||{}).map(([id,value])=>[runtimeEntityName(runtime,id),value])), ...(yiHuState ? { 易虎: yiHuState } : {}) }, 伤病: Object.fromEntries(Object.entries(ledger?.injuries||{}).map(([id,value])=>[runtimeEntityName(runtime,id),value])),
    群体伤病: Object.values(ledger?.groupInjuries || {}),
    已故: [...new Set([runtimeEntityName(runtime,"lcq.character.duan_qiang"), runtimeEntityName(runtime,"lcq.character.wang_zhe"), ...Object.entries(ledger?.actors || {}).filter(([, v]) => v.status === 'dead').map(([id]) => runtimeEntityName(runtime,id))])],
    世界事实: [...(runtime?.completedEventIds?.includes('lcq.event.ghost_king_swallowed') ? [] : ['鬼王峒未平定，鬼巫王在世']), ...(ledger?.worldFacts || [])],
    上一拍要点: ledger?.lastBeat?.facts || runtime?.chronicle?.at(-1)?.summary || '',
  };
}
