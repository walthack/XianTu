import type { CharacterBaseInfo, SaveData } from '@/types/game';
import { createMinimalSaveDataV3 } from '@/utils/dataRepair';

import type { ScenarioMod } from './schema';
import { advanceScenarioRuntime } from './runtime';
import { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } from './strictInitializer';

export const QINGYU_OPENING_PLAYTEST_CHARACTER_ID = 'char_qingyu_opening_playtest_v1';
export const QINGYU_OPENING_PLAYTEST_SLOT = '清羽记开局';
export const QINGYU_OPENING_PLAYTEST_KIND = 'qingyu-demo-v1';
export const QINGYU_OPENING_PLAYTEST_MOD_ID = 'lcq.stage_01';
export const QINGYU_OPENING_PLAYTEST_END_MOD_ID = 'lcq.stage_02';
export const QINGYU_OPENING_PLAYTEST_EXTENSION_KEY = '清羽记开局';

/** Demo 里 s01_01 自由行动这么多回合后由世界自行结清，激活下一段。建档预跑占 1，玩家再输入 2 回合后到点。 */
export const QINGYU_OPENING_S01_01_AUTO_STALL_TURNS = 3;
/** Demo 仅这两拍到点织入当前行动：s01_01 过渡遇袭，s01_02 段强既定死亡。其它拍不默认自动推进叙事。 */
export const QINGYU_DEMO_TIMER_WEAVE_EVENT_IDS = ['lcq.event.s01_01', 'lcq.event.s01_02'] as const;

export const QINGYU_OPENING_PLAYTEST_EVENT_IDS = [
  'lcq.event.s01_01',
  'lcq.event.s01_02',
  'lcq.event.s01_03',
  'lcq.event.s01_04',
  'lcq.event.s01_06',
  'lcq.event.s01_05',
  'lcq.event.s02_01',
  'lcq.event.s02_03',
  'lcq.event.s02_02',
  'lcq.event.s02_04',
  'lcq.event.s02_05',
  'lcq.event.s02_06',
  'lcq.event.ningyu_enters_gamble',
  'lcq.event.sudaji_south_pact',
  'lcq.event.gamble_bond_signed',
  'lcq.event.charge_sudaji_fee',
  'lcq.event.free_ajiman',
  'lcq.event.baihu_shangguan_escape',
] as const;

export interface QingyuOpeningPlaytestMarker {
  kind: typeof QINGYU_OPENING_PLAYTEST_KIND;
  disposable: true;
  persistence: 'isolated-local';
  scope: string;
  startModId: typeof QINGYU_OPENING_PLAYTEST_MOD_ID;
  endModId: typeof QINGYU_OPENING_PLAYTEST_END_MOD_ID;
  eventIds: string[];
}

// ⚠ 开场正文只写**眼前的场景**，不写任何一拍之后的事，也不写机制。
//
// 初版（2026-08-19，Grok 照抄 world_sim 试玩样板）在这里写了
// 「按固定顺序走完十八拍：穿越、段强之死、战场遇月霜、王哲传功、五原城落为奴隶……」
// 以及「Canon Rail 钉死」「任务栏会给出当前合同」「两处绝路会直接结束本局」——
// **把整段剧情剧透完了，还把机制术语写进了叙事面**。制作人一进游戏就看到了。
//
// 这些话本身没错，但它们属于**入口卡片**（玩家在那里决定要不要开始，知道范围是合理的），
// 不属于开场正文。卡片上已经写了，这里再写一遍纯属有害。
// 这与本轮清理 objective 的规矩是同一条：玩家看到的东西里不许有开发者语言与剧透。
const OPENING_TEXT = `雷光是紫色的。

机舱在那一瞬间失去了所有声音——引擎、广播、邻座的呼吸，一齐没了。等你重新听见东西，耳朵里只剩风，草叶擦过脸颊的窸窣，以及远处某种连成一片的低鸣，像是很多人在同时喊叫。

你趴在草里。掌心下面是湿的泥土和草根，不是座椅，不是金属。段强在几步开外，还没爬起来。

天是亮的。风里有血腥味。`;

