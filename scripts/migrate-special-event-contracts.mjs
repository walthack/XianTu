#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const books = ['qingyu', 'yunlong', 'yange'];

const debutIds = new Set([
  'lcq.event.debut_yueshuang',
  'lcq.event.debut_lemingzhu',
  'lcq.event.s07_debut_qinhui',
  'lcq.event.s08_debut_xiaoyaoyi',
  'lcq.event.debut_panjinlian',
  'lyl.event.debut_zhuoyunjun',
  'lyl.event.debut_yundanliu',
  'lyl.event.debut_yunruyao',
  'lyl.event.debut_zhaohede',
  'lyl.event.debut_yinfulan',
  'lyl.event.debut_jingli',
  'lyl.event.debut_jianyuji',
  'lyg.event.debut_shefuren',
  'lyg.event.debut_daiqisi',
  'lyg.event.debut_lvzhi',
  'lyg.event.debut_chengguang',
  'lyg.event.debut_qiyuxian',
  'lyg.event.debut_jiawenhe',
  'lyg.event.debut_yangyuhuan',
  'lyg.event.debut_quanyuji',
  'lyg.event.debut_bainichang',
]);

const objectiveById = new Map(Object.entries({
  'lcq.event.s07_qinhui_join': '确认秦桧归入麾下后的职责与约束',
  'lyl.event.yin_fulan_aid': '接受尹馥兰援手并确认后续安排',
  'lyl.event.plan_counterattack': '与同伴确定下一步反制计划',
  'lyl.event.pan_jinlian_ambush': '应对潘金莲发动的伏击',
  'lyl.event.yin_yang_counter': '利用阴阳鱼线索抵御追击',
  'lyl.event.decide_yin_fulan_fate': '处理尹馥兰去留与当前局势余波',
  'lyg.event.buddhist_conspiracy_lore_nuclear_treaty': '听取并核对“核武不扩散条约”的来历',
  'lyg.event.lvzhi_zhenjiu': '见证吕雉亲裁诸吕并承接政局变化',
  'lyg.event.dengji_yuzuo_yinhuan': '完成登基大典后的私密余波',
  'lyg.event.yangwuhou_rumor': '查明《阳武侯小史》流言的来源与影响',
}));

const sequences = new Map(Object.entries({
  'lcq.event.s02_02': {
    objective: '完整见证左武军覆灭与王哲殉军的三段因果',
    steps: [
      ['hold_left_army_line', '守住左武军覆灭的前因视角', '我留在战局视角内，先确认左武军在多方围攻下伤亡殆尽及军械尽毁的前因。'],
      ['witness_wang_zhe_nine_suns', '见证王哲九阳合一', '我继续见证王哲脱甲悬空、九阳依次点亮并合一如日轮，不让旁人抢走这次收束。'],
      ['record_battlefield_aftermath', '确认焦土余波与殉军结果', '我确认毁灭性光球坠地后的焦土余波，把王哲殉军与左武军覆灭完整落账。'],
    ],
  },
  'lcq.event.s04_05': {
    objective: '完整经历易虎救人、受创、被洪水吞没与易彪送别',
    steps: [
      ['respond_to_flash_flood', '应对山洪并见证易虎先救两人', '我应对骤发山洪，先确认易虎救起易彪与年轻军士的次序。'],
      ['witness_yihu_last_stand', '见证千斤坠与巨石重创', '我留在现场见证易虎以千斤坠硬扛洪峰，继而被巨石正中胸口并遭洪水吞没。'],
      ['stay_for_yibiao_farewell', '陪易彪完成岸边送别', '洪峰退去后，我陪易彪留在岸边，确认他的认兄与磕头送别。'],
    ],
  },
  'lyg.event.highlight_banchao_lamb_leg': {
    objective: '完整见证班超以霹雳手段镇场并为田荣留下退路',
    steps: [
      ['hold_banchao_entrance', '让班超以羊腿砸案夺回场面', '我不抢班超的主导，让他排闼而入、以羊腿砸案并用刀尖挑肉逼吉策回应。'],
      ['hear_nine_gate_evidence', '听完九门出入记录的证据', '我继续听班超逐条点出九门出入记录，确认他的威吓建立在准备与证据上。'],
      ['witness_tianrong_exit', '见证班超替田荣安排差事', '众商贾服软后，我见证班超收锋，为田荣安排一份差事，保留这场镇压的收束余地。'],
    ],
  },
}));

function outcomeText(objective) {
  return {
    success: `你已完成“${objective}”的当前结构化步骤；最终完成真值由本地引擎落账。`,
    partial: '该展示动作不产生 partial；需要分歧时必须另建本地判定合同。',
    failure: '该展示动作不产生 failure；需要失败与重试时必须另建本地判定合同。',
  };
}

function singleActionContract(objective, actionText) {
  return {
    kind: 'objective_action',
    settleOn: ['success'],
    actions: [{
      id: 'advance_curated_event',
      label: objective,
      actionText,
      timeCost: 1,
      outcomeText: outcomeText(objective),
    }],
  };
}

function sequenceContract(sequence) {
  return {
    kind: 'objective_action',
    settleOn: ['success'],
    actions: sequence.steps.map(([id, label, actionText], index) => ({
      id,
      label,
      actionText,
      timeCost: 1,
      ...(index < sequence.steps.length - 1 ? {
        kind: 'prepare',
        grantsPreparation: `sequence_step_${index + 1}`,
      } : {}),
      ...(index > 0 ? { requiresPreparation: [`sequence_step_${index}`] } : {}),
      outcomeText: outcomeText(label),
    })),
  };
}

const expectedIds = new Set([...debutIds, ...objectiveById.keys(), ...sequences.keys()]);
const foundIds = new Set();
let changedEvents = 0;
let changedStages = 0;

for (const book of books) {
  const directory = path.join(root, 'mod-kit/generated/deepseek-v4-flash', book, 'stages');
  for (const filename of fs.readdirSync(directory).filter(item => item.endsWith('.json')).sort()) {
    const target = path.join(directory, filename);
    const stage = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (!stage.manifest?.id || !Array.isArray(stage.scenario?.events)) continue;
    let touched = false;
    for (const event of stage.scenario.events) {
      if (!expectedIds.has(event.id)) continue;
      foundIds.add(event.id);
      if (event.playerCompletionContract) continue;
      const sequence = sequences.get(event.id);
      const objective = sequence?.objective
        || objectiveById.get(event.id)
        || `留在现场完成“${event.name}”的首次接触`;
      if (apply) {
        event.objective = objective;
        event.playerCompletionContract = sequence
          ? sequenceContract(sequence)
          : singleActionContract(
            objective,
            debutIds.has(event.id)
              ? `我留在现场观察并回应，完成“${event.name}”的首次接触。`
              : `我按当前事件目标行动：${objective}`,
          );
      }
      touched = true;
      changedEvents++;
    }
    if (apply && touched) {
      fs.writeFileSync(target, `${JSON.stringify(stage, null, 2)}\n`);
      changedStages++;
    }
  }
}

const missing = [...expectedIds].filter(id => !foundIds.has(id));
if (missing.length) throw new Error(`Missing curated event ids: ${missing.join(', ')}`);
console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  expected: expectedIds.size,
  changedEvents,
  changedStages,
  existing: expectedIds.size - changedEvents,
}, null, 2));
