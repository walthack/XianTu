#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

async function edit(relativePath, transform) {
  const path = resolve(root, relativePath);
  const value = JSON.parse(await readFile(path, 'utf8'));
  transform(value);
  await writeFile(path, JSON.stringify(value, null, 2));
}

await edit('mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_03.json', mod => {
  delete mod.scenario.chapters[0].activation;
});

await edit('mod-kit/generated/deepseek-v4-flash/yange/stages/lyg.shixiang_ambush.json', mod => {
  delete mod.canon.characters[13].locationId;
});

await edit('mod-kit/generated/deepseek-v4-flash/yunlong/stages/lyl.lin_an_black_sea.json', mod => {
  for (const faction of mod.canon.factions) {
    if (faction.headquartersLocationId == null) delete faction.headquartersLocationId;
  }
  if (!mod.canon.factions.some(faction => faction.id === 'liuchao.faction.mingqing_temple')) {
    mod.canon.factions.push({
      id: 'liuchao.faction.mingqing_temple',
      name: '明庆寺',
      description: '临安佛寺，鲁智深在此挂单。',
      type: '寺院',
      headquartersLocationId: 'liuchao.location.mingqing_temple',
    });
  }
  for (const flag of [
    'event.wei_yuan_first_contact.done',
    'event.lin_chong_confront.done',
    'event.wei_yuan_crisis_deepen.done',
    'event.gao_yanei_showdown.done',
    'event.cold_poison_mystery.done',
    'event.final_preparations.done',
  ]) mod.scenario.initialFlags[flag] = false;
  const chapters = mod.scenario.chapters;
  chapters[2].activation = [{ path: 'flags.chapter.lin_chong.done', operator: 'eq', value: true }];
  chapters[3].activation = [{ path: 'flags.chapter.wei_yuan.done', operator: 'eq', value: true }];
  chapters[4].activation = [{ path: 'flags.chapter.xue_sun.done', operator: 'eq', value: true }];
});

await edit('mod-kit/generated/deepseek-v4-flash/yunlong/stages/lyl.luoyang_cloud_secret.json', mod => {
  delete mod.canon.factions[1].headquartersLocationId;
  delete mod.canon.factions[2].headquartersLocationId;
});

await edit('mod-kit/generated/deepseek-v4-flash/yunlong/stages/lyl.luoyang_coup.json', mod => {
  if (!mod.canon.characters.some(character => character.id === 'lyl.character.cheng_zongyang')) {
    mod.canon.characters.unshift({
      id: 'lyl.character.cheng_zongyang',
      name: '程宗扬',
      description: '玩家扮演的正典主角。',
      role: '主角',
      gender: '男',
      locationId: mod.scenario.opening.locationId,
      affiliations: [],
      skillIds: [],
      techniqueIds: [],
      itemIds: [],
    });
  }
});

await edit('mod-kit/generated/deepseek-v4-flash/yunlong/stages/lyl.taiquan_core_conflict.json', mod => {
  mod.scenario.initialFlags['chapter.aftermath.done'] = false;
});

await edit('mod-kit/generated/deepseek-v4-flash/yunlong/stages/lyl.taiquan_expedition.json', mod => {
  const oldId = 'liuchao.character.guan_xin_niang';
  const newId = 'liuchao.character.ruan_xiang_lin';
  const replace = value => {
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) value[key] = replace(child);
      return value;
    }
    return value === oldId ? newId : value;
  };
  replace(mod);
  if (!mod.canon.factions.some(faction => faction.id === 'liuchao.faction.black_demon_sea')) {
    mod.canon.factions.push({
      id: 'liuchao.faction.black_demon_sea',
      name: '黑魔海',
      description: '与巫宗、毒宗相关的隐秘势力。',
      type: '隐秘宗派',
    });
  }
  mod.scenario.chapters[1].eventIds = mod.scenario.chapters[1].eventIds.filter(id => id !== 'liuchao.event.du_zong_raid');
});

