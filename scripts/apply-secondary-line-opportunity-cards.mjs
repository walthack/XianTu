#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { INSTALLS, generated } from './add-secondary-line-opportunity-cards.mjs';
import './add-secondary-line-opportunity-cards-rest.mjs';
import './add-secondary-line-opportunity-cards-south.mjs';

function mergeIds(existing = [], extra = []) {
  return [...new Set([...(existing || []), ...extra])];
}

function assertTrigger(event, opportunity) {
  const bindings = event.worldActor?.decisionCore?.actionBindings || [];
  const actorIds = new Set(opportunity.trigger.actorIds);
  const actionIds = new Set(opportunity.trigger.actionIds);
  const reachable = bindings.some(binding => actionIds.has(binding.actionId)
    && binding.actorIds.some(actorId => actorIds.has(actorId)));
  if (!reachable) throw new Error(`${opportunity.id}: trigger does not match a decisionCore action binding`);
}

const byStage = new Map();
for (const install of INSTALLS) {
  const key = `${install.book}/${install.stageFile}`;
  if (!byStage.has(key)) byStage.set(key, []);
  byStage.get(key).push(install);
}

let cards = 0;
for (const [key, installs] of byStage) {
  const [book, stageFile] = key.split('/');
  const stagePath = join(generated, book, 'stages', stageFile);
  const document = JSON.parse(await readFile(stagePath, 'utf8'));
  for (const install of installs) {
    const event = document.scenario.events.find(item => item.id === install.eventId);
    if (!event) throw new Error(`${install.eventId}: not found in ${stagePath}`);
    if (event.worldActor?.decisionCore && event.id === 'lyg.event.s01_05') {
      throw new Error('s01_05 should not be in INSTALLS');
    }
    for (const character of install.ensureCharacters || []) {
      if (!document.canon.characters.some(item => item.id === character.id)) {
        document.canon.characters.push(structuredClone(character));
      }
    }
    event.relatedCharacterIds = mergeIds(event.relatedCharacterIds, install.present);
    event.relatedFactionIds = mergeIds(event.relatedFactionIds, install.factions);
    event.worldActor = structuredClone(install.worldActor);
    for (const opportunity of event.worldActor.opportunities) {
      assertTrigger(event, opportunity);
      cards += 1;
    }
  }
  await writeFile(stagePath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`wrote ${stagePath} (${installs.map(item => item.eventId).join(', ')})`);
}

console.log(`installed ${cards} opportunities across ${INSTALLS.length} events`);
