import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTs } from './loadTs.mjs';

// critical event 必须**够得着**：绑在某个章的 eventIds 里，或在 canon rail 上。
//
// 立项由来（2026-08-19）：用户问「接下去这个 event 怎么触发没有显示在文档内」，
// 顺着读 `runtime.ts` 的推进循环，撞见比文档问题严重得多的东西——
//
//   `activeEventIds` 全仓只有两处 push：
//     · rail 那处      `orderedEventIds.find(id => !isEventSettled(...))`
//     · 章那处          `for (const eventId of chapterEventIds)`
//   **两者都够不到的 event 永远进不了 active**，玩家永远不会被给到它的目标与动作。
//
// 切关门禁现已只扫生产可达 critical（rail / 当前章 / 已 active）。未挂章 critical
// 不再挡 `stage_ready`，但玩家仍然永远激活不了它们，所以本测试继续要求绑章或上 rail。
//
// 决定性对照（2026-08-19 实测）：
//   lcq.stage_01   event  7　全绑章　critical 6　全在 rail 上　→ 0 悬空
//   lcq.stage_02   event 18　只绑 6　critical 全悬空 12 条　→ 整段白湖商馆剧情够不着
// 同一本书相邻两关，一关干净一关全悬——这不是设计选择，是迁移时漏绑。
//
// 隔离关（`DEFAULT_LINE_QUARANTINED_STAGE_IDS`）默认路线走不到，不计入。

const DIR = 'src/modules/scenarioMods/builtins/data/';

// 欠账清单：**只能减，不能增**。绑好一条就从这里删一条。
// stage_02 的 12 条已在同一提交里绑完，故不在此列。
const DEBT = new Set([
  'lcq.event.zixi_intercept',
  'lcq.event.haishen_hall_merfolk',
  'lcq.event.weapon_deal_with_geluo',
  'lcq.event.guiwangdong_coop_pact',
  'lcq.event.blank_letter_and_dagu',
  'lcq.event.geluo_summons_biji',
  'lcq.event.ice_gu_coercion',
  'lcq.event.persuade_wuerlang',
  'lcq.event.spot_dong_informant',
  'lcq.event.ruins_ghost_warriors',
  'lcq.event.enter_dong_with_migu',
  'lcq.event.hongmiao_controlled',
  'lcq.event.xiaozi_first_appears',
  'lcq.event.pull_harpoon_lemingzhu',
  'lcq.event.regroup_caravan_envoy',
  'lcq.event.wuerlang_slays_dagu',
  'lcq.event.yiyang_repels_yinsha',
  'lcq.event.escape_cave_mechanism',
  'lcq.event.biling_bay_stance',
  'lcq.event.huamiao_coop_boundary',
  'lcq.event.wangzhe_letter',
  'lcq.event.shanghou_revealed',
  'lcq.event.palace_haunting_rumor',
  'lcq.event.shanghou_cures_ice_gu',
  'lcq.event.palm_oath_shanghou',
  'lcq.event.xiangfu_stance',
  'lcq.event.spoils_split',
  'lcq.event.yeying_seat_struggle',
  'lcq.event.pengyi_takeover',
  'lcq.event.jin_vacate_jiangzhou',
  'lcq.event.tuntian_post',
  'lyg.event.changgan_fanseng_hunt',
  'lyg.event.qinglongsi_te_master',
  'lyg.event.song_tongwen',
  'lyg.event.interrogate_feiniao_yingzi',
  'lyg.event.liang_secret_order',
  'lyg.event.zhoufei_conspiracy',
  'lyg.event.feiniao_hilt_clue',
  'lyg.event.north_bureau_buddhist_moves',
  'lyg.event.honglusi_amends',
  'lyg.event.cien_red_lotus',
  'lyg.event.yuanzheng_globe',
  'lyg.event.xuanping_eunuch_murder',
  'lyg.event.survey_xingqing_palace',
  'lyg.event.prince_injury_control',
  'lyg.event.shuixiang_lure_setup',
  'lyg.event.spot_poison_assassin',
  'lyg.event.poolside_capture',
  'lyg.event.blast_moni_temple',
  'lyg.event.xinyong_reveals_fanmi',
  'lyg.event.mijing_superuser_roster',
  'lyg.event.shituolin_endgame_title_daduhu',
  'lyl.event.han_jianyu_refused',
  'lyl.event.han_power_vacuum',
  'lyl.event.han_sponsor_dingtao',
  'lyl.event.liujian_takes_nangong',
  'lyl.event.lvji_defiles_consort',
  'lyl.event.emperor_death_spreads',
  'lyl.event.arrange_escape_route',
  'lyl.event.changqiu_palace_defense',
  'lyl.event.bounty_and_hu_cavalry',
  'lyl.event.lvfengxian_breaks_line',
  'lyl.event.mingqingsi_lin_lu_meeting',
  'lyl.event.blacksea_iron_puppet',
  'lyl.event.siying_lane_saber_ambush',
  'lyl.event.tail_li_shishi',
  'lyl.event.evade_huangchengsi',
  'lyl.event.libu_registration',
  'lyl.event.leifeng_pagoda_invite',
  'lyl.event.leifeng_repel_gao',
  'lyl.event.weiyuan_extortion',
  'lyl.event.ivory_visit_weiyuan',
  'lyl.event.survey_wumu_mansion',
  'lyl.event.decode_bianmenwa_note',
  'lyl.event.meet_xue_yanshan',
  'lyl.event.identify_xue_cold_poison',
  'lyl.event.decide_chase_weiyuan',
  'lyl.event.pass_kotian_stone',
  'lyl.event.han_xingyue_framed',
  'lyl.event.han_limit_field',
  'lyl.event.jin_guangyuan_ledger',
  'lyl.event.han_court_grain_blame',
  'lyl.event.sacred_against_lin',
  'lyl.event.sacred_jin_drought',
  'lyl.event.xiaoyingzhou_lin_takes_seat',
  'lyl.event.xiaoyingzhou_cement_truce',
  'lyl.event.xiaoyingzhou_paper_plan',
  'lyl.event.xiaoyingzhou_paper_mint',
  'lyl.event.linjia_sees_ningyi',
  'lyl.event.xihu_villa_eavesdrop',
]);

