#!/usr/bin/env node
// 插入用户已裁定的角色招牌登场事件（debut-events-scan 首批 6 人：阮香凝/吕雉/阮香琳/黛绮丝/秦桧/萧遥逸）。
// 规则：挂目标关卡首章 eventIds；critical:false（弹性层，不卡 stage_ready）；conditions 空=随章激活；
// completion=flags.event.<slug>.done；relatedCharacterIds 按该关花名册名字解析（不在场者跳过）；幂等。
// 用法：node scripts/insert-debut-events.mjs [--apply]
import fs from 'node:fs';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const bookOf = id => id.startsWith('lcq.') ? 'qingyu' : id.startsWith('lyl.') ? 'yunlong' : 'yange';

const EVENTS = [
  { stage: 'lcq.stage_07_qingyuan_jiankang', slug: 's07_debut_qinhui', name: '秦桧初登场',
    desc: '殇侯与程宗扬夜谈六朝兴亡之际，文士巾打扮的秦桧快步走来，躬身深揖："君侯，北地有讯。"随后受命引程宗扬在山崖温泉间随意走走。其人举止温文尔雅，脸上总带一丝谦虚笑意；殇侯私评："灵敏有余，志浅易变。"',
    who: ['秦桧', '殇侯', '程宗扬'] },
  { stage: 'lcq.stage_07_qingyuan_jiankang', slug: 's07_qinhui_join', name: '秦桧归入麾下',
    desc: '殇侯把秦桧、吴三桂等手下交给程宗扬差遣。秦桧恭敬改称程宗扬"主公"："能协助主公行事，是我等的福分。"自此成为程宗扬身边第一智囊。',
    who: ['秦桧', '殇侯', '程宗扬', '吴三桂'] },
  { stage: 'lcq.stage_08_jiankang_coup', slug: 's08_debut_xiaoyaoyi', name: '萧遥逸接骨灰',
    desc: '少陵侯嫡子萧遥逸上门拜访，先为小紫美貌所惊、赞叹失态，才自报名号。程宗扬告知谢艺死讯并交出骨灰与佩刀——萧遥逸抱匣恸哭，继而暴怒痛骂黑魔海足足半个时辰，最终取走三哥骨灰离去（星月湖八骏·玄骐，谢艺之弟）。',
    who: ['萧遥逸', '程宗扬', '小紫'] },
  { stage: 'lyl.lin_an_black_sea', slug: 'debut_ruan_sisters', name: '阮氏姐妹情报',
    desc: '敖润打探临安消息回报：威远镖局总镖头李寅臣之妻为长姐阮香琳（林州小碧潭"销魂玉带"，李师师之母）；八十万禁军教头林冲之妻为小妹阮香凝（林娘子），未习武、成婚多年无子，常延尼姑道姑上门求子。程宗扬等由此怀疑阮香凝是黑魔海安插临安的暗桩，恐已渗透宋国禁军。',
    who: ['阮香凝', '阮香琳', '程宗扬', '敖润', '林冲', '李师师'] },
  { stage: 'lyl.lin_an_black_sea', slug: 'ruan_xiangning_secret', name: '处女之秘',
    desc: '程宗扬在林家误入阮香凝房间，依西门庆相女之术近距离判断：成婚十余年的林娘子竟仍是处女——多年"求子"实为掩饰，其潜伏身份疑云更深。',
    who: ['阮香凝', '程宗扬'] },
  { stage: 'lyl.lin_an_black_sea', slug: 'ruan_xianglin_scheme', name: '逼女就嫁',
    desc: '阮香琳力主攀附高太尉府：与丈夫李寅臣争执时，以"不允高衙内必遭官府发卖"要挟其就范；又亲赴李师师住处劝女儿受纳为妾，以"一步登天""小衙内会爱护如珠如宝"安抚。',
    who: ['阮香琳', '李师师', '李寅臣', '高衙内'] },
  // 注：明庆寺遇险原拟放 lin_an_bridge(关名含明庆寺)，但李师师/高衙内/林冲不在其花名册；
  // black_sea 人齐且同属 0017 章窗口 → 落 black_sea。
  { stage: 'lyl.lin_an_black_sea', slug: 'mingqingsi_encounter', name: '明庆寺遇险',
    desc: '阮香凝与李师师往明庆寺进香，五岳楼前遭高衙内拦截调戏；程宗扬出手干预化解，林冲随后赶到，全程被林清浦以水镜录下。',
    who: ['阮香凝', '李师师', '高衙内', '程宗扬', '林冲', '林清浦'] },
  { stage: 'lyg.dingtao_beijing', slug: 'debut_lvzhi', name: '凤辇临朝',
    desc: '霍子孟强行入宫，长秋宫前一驾凤辇静候——吕雉珠帘遮面、正襟端坐其中，太后之威使老臣当场拂衣跪伏叩首。她冷静剖析当朝各方得失，点破霍子孟三面受制之局。',
    who: ['吕雉', '霍子孟', '程宗扬'] },
  { stage: 'lyg.dingtao_beijing', slug: 'lvzhi_zhenjiu', name: '亲裁诸吕',
    desc: '吕雉主动提出诸吕处置方案：赐鸩酒予爱逾性命的侄儿吕冀、废吕不疑为庶人、作乱诸吕交有司论罪——以雷霆手段自断臂膀，稳住朝局。',
    who: ['吕雉', '吕冀', '吕不疑'] },
  { stage: 'lyg.changgan_interlude', slug: 'debut_daiqisi', name: '佛堂善母',
    desc: '程宗扬在从十方丛林手中夺来的家庙佛堂废墟中，发现被众高僧以秘法禁锢、全身瘫痪唯口眼能动的波斯美妇——摩尼教善母黛绮丝（波斯亡国后仅存的最高宗教领袖，曾在盩厔县遭十方丛林联合仇士良设伏擒获）。程宗扬以生死根之力驱散禁锢，黛绮丝感知其身上"光明与生命的力量"，认定他是期待已久的拯救者，誓为主仆。',
    who: ['黛绮丝', '程宗扬'] },
];

