// 宋线 S2：内容包新格式 stageMeta／railExtraBeats／secondaryLines 与包 rail 动态名字（只建机制，不搬数据）。
// 编译夹具都在 _newbot_tmp 下的临时 packs 目录，不碰仓库里的包和 catalog（写法照 contentPackDeps.test.mjs）。
// 运行时读取：纯函数直接传合成 stageMeta；模块级读 catalog 的（canonRail、musicLibrary）把 CONTENT_PACKS 换成合成 catalog 后从临时目录加载。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createJiti} from 'jiti';
import {compileContentPacks} from '../scripts/content-packs.mjs';
import {loadTs} from './loadTs.mjs';

const root=resolve(import.meta.dirname,'..');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const builtin=id=>read(join(root,'src/modules/scenarioMods/builtins/data',`${id}.json`));
const qinDir=join(root,'src/modules/contentPacks/packs/qin');
const QIN_STAGE='lyg.qin_xianyang',QIN_EVENT='liuchao.event.qin_hook_fangshi_rumor';

const {CONTENT_PACKS}=await loadTs('../src/modules/contentPacks/index.ts');
const {quarantinedStageIds}=await loadTs('../src/modules/contentPacks/stageMeta.ts');
const {TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS,DEFAULT_LINE_QUARANTINED_STAGE_IDS,DEFAULT_LINE_EXTRA_RAIL_BEATS}=await loadTs('../src/modules/scenarioMods/canonRail.ts');
const {MILESTONE_REWARDS,milestoneRewardFor}=await loadTs('../src/modules/scenarioMods/milestoneRewards.ts');
const {storyChapterTitleIn}=await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const {resolveFixedQuestObjectiveIn,FIXED_QUEST_OBJECTIVE_OVERRIDES}=await loadTs('../src/modules/scenarioMods/fixedQuestObjectives.ts');
const {SECONDARY_LINES,TS_SECONDARY_LINES,mergeSecondaryLines}=await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const {entityName}=await loadTs('../src/modules/scenarioMods/namedEntities.ts');

/** packs: {目录名: {manifest 其余字段, files: {文件名: 内容}}}；id 写在 manifest 里。 */
const withPacks=async(packs,fn)=>{
 const dir=await mkdtemp(join(root,'_newbot_tmp/song-s2-formats-'));
 try{
  for(const [name,{files={},...m}] of Object.entries(packs)){
   await mkdir(join(dir,name));
   await writeFile(join(dir,name,'manifest.json'),JSON.stringify({schemaVersion:1,...m}));
   for(const [f,v] of Object.entries(files))await writeFile(join(dir,name,f),JSON.stringify(v));
  }
  return await fn(()=>compileContentPacks({packsDir:dir}));
 }finally{await rm(dir,{recursive:true,force:true});}
};
const compile=packs=>withPacks(packs,c=>c());
const rejects=(packs,re)=>withPacks(packs,c=>assert.rejects(c,re));
const metaPack=entries=>({p:{id:'test.meta',stageMeta:['stage-meta.json'],files:{'stage-meta.json':entries}}});
const linesPack=lines=>({p:{id:'test.lines',secondaryLines:['secondary-lines.json'],files:{'secondary-lines.json':lines}}});
const qinTexts=async()=>({id:'test.a',texts:['texts.json'],files:{'texts.json':await read(join(qinDir,'qin-texts.json'))}});
const qinStage=async(m={})=>({id:'test.b',dependsOn:['test.a'],stages:['stage.json'],files:{'stage.json':await read(join(qinDir,'stage-qin-xianyang.json'))},...m});