/** 切关进帅帐只写眼前，不写王哲身死或玩家可改结局。 */
export const QINGYU_STAGE_02_OPENING_TEXT = `帅帐里灯火压得很低。

帐外还能听见远处的喊杀，但这里已经静下来了。案上有一只未拆的锦囊，对面的人还坐着，像是有话要当面说完。

帐帘刚落下。你站在门槛里。`;

export function overlayQingyuStage02Opening(mod: ScenarioMod): ScenarioMod {
  if (mod.manifest.id !== QINGYU_OPENING_PLAYTEST_END_MOD_ID) return mod;
  const next = structuredClone(mod);
  next.scenario.opening = { ...next.scenario.opening, text: QINGYU_STAGE_02_OPENING_TEXT };
  applyQingyuDemoNaturalIntents(next);
  return next;
}

function overlayDemoActionIntent(
  mod: ScenarioMod,
  eventId: string,
  actionId: string,
  extraAny: string[],
  extraReject: string[] = [],
): void {
  const action = mod.scenario.events
    ?.find(item => item.id === eventId)
    ?.playerCompletionContract?.actions?.find(item => item.id === actionId);
  if (!action) return;
  action.intentMatch = {
    matchAny: [...new Set([...(action.intentMatch?.matchAny || []), ...extraAny])],
    rejectIf: [...new Set([...(action.intentMatch?.rejectIf || []), ...extraReject])],
  };
}

function applyQingyuDemoNaturalIntents(mod: ScenarioMod): void {
  const event = (
    eventId: string,
    extraAny: string[],
    extraReject: string[] = [],
  ) => overlayDemoActionIntent(mod, eventId, 'advance_declared_objective', extraAny, extraReject);

  // Demo 的自然行动只是把玩家意图映射到当前 fresh 合同；成功、移动、物品和死亡
  // 仍全部由本地 settlement 决定。短语只覆盖眼前可执行动作，否定与离场优先拒绝。
  event('lcq.event.s01_01', [
    '稳住自己', '弄清身在何处', '确认段强', '查看段强', '弄清这片草原', '观察四周', '找掩体', '处理落地',
  ], ['不管段强', '丢下段强']);
  event('lcq.event.s01_02', [
    '带段强躲开', '拉段强避箭', '掩护段强', '寻找掩护', '躲开半兽人', '避开箭袭',
  ]);
  event('lcq.event.s01_03', [
    '见月霜', '上前查看伤者', '看看那个伤兵', '查看伤者', '扶住伤者', '救那个伤兵',
  ]);
  event('lcq.event.s01_04', [
    '带伤者脱险', '带伤兵脱险', '护着伤者撤退', '跟修士撤离', '离开战场',
  ], ['独自离开', '丢下伤者']);
  event('lcq.event.s01_05', [
    '去帅帐', '前往帅帐', '走进帅帐', '见王哲', '请他看伤', '说明自己的来历',
  ]);
  event('lcq.event.s01_06', [
    '见月霜', '应对眼前危局', '压住寒毒', '替月霜疗伤', '救月霜',
  ]);

  event('lcq.event.s02_01', [
    '听王哲交代', '听他说完', '问王哲还有什么事', '询问王哲后事', '听清三件事',
  ], ['不听王哲', '转身离开帅帐']);
  event('lcq.event.s02_03', [
    '观察秦军和罗马军交战', '观察战局', '躲避交战', '跟着月霜求生', '在乱军中活下来',
  ], ['冲出帅帐逃亡']);
  overlayDemoActionIntent(mod, 'lcq.event.s02_02', 'hold_left_army_line', [
    '守住左武军阵线', '看清左武军为何覆灭', '留在帅帐观察战场',
  ], ['离开帅帐']);
  overlayDemoActionIntent(mod, 'lcq.event.s02_02', 'witness_wang_zhe_nine_suns', [
    '看王哲施展九阳', '见证王哲九阳合一', '守在王哲身边',
  ], ['阻止王哲出手']);
  overlayDemoActionIntent(mod, 'lcq.event.s02_02', 'record_battlefield_aftermath', [
    '确认战场余波', '查看焦土', '确认王哲殉军结果', '看清左武军结局',
  ]);
  // s02_04 必须走五原地图与局部问题动作，不能用旧事件按钮／自然句绕开地图回执。
  event('lcq.event.s02_05', [
    '判断她要带我去哪', '询问她要去哪', '跟着她离开地牢', '观察靠近的人', '试探她的来意',
  ], ['拒绝离开地牢']);
  event('lcq.event.s02_06', [
    '与馆主周旋', '询问馆主身份', '观察白湖馆主', '看清她是谁', '回应馆主',
  ]);
  overlayDemoActionIntent(mod, 'lcq.event.ningyu_enters_gamble', 'see_ningyu_sent_into_gamble', [
    '看清凝羽进入赌局', '观察凝羽入局', '弄清谁把凝羽送来',
  ]);
  overlayDemoActionIntent(mod, 'lcq.event.ningyu_enters_gamble', 'answer_ningyu_on_debut', [
    '回应凝羽', '和凝羽说话', '询问凝羽来意',
  ]);
  overlayDemoActionIntent(mod, 'lcq.event.sudaji_south_pact', 'offer_nylon_clue_for_term', [
    '用霓龙丝线索换期限', '拿霓龙丝线索谈条件', '提出三个月期限',
  ]);
  overlayDemoActionIntent(mod, 'lcq.event.sudaji_south_pact', 'seal_three_month_south_pact', [
    '订下三个月南荒之约', '答应三个月之约', '与苏妲己当面立约',
  ], ['拒绝南荒之约']);
  overlayDemoActionIntent(mod, 'lcq.event.gamble_bond_signed', 'confirm_rigged_wager_loss', [
    '检查刻香', '确认赌局落败', '看清刻香被动了手脚',
  ]);
  overlayDemoActionIntent(mod, 'lcq.event.gamble_bond_signed', 'sign_the_bond', [
    '回应眼前契书', '拿起契书', '签下身契', '面对赌债契书',
  ], ['拒绝签契', '撕毁契书']);
  overlayDemoActionIntent(mod, 'lcq.event.charge_sudaji_fee', 'name_sixty_zhu_before_help', [
    '开价六十金铢', '向苏妲己报价', '先谈六十金铢工价',
  ]);
  overlayDemoActionIntent(mod, 'lcq.event.charge_sudaji_fee', 'lock_fee_then_remove_device', [
    '谈定报酬', '收下六十金铢', '谈妥后取出器物',
  ]);
  overlayDemoActionIntent(mod, 'lcq.event.free_ajiman', 'take_ajiman_bond_in_hand', [
    '拿到阿姬曼身契', '把阿姬曼的身契拿过来', '索要阿姬曼身契',
  ]);
  overlayDemoActionIntent(mod, 'lcq.event.free_ajiman', 'tear_bond_and_face_blockade', [
    '撕毁阿姬曼身契', '当面撕契', '带阿姬曼离开', '改道出城',
  ]);
  overlayDemoActionIntent(mod, 'lcq.event.baihu_shangguan_escape', 'walk_out_wuyuan_shangguan', [
    '离开五原商馆', '走出五原商馆', '离开白湖商馆', '走出商馆',
  ]);
}

