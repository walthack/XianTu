import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadInputs,buildAppearances,serializeAppearances,auditStoryLinks,expandStoryLinks,APPEARANCES_PATH} from '../scripts/story-links.mjs';

// 试验都在内存副本上做（structuredClone），不碰仓库里的关卡数据、总表和派生文件。
const base=loadInputs();
const copy=()=>structuredClone(base);
const PEARL='lyg.item.dragon_pearl',ROSTER='lyg.event.mijing_superuser_roster',PRIOR='lyg.event.s02_09';
const NINGYU='liuchao.character.ning_yu',RAIN='lcq.event.rainforest_black_shoal',REGICIDE='lcq.event.ningyu_regicide_offer',GAMBLE='lcq.event.gamble_bond_signed';
const event=(inp,stageId,id)=>inp.stages[stageId].scenario.events.find(e=>e.id===id);
const fresh=inp=>{inp.appearancesText=serializeAppearances(buildAppearances(inp));return inp;}; // 副本改了数据后，派生文件也按副本重生成
const pearlEntry=inp=>inp.items.entries.find(e=>e.id===PEARL);

test('1 基线：仓库当前数据零错误零警告，派生文件与重新生成的逐字节一致',()=>{
 const r=auditStoryLinks(base);
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.warnings,[]);
 assert.equal(base.appearancesText,serializeAppearances(buildAppearances(base)));
 assert.equal(base.appearancesText,readFileSync(new URL(`../${APPEARANCES_PATH}`,import.meta.url),'utf8'));
});

test('龙珠是总表里的语义 slug 物品：关卡与代码里没有写死名词，指针只引用 id+数量',()=>{
 const e=pearlEntry(base);
 assert.equal(e.definition.name,'龙珠');assert.equal(e.definition.storyItem,true);assert.ok(!/np\d+$/.test(e.id));
 const link=base.links.links.find(l=>l.object.id===PEARL);
 assert.deepEqual(Object.keys(link).sort(),['actionId','actor','eventId','id','necessity','object','stageId','verb']);
 assert.deepEqual(link.object,{kind:'item',id:PEARL,quantity:1});
 const refs=Object.values(base.stages).flatMap(m=>m.content.items.map(r=>r.id));
 assert.ok(!refs.includes(PEARL),'没有改任何关卡的物品池');
});

test('2 调换顺序：把前置事件挪到被要求事件之后，报顺序违反并指明物品与两个事件',()=>{
 const inp=copy();event(inp,'lyg.mijing_rumen',PRIOR).axisSeq=event(inp,'lyg.mijing_rumen',ROSTER).axisSeq+1;
 const r=auditStoryLinks(fresh(inp));
 assert.equal(r.errors.length,1,r.errors.join('\n'));
 assert.match(r.errors[0],new RegExp(`物品 ${PEARL}.*顺序违反.*${PRIOR}.*${ROSTER}.*并不在其后`));
 const chr=copy();event(chr,'lcq.stage_02',GAMBLE).axisSeq=999;
 assert.match(auditStoryLinks(fresh(chr)).errors.join('\n'),new RegExp(`角色 ${NINGYU}.*顺序违反.*${GAMBLE}`));
});

test('2b flags 依赖链优先于 axisSeq：被要求事件的 conditions 依赖前置事件时判先后正确',()=>{
 const inp=copy();const roster=event(inp,'lyg.mijing_rumen',ROSTER),prior=event(inp,'lyg.mijing_rumen',PRIOR);
 prior.axisSeq=roster.axisSeq+5;roster.conditions=[{path:'flags.event.s02_09.done',operator:'eq',value:true}];
 assert.deepEqual(auditStoryLinks(fresh(inp)).errors,[]);
});

test('3 挪走事件：角色不再出现在要求的事件里，缺失默认只警告；配置改 error 就拦；事件被删则是悬空引用错误',()=>{
 const inp=copy();const e=event(inp,'lcq.stage_02',RAIN);e.relatedCharacterIds=e.relatedCharacterIds.filter(id=>id!==NINGYU);
 const warn=auditStoryLinks(fresh(inp));
 assert.deepEqual(warn.errors,[]);
 assert.equal(warn.warnings.length,1);assert.match(warn.warnings[0],new RegExp(`角色 ${NINGYU}.*${RAIN}.*没有它的登场`));
 inp.config.storyLinks.mustAppearSeverity='error';
 assert.match(auditStoryLinks(fresh(inp)).errors[0],new RegExp(`${NINGYU}.*${RAIN}`));
 const gone=copy();gone.stages['lcq.stage_02'].scenario.events=gone.stages['lcq.stage_02'].scenario.events.filter(e=>e.id!==RAIN);
 for(const ch of gone.stages['lcq.stage_02'].scenario.chapters)ch.eventIds=ch.eventIds.filter(id=>id!==RAIN);
 assert.match(auditStoryLinks(fresh(gone)).errors.join('\n'),new RegExp(`mustAppear 事件 ${RAIN} 不存在`));
});

test('3b 可选事件（critical:false）不算必经出现的证据；配置放开后才算',()=>{
 const inp=copy();event(inp,'lcq.stage_02',RAIN).critical=false;
 const r=auditStoryLinks(fresh(inp));
 assert.match(r.warnings.join('\n'),/可选事件.*不算必经出现的证据/);
 inp.config.storyLinks.optionalEventIsEvidence=true;
 assert.deepEqual(auditStoryLinks(fresh(inp)).warnings,[]);
});