/** 把 TS 模块复制到临时目录加载：CONTENT_PACKS 换成合成 catalog，相对 import 改成原目录的绝对路径，mp3 换成字符串。 */
const loadWithCatalog=async(rel,catalog)=>{
 const file=join(root,rel),source=await readFile(file,'utf8');
 const dir=await mkdtemp(join(root,'_newbot_tmp/song-s2-inject-'));
 try{
  await writeFile(join(dir,'catalog-stub.ts'),`export const CONTENT_PACKS: any = ${JSON.stringify(catalog)};\n`);
  const patched=source
   .replace(/^import (\w+) from '(@\/assets\/music\/[^']+\.mp3)';$/gm,(_,name,path)=>`const ${name} = '${path}';`)
   .replace(/from '(?:\.\.\/contentPacks|@\/modules\/contentPacks)'/g,`from '${join(dir,'catalog-stub.ts')}'`)
   .replace(/from '(\.{1,2}\/[^']+)'/g,(_,p)=>`from '${resolve(dirname(file),p)}'`);
  const out=join(dir,rel.split('/').pop());await writeFile(out,patched);
  return await createJiti(import.meta.url,{interopDefault:true,moduleCache:false,alias:{'@':join(root,'src')}}).import(out);
 }finally{await rm(dir,{recursive:true,force:true});}
};

// 内置关 lcq.stage_10_jiangzhou_shadow_war：不在任何 TS 章名特判、隔离表、称号表里；章不在 CHAPTER_MOOD_MAP；只有 s10_01 在 EVENT_MOOD_MAP
const S10='lcq.stage_10_jiangzhou_shadow_war';
const s10=await builtin(S10);
const [ORDERS,QINGZHOU,LAIR]=s10.scenario.chapters.map(c=>c.id);
const [E1,E2,E3]=s10.scenario.events.map(e=>e.id);
const s10Meta=()=>({stageId:S10,note:'作者备注，编译时剥掉',defaultLineQuarantined:true,milestoneReward:{titles:['测试称号'],note:'测试说明'},
 presentation:{defaultUiChapterId:QINGZHOU,chapters:{[LAIR]:{mood:'horror'}},events:{[E2]:{uiChapterId:ORDERS,mood:'emotion',objective:'测试目标'}}}});
const FB='<<FALLBACK>>';

test('新段为空时：catalog 只多两个空段，读取方与 TS 表逐项相同',()=>{
 assert.deepEqual(CONTENT_PACKS.stageMeta,[]);
 assert.deepEqual(CONTENT_PACKS.secondaryLines,[]);
 assert.deepEqual([...DEFAULT_LINE_QUARANTINED_STAGE_IDS],[...TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS]);
 assert.equal(SECONDARY_LINES.length,TS_SECONDARY_LINES.length);
 SECONDARY_LINES.forEach((line,i)=>assert.equal(line,TS_SECONDARY_LINES[i]));
 for(const r of MILESTONE_REWARDS)assert.equal(milestoneRewardFor(r.stageId),r);
 assert.equal(milestoneRewardFor(S10),undefined);
});

test('stageMeta 正例：编译后剥 note、补 chapterTitles；读取方先查 stageMeta、无值回退',async()=>{
 const out=await compile(metaPack([s10Meta()]));
 const {note,...expected}=s10Meta();
 assert.deepEqual(out.stageMeta,[{...expected,chapterTitles:{[QINGZHOU]:'晴州筹备',[ORDERS]:'攻江州令'}}]);
 const meta=out.stageMeta;
 // 隔离
 const q=quarantinedStageIds(meta,TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS);
 assert.equal(q.has(S10),true);for(const id of TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS)assert.equal(q.has(id),true);
 assert.equal(quarantinedStageIds([{stageId:'lyl.taiquan_expedition',defaultLineQuarantined:false}],TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS).has('lyl.taiquan_expedition'),false,'写了 false 的关按 stageMeta 去掉');
 // 称号
 assert.deepEqual(milestoneRewardFor(S10,meta),{stageId:S10,titles:['测试称号'],note:'测试说明'});
 assert.equal(milestoneRewardFor('lcq.stage_12_jiangzhou_counterwar',meta),MILESTONE_REWARDS.find(r=>r.stageId==='lcq.stage_12_jiangzhou_counterwar'));
 // 章名：事件 uiChapterId → 关 defaultUiChapterId → fallback
 const packs={...CONTENT_PACKS,stageMeta:meta};
 assert.equal(storyChapterTitleIn(packs,S10,E2,FB),'攻江州令');
 assert.equal(storyChapterTitleIn(packs,S10,E3,FB),'晴州筹备');
 assert.equal(storyChapterTitleIn(packs,S10,'lcq.event.not_in_catalog',FB),'晴州筹备','表外事件也取关默认章');
 assert.equal(storyChapterTitleIn(packs,S10,undefined,FB),FB);
 assert.equal(storyChapterTitleIn({...CONTENT_PACKS,stageMeta:[]},S10,E2,FB),FB);
 // 目标
 assert.equal(resolveFixedQuestObjectiveIn(meta,{id:E2,objective:'原目标'}),'测试目标');
 assert.equal(resolveFixedQuestObjectiveIn(meta,{id:E3,objective:'原目标'}),'原目标');
 assert.equal(resolveFixedQuestObjectiveIn([],{id:E2,objective:'原目标'}),'原目标');
});

