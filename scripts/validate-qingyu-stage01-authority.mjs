#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGE_ID = 'lcq.stage_01';
const COMMAND_TENT_ID = 'lcq.location.command_tent';
const COMMAND_TENT_NAME = '帅帐';
const COMMAND_TENT_EVENT_ID = 'lcq.event.s01_05';
const authorityUrl = new URL(
  '../mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_01.json',
  import.meta.url,
);

export function validateQingyuStage01Authority(stage) {
  const errors = [];
  if (stage?.manifest?.id !== STAGE_ID) {
    errors.push(`manifest.id 必须为 ${STAGE_ID}`);
  }

  const locations = Array.isArray(stage?.canon?.locations) ? stage.canon.locations : [];
  const commandTent = locations.find(location => location?.id === COMMAND_TENT_ID);
  if (!commandTent) {
    errors.push(`缺少帅帐地点 ${COMMAND_TENT_ID}`);
  } else if (commandTent.name !== COMMAND_TENT_NAME) {
    errors.push(`${COMMAND_TENT_ID}.name 必须为“${COMMAND_TENT_NAME}”`);
  }

  const events = Array.isArray(stage?.scenario?.events) ? stage.scenario.events : [];
  const commandTentEvent = events.find(event => event?.id === COMMAND_TENT_EVENT_ID);
  if (!commandTentEvent) {
    errors.push(`缺少事件 ${COMMAND_TENT_EVENT_ID}`);
  } else if (commandTentEvent.locationId !== COMMAND_TENT_ID) {
    errors.push(`${COMMAND_TENT_EVENT_ID}.locationId 必须为 ${COMMAND_TENT_ID}`);
  }

  if (errors.length > 0) {
    throw new Error(`清羽 stage_01 权威源锚点校验失败：${errors.join('；')}`);
  }
}

export async function validateQingyuStage01AuthorityFile(url = authorityUrl) {
  const stage = JSON.parse(await readFile(url, 'utf8'));
  validateQingyuStage01Authority(stage);
  console.log(`清羽 stage_01 权威源锚点 PASS：${COMMAND_TENT_ID} / ${COMMAND_TENT_EVENT_ID}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  validateQingyuStage01AuthorityFile().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
