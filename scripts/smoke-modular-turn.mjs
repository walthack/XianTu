// SUPERSEDED 2026-10-01: quality 已并入后台审计、失败策略改为重试后回落；新验收见 scripts/smoke-module-framework.mjs。
// Controlled integration acceptance. Disposable browser; all model/storage traffic intercepted.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const urls = process.argv.slice(2);
const fixture = JSON.parse(await readFile('.xiantu-server/module-probe-20261001/fixture.private.json', 'utf8')).save;
const prose = '你把霓龙丝产地线索作为交换，向苏妲己提出三个月期限。苏妲己抬眼望着你，指尖在桌沿轻轻一停。商馆里灯火安静，她仍等你把条件说明白，没有立即接受你的提议。你站在桌前，凝羽留在近旁，眼下只是在谈期限，没有新的物品交付。';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
 for (const url of urls) {
  const ctx = await browser.newContext();
  const requests = [], errors = [];
  const gates = [];
  let summaryMode = 'valid', mainContent = prose;
  await ctx.addInitScript(() => {
   localStorage.setItem('xiantu.modularTurnPlaytest.v1', 'true');
   localStorage.setItem('api_management_config', JSON.stringify({
    apiConfigs: ['main','memory','quality'].map((id,i) => ({id:i===0?'default':id,name:id,provider:'openai',url:'https://fixture.invalid/v1',apiKey:'fixture',model:id,enabled:true})),
    apiAssignments: [{type:'main',apiId:'default'},{type:'memory_summary',apiId:'memory'},{type:'text_optimization',apiId:'quality'}],
    functionEnabled: [{type:'text_optimization',enabled:true}],
   }));
   localStorage.setItem('ai_service_config',JSON.stringify({mode:'custom',streaming:false,maxRetries:0,customAPI:{provider:'openai',url:'https://fixture.invalid/v1',apiKey:'fixture',model:'main'}}));
  });
  await ctx.route('**/*', async route => {
   const r=route.request(),u=new URL(r.url());
   if (/\/save-storage(?:\/|$)/.test(u.pathname)) return route.fulfill({status:501,contentType:'application/json',body:'{}'});
   if (r.method()==='POST' && /chat\/completions/.test(u.pathname)) {
    const body=r.postDataJSON();requests.push({model:body.model,chars:JSON.stringify(body.messages).length,stream:body.stream});
    let content=mainContent, status=200;
    if (!['main','alternate-narrator'].includes(body.model)) {
     const mode=summaryMode;
     await new Promise(resolve=>gates.push(resolve));
     content=body.model === 'memory' ? JSON.stringify({evidence:[mode==='valid'?'她仍等你把条件说明白':'她答应婚约且送出宝剑']}) : '{"findings":[]}';
     if(mode==='fail' && body.model==='memory') status=500;
    }
    try {return await route.fulfill({status,contentType:'application/json',body:JSON.stringify({choices:[{message:{content},finish_reason:'stop'}],usage:{completion_tokens:120,total_tokens:1000}})});} catch {return;}
   }
   if (!['GET','HEAD'].includes(r.method())) return route.abort();
   return route.continue();
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  const state=async()=>page.evaluate(()=>{
   const p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
   const s=p._s.get('gameState').toSaveData();
   return {busy:p._s.get('ui').isAIProcessing,receipt:s.系统.扩展.回合模块试玩?.receipts?.at(-1),history:s.系统.历史.叙事,rt:s.世界.状态.剧本模组};
  });
  try {
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.getByText('星月湖任务线试玩',{exact:true}).first().click();
   await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
   await page.locator('textarea.game-input').waitFor({timeout:25000});
   const restore=async()=>page.evaluate(save=>{
    const p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    p._s.get('gameState').loadFromSaveData(save);
   },fixture);
   const send=async()=>{
    const before=requests.length;
    await page.locator('textarea.game-input').fill('我用霓龙丝产地线索换三个月期限。');
    await page.locator('.send-button').click();
    await page.waitForFunction(()=>{
     const p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
     return !!p._s.get('gameState').systemExtensions?.回合模块试玩?.receipts?.at(-1);
    },{},{timeout:25000});
    await page.waitForFunction(()=>!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing);
    assert.ok(requests.length>before);
   };
   const waitGates=async(count)=>{const deadline=Date.now()+25000;while(gates.length<count){if(Date.now()>deadline)throw Error(`Expected ${count} auxiliary calls; got ${gates.length}`);await new Promise(resolve=>setTimeout(resolve,30));}};
   await restore();await send();
   await page.waitForFunction(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').systemExtensions?.回合模块试玩?.receipts?.at(-1)?.path==='modular');
   await waitGates(2);
   const waiting=await state();
   assert.equal(waiting.busy,false);assert.equal(waiting.receipt.memory.status,'pending');
   assert.ok(requests.filter(r=>r.model==='main').every(r=>r.chars<12000),'compact route only');
   assert.equal(await page.locator('textarea.game-input').isEnabled(),true);
   gates.splice(0).forEach(resolve=>resolve());
   await page.waitForFunction(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').systemExtensions?.回合模块试玩?.receipts?.at(-1)?.memory?.status==='accepted');
   assert.equal((await state()).receipt.memory.value,'她仍等你把条件说明白');
   const count=(await state()).history.length;
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.has('characterV3'));
   await page.evaluate(async()=>{ const a=document.querySelector('#app').__vue_app__; const c=a.config.globalProperties.$pinia._s.get('characterV3'); await c.initializeStore(); const id=Object.keys(c.rootState.角色列表).find(id=>c.rootState.角色列表[id].隔离试玩信息?.kind==='xingyuehu-landing-through-v1'); if(!id)throw Error('missing isolated profile after reload'); await c.loadGame(id,'星月湖从落地开始');await a.config.globalProperties.$router.push('/game'); });
   await page.locator('textarea.game-input').waitFor();
   assert.equal((await state()).history.length,count,'reload does not settle twice');
   assert.equal((await state()).receipt.memory.status,'accepted','sidecar persisted');
   // Swap the model assignment, keep the same module contract and settlement path.
   await page.evaluate(()=>{const api=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('apiManagement');api.apiConfigs.push({id:'alternate',name:'alternate',provider:'openai',url:'https://fixture.invalid/v1',apiKey:'fixture',model:'alternate-narrator',maxTokens:8192,temperature:.4,enabled:true});api.assignAPI('main','alternate');});
   await restore();await send();await waitGates(2);
   assert.equal((await state()).receipt.route.model,'alternate-narrator');
   assert.equal((await state()).receipt.text,prose);
   gates.splice(0).forEach(resolve=>resolve());
   await page.waitForFunction(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').systemExtensions?.回合模块试玩?.receipts?.at(-1)?.memory?.status==='accepted');
   await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('apiManagement').assignAPI('main','default'));
   // A late auxiliary request cannot rewrite a loaded checkpoint; rejection remains local.
   summaryMode='invalid';await restore();await send();
   await waitGates(2);
   gates.splice(0).forEach(resolve=>resolve());
   await page.waitForFunction(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').systemExtensions?.回合模块试玩?.receipts?.at(-1)?.memory?.status==='rejected');
   assert.equal((await state()).receipt.text,prose);
   // Invalid main output must not commit or launch auxiliaries, and input stays available.
   await restore();mainContent='苏妲己答应给你三个月，从今日算起。你可以离开了。';
   const callsBefore=requests.length;
   await page.locator('textarea.game-input').fill('我用霓龙丝产地线索换三个月期限。');
   await page.locator('.send-button').click();
   await page.waitForFunction(()=>!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing);
   assert.equal((await state()).receipt,undefined);
   assert.equal(await page.locator('textarea.game-input').inputValue(),'我用霓龙丝产地线索换三个月期限。');
   assert.equal(requests.length-callsBefore,1,'rejected main must not launch side jobs');
   mainContent=prose;
   // A disabled quality function must produce no quality request.
   await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('apiManagement').setFunctionEnabled('text_optimization',false));
   summaryMode='fail';await restore();await send();await waitGates(1);
   assert.equal((await state()).receipt.quality.status,'disabled');
   gates.splice(0).forEach(resolve=>resolve());
   await page.waitForFunction(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').systemExtensions?.回合模块试玩?.receipts?.at(-1)?.memory?.status==='failed');
   assert.equal(await page.locator('textarea.game-input').isEnabled(),true);
   assert.equal((await state()).receipt.text,prose);
   summaryMode='valid';await restore();await send();await waitGates(1);
   await page.evaluate(async()=>{
    const a=document.querySelector('#app').__vue_app__;await a.config.globalProperties.$router.push('/');
   });
   await restore();gates.splice(0).forEach(resolve=>resolve());
   await new Promise(resolve=>setTimeout(resolve,250));
   assert.equal((await state()).receipt,undefined,'late sidecar cannot contaminate loaded save');
   assert.deepEqual(errors,[]);
   results.push({url,passed:true,requests,foregroundIndependent:true,reload:true,rejectedEvidence:true,lateIsolated:true,invalidMainUncommitted:true,disabledRouteRespected:true,backgroundFailureIsolated:true,modelSwapSameContract:true});
  } finally {gates.splice(0).forEach(resolve=>resolve());await ctx.close();}
 }
} finally {await browser.close();}
await mkdir('.xiantu-server/module-integration',{recursive:true});
await writeFile('.xiantu-server/module-integration/controlled.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
