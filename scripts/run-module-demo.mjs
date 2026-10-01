// Real-model isolated demo. No production API settings/save writes and no orchestration skill.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadTs} from '../tests/loadTs.mjs';
import {DemoLedger,runDemo,parseJson,visibleContent} from './module-demo-core.mjs';

const root=process.cwd(),out=path.resolve(root,process.env.MODULE_DEMO_OUTPUT||'.xiantu-server/module-probe-20261001');
await mkdir(out,{recursive:true,mode:0o700});
const configPath=path.join(root,'.xiantu-server/save-storage/user_config_api_management_v1.json');
const configBytes=await readFile(configPath),config=JSON.parse(configBytes).data;
const hash=b=>createHash('sha256').update(b).digest('hex');
const configurationHash=hash(configBytes);
function assigned(type) {
 const id=config.apiAssignments.find(a=>a.type===type)?.apiId||'default';
 const c=config.apiConfigs.find(c=>c.id===id);
 assert.ok(c?.enabled&&c.apiKey,`Missing runnable assigned ${type} model`);
 return c;
}
const routes={narrative:assigned('main'),memory:assigned('memory_summary'),optimization:assigned('text_optimization')};
const inputDir=path.resolve(root,'.xiantu-server/module-probe-20261001');
const fixture=JSON.parse(await readFile(path.join(inputDir,'fixture.private.json'),'utf8'));
const baseline=JSON.parse(await readFile(path.join(inputDir,'baseline.private.json'),'utf8'));
const {getCurrentStoryEventActions,recordStoryEventStructuredAction}=await loadTs('../src/modules/scenarioMods/runtime.ts');
const {buildScenarioStoryPrompt}=await loadTs('../src/modules/scenarioMods/storyContext.ts');
const results={startedAt:new Date().toISOString(),configurationHash,routes:Object.fromEntries(Object.entries(routes).map(([role,c])=>[role,{model:c.model,provider:c.provider,usage:role==='narrative'?'main':role==='memory'?'memory_summary':'text_optimization',enabledInGame:role==='optimization'?config.functionEnabled.find(e=>e.type==='text_optimization')?.enabled!==false:true}])),runs:[],calls:[]};
async function save(){await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2),{mode:0o600});}
async function call(role,messages,label,maxTokens=8192) {
 const c=routes[role],start=performance.now(),at=new Date().toISOString();
 const body={model:c.model,messages,max_tokens:maxTokens,temperature:0.4,stream:true};
 if (new URL(c.url).hostname==='openrouter.ai') {body.stream_options={include_usage:true};body.reasoning={effort:'low'};}
 const meta={label,role,model:c.model,startedAt:at,inputChars:JSON.stringify(messages).length,inputHash:hash(JSON.stringify(messages)),maxTokens};
 let content='',finish,usage,ttfbMs,firstVisibleMs;
 try {
  const endpoint=c.url.replace(/\/+$/,'').replace(/\/chat\/completions$/,'').replace(/\/v1$/,'')+'/v1/chat/completions';
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.apiKey},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  ttfbMs=performance.now()-start;if(!res.ok)throw Object.assign(new Error('http'),{httpStatus:res.status});
  const decoder=new TextDecoder();let buffer='';
  const consume=line=>{
   if(!line.startsWith('data:'))return;
   const s=line.slice(5).trim();if(!s||s==='[DONE]')return;
   let o;try{o=JSON.parse(s);}catch{return;}
   if(o.error)throw new Error('provider_stream_error');
   const choice=o.choices?.[0],delta=choice?.delta||choice?.message;
   if(typeof delta?.content==='string'&&delta.content){content+=delta.content;firstVisibleMs??=performance.now()-start;}
   if(choice?.finish_reason)finish=choice.finish_reason;
   if(o.usage)usage=o.usage;
  };
  if ((res.headers.get('content-type')||'').includes('json')) {
   const o=await res.json();content=o.choices?.[0]?.message?.content||'';finish=o.choices?.[0]?.finish_reason;usage=o.usage;firstVisibleMs=performance.now()-start;
  } else {
   for await(const chunk of res.body){buffer+=decoder.decode(chunk,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();lines.forEach(consume);}
   if(buffer)consume(buffer);
  }
  const cleaned=visibleContent(content);meta.thinkingTagRemoved=cleaned!==content.trim();content=cleaned;
  Object.assign(meta,{elapsedMs:performance.now()-start,ttfbMs,firstContentMs:firstVisibleMs,finish,visibleChars:content.length,usage,status:finish==='length'?'truncated':'returned'});
  // Cache only visible output; hidden reasoning is not collected.
  await writeFile(path.join(out,label+'.json'),JSON.stringify({meta,content},null,2),{mode:0o600});
  if(finish==='length'||!content.trim())throw new Error(finish==='length'?'output_truncated':'empty_output');
  let value;
  try {value=parseJson(content);meta.jsonValid=true;}
  catch(e) {
   if(role==='narrative'&&label.endsWith('-narrative')&&!content.includes('{')) {value={text:content,mid_term_memory:'',tavern_commands:[],action_options:[]};meta.adaptedPlainText=true;}
   else throw e;
  }
  return value;
 } catch(e) {Object.assign(meta,{elapsedMs:performance.now()-start,ttfbMs,status:'failed',error:e.httpStatus?'HTTP_'+e.httpStatus:e.name==='TimeoutError'?'timeout':e.message==='output_truncated'?'truncated':e instanceof SyntaxError?'invalid_json':'module_error'});throw new Error(meta.error);}
 finally {
  try {content=visibleContent(content);}catch {content='';}
  await writeFile(path.join(out,label+'.json'),JSON.stringify({meta,content},null,2),{mode:0o600});
  results.calls.push(meta);await save();console.log(JSON.stringify({label,status:meta.status,seconds:+(meta.elapsedMs/1000).toFixed(2),chars:meta.inputChars,model:meta.model}));
 }
}

