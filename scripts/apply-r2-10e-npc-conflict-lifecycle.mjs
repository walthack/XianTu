import { readFile, writeFile } from 'node:fs/promises';

const stagePath = new URL('../mod-kit/generated/deepseek-v4-flash/yange/stages/lyg.dingtao_beijing.json', import.meta.url);
const stage = JSON.parse(await readFile(stagePath, 'utf8'));

const coreOf = eventId => {
  const event = stage.scenario.events.find(item => item.id === eventId);
  if (!event?.worldActor?.decisionCore) throw new Error(`Missing decision core: ${eventId}`);
  return event.worldActor.decisionCore;
};
const bindingOf = (core, actionId, actorId) => {
  const binding = core.actionBindings.find(item =>
    item.actionId === actionId && (!item.actorIds?.length || item.actorIds.includes(actorId)));
  if (!binding) throw new Error(`Missing binding: ${actorId}/${actionId}`);
  return binding;
};
const setInteraction = (binding, domain, stance, power, counters = []) => {
  binding.interaction = { domain, stance, power, counters };
};

const GUO = 'liuchao.character.guo_jie';
const JIAN = 'liuchao.character.jian_yu_ji';
const DONG = 'liuchao.character.dong_zhuo';
const JIA = 'liuchao.character.jia_wenhe';
const RUAN = 'liuchao.character.ruan_xiang_ning';

{
  const core = coreOf('lyg.event.s01_06');
  setInteraction(
    bindingOf(core, 'protect_principal', GUO),
    'royal_guard',
    'defend',
    5,
    ['sabotage_agenda'],
  );
  setInteraction(
    bindingOf(core, 'sabotage_agenda', JIAN),
    'royal_guard',
    'advance',
    3,
    ['protect_principal'],
  );
  setInteraction(
    bindingOf(core, 'escort_witness', GUO),
    'evacuation_route',
    'defend',
    3,
    ['block_road'],
  );
  setInteraction(
    bindingOf(core, 'open_safe_route', GUO),
    'evacuation_route',
    'defend',
    2,
    ['block_road'],
  );
  setInteraction(
    bindingOf(core, 'block_road', JIAN),
    'evacuation_route',
    'advance',
    4,
    ['escort_witness', 'open_safe_route'],
  );
}

{
  const core = coreOf('lyg.event.s01_07');
  setInteraction(bindingOf(core, 'public_declaration', DONG), 'liangzhou_succession', 'defend', 4);
  setInteraction(bindingOf(core, 'withdraw_force', JIA), 'liangzhou_succession', 'defend', 5);
  setInteraction(bindingOf(core, 'reserve_supplies', JIA), 'border_logistics', 'defend', 3);
  setInteraction(bindingOf(core, 'prepare_fallback_route', JIA), 'border_logistics', 'advance', 2);
}

{
  const core = coreOf('lyg.event.s01_08');
  setInteraction(bindingOf(core, 'gather_intelligence', RUAN), 'secret_source', 'advance', 3);
  setInteraction(bindingOf(core, 'conceal_evidence', RUAN), 'secret_source', 'defend', 4);
}

await writeFile(stagePath, `${JSON.stringify(stage, null, 2)}\n`);
console.log('R2-10E conflict domains and lifecycle contracts installed for lyg.event.s01_06–08');
