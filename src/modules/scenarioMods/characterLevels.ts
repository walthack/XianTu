import {evalExpr} from '../sceneModule/conditions';
import type {Contract,SceneState} from '../sceneModule/types';
import table from '../../../mod-kit/entity-catalog/character-levels.qingyu.json';
/** One authoritative id/timepoint table. Null means not applicable, never level zero. */
export type LevelFact = typeof table.entries[number];
export function canonicalLevelEntityId(id:string):string {return (table.idAliases as Record<string,string>)[id] || id;}
export function levelFact(id:string,chapter:number,variant?:string):LevelFact|undefined {
 id=canonicalLevelEntityId(id);
 return table.entries.filter(e=>e.entityId===id && e.chapterRanges.some(([lo,hi])=>chapter>=lo && chapter<=hi) && (!e.variant || e.variant===variant)).sort((a,b)=>Number(Boolean(a.variant))-Number(Boolean(b.variant))||a.sourceRow-b.sourceRow).at(-1);
}
export function effectiveLevel(f:LevelFact|undefined):number|undefined {return f?.available ? f.effectiveLevel ?? f.level ?? undefined : undefined;}
export function contractChapter(c:{levelContext?:{chapter:number;chaptersByBeat?:{fromBeat:number;chapter:number}[]}},beat=1):number {return c.levelContext?.chaptersByBeat?.filter(s=>s.fromBeat<=beat).at(-1)?.chapter ?? c.levelContext?.chapter ?? 0;}

export function contractVariant(c:Contract,id:string,state:SceneState):string|undefined {return c.levelContext?.variantWhen?.filter(r=>r.entityId===id&&evalExpr(r.when,c,state)).at(-1)?.variant ?? c.levelContext?.variants?.[id];}
