import raw from './generated/catalog.json';
import type {Contract,StatusDef} from '@/modules/sceneModule/types';
import type {ScenarioMod} from '@/modules/scenarioMods/schema';
export interface PackPlaytest {id:string;kind:string;extensionKey:string;startModId:string;endModId:string;endEventId:string;eventIds:string[];scope?:string;characterId?:string;slot?:string;openingTextId?:string;stageOpeningTextIds?:Record<string,string>;autoStallTurns?:number;timerWeaveEventIds?:string[];nextId?:string}
export interface PackEntry {id:string;label:string;route:string;group:'primary'|'legacy';icon:'Moon'|'Orbit'|'Feather';testId:string;playtestId?:string}
export interface PackOverlay {stageId:string;events:ScenarioMod['scenario']['events']}
export const CONTENT_PACKS=raw as unknown as {version:string;contracts:Contract[];drafts:Contract[];statuses:StatusDef[];stages:ScenarioMod[];overlays:PackOverlay[];questLines:any[];questLineResources?:Partial<Record<'memories'|'facts'|'affinityWeights'|'salience'|'intentMatches',Record<string,any>>>;entities:{kind:'item'|'skill'|'technique';entry:any}[];texts:Record<string,string>;playtests:PackPlaytest[];entries:PackEntry[];lineCompass?:{version:1;note?:string;lines:any[]};lineCompassPlaces?:Record<string,string>;lineCompassPlaceIds?:Record<string,string>};
export function packPlaytest(id:string):PackPlaytest {const p=CONTENT_PACKS.playtests.find(p=>p.id===id);if(!p)throw Error(`缺少试玩定义 ${id}`);return p;}
export function packText(id:string):string {const t=CONTENT_PACKS.texts[id];if(t===undefined)throw Error(`缺少正文 ${id}`);return t;}
export function applyContentPackOverlays(input:ScenarioMod):ScenarioMod {const next=structuredClone(input);for(const o of CONTENT_PACKS.overlays.filter(o=>o.stageId===next.manifest.id))for(const e of o.events||[]){const at=(next.scenario.events||[]).findIndex(x=>x.id===e.id);if(at<0)(next.scenario.events||=[]).push(structuredClone(e));else next.scenario.events![at]=structuredClone(e);}return next;}

export function overlayPackPlaytestOpening(input:ScenarioMod,extensions:Record<string,unknown>|undefined):ScenarioMod {
  const p=CONTENT_PACKS.playtests.find(p=>(extensions?.[p.extensionKey] as {kind?:string}|undefined)?.kind===p.kind&&p.stageOpeningTextIds?.[input.manifest.id]);
  if(!p)return input;
  const next=structuredClone(input);next.scenario.opening.text=packText(p.stageOpeningTextIds![input.manifest.id]);return next;
}

/** Contract hook flags are settled worldline facts needed by later scenes. */
export function contentPackPersistentFlagIds(): ReadonlySet<string> {
  return new Set(CONTENT_PACKS.contracts.flatMap(c => [c.meta.hook.requiredFlag, c.meta.hook.escapeFlag, c.meta.hook.consumedFlag].filter((id): id is string => !!id)));
}
