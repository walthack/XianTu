#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const contracts = [
  ['qingyu', 'lcq.stage_01.json', 'lcq.event.s01_02', 8, '段强仍在草原遭半兽人箭袭身亡；这场袭击没有因你缺席而停下，幸存者与战场痕迹成为后来者能接触到的后果。'],
  ['qingyu', 'lcq.stage_01.json', 'lcq.event.s01_04', 8, '太乙真宗已介入草原战局并带走伤员；你错过了最初接触，只能从留下的人证与去向继续追赶。'],
  ['qingyu', 'lcq.stage_02.json', 'lcq.event.s02_02', 7, '左武军与罗马军团的战事自行爆发，前线死伤与溃兵已经改变五原周边局势。'],
  ['qingyu', 'lcq.stage_02.json', 'lcq.event.s02_03', 7, '秦军随后卷入罗马军团战事，军情、俘虏与道路封锁成为玩家缺席后的既成事实。'],
  ['qingyu', 'lcq.stage_03.json', 'lcq.event.s03_06', 8, '商队仍遭袭击，武二郎因此卷入队伍；你未在场的交锋以伤员、戒备和同行关系留下余波。'],
  ['qingyu', 'lcq.stage_04.json', 'lcq.event.s04_02', 7, '鬼王峒武士已发动袭击，队伍的路线与戒备被迫改变；玩家仍可介入战后追踪或救援。'],
  ['qingyu', 'lcq.stage_04.json', 'lcq.event.s04_04', 8, '发蛊事件仍然发生，受害者与蛊毒威胁进入队伍现实；你只能从处置后果而非倒带事件开始介入。'],
  ['qingyu', 'lcq.stage_04.json', 'lcq.event.s04_05', 9, '旱洪席卷去路，易虎之死已成为队伍共同经历；灾后失散、哀恸与道路中断继续影响众人。'],
  ['qingyu', 'lcq.stage_05.json', 'lcq.event.s05_06', 8, '阴煞袭击商队并造成花苗女子死亡，幸存者的恐惧与复仇要求不会等待玩家到场。'],
  ['qingyu', 'lcq.stage_06.json', 'lcq.event.s06_01', 7, '鬼巫王与龙神的合体仍以失败告终并引发吞噬，鬼王峒权力与战场局势随之崩裂。'],
  ['yange', 'lyg.dingtao_beijing.json', 'lyg.event.s01_01', 7, '秦桧已斩杀刘建，洛都政变的第一枚棋子落下；你只能承接由此扩散的追捕与朝局震荡。'],
  ['yange', 'lyg.dingtao_beijing.json', 'lyg.event.s01_02', 7, '贾文和已劫持定陶王，帝统争夺进入不可逆的新阶段；各方开始围绕王驾采取行动。'],
  ['yange', 'lyg.dingtao_beijing.json', 'lyg.event.s01_03', 7, '董卓已经挟定陶王离开洛都，凉州军与朝廷势力的空间位置随之改变。'],
  ['yange', 'lyg.dingtao_beijing.json', 'lyg.event.s01_04', 8, '霍子孟已经与吕雉接触并交换朝局判断，长秋宫一方不再停在原地等待玩家。'],
  ['yange', 'lyg.dingtao_beijing.json', 'lyg.event.s01_05', 8, '董卓已经拥立定陶王为帝，诏令、军心与宫城秩序成为既成事实；玩家仍可选择如何介入新帝朝局。'],
  ['yange', 'lyg.changgan_begins.json', 'lyg.event.s03_03', 9, '泼寒胡戏照常举行并演变为杨玉环的街头冲突，长安市井已经留下围观、流言与官面反应。'],
  ['yunlong', 'lyl.jiangzhou_retreat.json', 'lyl.event.s01_01', 7, '江州宋军主力已经溃退，残军、伤员与失守道路涌向后方；战局不会因玩家缺席冻结。'],
  ['yunlong', 'lyl.jiangzhou_retreat.json', 'lyl.event.s01_03', 8, '王团练部众已经袭击荆溪村寨，村民伤亡与逃难成为玩家赶到后必须面对的后果。'],
  ['yunlong', 'lyl.luoyang_coup.json', 'lyl.event.s06_01', 7, '天子暴毙的消息已经传遍洛都，宫门、军营与豪门同时开始站队。'],
  ['yunlong', 'lyl.luoyang_coup.json', 'lyl.event.s06_03', 8, '刘建一方已经攻占南宫与武库，兵械和宫城通道易手，长秋宫危机随之升级。'],
  ['yunlong', 'lyl.luoyang_coup.json', 'lyl.event.s06_04', 8, '长秋宫守卫战已经爆发，宫门攻防与伤亡迫使各方公开表态；玩家可介入余波但不能倒带战事。'],
  ['yunlong', 'lyl.luoyang_coup.json', 'lyl.event.s06_06', 9, '吕奉先已经单骑破阵，南宫战线与双方士气被这一行动改写；玩家面对的是变化后的战场。'],
];

function slug(id) {
  return id.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

const grouped = new Map();
for (const contract of contracts) {
  const key = `${contract[0]}/${contract[1]}`;
  const list = grouped.get(key) || [];
  list.push(contract);
  grouped.set(key, list);
}

for (const [key, entries] of grouped) {
  const [series, filename] = key.split('/');
  const source = path.join(root, 'mod-kit/generated/deepseek-v4-flash', series, 'stages', filename);
  const builtin = path.join(root, 'src/modules/scenarioMods/builtins/data', filename);
  const backupDir = path.join(root, 'mod-kit/generated/deepseek-v4-flash', series, 'stages-pre-r2-9-world-gravity-backup');
  await mkdir(backupDir, { recursive: true });
  const backup = path.join(backupDir, filename);
  try {
    await readFile(backup);
  } catch {
    await copyFile(source, backup);
  }

  for (const file of [source, builtin]) {
    const data = JSON.parse(await readFile(file, 'utf8'));
    const events = data?.scenario?.events;
    if (!Array.isArray(events)) throw new Error(`${file}: scenario.events missing`);
    for (const [, , eventId, afterStallTurns, worldDelta] of entries) {
      const event = events.find(item => item.id === eventId);
      if (!event) throw new Error(`${file}: event missing ${eventId}`);
      if (event.offscreenResolution && !String(event.offscreenResolution.id).startsWith('offscreen.r2_9.')) {
        throw new Error(`${file}: refusing to overwrite existing contract on ${eventId}`);
      }
      event.offscreenResolution = {
        id: `offscreen.r2_9.${slug(eventId)}`,
        afterStallTurns,
        flagKey: `world.r2_9.${slug(eventId)}.offscreen_resolved`,
        resolvedEventIds: [eventId],
        worldDelta,
        evidence: `R2-9 世界引力合同：${event.name}属于不依赖玩家领取任务才会发生的世界事件；仅在该节点已激活且长期停滞时结算。`,
      };
    }
    await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  }
}

console.log(`R2-9 world-gravity contracts applied: ${contracts.length}`);