function narrativeValidation(n) {
 assert.ok(typeof n.text==='string'&&n.text.length>=80&&n.text.length<=2500,'narrative length');
 assert.deepEqual(n.tavern_commands||[],[],'narrator cannot write state');
 assert.ok(!/获得.{0,8}(?:手机|铁匣|武器)|签下.{0,6}(?:卖身|身契)|已经逃出/.test(n.text),'invented irreversible result');
}
function memoryValidation(m,n) {
 assert.ok(Array.isArray(m.facts)&&m.facts.length<=4,'summary schema');
 for(const f of m.facts){assert.ok(typeof f.summary==='string'&&f.summary.length<=200);assert.ok(typeof f.evidence==='string'&&f.evidence.length>=2&&n.text.includes(f.evidence),'memory needs verbatim narrative evidence');}
 return m;
}
function qualityValidation(q,n) {
 assert.ok(Array.isArray(q.issues)&&q.issues.length<=4,'quality schema');
 for(const i of q.issues){assert.ok(typeof i.evidence==='string'&&n.text.includes(i.evidence),'quality issue needs evidence');assert.ok(typeof i.suggestion==='string'&&i.suggestion.length<=200);}
 return q;
}

const shape='只输出JSON，字段text、mid_term_memory、tavern_commands、action_options。正文250至400汉字，只写当前一步。';
const selected=getCurrentStoryEventActions(fixture.save).find(a=>a.actionId==='offer_nylon_clue_for_term');
assert.ok(selected,'checkpoint lacks current offer action');
const preview=structuredClone(fixture.save),receipt=recordStoryEventStructuredAction(preview,selected);
assert.ok(receipt.attempted&&receipt.outcome==='success');assert.equal(receipt.completed,false);
const rt=preview.世界.状态.剧本模组;
const packet={playerInput:selected.playerLine,location:fixture.save.角色.位置.描述,currentStep:selected.actionText,receipt,
 facts:['玩家提出以霓龙丝产地线索换取期限，当前第一步已结算。','三个月之约最终确认仍是下一步，本轮不能演到最终确认。','拒赌扣押仍有效；没有赌输或签卖身契；没有离开商馆。'],
 characters:[{name:'苏妲己',role:'白湖商馆主人',attitude:'掌控局面、精明多疑、措辞有压迫感'},{name:'程宗扬',role:'玩家；提出交易以求活命'}],
 presentation:'第二人称，续写当前谈判，不重演初见；人物只回应当前交易。'};