test('读取方优先级：既有特判仍先于 stageMeta，stageMeta 先于 TS 表',async()=>{
 const LIN_AN='lyl.lin_an_bridge',linAn=await builtin(LIN_AN);const intel=linAn.scenario.chapters[1].id;
 const fake=[{stageId:LIN_AN,presentation:{defaultUiChapterId:intel},chapterTitles:{[intel]:'不该出现'}}];
 for(const e of linAn.scenario.events)assert.equal(storyChapterTitleIn({...CONTENT_PACKS,stageMeta:fake},LIN_AN,e.id,FB),storyChapterTitleIn(CONTENT_PACKS,LIN_AN,e.id,FB),e.id);
 // 目标：三条特判先于 stageMeta；stageMeta 先于 FIXED 表
 const special='lcq.event.s02_04',tabled=Object.keys(FIXED_QUEST_OBJECTIVE_OVERRIDES)[0];
 const objMeta=[{stageId:'x',presentation:{events:{[special]:{objective:'包'},[tabled]:{objective:'包'}}}}];
 assert.equal(resolveFixedQuestObjectiveIn(objMeta,{id:special}),resolveFixedQuestObjectiveIn([],{id:special}));
 assert.equal(resolveFixedQuestObjectiveIn(objMeta,{id:tabled}),'包');
 // 称号：stageMeta 先于 MILESTONE_REWARDS
 const s12='lcq.stage_12_jiangzhou_counterwar';
 assert.deepEqual(milestoneRewardFor(s12,[{stageId:s12,milestoneReward:{titles:['包'],note:'包'}}]),{stageId:s12,titles:['包'],note:'包'});
});

test('stageMeta 配乐：章 mood 排在包内关 presentation 之后、CHAPTER_MOOD_MAP 之前；事件 mood 先于 EVENT_MOOD_MAP',async()=>{
 const meta=[...(await compile(metaPack([s10Meta()]))).stageMeta,
  {stageId:'lyl.lin_an_bridge',presentation:{chapters:{'lyl.chapter.lin_an_bridge_arrival':{mood:'horror'}},events:{'lcq.event.s10_01_jiangzhou_order':{mood:'horror'}}}},
  {stageId:QIN_STAGE,presentation:{chapters:{'lyg.chapter.qin_xianyang_prologue':{mood:'horror'}}}}];
 const base=await loadWithCatalog('src/utils/musicLibrary.ts',CONTENT_PACKS);
 const withMeta=await loadWithCatalog('src/utils/musicLibrary.ts',{...CONTENT_PACKS,stageMeta:meta});
 assert.equal(withMeta.resolveMusicMoodForChapter(LAIR),'horror');
 assert.equal(base.resolveMusicMoodForChapter(LAIR),'battle','无 stageMeta 时走章 id 正则');
 assert.equal(withMeta.resolveMusicMoodForScenario(null,[{id:E2}]),'emotion');
 assert.equal(base.resolveMusicMoodForScenario(null,[{id:E2}]),base.resolveMusicMoodForScenario(null,[]));
 assert.equal(withMeta.resolveMusicMoodForChapter('lyl.chapter.lin_an_bridge_arrival'),'horror','stageMeta 先于 CHAPTER_MOOD_MAP');
 assert.equal(base.resolveMusicMoodForChapter('lyl.chapter.lin_an_bridge_arrival'),'court');
 assert.equal(withMeta.resolveMusicMoodForScenario(null,[{id:'lcq.event.s10_01_jiangzhou_order'}]),'horror','stageMeta 先于 EVENT_MOOD_MAP');
 assert.equal(withMeta.resolveMusicMoodForChapter('lyg.chapter.qin_xianyang_prologue'),'court','包内关章 presentation.mood 先于 stageMeta');
});