let inserted = 0, skipped = 0;
const byStage = new Map();
for (const e of EVENTS) { if (!byStage.has(e.stage)) byStage.set(e.stage, []); byStage.get(e.stage).push(e); }

for (const [stageId, list] of byStage) {
  const p = join(gen, bookOf(stageId), 'stages', `${stageId}.json`);
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  const nameToId = new Map((m.canon.characters || []).map(c => [c.name, c.id]));
  const events = m.scenario.events = m.scenario.events || [];
  const chapter = (m.scenario.chapters || [])[0];
  const flags = m.scenario.initialFlags = m.scenario.initialFlags || {};
  let changed = false;
  for (const e of list) {
    const id = `${stageId.split('.')[0]}.event.${e.slug}`;
    if (events.some(x => x.id === id)) { skipped++; continue; }
    const related = e.who.map(n => nameToId.get(n)).filter(Boolean);
    const missing = e.who.filter(n => !nameToId.has(n));
    events.push({
      id, name: e.name, description: e.desc,
      conditions: [],
      completion: [{ path: `flags.event.${e.slug}.done`, operator: 'eq', value: true }],
      relatedCharacterIds: related,
      critical: false,
    });
    if (chapter) { chapter.eventIds = chapter.eventIds || []; if (!chapter.eventIds.includes(id)) chapter.eventIds.push(id); }
    flags[`event.${e.slug}.done`] = false;
    inserted++; changed = true;
    console.log(`+ [${stageId}] ${id} ${e.name}${missing.length ? `（不在场跳过:${missing.join('、')}）` : ''}`);
  }
  if (changed && APPLY) fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
}
console.log(`${APPLY ? '已写入' : '(DRY-RUN)'} 插入:${inserted} 跳过(已存在):${skipped}`);
