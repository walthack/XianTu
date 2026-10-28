// 离线组装 05b 各拍模块演出提示词：截获 aiService.generate，不联网。
import { createJiti } from 'jiti';
import { createPinia, setActivePinia } from 'pinia';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const WT=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
globalThis.fetch=async()=>{throw new Error('network forbidden');};
if (!globalThis.localStorage) { const v=new Map(); globalThis.localStorage={getItem:k=>v.get(k)??null,setItem:(k,x)=>v.set(k,String(x)),removeItem:k=>v.delete(k),clear:()=>v.clear()}; }
if (typeof globalThis.window==='undefined') globalThis.window=globalThis;
if (!globalThis.window.location) globalThis.window.location={hostname:'localhost',href:'http://localhost/'};
const jiti=createJiti(WT+'/tests/x.mjs',{interopDefault:true,alias:{'@/stores/characterStore':WT+'/tests/stubs/characterStoreForAbortTest.ts','@':WT+'/src'}});
const load=p=>jiti.import(WT+'/'+p);
const { walkMainline } = await import(WT+'/tests/baihuMainlineWalk.mjs');
const rt=await load('src/modules/scenarioMods/runtime.ts');
const QUIET=['log','info','warn','debug'];
const quiet=()=>{const s={};for(const k of QUIET){s[k]=console[k];console[k]=()=>{};}return()=>Object.assign(console,s);};
const want=new Set(['lcq.event.hongmiao_controlled']);
const snaps={};
{const r=quiet();try{await walkMainline((save,event)=>{if(event&&want.has(event.id)){const k=event.id+'#'+(save.世界.状态.剧本模组.eventActionStates?.[event.id]?.preparations||[]).join('+');snaps[k]||=structuredClone(save);}});}catch(e){r();console.error('walk err',e.message);}finally{r();}}

async function capture(save,userMessage,eventAction){
  setActivePinia(createPinia());
  const { useAPIManagementStore } = await load('src/stores/apiManagementStore.ts');
  useAPIManagementStore().apiConfigs=[{id:'default',name:'fixture',provider:'custom',url:'https://example.invalid/v1',apiKey:'x',model:'fixture',enabled:true}];
  const { AIBidirectionalSystem } = await load('src/utils/AIBidirectionalSystem.ts');
  const { aiService } = await load('src/services/aiService.ts');
  const calls=[]; const o={g:aiService.generate,r:aiService.generateRaw};
  aiService.generate=async opt=>{calls.push(opt);const e=new Error('captured');e.name='AbortError';throw e;};
  aiService.generateRaw=async opt=>{calls.push(opt);throw new Error('captured raw');};
  const r=quiet();let err;
  try{await AIBidirectionalSystem.tryModularTurn(structuredClone(save),{...(eventAction?{eventAction,eventActionProvenance:'selected'}:{}),playerIntentText:userMessage},'dbg',()=>false,userMessage);}catch(e){err=e.message;}finally{r();Object.assign(aiService,{generate:o.g,generateRaw:o.r});}
  return {calls,err};
}
test('05b 见苏荔见丹宸每个步骤动作与自由输入的提示不含丹宸原台词',async()=>{
  let count=0;
  for(const [key,save] of Object.entries(snaps)) {
    const actions=[...rt.getCurrentStoryEventActions(save),null];
    for(const action of actions) {
      const {calls}=await capture(save,action?.actionText||action?.label||'我四下看看，问苏荔这里情况如何。',action);
      assert.ok(calls.length,key);
      for(const call of calls) {
        const system=call.injects.filter(i=>i.role==='system').map(i=>i.content).join('\n');
        assert.doesNotMatch(system,/好(?:……)?舒服|让(?:……)?哥插|妖淫唱词/);
        assert.match(system,/神情恍惚，言语含混/);
        count++;
      }
    }
  }
  assert.ok(count>=4);
});

test('丹宸谈吐概括与 registry 内容哈希一致，苏荔性格保留',()=>{
  const doc=JSON.parse(readFileSync(WT+'/src/modules/scenarioMods/builtins/character-registry.json','utf8'));
  assert.equal(doc.characters.find(c=>c.id==='liuchao.character.dan_chen').staticProfile.speechStyle,'神情恍惚，言语含混，谦卑称‘仁慈而神圣的鬼巫王’');
  const stage=JSON.parse(readFileSync(WT+'/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json','utf8'));
  assert.deepEqual(stage.canon.characters.find(c=>c.id==='liuchao.character.su_li').profile.personality,['美艳','顺从','富有情欲']);
  assert.equal(doc.sourceHash,createHash('sha256').update(JSON.stringify(doc.characters)).digest('hex').slice(0,16));
  assert.ok(doc.version.endsWith(doc.sourceHash));
});