test('stageMeta 隔离：canonRail 合并后的集合与 isDefaultLineQuarantinedStageId 读 catalog',async()=>{
 const rail=await loadWithCatalog('src/modules/scenarioMods/canonRail.ts',{...CONTENT_PACKS,stageMeta:[{stageId:S10,defaultLineQuarantined:true},{stageId:'lyl.taiquan_expedition',defaultLineQuarantined:false}]});
 assert.equal(rail.isDefaultLineQuarantinedStageId(S10),true);
 assert.equal(rail.isDefaultLineQuarantinedStageId('lyl.taiquan_expedition'),false);
 assert.equal(rail.isDefaultLineQuarantinedStageId('lcq.stage_03'),true,'没写的关沿用 TS 表');
 assert.equal(rail.DEFAULT_LINE_QUARANTINED_STAGE_IDS.size,TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS.size);
});

test('stageMeta 反例：关、章、事件、mood、目标、称号与字段',async()=>{
 const bad=async(patch,re)=>rejects(metaPack([{...s10Meta(),...patch}]),re);
 await bad({stageId:'lcq.no_such_stage'},/stageMeta lcq\.no_such_stage: unknown stage/);
 await bad({extra:1},/stageMeta \S+: invalid fields/);
 await bad({defaultLineQuarantined:'yes'},/defaultLineQuarantined must be boolean/);
 await bad({milestoneReward:{titles:[],note:'x'}},/invalid milestoneReward/);
 await bad({presentation:{defaultUiChapterId:'lyl.chapter.lin_an_bridge_intel'}},/lyl\.chapter\.lin_an_bridge_intel is not a chapter of lcq\.stage_10/);
 await bad({presentation:{events:{'lyl.event.debut_jingli':{mood:'court'}}}},/lyl\.event\.debut_jingli is not an event of lcq\.stage_10/);
 await bad({presentation:{events:{[E2]:{uiChapterId:'lyl.chapter.lin_an_bridge_intel'}}}},/is not a chapter of/);
 await bad({presentation:{events:{[E2]:{mood:'no_such_mood'}}}},/invalid mood no_such_mood/);
 await bad({presentation:{chapters:{[LAIR]:{mood:'no_such_mood'}}}},/chapter \S+: invalid mood/);
 await bad({presentation:{events:{[E2]:{objective:'  '}}}},/empty objective/);
 await bad({presentation:{events:{[E2]:{title:'x'}}}},/event \S+: invalid fields/);
 await rejects(metaPack([s10Meta(),{stageId:S10}]),/stageMeta stageId missing\/duplicate id lcq\.stage_10/);
 // 包内关已有 presentation 的事件／章不得再写
 const qinEvent=(await read(join(qinDir,'stage-qin-xianyang.json'))).scenario.events.find(e=>e.presentation?.uiChapterId);
 await rejects({a:await qinTexts(),b:await qinStage(),c:{id:'test.c',dependsOn:['test.b'],stageMeta:['m.json'],files:{'m.json':[{stageId:QIN_STAGE,presentation:{events:{[qinEvent.id]:{uiChapterId:'lyg.chapter.qin_xianyang_act1'}}}}]}}},/already has presentation\.uiChapterId/);
 await rejects({a:await qinTexts(),b:await qinStage(),c:{id:'test.c',dependsOn:['test.b'],stageMeta:['m.json'],files:{'m.json':[{stageId:QIN_STAGE,presentation:{chapters:{'lyg.chapter.qin_xianyang_prologue':{mood:'court'}}}}]}}},/already has presentation\.mood/);
});

