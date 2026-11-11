// 宋线 S2：内容包新格式 stageMeta／railExtraBeats／secondaryLines 与包 rail 动态名字（只建机制，不搬数据）。
// 编译夹具都在 _newbot_tmp 下的临时 packs 目录，不碰仓库里的包和 catalog（写法照 contentPackDeps.test.mjs）。
// 运行时读取：纯函数直接传合成 stageMeta；模块级读 catalog 的（canonRail、musicLibrary）把 CONTENT_PACKS 换成合成 catalog 后从临时目录加载。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
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
const {TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS,DEFAULT_LINE_EXTRA_RAIL_BEATS}=await loadTs('../src/modules/scenarioMods/canonRail.ts');
const {TS_MILESTONE_REWARDS,milestoneRewardFor}=await loadTs('../src/modules/scenarioMods/milestoneRewards.ts');
const NV=await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const {storyChapterTitleIn}=NV;
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
// 晋线 S4：晋的事件配乐、jin 二级线迁出 TS。EVENT_MOOD_MAP、TS_SECONDARY_LINES 的条目都属某条线、终将搬空，
// 夹具改为从 TS 表动态挑第一条现存条目（配乐表按编译器同样的读源码法）；表搬空时这几条用例要改用合成的临时 TS 条目。
const EVENT_MOOD_ID=(await readFile(join(root,'src/utils/musicLibrary.ts'),'utf8')).match(/const EVENT_MOOD_MAP: Record<string, MusicMood> = \{([\s\S]*?)\n\};/)?.[1].match(/^\s*'([^']+)': '[^']+',$/m)?.[1];
// 昭南线 S4（八条线全部进包）之后 EVENT_MOOD_MAP、CHAPTER_MOOD_MAP、TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS 都已搬空：
// 配乐两张表由编译器读 musicLibrary.ts 源码取键，没法塞合成条目——「先于 TS 表」「与 TS 表重复」这几条只在表里还有条目时才断言；
// stageMeta 自身生效的断言改用任取的内置章／事件（MOOD_CH／MOOD_EV）。
const BUILTINS=await Promise.all((await readdir(join(root,'src/modules/scenarioMods/builtins/data'))).filter(f=>f.endsWith('.json')).sort().map(f=>read(join(root,'src/modules/scenarioMods/builtins/data',f))));
const EVENT_MOOD_STAGE=EVENT_MOOD_ID&&BUILTINS.find(m=>m.scenario.events.some(e=>e.id===EVENT_MOOD_ID)).manifest.id;
const TS_LINE_ID=TS_SECONDARY_LINES[0]?.id;
assert.ok(TS_LINE_ID,'TS_SECONDARY_LINES 已搬空：改用合成的临时 TS 线');
// 汉线 S4：汉的隔离、称号、目标、章配乐、整关章名特判迁出 TS（原夹具洛都封侯、liujian_takes_nangong、luoyang_cloud_secret 章、汉宫）。
// 同样改为从 TS 表／特判动态挑现存条目；表搬空时这几条用例要改用合成的临时 TS 条目。
const [,CH_MOOD_ID,CH_MOOD]=(await readFile(join(root,'src/utils/musicLibrary.ts'),'utf8')).match(/const CHAPTER_MOOD_MAP: Record<string, MusicMood> = \{([\s\S]*?)\n\};/)?.[1].match(/^\s*'([^']+)': '([^']+)',$/m)||[];
const CH_MOOD_STAGE=CH_MOOD_ID&&BUILTINS.find(m=>m.scenario.chapters.some(c=>c.id===CH_MOOD_ID)).manifest.id;
const MOOD_BUILTIN=BUILTINS.find(m=>m.scenario.chapters.length&&m.scenario.events.length);
const MOOD_STAGE=CH_MOOD_STAGE||MOOD_BUILTIN.manifest.id,MOOD_CH=CH_MOOD_ID||MOOD_BUILTIN.scenario.chapters[0].id,MOOD_EV=EVENT_MOOD_ID||MOOD_BUILTIN.scenario.events[0].id;
// 唐线 S4：唐称号迁出后 TS_MILESTONE_REWARDS 已搬空：改用合成的临时 TS 条目——用例里临时推进 TS 表、用完删掉。
// 本文件与编译器（scripts/content-packs.mjs 的 jiti）共用 jiti 模块缓存，拿到的是同一个数组，所以编译期校验也看得到这条
// （不共用时下面「与 TS 表重复」的 rejects 会因为编译通过而红，不会静默放过）。
const MR_STAGE=BUILTINS.map(m=>m.manifest.id).find(id=>!milestoneRewardFor(id));
const withTsMilestone=async fn=>{const r={stageId:MR_STAGE,titles:['合成称号'],note:'合成的临时 TS 条目'};TS_MILESTONE_REWARDS.push(r);
 try{return await fn();}finally{TS_MILESTONE_REWARDS.splice(TS_MILESTONE_REWARDS.indexOf(r),1);}};
const OBJ_ID=Object.keys(FIXED_QUEST_OBJECTIVE_OVERRIDES)[0];
assert.ok(OBJ_ID,'FIXED_QUEST_OBJECTIVE_OVERRIDES 已搬空：改用合成的临时 TS 条目');
const OBJ_STAGE=BUILTINS.find(m=>m.scenario.events.some(e=>e.id===OBJ_ID)).manifest.id;
// 塞外线 S4 把 lcq.stage_03 的隔离也迁进了塞外包：两个隔离夹具都从 TS 表动态挑（Q_OFF 注入成 false，TS_QUARANTINED_ID 验证「没写的关沿用 TS 表」）
// 昭南线 S4 之后 TS 隔离表已搬空：Q_OFF／TS_QUARANTINED_ID 在表里还有条目时照旧取前两条；搬空后「与 TS 表重复」的编译期反例
// 用合成的临时 TS 条目（临时 add 进导出的 Set、用完删掉——编译器与本文件共用同一个模块对象，同 withTsMilestone）。
const [Q_OFF,TS_QUARANTINED_ID]=[...TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS];
const Q_SYNTH=BUILTINS.map(m=>m.manifest.id).find(id=>!CONTENT_PACKS.stageMeta?.some(m=>m.stageId===id&&m.defaultLineQuarantined!==undefined)&&!TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(id)&&id!=='lcq.stage_10_jiangzhou_shadow_war');
const withTsQuarantine=async fn=>{TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS.add(Q_SYNTH);try{return await fn();}finally{TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS.delete(Q_SYNTH);}};
// 唐线 S4：长安初定／长安插曲特判迁进唐包后，eventNarrativeView.ts 已没有整关章名特判：编译期反例改用合成的临时特判——
// 临时替换模块导出的 storyChapterTitleIn（同上，编译器与本文件共用同一个模块对象），给 WHOLE_STAGE 的任何事件都定章名，用完还原。
const WHOLE_STAGE=BUILTINS.find(m=>m.scenario.chapters.length&&m.scenario.events.length);
const withWholeStageSpecial=async fn=>{const orig=NV.storyChapterTitleIn,W=WHOLE_STAGE.manifest.id;
 NV.storyChapterTitleIn=(packs,modId,eventId,fallback)=>modId===W&&eventId?'合成整关特判':orig(packs,modId,eventId,fallback);
 try{return await fn();}finally{NV.storyChapterTitleIn=orig;}};
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

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

// 宋线 S4 起真实 catalog 已有宋包的 stageMeta／secondaryLines：「新段为空」改为注入去掉这两段的 catalog 后加载读取方
test('新段为空时：catalog 只多两个空段，读取方与 TS 表逐项相同',async()=>{
 const empty={...CONTENT_PACKS,stageMeta:[],secondaryLines:[]};
 const rail=await loadWithCatalog('src/modules/scenarioMods/canonRail.ts',empty),sl=await loadWithCatalog('src/modules/scenarioMods/secondaryLines.ts',empty),mr=await loadWithCatalog('src/modules/scenarioMods/milestoneRewards.ts',empty);
 assert.deepEqual([...rail.DEFAULT_LINE_QUARANTINED_STAGE_IDS],[...rail.TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS]);
 assert.equal(sl.SECONDARY_LINES.length,sl.TS_SECONDARY_LINES.length);
 sl.SECONDARY_LINES.forEach((line,i)=>assert.equal(line,sl.TS_SECONDARY_LINES[i]));
 for(const r of mr.MILESTONE_REWARDS)assert.equal(mr.milestoneRewardFor(r.stageId),r);
 assert.equal(mr.milestoneRewardFor(S10),undefined);
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
 await withTsMilestone(()=>assert.equal(milestoneRewardFor(MR_STAGE,meta),TS_MILESTONE_REWARDS.find(r=>r.stageId===MR_STAGE)));
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

// 宋线 S4b 删了临安特判、宋的 TS 表条目迁进宋包：夹具改用仍留在 TS 里的汉宫特判、洛都封侯称号
// 汉线 S4 又删了汉宫特判、汉称号：改用上面动态挑出的整关特判关（WHOLE_STAGE）与 TS 称号表现存条目（MR_STAGE）
// 唐线 S4 删了最后的整关特判（长安初定）：章名改用 lcq.stage_04 的逐拍特判（只对特判定了章名的那几拍查），称号用合成的临时 TS 条目
test('读取方优先级：既有特判仍先于 stageMeta，stageMeta 先于 TS 表',async()=>{
 const linAn=await builtin('lcq.stage_04'),LIN_AN=linAn.manifest.id;const intel=linAn.scenario.chapters.at(-1).id;
 const fake=[{stageId:LIN_AN,presentation:{defaultUiChapterId:intel},chapterTitles:{[intel]:'不该出现'}}];
 const decided=linAn.scenario.events.filter(e=>storyChapterTitleIn({...CONTENT_PACKS,stageMeta:[]},LIN_AN,e.id,FB)!==FB);
 assert.ok(decided.length,'lcq.stage_04 已没有逐拍章名特判：改用别的特判或合成的临时特判');
 for(const e of decided)assert.equal(storyChapterTitleIn({...CONTENT_PACKS,stageMeta:fake},LIN_AN,e.id,FB),storyChapterTitleIn(CONTENT_PACKS,LIN_AN,e.id,FB),e.id);
 // 目标：三条特判先于 stageMeta；stageMeta 先于 FIXED 表
 const special='lcq.event.s02_04',tabled=Object.keys(FIXED_QUEST_OBJECTIVE_OVERRIDES)[0];
 const objMeta=[{stageId:'x',presentation:{events:{[special]:{objective:'包'},[tabled]:{objective:'包'}}}}];
 assert.equal(resolveFixedQuestObjectiveIn(objMeta,{id:special}),resolveFixedQuestObjectiveIn([],{id:special}));
 assert.equal(resolveFixedQuestObjectiveIn(objMeta,{id:tabled}),'包');
 // 称号：stageMeta 先于 MILESTONE_REWARDS
 const s12=MR_STAGE;
 await withTsMilestone(()=>assert.deepEqual(milestoneRewardFor(s12,[{stageId:s12,milestoneReward:{titles:['包'],note:'包'}}]),{stageId:s12,titles:['包'],note:'包'}));
});

test('stageMeta 配乐：章 mood 排在包内关 presentation 之后、CHAPTER_MOOD_MAP 之前；事件 mood 先于 EVENT_MOOD_MAP',async()=>{
 const meta=[...(await compile(metaPack([s10Meta()]))).stageMeta,
  {stageId:MOOD_STAGE,presentation:{chapters:{[MOOD_CH]:{mood:'horror'}},events:{[MOOD_EV]:{mood:'horror'}}}},
  {stageId:QIN_STAGE,presentation:{chapters:{'lyg.chapter.qin_xianyang_prologue':{mood:'horror'}}}}];
 const base=await loadWithCatalog('src/utils/musicLibrary.ts',CONTENT_PACKS);
 const withMeta=await loadWithCatalog('src/utils/musicLibrary.ts',{...CONTENT_PACKS,stageMeta:meta});
 assert.equal(withMeta.resolveMusicMoodForChapter(LAIR),'horror');
 assert.equal(base.resolveMusicMoodForChapter(LAIR),'battle','无 stageMeta 时走章 id 正则');
 assert.equal(withMeta.resolveMusicMoodForScenario(null,[{id:E2}]),'emotion');
 assert.equal(base.resolveMusicMoodForScenario(null,[{id:E2}]),base.resolveMusicMoodForScenario(null,[]));
 assert.equal(withMeta.resolveMusicMoodForChapter(MOOD_CH),'horror','stageMeta 章配乐生效（表里还有条目时即「先于 CHAPTER_MOOD_MAP」）');
 if(CH_MOOD_ID)assert.equal(base.resolveMusicMoodForChapter(CH_MOOD_ID),CH_MOOD);
 assert.equal(withMeta.resolveMusicMoodForScenario(null,[{id:MOOD_EV}]),'horror','stageMeta 事件配乐生效（表里还有条目时即「先于 EVENT_MOOD_MAP」）');
 assert.equal(withMeta.resolveMusicMoodForChapter('lyg.chapter.qin_xianyang_prologue'),'court','包内关章 presentation.mood 先于 stageMeta');
});

test('stageMeta 隔离：canonRail 合并后的集合与 isDefaultLineQuarantinedStageId 读 catalog',async()=>{
 const off=Q_OFF||Q_SYNTH;
 const rail=await loadWithCatalog('src/modules/scenarioMods/canonRail.ts',{...CONTENT_PACKS,stageMeta:[{stageId:S10,defaultLineQuarantined:true},{stageId:off,defaultLineQuarantined:false}]});
 assert.equal(rail.isDefaultLineQuarantinedStageId(S10),true);
 assert.equal(rail.isDefaultLineQuarantinedStageId(off),false);
 if(TS_QUARANTINED_ID)assert.equal(rail.isDefaultLineQuarantinedStageId(TS_QUARANTINED_ID),true,'没写的关沿用 TS 表');
 // S10 加入（+1）；Q_OFF 在 TS 表里时被去掉（−1），表已搬空时没有可去掉的
 assert.equal(rail.DEFAULT_LINE_QUARANTINED_STAGE_IDS.size,TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS.size+(Q_OFF?0:1));
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
 // 宋线 S4 把宋的条目迁出了这些 TS 表：夹具改用仍留在 TS 里的非宋条目
 await withTsQuarantine(()=>rejects(metaPack([{stageId:Q_SYNTH,defaultLineQuarantined:true}]),/defaultLineQuarantined also set in canonRail\.ts/));
 await withTsMilestone(()=>rejects(metaPack([{stageId:MR_STAGE,milestoneReward:{titles:['x'],note:'x'}}]),/milestoneReward also set in milestoneRewards\.ts/));
 await rejects(metaPack([{stageId:OBJ_STAGE,presentation:{events:{[OBJ_ID]:{objective:'x'}}}}]),new RegExp(`objective for ${reEsc(OBJ_ID)} already set in fixedQuestObjectives\\.ts`));
 if(EVENT_MOOD_ID)await rejects(metaPack([{stageId:EVENT_MOOD_STAGE,presentation:{events:{[EVENT_MOOD_ID]:{mood:'court'}}}}]),new RegExp(`event mood for ${reEsc(EVENT_MOOD_ID)} also set in musicLibrary\\.ts EVENT_MOOD_MAP`));
 if(CH_MOOD_ID)await rejects(metaPack([{stageId:CH_MOOD_STAGE,presentation:{chapters:{[CH_MOOD_ID]:{mood:'court'}}}}]),new RegExp(`chapter mood for ${reEsc(CH_MOOD_ID)} also set in musicLibrary\\.ts CHAPTER_MOOD_MAP`));
 // 整关章名特判（原夹具汉宫，汉线 S4 已删；唐线 S4 删了最后一个长安初定，现用 WHOLE_STAGE 上的合成临时特判）：迁 stageMeta 必须同时删掉特判（宋临安在 S4b 就是这样做的），否则 defaultUiChapterId／逐事件 uiChapterId 都不生效
 const W=WHOLE_STAGE.manifest.id,WCH=WHOLE_STAGE.scenario.chapters[0].id,WEV=WHOLE_STAGE.scenario.events[0].id;
 await withWholeStageSpecial(async()=>{
  await rejects(metaPack([{stageId:W,presentation:{defaultUiChapterId:WCH}}]),new RegExp(`stageMeta ${reEsc(W)}: defaultUiChapterId is shadowed by eventNarrativeView\\.ts`));
  await rejects(metaPack([{stageId:W,presentation:{events:{[WEV]:{uiChapterId:WCH}}}}]),new RegExp(`chapter title for ${reEsc(WEV)} is already decided in eventNarrativeView\\.ts`));
 });
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
// 昭南线 S4 之后核心生成档已搬空：夹具改从核心生成档 + 各包的 rails.generated.json（同一形状的未合并生成档）里挑
const PACKS_DIR=join(root,'src/modules/contentPacks/packs');
const generated=[...await read(join(root,'src/modules/scenarioMods/canonRailProfiles.generated.json')),
 ...(await Promise.all((await readdir(PACKS_DIR)).sort().map(d=>read(join(PACKS_DIR,d,'rails.generated.json')).catch(()=>[])))).flat()];
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
 // TS 加拍表已搬空时改用合成的临时 TS 条目（临时 push、用完 pop；编译器与本文件共用同一个模块对象）
 const shared=generated.find(p=>DEFAULT_LINE_EXTRA_RAIL_BEATS.some(e=>e.modId===p.modId))||P;
 const synth=!DEFAULT_LINE_EXTRA_RAIL_BEATS.some(e=>e.modId===shared.modId);
 if(synth)DEFAULT_LINE_EXTRA_RAIL_BEATS.push({modId:shared.modId,afterEventId:shared.orderedEventIds[0],eventIds:[],contracts:[]});
 try{await rejects(railPack(shared),new RegExp(`rail ${shared.modId.replaceAll('.','\\.')}: also listed in canonRail\\.ts DEFAULT_LINE_EXTRA_RAIL_BEATS`));}
 finally{if(synth)DEFAULT_LINE_EXTRA_RAIL_BEATS.pop();}
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

const line=(patch={})=>({id:'test_line',name:'测试线',kind:'nation',after:TS_LINE_ID,note:'作者备注',anchorEventIds:[E1],anchorLocationIds:['liuchao.location.jiangzhou'],entryHint:'去江州。',basis:'测试。',
 nodes:[{reviewSummary:'第一步',status:'ready',stageId:S10,eventId:E2,note:'节点备注'},{reviewSummary:'待扩',status:'pending'}],...patch});

test('secondaryLines 正例：剥 note、保留 after；合并后按 after 插位，可接在另一条包线后面',async()=>{
 const out=await compile(linesPack([line(),line({id:'test_line2',after:'test_line',anchorEventIds:['lcq.event.not_yet'],anchorEventPending:true})]));
 assert.equal(out.secondaryLines.length,2);
 assert.equal('note' in out.secondaryLines[0],false);assert.equal(out.secondaryLines[0].nodes.some(n=>'note' in n),false);
 assert.equal(out.secondaryLines[0].after,TS_LINE_ID);
 // 宋线 S4c：song 线从 TS 表迁进宋包，基底改用合并后的 SECONDARY_LINES（只换读取来源）
 const merged=mergeSecondaryLines(SECONDARY_LINES,out.secondaryLines);const ids=merged.map(l=>l.id);
 const at=ids.indexOf(TS_LINE_ID),next=SECONDARY_LINES[SECONDARY_LINES.findIndex(l=>l.id===TS_LINE_ID)+1]?.id;assert.deepEqual(ids.slice(at,at+4),[TS_LINE_ID,'test_line','test_line2',next].filter(Boolean));
 assert.deepEqual(ids.filter(id=>!id.startsWith('test_')),SECONDARY_LINES.map(l=>l.id));
 assert.equal('after' in merged[at+1],false);
});

test('secondaryLines 反例：kind、status、节点关与事件、锚事件、锚地点、after、id',async()=>{
 await rejects(linesPack([line({kind:'guild'})]),/secondary line test_line: invalid fields/);
 await rejects(linesPack([line({nodes:[{reviewSummary:'x',status:'done'}]})]),/node 0: invalid fields/);
 await rejects(linesPack([line({nodes:[{reviewSummary:'x',status:'ready',stageId:'lcq.no_such_stage',eventId:E2}]})]),/node 0: unknown stage lcq\.no_such_stage/);
 await rejects(linesPack([line({nodes:[{reviewSummary:'x',status:'ready',stageId:S10,eventId:'lyl.event.debut_jingli'}]})]),/node 0: lyl\.event\.debut_jingli is not an event of lcq\.stage_10/);
 await rejects(linesPack([line({anchorEventIds:['lcq.event.not_yet']})]),/unknown anchor event lcq\.event\.not_yet/);
 await rejects(linesPack([line({anchorLocationIds:['liuchao.location.nowhere']})]),/unknown anchor location liuchao\.location\.nowhere/);
 await rejects(linesPack([line({after:''})]),/after must name a line/);
 await rejects(linesPack([line(),line({id:'test_line2'})]),new RegExp(`test_line2: another pack line is already after ${reEsc(TS_LINE_ID)}`));
 await rejects(linesPack([line({after:'no_such_line'})]),/secondary line test_line: after no_such_line not found/);
 // 汉线 S4：han 线迁出 TS，与 TS 线同 id 的夹具改用 TS_LINE_ID
 await rejects(linesPack([line({id:TS_LINE_ID})]),new RegExp(`secondary line ${reEsc(TS_LINE_ID)}: duplicate id`));
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