const compact=[{role:'system',content:'你只负责叙事演出。以下事实由本地引擎确认，不能改写。禁止替玩家行动或补造承诺。'+shape+'tavern_commands必须为空数组；记忆由独立模块处理，mid_term_memory为空字符串。'}, {role:'user',content:JSON.stringify(packet)}];
await writeFile(path.join(out,'scene-packet.json'),JSON.stringify(packet,null,2),{mode:0o600});
results.packet={baselineChars:JSON.stringify(baseline.messages).length,modularChars:JSON.stringify(compact).length,source:'copied R5 pact checkpoint; production prompt captured without sending to provider',scope:'one neutral pact offer; reset clone per run',postStateHash:hash(JSON.stringify(preview)),noSignedBond:preview.世界.状态.剧本模组.baihuGambleRefusal?.signedBond===false,stepOneCompleted:receipt.attempted,finalPactCompleted:receipt.completed};
const rounds=Number(process.argv[2]||2);
for(let round=1;round<=rounds;round++) {
 const modes=round%2===1?['legacy','serial','async']:['async','serial','legacy'];
 for(const mode of modes) {
  const label=`r${round}-${mode}`,started=performance.now();
  try {
   if(mode==='legacy') {
    const messages=structuredClone(baseline.messages);messages.push({role:'user',content:shape});
    const n=await call('narrative',messages,label);assert.ok(typeof n.text==='string'&&n.text.length>=80);
    results.runs.push({round,mode,status:'ok',readyMs:performance.now()-started,visibleChars:n.text.length,commandCount:n.tavern_commands?.length||0});
   } else {
    const scope={characterId:'isolated-pact',slotId:'checkpoint',revision:round,turnId:label};
    const ledger=new DemoLedger(scope);
    const response=await runDemo({scope,ledger,mode,
     render:()=>call('narrative',compact,label+'-narrative'),validate:narrativeValidation,
     summarize:async n=>memoryValidation(await call('memory',[{role:'system',content:'你只整理已接受正文的记忆。只输出JSON {"facts":[{"summary":"一条简短事实","evidence":"正文原文短句"}]}，最多3条，不推测未来、不确认关系、不修改状态。'},{role:'user',content:n.text}],label+'-memory',4096),n),
     optimize:async n=>qualityValidation(await call('optimization',[{role:'system',content:'你只审查正文连贯性，提供局部优化建议，不重写全文、不改事实、不写记忆。只输出JSON {"issues":[{"evidence":"正文原文短句","suggestion":"简短建议"}]}，最多3条，没问题返回空数组。'},{role:'user',content:JSON.stringify({packet,text:n.text})}],label+'-optimization',4096),n),
    });
    if(mode==='async') {console.log(JSON.stringify({label,event:'player_ready',seconds:+(response.readyMs/1000).toFixed(2)}));Object.assign(response,await response.background);delete response.background;}
    const record={round,mode,status:response.sidecars.every(s=>s.attachment.accepted)?'ok':'partial',readyMs:response.readyMs,criticalMs:response.criticalMs,completedMs:response.completedMs,sidecars:response.sidecars,visibleChars:response.narrative.text.length,committed:ledger.receipts.size===1};
    results.runs.push(record);
    await writeFile(path.join(out,label+'-merged.json'),JSON.stringify({scope,localReceipt:receipt,narrative:response.narrative,memory:ledger.sidecars.get(label+':memory'),optimizationProposal:ledger.sidecars.get(label+':optimization'),stateResult:'local clone only; no production writes'},null,2),{mode:0o600});
   }
  } catch(e) {results.runs.push({round,mode,status:'failed',elapsedMs:performance.now()-started,error:e.message});}
  await save();
 }
}
results.finishedAt=new Date().toISOString();results.configurationUnchanged=hash(await readFile(configPath))===configurationHash;
assert.ok(results.configurationUnchanged);
await save();console.log(JSON.stringify({done:true,runs:results.runs.map(r=>({round:r.round,mode:r.mode,status:r.status,readySeconds:r.readyMs?+(r.readyMs/1000).toFixed(2):null})),configurationUnchanged:results.configurationUnchanged}));