test('stageMeta 反例：与 TS 表重复（validateWithTs）',async()=>{
 await rejects(metaPack([{stageId:'lyl.taiquan_expedition',defaultLineQuarantined:true}]),/defaultLineQuarantined also set in canonRail\.ts/);
 await rejects(metaPack([{stageId:'lcq.stage_12_jiangzhou_counterwar',milestoneReward:{titles:['x'],note:'x'}}]),/milestoneReward also set in milestoneRewards\.ts/);
 await rejects(metaPack([{stageId:'lyl.lin_an_bridge',presentation:{events:{'lyl.event.debut_jingli':{objective:'x'}}}}]),/objective for lyl\.event\.debut_jingli already set in fixedQuestObjectives\.ts/);
 await rejects(metaPack([{stageId:S10,presentation:{events:{[E1]:{mood:'court'}}}}]),/event mood for lcq\.event\.s10_01_jiangzhou_order also set in musicLibrary\.ts EVENT_MOOD_MAP/);
 await rejects(metaPack([{stageId:'lyl.lin_an_bridge',presentation:{chapters:{'lyl.chapter.lin_an_bridge_arrival':{mood:'court'}}}}]),/chapter mood for lyl\.chapter\.lin_an_bridge_arrival also set in musicLibrary\.ts CHAPTER_MOOD_MAP/);
 // 临安的章名特判覆盖整关：迁 stageMeta 必须同时删掉特判（S4b），否则 defaultUiChapterId／逐事件 uiChapterId 都不生效
 await rejects(metaPack([{stageId:'lyl.lin_an_bridge',presentation:{defaultUiChapterId:'lyl.chapter.lin_an_bridge_intel'}}]),/stageMeta lyl\.lin_an_bridge: defaultUiChapterId is shadowed by eventNarrativeView\.ts/);
 await rejects(metaPack([{stageId:'lyl.lin_an_bridge',presentation:{events:{'lyl.event.debut_jingli':{uiChapterId:'lyl.chapter.lin_an_bridge_intel'}}}}]),/chapter title for lyl\.event\.debut_jingli is already decided in eventNarrativeView\.ts/);
 // lcq.stage_04 只对表里 7 拍特判：关默认章与表内事件重叠，逐事件查出来
 await rejects(metaPack([{stageId:'lcq.stage_04',presentation:{defaultUiChapterId:(await builtin('lcq.stage_04')).scenario.chapters[0].id}}]),/defaultUiChapterId is shadowed by eventNarrativeView\.ts \(event lcq\.event\.s04_0\d\)/);
});

test('stageMeta 包内关：包内 presentation.uiChapterId 先于 stageMeta，其余事件取 defaultUiChapterId',async()=>{
 const stage=await read(join(qinDir,'stage-qin-xianyang.json'));
 const c={id:'test.c',dependsOn:['test.b'],stageMeta:['m.json'],files:{'m.json':[{stageId:QIN_STAGE,presentation:{defaultUiChapterId:'lyg.chapter.qin_xianyang_act3'}}]}};
 const out=await compile({a:await qinTexts(),b:await qinStage(),c});
 const act3=stage.scenario.chapters.find(x=>x.id==='lyg.chapter.qin_xianyang_act3').title;
 for(const e of stage.scenario.events){
  const before=storyChapterTitleIn({...out,stageMeta:[]},QIN_STAGE,e.id,FB);
  assert.equal(storyChapterTitleIn(out,QIN_STAGE,e.id,FB),before===FB?act3:before,e.id);
 }
});

// rail 夹具：取一条不在 TS 加拍表里的生成档（纯字符串文案）当包 rail
const generated=await read(join(root,'src/modules/scenarioMods/canonRailProfiles.generated.json'));
const P=generated.find(p=>p.orderedEventIds.length>=4&&!DEFAULT_LINE_EXTRA_RAIL_BEATS.some(x=>x.modId===p.modId));
const railPack=(rail,extras)=>({p:{id:'test.rail',rails:['rails.json'],...(extras?{railExtraBeats:['extra.json']}:{}),files:{'rails.json':[rail],...(extras?{'extra.json':extras}:{})}}});
const without=(p,i)=>({...p,orderedEventIds:p.orderedEventIds.filter((_,j)=>j!==i),contracts:p.contracts.filter((_,j)=>j!==i)});