await edit('mod-kit/generated/deepseek-v4-flash/yange/stages/lyg.ganlu_bian.json', mod => {
  const chapters = mod.scenario.chapters;
  delete chapters[0].activation;
  chapters[1].activation = [{ path: 'flags.event.yang_yuhuan_report_done', operator: 'eq', value: true }];
  chapters[2].activation = [{ path: 'flags.event.soul_summoning_done', operator: 'eq', value: true }];
  chapters[3].activation = [{ path: 'flags.event.su_sha_identified', operator: 'eq', value: true }];
});

await edit('mod-kit/generated/deepseek-v4-flash/qingyu/stage-plan.json', plan => {
  const stage = plan.stages.find(item => item.id === 'lcq.stage_06');
  stage.completedFacts = (stage.completedFacts || []).filter(fact => !fact.includes('龙神') && !fact.includes('合体失败'));
});

await edit('mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_06.json', mod => {
  mod.manifest.description = '鬼巫王即将与龙神合体，商队被卷入最终决战。玩家扮演程宗扬，在龙神失控前介入并改变战局。';
  mod.world.background = '鬼巫王以苍龙星阵召唤龙神，试图合体获得神力。商队众人已经进入鬼王峒决战区域，但合体、龙神失控及战后伤亡尚未发生。';
  mod.scenario.opening.text = '鬼巫王正试图与龙神合体，商队众人被卷入决战。谢艺、武二郎、乐明珠等人各自迎敌，程宗扬必须在龙神完成吞噬前寻找破局机会。';
  const relation = mod.canon.playerRelationships.find(item => item.characterId === 'liuchao.character.le_mingzhu');
  if (relation) relation.memories = (relation.memories || []).filter(memory => !memory.includes('杀死龙神'));
  mod.scenario.chapters[0].summary = '玩家与谢艺、武二郎会合，并确认鬼巫王与龙神合体的危机。';
  mod.scenario.events[0].description = '让玩家在鬼王峒与谢艺、武二郎等人会合，并得知鬼巫王正在尝试与龙神合体。';
  const ghostKing = mod.canon.characters.find(character => character.name === '鬼巫王');
  if (ghostKing) ghostKing.description = '鬼王峒首领，正在以苍龙星阵召唤龙神并尝试合体。';
});

await edit('mod-kit/generated/deepseek-v4-flash/yange/stage-plan.json', plan => {
  const stage = plan.stages.find(item => item.id === 'lyg.changgan_begins');
  Object.assign(stage, {
    openingAfterSourceIndex: 54,
    openingAfterHeading: '灞桥',
    openingBeforeSourceIndex: 55,
    openingBeforeHeading: '深谊',
    sourceStartIndex: Math.min(stage.sourceStartIndex, 50),
    sourceEndIndex: Math.max(stage.sourceEndIndex, 56),
    mappingReason: '程宗扬一行已由灞桥进入长安，后续长安主线即将展开。',
  });
  plan.stages.sort((a, b) => a.openingAfterSourceIndex - b.openingAfterSourceIndex);
});

await edit('mod-kit/generated/deepseek-v4-flash/yunlong/stage-plan.json', plan => {
  const stage = plan.stages.find(item => item.id === 'lyl.luoyang_coup');
  Object.assign(stage, {
    openingAfterSourceIndex: 282,
    openingAfterHeading: '矫诏',
    openingBeforeSourceIndex: 283,
    openingBeforeHeading: '侠义',
    sourceStartIndex: 275,
    sourceEndIndex: Math.max(stage.sourceEndIndex, 288),
    mappingReason: '刘骜已暴毙，矫诏夺权刚刚发生，长秋宫与洛都多方混战尚未进入高潮。',
  });
  plan.stages.sort((a, b) => a.openingAfterSourceIndex - b.openingAfterSourceIndex);
});
