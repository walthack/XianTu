#!/usr/bin/env node

// 生成 yunlong / yange if 线(各3条,新主轴 axisId,四模式,脱敏)。Claude 设计+用户后审。
// Usage: node scripts/gen-if-branches-yl-yg.mjs

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ccDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const binding = JSON.parse(readFileSync(join(ccDir, 'axis-binding.json'), 'utf8'));
const byAxisId = new Map(binding.nodes.map(n => [n.axisId, n]));
const node = a => { const n = byAxisId.get(a); if (!n) throw new Error('无 axisId: ' + a); return n; };
const fork = a => { const n = node(a); return { axisId: a, seq: n.seq, anchor: n.anchor }; };
const repl = (a, beat) => { const n = node(a); return [{ id: 'node_01', sourceAxisId: a, sourceSeq: n.seq, sourceAnchor: n.anchor, heading: n.heading, beat }]; };

const BOOKS = {
  yunlong: {
    bookTitle: '六朝云龙吟',
    branches: [
      {
        id: 'lyl.if_youtongqi_rescued', title: '救昭仪 · 友通期未殁', status: 'reviewed',
        branchType: 'returning', runtimeMode: 'future_stage', kind: 'character_rescue',
        forkId: 'yunlong.278.2', overturns: '吕冀在含光殿勒杀并凌辱赵昭仪（友通期）之尸。',
        replBeat: '程宗扬与赵合德自藻井上及时出手，救下垂危的友通期；吕冀之恶被截，但其乱政未止。',
        reconverge: { mode: 'spine', spineId: 'spine_lushi_regime', description: '救下友通期改写后宫局,但吕氏外戚专权脊柱不变,仍汇回其兴亡主线。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true }, { spineId: 'spine_lushi_regime', mustRemain: true }],
        preserve: ['吕氏专权如期', '刘骜已暴毙'], blocked: ['吕氏提前覆灭'],
        notes: '角色救援型,低半径。友通期存活=未来可用伏笔。',
      },
      {
        id: 'lyl.if_shankou_protagonist_fall', title: '山口殒落 · 主角之死（死亡结局）', status: 'reviewed',
        branchType: 'ending', runtimeMode: 'future_stage', kind: 'protagonist_death',
        forkId: 'yunlong.206.1', overturns: '程宗扬于山口镇遭吕氏四军围杀,在援军/谋略下脱险。',
        replBeat: '若援军未至、突围失策,程宗扬力竭殁于山口镇乱军之中。',
        reconverge: { mode: 'ending', endingType: 'death', description: '产出死亡结局:程宗扬殁于吕氏围杀,游戏在此分支终止,不汇回脊柱。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true, note: '致主角死→路由死亡结局terminus,非违规' }],
        preserve: [], blocked: ['主角死后继续挂剧情/冒充canon'], protagonistPresent: false,
        notes: '死亡结局范本(云龙)。',
      },
      {
        id: 'lyl.if_shankou_cost_shift', title: '山口血路 · 代价转移', status: 'reviewed',
        branchType: 'returning', runtimeMode: 'future_stage', kind: 'cost_shift',
        forkId: 'yunlong.206.1', overturns: '山口围杀中程宗扬一行的具体伤亡分布。',
        replBeat: '突围结果不变(脱险),但战死/重伤的代价换到另一名随从头上,主轴照常推进。',
        reconverge: { mode: 'spine', spineId: 'spine_lushi_regime', description: '同一脱险结果,代价换人付,汇回吕氏专权线。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true }, { spineId: 'spine_lushi_regime', mustRemain: true }],
        preserve: ['程宗扬脱险', '吕氏专权如期'], blocked: ['程宗扬被围杀致死'],
        notes: '代价转移,低半径。',
      },
      {
        id: 'lyl.if_xiaoyingzhou_early_win', title: '小瀛洲早胜 · 黑魔海暂退', status: 'reviewed',
        branchType: 'returning', runtimeMode: 'future_stage', kind: 'antagonist_setback',
        forkId: 'yunlong.58.1', overturns: '小瀛洲杀局中剑玉姬等人撤退,黑魔海仍保留后续行动能力。',
        replBeat: '程宗扬在小瀛洲杀局中提前识破剑玉姬真身并重创其布局,西门庆线被压低,黑魔海临安行动暂退。',
        reconverge: { mode: 'spine', spineId: 'spine_lushi_regime', description: '黑魔海临安线受挫,但吕氏外戚专权和汉宫政变脊柱不变。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true }, { spineId: 'spine_lushi_regime', mustRemain: true }],
        preserve: ['吕氏专权如期', '程宗扬继续卷入汉宫政变'], blocked: ['黑魔海被提前彻底消灭'],
        notes: '反派暂退,不删除后续黑魔海承重线。',
      },
      {
        id: 'lyl.if_hanguang_hostage_saved', title: '含光殿抢救 · 昭仪留证', status: 'reviewed',
        branchType: 'returning', runtimeMode: 'future_stage', kind: 'character_rescue',
        forkId: 'yunlong.294.1', overturns: '含光殿中程宗扬击杀古格尔、救出昭仪,但宫变罪证仍碎片化。',
        replBeat: '程宗扬击杀古格尔后保住更多昭仪证词和现场证据,使吕氏乱政暴露更清楚,但刘建终局仍需阙楼清算。',
        reconverge: { mode: 'spine', spineId: 'bridge_dingtaowang_succession', description: '证据更充分只改变清算方式,定陶王交棒桥梁仍如期进入燕歌。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true }, { spineId: 'bridge_dingtaowang_succession', mustRemain: true }],
        preserve: ['定陶王交棒燕歌', '刘建伏诛'], blocked: ['汉宫终局提前取消'],
        notes: '证据/救援型,中低半径。',
      },
    ],
  },
  yange: {
    bookTitle: '六朝燕歌行',
    branches: [
      {
        id: 'lyg.if_guojie_longrest', title: '托孤未竟 · 郭解重伤长养', status: 'reviewed',
        branchType: 'returning', runtimeMode: 'future_stage', kind: 'ally_death', overturnMode: 'incapacitate_longrest',
        forkId: 'yange.3.1', overturns: '郭解被剑玉姬刺穿心脉,临终托孤定陶王后身亡。',
        replBeat: '郭解重伤未死,弥留中仍托孤定陶王(托孤照常),被救后陷长期休养、退出舞台——等同死亡的剧情效果,只换得"郭解尚在"的伏笔。',
        reconverge: { mode: 'spine', spineId: 'arc_dingtaowang_enthrone', description: '托孤完成、定陶王登基承接线如期,郭解长养离场近乎原样汇回。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true }, { spineId: 'arc_dingtaowang_enthrone', mustRemain: true }],
        preserve: ['定陶王被托付给程宗扬', '登基承接如期'], blocked: ['郭解后段重新active改写大局'],
        notes: '死亡软翻转(重伤长养)。郭解=燕歌版谢艺。',
      },
      {
        id: 'lyg.if_dongzhuo_longrest', title: '董卓重伤长养', status: 'reviewed',
        branchType: 'returning', runtimeMode: 'future_stage', kind: 'ally_death', overturnMode: 'incapacitate_longrest',
        forkId: 'yange.3.2', overturns: '董卓被暗箭射中肩头重伤,在贾文和怀中去世。',
        replBeat: '董卓中箭重伤未死,被贾文和救回长期疗养、退出前台;只改"提及其死"的情节,余者不动。',
        reconverge: { mode: 'spine', spineId: 'arc_dingtaowang_enthrone', description: '董卓本就退场,长养与死对下游影响一致,近乎原样汇回前段承接线。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true }, { spineId: 'arc_dingtaowang_enthrone', mustRemain: true }],
        preserve: ['前段承接线如期'], blocked: ['董卓后段active搅动'],
        notes: '重伤长养,最小半径。',
      },
      {
        id: 'lyg.if_kuiji_setback', title: '窥基溃退 · 反派暂退', status: 'reviewed',
        branchType: 'returning', runtimeMode: 'future_stage', kind: 'antagonist_setback',
        forkId: 'yange.188.3', overturns: '程宗扬以九阳神功第七层击碎窥基骨傀替身,窥基精血大损后逃离。',
        replBeat: '这一击更狠,窥基重创溃退、长时间退场疗伤;但他并入李辅国终局线,终会"复仇归来",李辅国夺舍脊柱不被取消。',
        reconverge: { mode: 'spine', spineId: 'arc_libuguo_endgame', description: '窥基暂退非永久删除——其魔道支流并入李辅国终局,后段按需复现,终局脊柱不变。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true }, { spineId: 'arc_libuguo_endgame', mustRemain: true }],
        preserve: ['李辅国终局脊柱', '窥基/李辅国终被了结'], blocked: ['李辅国终局被取消'],
        notes: '反派暂退(承重反派不删,挫败+条件重现)。',
      },
      {
        id: 'lyg.if_shifang_siege_breakout', title: '真经破围 · 十方围杀改线', status: 'reviewed',
        branchType: 'returning', runtimeMode: 'future_stage', kind: 'antagonist_setback',
        forkId: 'yange.144.1', overturns: '十方丛林围杀中,程宗扬以不拾一世名义震慑僧众后仍需曲折突围。',
        replBeat: '程宗扬更早稳住不拾一世转世身份,部分僧众倒戈观望,十方围杀转为分裂追击。',
        reconverge: { mode: 'spine', spineId: 'arc_ganlu_throne_collapse', description: '佛门围杀方式变化,但甘露之变和皇权崩塌线照常推进。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true }, { spineId: 'arc_ganlu_throne_collapse', mustRemain: true }],
        preserve: ['甘露之变爆发', '程宗扬存活'], blocked: ['十方丛林提前完全归顺'],
        notes: '围杀减压,回流甘露主线。',
      },
      {
        id: 'lyg.if_li_fuguo_body_sealed', title: '琉璃塔破 · 李辅国夺舍延迟', status: 'reviewed',
        branchType: 'returning', runtimeMode: 'future_stage', kind: 'boss_setback',
        forkId: 'yange.220.1', overturns: '李辅国以琉璃净光与三具法身困杀程宗扬等人,虽肉身败亡但魂魄仍占郭氏躯体。',
        replBeat: '程宗扬等人在琉璃塔内更早打碎李辅国法身凭依,迫使其夺舍延迟并留下驱魂线索,但郭氏躯体伏笔仍保留。',
        reconverge: { mode: 'spine', spineId: 'arc_libuguo_endgame', description: '终局 boss 被削弱而非删除,李辅国魂魄占郭氏的开放断点仍存在。' },
        spineConstraints: [{ spineId: 'spine_protagonist', mustRemain: true }, { spineId: 'arc_libuguo_endgame', mustRemain: true }],
        preserve: ['李辅国终局脊柱', '郭氏躯体开放断点'], blocked: ['李辅国魂魄提前彻底消灭'],
        notes: '终局削弱型,为后续续写留更清晰驱魂钩子。',
      },
    ],
  },
};

function build(b) {
  const f = fork(b.forkId);
  const out = {
    id: b.id, title: b.title, status: b.status, branchType: b.branchType, runtimeMode: b.runtimeMode, kind: b.kind,
    ...(b.overturnMode ? { overturnMode: b.overturnMode } : {}),
    fork: { axisId: f.axisId, seq: f.seq, anchor: f.anchor },
    overturns: b.overturns,
    replacementNodes: repl(b.forkId, b.replBeat),
    deletedCanonNodes: [],
    reconverge: b.reconverge,
    spineConstraints: b.spineConstraints,
    constraints: { protagonistPresent: b.protagonistPresent !== false, preserveCanonFacts: b.preserve, blockedCanonChanges: b.blocked },
    notes: b.notes,
  };
  return out;
}

async function run() {
  for (const [book, spec] of Object.entries(BOOKS)) {
    const data = { book, bookTitle: spec.bookTitle, version: '0.1.0', schema: 'liuchao.if-branches.v2', axisVersion: binding.axisVersion, spinesRef: `${book}.story-spines.json`, branches: spec.branches.map(build) };
    for (const p of [join(ccDir, `${book}.if-branches.json`), `/Users/clawbot/Projects/XianTu/if-branches-sample/${book}.if-branches.json`])
      await writeFile(p, JSON.stringify(data, null, 2) + '\n');
    console.error(`✅ ${book}: ${data.branches.length} 条 → ${book}.if-branches.json`);
  }
}
run();