test('4 换线：只改关系（指针与总表 story 标注）把龙珠挪到别的事件，不动总表物品内容，校验仍全绿',()=>{
 const inp=copy();const before=JSON.stringify(pearlEntry(inp).definition);
 const other=inp.stages['lyg.mijing_rumen'].scenario.events.find(e=>e.id==='lyg.event.s02_08');
 const link=inp.links.links.find(l=>l.object.id===PEARL);
 link.eventId=other.id;delete link.actionId;
 pearlEntry(inp).story={mustAppear:[{eventId:other.id}],requires:[{eventDone:'lyg.event.s02_06'}]};
 const r=auditStoryLinks(fresh(inp));
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.warnings,[]);
 assert.equal(JSON.stringify(pearlEntry(inp).definition),before);
 assert.deepEqual(r.appearances.entities[`item:${PEARL}`].events.map(x=>x.eventId),[other.id]);
 // 只挪指针不改总表标注 → 标注要求的事件上没有它的登场，警告
 const half=copy();half.links.links.find(l=>l.object.id===PEARL).eventId='lyg.event.s02_08';delete half.links.links.find(l=>l.object.id===PEARL).actionId;
 assert.match(auditStoryLinks(fresh(half)).warnings.join('\n'),new RegExp(`${PEARL}.*${ROSTER}.*没有它的登场`));
});

test('5 漂移检测：手改派生文件一行、或关卡数据变了没重新生成，都报过期',()=>{
 const hand=copy();hand.appearancesText=hand.appearancesText.replace('"chapter": 26','"chapter": 27');
 assert.match(auditStoryLinks(hand).errors.join('\n'),/entity-appearances\.json.*过期或被手改.*build-entity-appearances/);
 const stale=copy();event(stale,'lyg.mijing_rumen','lyg.event.s02_08').axisId='yange.19.1';
 assert.equal(auditStoryLinks(stale).errors.length,0,'该事件不涉及被跟踪实体，派生文件不变');
 const moved=copy();event(moved,'lyg.mijing_rumen',ROSTER).axisId='yange.30.1';
 assert.match(auditStoryLinks(moved).errors.join('\n'),/过期/);
 const missing=copy();missing.appearancesText=null;
 assert.match(auditStoryLinks(missing).errors.join('\n'),/不存在/);
});

test('6 确定性：连生成两次逐字节一致，键与事件顺序稳定',()=>{
 const a=serializeAppearances(buildAppearances(copy())),b=serializeAppearances(buildAppearances(copy()));
 assert.equal(a,b);
 const keys=Object.keys(buildAppearances(base).entities);
 assert.deepEqual(keys,[...keys].sort());
});

test('7 展开查看：把指针还原成可读剧情（章号只展示，事件 id 在括号里）',()=>{
 const text=expandStoryLinks(base);
 assert.match(text,/第 26 章｜冰冰验明超级用户（lyg\.event\.mijing_superuser_roster）：程宗扬 使用 龙珠×1（必须/);
 assert.match(text,/凝羽.*必须出现于 第 35 章.*第 37 章.*须先完成 第 21 章/);
 assert.match(text,/锦囊×1（可选/);
});

test('指针校验：悬空事件/动作/物品/角色、坏词表、数量、重复 id 都有明确报错；多义物品 id 被拦',()=>{
 const inp=copy(),l=inp.links.links[0];
 l.eventId='lyg.event.nope';assert.match(auditStoryLinks(fresh(inp)).errors.join('\n'),/link link\.demo\.dragon_pearl\.use: 事件 lyg\.event\.nope 不在关卡 lyg\.mijing_rumen 里/);
 const a=copy();a.links.links[0].actionId='no_such_action';assert.match(auditStoryLinks(fresh(a)).errors.join('\n'),/动作 no_such_action/);
 const b=copy();b.links.links[0].object.id='lyg.item.not_there';assert.match(auditStoryLinks(fresh(b)).errors.join('\n'),/物品 lyg\.item\.not_there 不在道具总表/);
 const c=copy();c.links.links[0].actor='liuchao.character.nobody';assert.match(auditStoryLinks(fresh(c)).errors.join('\n'),/角色 liuchao\.character\.nobody/);
 const d=copy();d.links.links[0].verb='steal';assert.match(auditStoryLinks(fresh(d)).errors.join('\n'),/动词 steal/);
 const e=copy();e.links.links[0].object.quantity=0;assert.match(auditStoryLinks(fresh(e)).errors.join('\n'),/quantity/);
 const f=copy();f.links.links.push({...f.links.links[0]});assert.match(auditStoryLinks(fresh(f)).errors.join('\n'),/指针 id 重复/);
 const g=copy();pearlEntry(g).stageVariants['lyg.mijing_rumen']={...pearlEntry(g).definition,name:'冒牌珠'};
 assert.match(auditStoryLinks(fresh(g)).errors.join('\n'),/多义 id.*variant identity lyg\.item\.dragon_pearl@lyg\.mijing_rumen/);
});

test('指针漏标：覆盖范围内关卡的事件里出现物品转移而没有指针，按配置警告；范围外不查',()=>{
 const inp=copy();
 inp.stages['lyg.mijing_rumen'].scenario.events[0].playerCompletionContract.effects={inventoryTransfers:[{transferId:'t1',itemId:'lcq.item.jin_nang',quantity:2}]};
 const r=auditStoryLinks(fresh(inp));
 assert.match(r.warnings.join('\n'),/指针漏标：lyg\.mijing_rumen.*lcq\.item\.jin_nang×2/);
 inp.config.storyLinks.unlinkedGrantSeverity='error';
 assert.match(auditStoryLinks(fresh(inp)).errors.join('\n'),/指针漏标/);
 inp.links.coverage.stages=['lcq.stage_02'];
 assert.deepEqual(auditStoryLinks(fresh(inp)).warnings,[]);
});