test('railExtraBeats 正例：按 afterEventId／beforeEventId 并进同一次编译的包 rail，catalog 只存合并结果',async()=>{
 const after={modId:P.modId,afterEventId:P.orderedEventIds[1],eventIds:[P.orderedEventIds[2]],contracts:[P.contracts[2]],note:'作者备注'};
 const out=await compile(railPack(without(P,2),[after]));
 assert.deepEqual(out.rails,[P]);assert.equal('railExtraBeats' in out,false);
 const before={modId:P.modId,beforeEventId:P.orderedEventIds[1],eventIds:[P.orderedEventIds[0]],contracts:[P.contracts[0]]};
 assert.deepEqual((await compile(railPack(without(P,0),[before]))).rails,[P]);
});

test('railExtraBeats 反例：锚点、重复、合同数、无 rail、二选一、事件不属该关、与 TS 加拍表同关',async()=>{
 const x=(patch={})=>({modId:P.modId,afterEventId:P.orderedEventIds[1],eventIds:[P.orderedEventIds[2]],contracts:[P.contracts[2]],...patch});
 const base=without(P,2);
 await rejects(railPack(base,[x({afterEventId:'lcq.event.nope'})]),new RegExp(`extra rail beat missing insertion anchor lcq\\.event\\.nope`));
 await rejects(railPack(base,[x({eventIds:[P.orderedEventIds[0]],contracts:[P.contracts[0]]})]),/extra rail beat already present/);
 await rejects(railPack(base,[x({contracts:[]})]),/extra rail beat contracts must match eventIds/);
 await rejects(railPack(base,[x({modId:'lcq.stage_01'})]),/railExtraBeats lcq\.stage_01: no pack rail for this stage/);
 await rejects(railPack(base,[x({beforeEventId:P.orderedEventIds[3]})]),/railExtraBeats \S+: invalid fields/);
 await rejects(railPack(base,[x({eventIds:['lyl.event.debut_jingli'],contracts:[{...P.contracts[2],eventId:'lyl.event.debut_jingli'}]})]),/orderedEventIds must be distinct events of the stage/);
 const shared=generated.find(p=>DEFAULT_LINE_EXTRA_RAIL_BEATS.some(e=>e.modId===p.modId));
 await rejects(railPack(shared),new RegExp(`rail ${shared.modId.replaceAll('.','\\.')}: also listed in canonRail\\.ts DEFAULT_LINE_EXTRA_RAIL_BEATS`));
});

test('包 rail 动态名字：编译期校验实体与标签，catalog 留原样，canonRail 合并时解析',async()=>{
 const CH='liuchao.character.a_jiman_bana';
 const named=t=>({...P,contracts:P.contracts.map((c,i)=>i?c:{...c,mustReach:t})});
 const tpl=`见{{entity:character:${CH}}}，称{{entityLabel:character:${CH}:short}}`;
 const out=await compile(railPack(named(tpl)));
 assert.equal(out.rails[0].contracts[0].mustReach,tpl);
 const rail=await loadWithCatalog('src/modules/scenarioMods/canonRail.ts',{...CONTENT_PACKS,rails:out.rails});
 assert.equal(rail.getCanonRailProfile({modId:P.modId}).contracts[0].mustReach,`见${entityName('character',CH)}，称阿姬曼`);
 await rejects(railPack(named('{{entity:character:liuchao.character.nobody}}')),/unknown character liuchao\.character\.nobody/);
 await rejects(railPack(named(`{{entityLabel:character:${CH}:no_label}}`)),/unknown label no_label/);
 await rejects(railPack(named('{{entity:identity:x}}')),/expected entity:<kind>:<id>/);
 await rejects(railPack(named('{{name}}')),/expected entity:<kind>:<id>/);
});

const line=(patch={})=>({id:'test_line',name:'测试线',kind:'nation',after:'jin',note:'作者备注',anchorEventIds:[E1],anchorLocationIds:['liuchao.location.jiangzhou'],entryHint:'去江州。',basis:'测试。',
 nodes:[{reviewSummary:'第一步',status:'ready',stageId:S10,eventId:E2,note:'节点备注'},{reviewSummary:'待扩',status:'pending'}],...patch});

