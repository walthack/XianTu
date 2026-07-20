import { readFile, writeFile } from 'node:fs/promises';

const stagePath = new URL('../mod-kit/generated/deepseek-v4-flash/yange/stages/lyg.dingtao_beijing.json', import.meta.url);
const stage = JSON.parse(await readFile(stagePath, 'utf8'));

const eventOf = eventId => {
  const event = stage.scenario.events.find(item => item.id === eventId);
  if (!event?.worldActor?.decisionCore) throw new Error(`Missing decision core: ${eventId}`);
  return event;
};
const opportunityOf = (event, opportunityId) => {
  const opportunity = event.worldActor.opportunities.find(item => item.id === opportunityId);
  if (!opportunity) throw new Error(`Missing opportunity: ${opportunityId}`);
  return opportunity;
};
const bindingOf = (event, actionId, actorId) => {
  const binding = event.worldActor.decisionCore.actionBindings.find(item =>
    item.actionId === actionId && (!item.actorIds?.length || item.actorIds.includes(actorId)));
  if (!binding) throw new Error(`Missing binding: ${event.id}/${actorId}/${actionId}`);
  return binding;
};

{
  const event = eventOf('lyg.event.s01_05');
  opportunityOf(event, 'opportunity.lyg.s01_05.first_edict').trigger = {
    actorIds: ['liuchao.character.jia_wenhe'],
    actionIds: ['prepare_fallback_route'],
  };
  opportunityOf(event, 'opportunity.lyg.s01_05.first_edict').expiresAfterTurns = 6;
  opportunityOf(event, 'opportunity.lyg.s01_05.court_entry').trigger = {
    actorIds: ['liuchao.character.huo_zi_meng'],
    actionIds: ['negotiate_court_procedure'],
  };
  opportunityOf(event, 'opportunity.lyg.s01_05.court_entry').expiresAfterTurns = 6;
}

{
  const event = eventOf('lyg.event.s01_06');
  const opportunity = opportunityOf(event, 'opportunity.lyg.s01_06.royal_escape');
  opportunity.trigger = {
    actorIds: ['liuchao.character.guo_jie'],
    actionIds: ['protect_principal', 'escort_witness', 'open_safe_route'],
  };
  opportunity.expiresAfterTurns = 3;
}

{
  const event = eventOf('lyg.event.s01_07');
  const opportunity = opportunityOf(event, 'opportunity.lyg.s01_07.border_warning');
  opportunity.trigger = {
    actorIds: ['liuchao.character.dong_zhuo', 'liuchao.character.jia_wenhe'],
    actionIds: ['public_declaration', 'spread_message', 'withdraw_force'],
  };
  opportunity.expiresAfterTurns = 3;
  const withdraw = bindingOf(event, 'withdraw_force', 'liuchao.character.jia_wenhe');
  if (withdraw.utility) delete withdraw.utility.memories;
  const reserve = bindingOf(event, 'reserve_supplies', 'liuchao.character.jia_wenhe');
  reserve.utility ||= {};
  reserve.utility.memories = [{
    tag: 'opportunity:opportunity.lyg.s01_05.first_edict',
    weight: 3,
  }];
}

{
  const event = eventOf('lyg.event.s01_08');
  const opportunity = opportunityOf(event, 'opportunity.lyg.s01_08.verify_shengji');
  opportunity.trigger = {
    actorIds: ['liuchao.character.ruan_xiang_ning'],
    actionIds: ['verify_rumor', 'gather_intelligence'],
  };
  opportunity.expiresAfterTurns = 4;
}

await writeFile(stagePath, `${JSON.stringify(stage, null, 2)}\n`);
console.log('R2-10G opportunity lifecycle and long-term memory hooks installed for lyg.event.s01_05–08');
