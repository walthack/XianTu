#!/usr/bin/env node
// 把补卡的漏网配角 source 锚定挂进 mod 关卡:按其 extraction firstSeen 落到该书 sourceRange 含之的关卡。
// 带卡资料(personality/appearance/race/origin + 富字段进 notes)。id 用 missing-idmap.json。备份 stages-pre-place-backup。
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const SCRATCH = '/private/tmp/claude-501/-Users-clawbot-Projects-XianTu/4539c391-d7a9-44e3-89ed-752e9edc2f05/scratchpad';
const books = ['qingyu', 'yunlong', 'yange'];
const raceClean = s => (s || '').replace(/（[^）]*）/g, '').trim();
const TAGMAP = [['与主角关系','关系'],['称呼','称呼'],['说话风格','谈吐'],['人格底线','底线'],['目标动机','目标'],['弱点软肋','软肋'],['加入经过','入伙'],['关键情节','情节'],['结局下场','结局'],['性癖','性癖'],['身体性特征','身体'],['备注','备注']];

async function run(){
  const idmap = JSON.parse(await readFile(join(SCRATCH,'missing-idmap.json'),'utf8'));
  const want = new Set(Object.keys(idmap));
  // 卡数据(name->card)
  const card = {};
  for(const b of books) for(const c of JSON.parse(await readFile(join(gen,'character-canon',`${b}.character-cards-v2.json`),'utf8')).characters) card[c.name]=c;
  let placed=0; const noStage=[];
  for(const b of books){
    const sd=join(gen,b,'stages');
    if(!existsSync(join(gen,b,'stages-pre-place-backup'))) await cp(sd, join(gen,b,'stages-pre-place-backup'),{recursive:true});
    // stage-plan 区间
    const sp=JSON.parse(await readFile(join(gen,b,'stage-plan.json'),'utf8'));
    const stages=(Array.isArray(sp)?sp:sp.stages||[]).map(s=>({id:s.id,a:s.sourceStartIndex??0,z:s.sourceEndIndex??1e9})).sort((x,y)=>x.a-y.a);
    // firstSeen per name in this book
    const first={};
    const ex=join(gen,b,'extraction');
    for(const f of (await readdir(ex)).filter(n=>/batch-\d+\.json/.test(n))){const d=JSON.parse(await readFile(join(ex,f),'utf8'));for(const c of d.characterStates||[]){if(!want.has(c.name))continue;const v=c.firstSeenSourceIndex;if(Number.isFinite(v))first[c.name]=Math.min(first[c.name]??1e9,v);}}
    // existing rosters per stage file
    const fileById={};for(const s of stages)fileById[s.id]=`${s.id}.json`;
    for(const [name,fs0] of Object.entries(first)){
      // 目标关:区间含 firstSeen;否则 start<=fs 的最后一个;否则第一个
      let tgt=stages.find(s=>fs0>=s.a&&fs0<=s.z) || [...stages].reverse().find(s=>s.a<=fs0) || stages[0];
      if(!tgt){noStage.push(b+'/'+name);continue;}
      const fp=join(sd,`${tgt.id}.json`);const m=JSON.parse(await readFile(fp,'utf8'));
      const id=idmap[name];
      if((m.canon.characters||[]).some(c=>c.id===id||c.name===name))continue; // 已在
      const cd=card[name]||{};
      const notes=[];for(const[fld,tag]of TAGMAP){const v=cd[fld];const s=Array.isArray(v)?v.join('；'):(v||'');if(s)notes.push(`【${tag}】${s}`);}
      const ch={id,name,role:(cd.身份||'配角').split(/[，,；;]/)[0].slice(0,20),gender:cd.gender||'未知',
        profile:{personality:cd.性格||[],appearance:cd.外貌||'',race:raceClean(cd.种族)||'人族',origin:cd.身份||'',notes}};
      m.canon.characters=m.canon.characters||[];m.canon.characters.push(ch);
      await writeFile(fp,JSON.stringify(m,null,2)+'\n');placed++;
    }
  }
  console.log(`配角入关:${placed} 处${noStage.length?(' | 无法定位关卡:'+noStage.join(',')):''}`);
}
run().catch(e=>{console.error(e);process.exit(1);});