function applyQingyuOpeningDemoOverrides(mod: ScenarioMod): void {
  // 限时自动推进只覆写开场落地拍。A 线 TES（去哪/见谁、到达即推进）不加 timer。
  const event = mod.scenario.events?.find(item => item.id === 'lcq.event.s01_01');
  if (event) {
    event.playerPresence = 'required';
    event.offscreenResolution = {
      id: 'offscreen.qingyu_demo.lcq_event_s01_01',
      afterStallTurns: QINGYU_OPENING_S01_01_AUTO_STALL_TURNS,
      flagKey: 'world.qingyu_demo.lcq_event_s01_01.offscreen_resolved',
      resolvedEventIds: ['lcq.event.s01_01'],
      worldDelta: '你已经看清：这不是上海，是一片正在交战的草原。段强还在身边，远处的喊杀声正往这边压。',
      onSceneDelta: '风里的血腥味不再含糊。你看清了草浪、旗帜和兽影，也看清段强就在几步外。这片草原正在开战。',
      evidence: '清羽 Demo：s01_01 在玩家自由行动 2-3 回合后由世界自行结清穿越落地，激活下一段。',
    };
  }
  const tent = mod.scenario.events?.find(item => item.id === 'lcq.event.s01_05');
  if (tent) tent.locationId = 'lcq.location.command_tent';
  applyQingyuDemoNaturalIntents(mod);
}

