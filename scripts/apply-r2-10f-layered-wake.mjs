import { readFile, writeFile } from 'node:fs/promises';

const stagePath = new URL('../mod-kit/generated/deepseek-v4-flash/yange/stages/lyg.dingtao_beijing.json', import.meta.url);
const stage = JSON.parse(await readFile(stagePath, 'utf8'));

const actorOf = (eventId, characterId) => {
  const event = stage.scenario.events.find(item => item.id === eventId);
  const actor = event?.worldActor?.decisionCore?.actors.find(item => item.characterId === characterId);
  if (!actor) throw new Error(`Missing decision actor: ${eventId}/${characterId}`);
  return actor;
};

actorOf('lyg.event.s01_06', 'liuchao.character.guo_jie').wake = {
  tier: 'local_critical',
  factionIds: ['liuchao.faction.x6d397ffc7e'],
};
actorOf('lyg.event.s01_06', 'liuchao.character.jian_yu_ji').wake = {
  tier: 'offscreen_critical',
  cadenceTurns: 3,
  factionIds: ['liuchao.faction.wu_zong'],
};
actorOf('lyg.event.s01_07', 'liuchao.character.dong_zhuo').wake = {
  tier: 'local_critical',
  factionIds: ['liuchao.faction.liangzhou_army'],
};
actorOf('lyg.event.s01_07', 'liuchao.character.jia_wenhe').wake = {
  tier: 'faction',
  cadenceTurns: 3,
  factionIds: ['liuchao.faction.liangzhou_army'],
};
actorOf('lyg.event.s01_08', 'liuchao.character.ruan_xiang_ning').wake = {
  tier: 'local_critical',
  factionIds: ['liuchao.faction.cheng_shi_shang_hui'],
};

await writeFile(stagePath, `${JSON.stringify(stage, null, 2)}\n`);
console.log('R2-10F layered wake contracts installed for lyg.event.s01_06–08');