function isCritical(event) {
  if (event.critical !== undefined) return event.critical;
  if (event.axisMethod === 'reviewed-no-anchor' || event.axisId === null) return false;
  return Boolean(event.axisBeat || event.axisId || typeof event.axisSeq === 'number');
}

test('critical event 必须绑在章里或 rail 上，否则玩家永远够不着', async () => {
  const { DEFAULT_LINE_QUARANTINED_STAGE_IDS } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const onRail = new Set(CANON_RAIL_PROFILES.flatMap(profile => profile.orderedEventIds));

  const unreachable = [];
  for (const file of fs.readdirSync(DIR).filter(name => name.endsWith('.json'))) {
    const mod = JSON.parse(fs.readFileSync(DIR + file, 'utf8'));
    if (!mod.scenario?.worldSimulation) continue;
    if (DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(mod.manifest.id)) continue;
    const bound = new Set((mod.scenario.chapters || []).flatMap(chapter => chapter.eventIds || []));
    for (const event of mod.scenario.events || []) {
      if (!isCritical(event)) continue;
      if (bound.has(event.id) || onRail.has(event.id)) continue;
      unreachable.push(`${mod.manifest.id}　${event.id}　${event.name || ''}`);
    }
  }

  const unexpected = unreachable.filter(row => !DEBT.has(row.split('\u3000')[1]));
  assert.deepEqual(
    unexpected, [],
    '这些 critical event 既不在任何章的 eventIds 里也不在 rail 上——玩家永远激活不了它们，'
    + '且它们会挡住 stage_ready。要么绑进章，要么明确它为什么不该是 critical',
  );

  const cleared = [...DEBT].filter(id => !unreachable.some(row => row.includes(id)));
  assert.deepEqual(
    cleared, [],
    `欠账清单里这些已经够得着了，请从 DEBT 删掉（清一条删一条，别让清单虚高）：\n${cleared.join('\n')}`,
  );
});

test('rail 关里「不在 rail 上的 critical」数量不得增长', async () => {
  // ⚠ 这一条与上一条性质不同，别混：上一条是**硬缺陷**（够不着），这一条是**顺序性隐患**。
  //
  // rail 只覆盖 profile 指定的那一个章的那串 orderedEventIds。落在 rail 之外、
  // 但绑了章的 critical 仍能激活——章循环对非 rail 事件照常按 conditions 放行。
  // 隐患在于 `railStageComplete` 一旦成立会清空 activeEventIds 并把所有章标完成；
  // 切关门禁现已不再让这些拍挡住 `stage_ready`，但仍会错过它们。数量只减不增。
  //
  // 是否真的卡死取决于玩家次序与模型是否越序落 flag，故这里不断言「必须为 0」，
  // 只钉住数量不再增长。真要判定得靠真机自测（skill `xiantu-game-selftest`）实跑。
  const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const offRail = [];
  for (const profile of CANON_RAIL_PROFILES) {
    const file = `${DIR}${profile.modId}.json`;
    if (!fs.existsSync(file)) continue;
    const mod = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ordered = new Set(profile.orderedEventIds);
    for (const event of mod.scenario?.events || []) {
      if (isCritical(event) && !ordered.has(event.id)) offRail.push(`${profile.modId}　${event.id}`);
    }
  }
  assert.ok(
    offRail.length <= 114,
    `rail 关里「不在 rail 上的 critical」从 114 涨到了 ${offRail.length} —— 新增的拍要么进 rail，要么确认它不该是 critical`,
  );
});