test('secondaryLines 正例：剥 note、保留 after；合并后按 after 插位，可接在另一条包线后面',async()=>{
 const out=await compile(linesPack([line(),line({id:'test_line2',after:'test_line',anchorEventIds:['lcq.event.not_yet'],anchorEventPending:true})]));
 assert.equal(out.secondaryLines.length,2);
 assert.equal('note' in out.secondaryLines[0],false);assert.equal(out.secondaryLines[0].nodes.some(n=>'note' in n),false);
 assert.equal(out.secondaryLines[0].after,'jin');
 const merged=mergeSecondaryLines(TS_SECONDARY_LINES,out.secondaryLines);const ids=merged.map(l=>l.id);
 const jin=ids.indexOf('jin');assert.deepEqual(ids.slice(jin,jin+4),['jin','test_line','test_line2','song']);
 assert.deepEqual(ids.filter(id=>!id.startsWith('test_')),TS_SECONDARY_LINES.map(l=>l.id));
 assert.equal('after' in merged[jin+1],false);
});

test('secondaryLines 反例：kind、status、节点关与事件、锚事件、锚地点、after、id',async()=>{
 await rejects(linesPack([line({kind:'guild'})]),/secondary line test_line: invalid fields/);
 await rejects(linesPack([line({nodes:[{reviewSummary:'x',status:'done'}]})]),/node 0: invalid fields/);
 await rejects(linesPack([line({nodes:[{reviewSummary:'x',status:'ready',stageId:'lcq.no_such_stage',eventId:E2}]})]),/node 0: unknown stage lcq\.no_such_stage/);
 await rejects(linesPack([line({nodes:[{reviewSummary:'x',status:'ready',stageId:S10,eventId:'lyl.event.debut_jingli'}]})]),/node 0: lyl\.event\.debut_jingli is not an event of lcq\.stage_10/);
 await rejects(linesPack([line({anchorEventIds:['lcq.event.not_yet']})]),/unknown anchor event lcq\.event\.not_yet/);
 await rejects(linesPack([line({anchorLocationIds:['liuchao.location.nowhere']})]),/unknown anchor location liuchao\.location\.nowhere/);
 await rejects(linesPack([line({after:''})]),/after must name a line/);
 await rejects(linesPack([line(),line({id:'test_line2'})]),/test_line2: another pack line is already after jin/);
 await rejects(linesPack([line({after:'no_such_line'})]),/secondary line test_line: after no_such_line not found/);
 await rejects(linesPack([line({id:'song'})]),/secondary line song: duplicate id/);
 await rejects(linesPack([line(),line()]),/secondary line missing\/duplicate id test_line/);
});

test('归属检查认得新段里的 id：引用包内关、事件、rail 要 dependsOn',async()=>{
 const a=await qinTexts(),b=await qinStage();
 const owned=new RegExp(`test\\.c references \\S+ owned by test\\.b; add dependsOn`);
 const c=(m,deps)=>({id:'test.c',...m,...(deps?{dependsOn:['test.b']}:{})});
 const meta={stageMeta:['m.json'],files:{'m.json':[{stageId:QIN_STAGE,defaultLineQuarantined:false}]}};
 await rejects({a,b,c:c(meta)},owned);
 assert.equal((await compile({a,b,c:c(meta,true)})).stageMeta[0].stageId,QIN_STAGE);
 const lines={secondaryLines:['l.json'],files:{'l.json':[line({anchorEventIds:[QIN_EVENT],nodes:[{reviewSummary:'x',status:'ready',stageId:QIN_STAGE,eventId:QIN_EVENT}]})]}};
 await rejects({a,b,c:c(lines)},owned);
 assert.equal((await compile({a,b,c:c(lines,true)})).secondaryLines[0].id,'test_line');
 const qinRail=(await read(join(qinDir,'rails.json')))[0];const last=qinRail.orderedEventIds.length-1;
 const bRail={...b,rails:['rails.json'],files:{...b.files,'rails.json':[without(qinRail,last)]}};
 const extras={railExtraBeats:['x.json'],files:{'x.json':[{modId:QIN_STAGE,afterEventId:qinRail.orderedEventIds[last-1],eventIds:[qinRail.orderedEventIds[last]],contracts:[qinRail.contracts[last]]}]}};
 await rejects({a,b:bRail,c:c(extras)},owned);
 const out=await compile({a,b:bRail,c:{...c(extras,true),dependsOn:['test.a','test.b']}});
 assert.deepEqual(out.rails[0].orderedEventIds,qinRail.orderedEventIds);
});
