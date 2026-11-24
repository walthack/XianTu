/**
 * 图片挂位（catalog.assets，2026-11-16）：立绘／场景图／CG 的解析与缺图回落。纯函数，不读 DOM、不发请求。
 * file 是相对素材根目录 src/assets/ 的路径（用户 2026-11-16 定：立绘 characters/、场景图 scenes/、CG cg/，各一个子目录）；file 换成网址见 src/assets/packImages.ts。所有函数的第二参数可传合成数据，默认读 CONTENT_PACKS.assets。
 * 没有图（返回 null／[]）时界面只走文字：立绘只显示名牌，CG 不挡拍。
 */
import {CONTENT_PACKS} from './index';

export type PortraitExpression='neutral'|'joy'|'anger'|'sorrow'|'surprise'|'shy';
/** 编译时已补齐默认值：bust 必有 outfitId＋expression，full 必有 outfitId，avatar 两者都没有。 */
export type PackPortrait=
 |{characterId:string;kind:'bust';outfitId:string;expression:PortraitExpression;file:string}
 |{characterId:string;kind:'full';outfitId:string;file:string}
 |{characterId:string;kind:'avatar';file:string};
/** variant 为 null＝该类型的默认图。 */
export interface PackScene {sceneType:string;variant:string|null;file:string}
export interface PackCg {eventId:string;seq:number;file:string}
/** 地点（或区内节点）用哪几类场景图，按先后试；locationId 是地点总表的主 id。 */
export interface PackLocationScene {locationId:string;sceneTypes:string[]}
export interface PackAssets {portraits:PackPortrait[];scenes:PackScene[];cg:PackCg[];locationScenes?:PackLocationScene[]}

export type PortraitFallback='exact'|'outfitNeutral'|'defaultNeutral'|'avatar';
export interface PortraitRequest {characterId:string;outfitId?:string;expression?:PortraitExpression}
export interface ResolvedPortrait {file:string;kind:'bust'|'avatar';outfitId?:string;expression?:PortraitExpression;fallback:PortraitFallback}
export interface SceneRequest {sceneType:string;variant?:string}

/** 素材根目录（相对仓库根）与三类图各自的子目录；manifest 里的 file 从根目录起算。 */
export const ASSET_ROOT='src/assets';
export const ASSET_DIRS={portraits:'characters',scenes:'scenes',cg:'cg'} as const;

const EMPTY:PackAssets={portraits:[],scenes:[],cg:[]};
const packAssets=():PackAssets=>CONTENT_PACKS.assets??EMPTY;
const bust=(a:PackAssets,characterId:string,outfitId:string,expression:string)=>a.portraits.find(p=>p.kind==='bust'&&p.characterId===characterId&&p.outfitId===outfitId&&p.expression===expression);

/** 半身立绘的整条回落链：指定服装＋表情 → 指定服装＋neutral → default＋neutral → 头像。缺的级跳过；同一条目只出现一次（记最先命中的那一级）。 */
export function portraitCandidates(req:PortraitRequest,assets:PackAssets=packAssets()):ResolvedPortrait[] {
 const outfit=req.outfitId??'default',expression=req.expression??'neutral';
 const levels:[PortraitFallback,PackPortrait|undefined][]=[
  ['exact',bust(assets,req.characterId,outfit,expression)],
  ['outfitNeutral',bust(assets,req.characterId,outfit,'neutral')],
  ['defaultNeutral',bust(assets,req.characterId,'default','neutral')],
  ['avatar',assets.portraits.find(p=>p.kind==='avatar'&&p.characterId===req.characterId)],
 ];
 const out:ResolvedPortrait[]=[],seen=new Set<PackPortrait>();
 for(const [fallback,p] of levels){if(!p||seen.has(p))continue;seen.add(p);
  out.push(p.kind==='bust'?{file:p.file,kind:'bust',outfitId:p.outfitId,expression:p.expression,fallback}:{file:p.file,kind:'avatar',fallback});}
 return out;
}
export function resolvePortrait(req:PortraitRequest,assets:PackAssets=packAssets()):ResolvedPortrait|null {return portraitCandidates(req,assets)[0]??null;}
/** 界面加载 failedFile 失败（如 404）后调用：返回回落链上排在它后面的下一条；它不在链上或已是最后一条时返回 null。 */
export function nextPortraitFallback(req:PortraitRequest,failedFile:string,assets:PackAssets=packAssets()):ResolvedPortrait|null {
 const chain=portraitCandidates(req,assets),i=chain.findIndex(c=>c.file===failedFile);return i<0?null:chain[i+1]??null;
}

/** 全身立绘：指定服装 → default → null。 */
export function resolveFullBody(req:{characterId:string;outfitId?:string},assets:PackAssets=packAssets()):Extract<PackPortrait,{kind:'full'}>|null {
 const full=(o:string)=>assets.portraits.find((p):p is Extract<PackPortrait,{kind:'full'}>=>p.kind==='full'&&p.characterId===req.characterId&&p.outfitId===o);
 return full(req.outfitId??'default')??full('default')??null;
}
/** 头像：只取头像，没有就 null（不拿半身图顶）。 */
export function resolveAvatar(characterId:string,assets:PackAssets=packAssets()):Extract<PackPortrait,{kind:'avatar'}>|null {
 return assets.portraits.find((p):p is Extract<PackPortrait,{kind:'avatar'}>=>p.kind==='avatar'&&p.characterId===characterId)??null;
}

/** 场景图回落链：指定变体 → 该类型默认图（variant 为 null 的那条）。 */
export function sceneCandidates(req:SceneRequest,assets:PackAssets=packAssets()):PackScene[] {
 const out:PackScene[]=[];
 const add=(v:string|null)=>{const s=assets.scenes.find(x=>x.sceneType===req.sceneType&&x.variant===v);if(s&&!out.includes(s))out.push(s);};
 if(req.variant!==undefined)add(req.variant);add(null);return out;
}
export function resolveScene(req:SceneRequest,assets:PackAssets=packAssets()):PackScene|null {return sceneCandidates(req,assets)[0]??null;}
export function nextSceneFallback(req:SceneRequest,failedFile:string,assets:PackAssets=packAssets()):PackScene|null {
 const chain=sceneCandidates(req,assets),i=chain.findIndex(c=>c.file===failedFile);return i<0?null:chain[i+1]??null;
}

/**
 * 某个地点的场景图候选，按先后试：locationIds 里先写的先查（界面传「区内节点、地点」），用第一个登记过的。
 * 白天：各类型的默认图，按 sceneTypes 的顺序。夜里：先各类型的 night 图（有才算），再各类型的默认图。
 * 例：五原城登记 [loc_wuyuan, street]，夜里是 street__night → loc_wuyuan → street。没登记的地点返回 []（界面只写地点名）。
 */
export function locationSceneCandidates(req:{locationIds:(string|undefined)[];night?:boolean},assets:PackAssets=packAssets()):PackScene[] {
 const entry=req.locationIds.map(id=>id?assets.locationScenes?.find(x=>x.locationId===id):undefined).find(Boolean);
 if(!entry)return [];
 const pick=(v:string|null)=>entry.sceneTypes.map(t=>assets.scenes.find(s=>s.sceneType===t&&s.variant===v)).filter((s):s is PackScene=>!!s);
 return [...(req.night?pick('night'):[]),...pick(null)];
}

/** 该事件的全部 CG，按 seq 升序；没有就 []（走文字，不挡拍）。 */
export function resolveCg(eventId:string,assets:PackAssets=packAssets()):PackCg[] {
 return assets.cg.filter(c=>c.eventId===eventId).sort((a,b)=>a.seq-b.seq);
}
