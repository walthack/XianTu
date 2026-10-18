import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createJiti} from 'jiti';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
// 效果标签词表（mod-kit/entity-catalog/effect-tags.json）与状态目录、配置的对账：状态 remove 规则引用的 item 标签、status.itemTags 都必须在词表里，
// 词表里适用 consumable 的标签也必须有人引用（状态目录或 itemTags），避免词表和实际效果漂移。
export function auditEffectVocabulary(errors){
 const vocab=read('mod-kit/entity-catalog/effect-tags.json'),numbers=read('mod-kit/game-numbers.qingyu.json'),pack=read('src/modules/contentPacks/generated/catalog.json').statuses||[];
 const statuses=[...read('src/modules/sceneModule/contracts/statuses.json'),...pack];
 const used=new Set([...statuses.flatMap(s=>(s.remove||[]).filter(r=>r.kind==='item').map(r=>r.ref)),...Object.values(numbers.status.itemTags).flat()]);
 for(const tag of used)if(!vocab.tags[tag])errors.push(`effect vocabulary: 状态目录/配置用到的标签 ${tag} 不在 effect-tags.json`);
 for(const [tag,spec] of Object.entries(vocab.tags)){
  if(!Array.isArray(spec.activation)||!spec.activation.length||spec.activation.some(a=>!vocab.activations[a]))errors.push(`effect vocabulary: 标签 ${tag} 的 activation 需为非空且都在 activations 里`);
  else if(spec.activation.includes('consumable')&&!used.has(tag))errors.push(`effect vocabulary: consumable 标签 ${tag} 没有被状态目录或 status.itemTags 引用`);
 }
 if(typeof numbers.techniques?.allowMultiEquipDefault!=='boolean')errors.push('effect vocabulary: game-numbers.techniques.allowMultiEquipDefault 需为布尔值');
 if(typeof numbers.techniques?.applyBonusToAttributes!=='boolean')errors.push('effect vocabulary: game-numbers.techniques.applyBonusToAttributes 需为布尔值');
 if(numbers.techniques?.cultivationSpeedBonus?.semantics!=='fraction_increment')errors.push('effect vocabulary: game-numbers.techniques.cultivationSpeedBonus.semantics 未写明修炼速度加成口径');
}
// 效果（activation / effectTags / onUse / 加成）与词表、状态目录的对账。kind 为 item 或 technique：标签必须在词表里且适用该 activation，onUse 引用的状态 id 必须存在。
const jiti=createJiti(import.meta.url);
const {effectProblems}=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/effectTags.ts',root)));
export function auditItemEffects(errors,table,kind='item'){
 const numbers=read('mod-kit/game-numbers.qingyu.json').status,pack=read('src/modules/contentPacks/generated/catalog.json').statuses||[];
 const statuses=[...read('src/modules/sceneModule/contracts/statuses.json'),...pack],known=new Set(statuses.map(s=>s.id));
 for(const entry of table.entries){
  const id=entry.id,variants=Object.entries(entry.stageVariants||{});
  for(const [stageId,def] of [[undefined,entry.definition],...variants]){
   const where=`${kind} effect ${id}${stageId?`@${stageId}`:''}`;
   for(const key of Object.keys(def))if((key==='effectTags'||key==='onUse')&&def[key]===undefined)errors.push(`${where}: ${key} 不能是 undefined`);
   for(const message of effectProblems(kind,def,{requireActivation:kind==='technique'}))errors.push(`${where}: ${message}`);
   if(def.onUse!==undefined){
    if(!Array.isArray(def.onUse)||!def.onUse.length)errors.push(`${where}: onUse 需为非空数组（没有就整个字段省略）`);
    else for(const use of def.onUse){
     if(!use||typeof use!=='object'||Object.keys(use).some(k=>!['statusId','doses','minutes'].includes(k)))errors.push(`${where}: onUse 项只允许 statusId/doses/minutes`);
     else{
      if(!known.has(use.statusId))errors.push(`${where}: onUse 引用了不存在的状态 ${String(use.statusId)}`);
      if(use.doses!==undefined&&!(Number.isInteger(use.doses)&&use.doses>=1&&use.doses<=numbers.onUse.maxDoses))errors.push(`${where}: doses 需为 1..${numbers.onUse.maxDoses} 的整数`);
      if(use.minutes!==undefined&&!(Number.isInteger(use.minutes)&&use.minutes>0))errors.push(`${where}: minutes 需为正整数`);
     }
    }
   }
   if((def.effectTags||[]).some(tag=>numbers.itemTags.toxic.includes(tag))&&!(Array.isArray(def.onUse)&&def.onUse.length))errors.push(`${where}: 毒性物品必须有 onUse（挂哪个状态）`);
  }
 }
}
// 同一 id 不得在关卡里换成另一件东西：变体可以改描述/数值，不得改名称或类型（暂缓项见 validation.config.json）。
export function variantIdentityErrors(entry,stageId,variant,identity){
 if(identity.severity==='off'||identity.pendingRename.some(p=>p.id===entry.id&&p.stageId===stageId))return [];
 const changed=identity.forbid.filter(k=>variant[k]!==entry.definition[k]);
 return changed.length?[`variant identity ${entry.id}@${stageId}: 变体不得改 ${changed.join('/')}（${changed.map(k=>`${String(entry.definition[k])}→${String(variant[k])}`).join('，')}）；应改用独立 id`]:[];
}
export function auditEntityCatalog(){
 const errors=[],byKind={};
 const identity=read('mod-kit/entity-catalog/validation.config.json').variantIdentity;
 const dangerTiers=read('mod-kit/game-numbers.qingyu.json').freeAction.dangerTiers;
 for(const [kind,plural] of [['item','items'],['skill','skills'],['technique','techniques'],['enemy','enemies'],['location','locations'],['faction','factions'],['ending','endings']]){
  const table=read(`mod-kit/entity-catalog/${plural}.json`),map=new Map();byKind[kind]=map;
  for(const entry of table.entries){if(map.has(entry.id))errors.push(`duplicate ${kind} ${entry.id}`);map.set(entry.id,entry);
   if(entry.definition.id!==entry.id||!entry.definition.name)errors.push(`invalid definition ${entry.id}`);
   if(entry.authoritySource!==`mod-kit/entity-catalog/${plural}.json`)errors.push(`wrong authority ${entry.id}`);
   if(kind==='location'&&entry.definition.dangerTier!==undefined&&!dangerTiers.includes(entry.definition.dangerTier))errors.push(`unknown dangerTier ${entry.id}: ${String(entry.definition.dangerTier)}（须在 game-numbers freeAction.dangerTiers 里）`);
   for(const [stageId,v] of Object.entries(entry.stageVariants)){
    if(v.id!==entry.id)errors.push(`variant id drift ${entry.id}`);
    if(kind==='item')errors.push(...variantIdentityErrors(entry,stageId,v,identity));
   }
  }
 }
 for(const p of identity.pendingRename){const v=byKind.item.get(p.id)?.stageVariants[p.stageId];if(!v||identity.forbid.every(k=>v[k]===byKind.item.get(p.id).definition[k]))errors.push(`stale pendingRename ${p.id}@${p.stageId}: 已不存在改名/改类型的变体，请从 validation.config.json 移除`);}
 auditEffectVocabulary(errors);
 auditItemEffects(errors,read('mod-kit/entity-catalog/items.json'));
 auditItemEffects(errors,read('mod-kit/entity-catalog/techniques.json'),'technique');
 const index=read('mod-kit/entity-catalog/index.json');const indexed=new Set();
 for(const row of index.entries){const key=`${row.kind}:${row.id}`;if(indexed.has(key))errors.push(`duplicate index ${key}`);indexed.add(key);if(byKind[row.kind]&&!byKind[row.kind].has(row.id))errors.push(`dangling index ${key}`);}
 for(const [kind,map] of Object.entries(byKind))for(const entry of map.values()){
  if(!indexed.has(`${kind}:${entry.id}`))errors.push(`missing index ${entry.id}`);
  for(const def of [entry.definition,...Object.values(entry.stageVariants)]){
   for(const id of def.skillIds||[])if(!byKind.skill.has(id))errors.push(`dangling skill ${entry.id}/${id}`);
   if(def.techniqueId&&!byKind.technique.has(def.techniqueId))errors.push(`dangling technique ${entry.id}/${def.techniqueId}`);
  }
 }
 const access=read('mod-kit/entity-catalog/stage-access.json');
 for(const file of readdirSync(new URL('src/modules/scenarioMods/builtins/data/',root)).filter(f=>f.endsWith('.json'))){
  const mod=read(`src/modules/scenarioMods/builtins/data/${file}`),stageId=mod.manifest.id,expected=access.stages[stageId];
  if(!expected||JSON.stringify(mod.content)!==JSON.stringify(expected))errors.push(`stage access drift ${stageId}`);
  for(const [kind,plural] of [['item','items'],['skill','skills'],['technique','techniques']])for(const ref of mod.content?.[plural]||[]){
   if(!byKind[kind].has(ref.id))errors.push(`unknown ${kind} ${stageId}/${ref.id}`);
   if(Object.keys(ref).some(k=>!['id','availableWhen','revealWhen'].includes(k)))errors.push(`inline definition ${stageId}/${ref.id}`);
  }
  const walk=o=>{if(!o||typeof o!=='object')return;for(const [k,v]of Object.entries(o)){
   const kind={itemId:'item',skillId:'skill',techniqueId:'technique'}[k];if(kind&&typeof v==='string'&&!byKind[kind].has(v))errors.push(`unknown structured reference ${stageId}/${kind}/${v}`);walk(v);
  }};walk(mod.scenario);
 }
 return {errors:[...new Set(errors)],counts:Object.fromEntries(Object.entries(byKind).map(([k,m])=>[k,m.size]))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const result=auditEntityCatalog();console.log(JSON.stringify(result,null,2));if(result.errors.length)process.exitCode=1;}