function applyCreationPreset(save: SaveData, mod: ScenarioMod): void {
  const preset = mod.scenario.opening.creationPreset;
  const identity = save.角色.身份 as CharacterBaseInfo;
  identity.名字 = preset?.characterName || '程宗扬';
  if (preset?.gender) identity.性别 = preset.gender;
  if (preset?.race) identity.种族 = preset.race;
  identity.世界 = (mod.world?.name || '六朝') as unknown as CharacterBaseInfo['世界'];
  identity.天资 = (preset?.talentTier || { name: '异世来客' }) as CharacterBaseInfo['天资'];
  identity.出生 = preset?.origin?.name || '现代来客';
  identity.灵根 = (preset?.spiritRoot || { name: '生死根' }) as CharacterBaseInfo['灵根'];
  identity.天赋 = (preset?.talents || []).map((talent, index) => ({
    id: 9100 + index,
    name: talent.name,
    description: talent.description,
    rarity: '特殊',
    talent_cost: 0,
  })) as unknown as CharacterBaseInfo['天赋'];
  if (preset?.attributes) {
    identity.先天六司 = {
      根骨: preset.attributes.rootBone,
      灵性: preset.attributes.spirituality,
      悟性: preset.attributes.comprehension,
      气运: preset.attributes.fortune,
      魅力: preset.attributes.charm,
      心性: preset.attributes.temperament,
    };
  }
}

export function createQingyuOpeningPlaytestSave(mod: ScenarioMod, generatedAt = new Date().toISOString()): SaveData {
  if (mod.manifest.id !== QINGYU_OPENING_PLAYTEST_MOD_ID) {
    throw new Error(`清羽记开局试玩需要内置模组 ${QINGYU_OPENING_PLAYTEST_MOD_ID}`);
  }
  // 开场正文已经把穿越落地演给玩家看，但 s01_01 仍要留 2-3 回合自由行动，
  // 再由世界自行结清并激活 s01_02。不预置 done，也不改全局事件 schema。
  const playtestMod = structuredClone(mod);
  applyQingyuOpeningDemoOverrides(playtestMod);
  const save = applyStrictScenarioInitializationToSave(
    createMinimalSaveDataV3(),
    buildStrictScenarioInitialization(playtestMod, generatedAt),
  );
  applyCreationPreset(save, mod);
  // 预跑一轮引擎：激活发生在 advanceScenarioRuntime 内部。不预跑的话第一屏
  // 任务栏只有「章节：第1章·穿越」，没有 objective、没有完成合同按钮。
  const primed = advanceScenarioRuntime(save).saveData;
  save.世界 = primed.世界;

  save.元数据 = {
    ...save.元数据,
    存档ID: 'qingyu-opening-playtest-v1',
    存档名: QINGYU_OPENING_PLAYTEST_SLOT,
    创建时间: generatedAt,
    更新时间: generatedAt,
  };
  delete save.系统.扩展.开发验收;
  const marker: QingyuOpeningPlaytestMarker = {
    kind: QINGYU_OPENING_PLAYTEST_KIND,
    disposable: true,
    persistence: 'isolated-local',
    scope: 'lcq.stage_01-lcq.stage_02/s01_01-baihu_shangguan_escape',
    startModId: QINGYU_OPENING_PLAYTEST_MOD_ID,
    endModId: QINGYU_OPENING_PLAYTEST_END_MOD_ID,
    eventIds: [...QINGYU_OPENING_PLAYTEST_EVENT_IDS],
  };
  save.系统.扩展[QINGYU_OPENING_PLAYTEST_EXTENSION_KEY] = marker;
  save.系统.历史.叙事 = [{
    type: 'gm',
    content: OPENING_TEXT,
    time: '【清羽·草原落地】',
    actionOptions: [
      '先确认段强还在身边',
      '弄清这片草原是哪里',
      '找掩体观察四周',
    ],
  }];
  save.社交.记忆.短期记忆 = [OPENING_TEXT];
  return save;
}

export function isQingyuOpeningPlaytestSave(saveData: SaveData | null | undefined): boolean {
  return saveData?.系统?.扩展?.[QINGYU_OPENING_PLAYTEST_EXTENSION_KEY]?.kind === QINGYU_OPENING_PLAYTEST_KIND;
}
