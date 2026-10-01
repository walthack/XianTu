// One real-model integration smoke in an ephemeral browser using existing API assignments.
// Does not read/write original browser profile or permit server storage operations.
import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const configPath='.xiantu-server/save-storage/user_config_api_management_v1.json';
const before=await readFile(configPath);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const config=JSON.parse(before).data;
const enableQuality=process.argv.includes('--quality');
if(enableQuality) { config.functionEnabled ||= []; const flag=config.functionEnabled.find(item=>item.type==='text_optimization'); if(flag)flag.enabled=true;else config.functionEnabled.push({type:'text_optimization',enabled:true}); }
const fixture=JSON.parse(await readFile('.xiantu-server/module-probe-20261001/fixture.private.json','utf8')).save;
const url=process.argv.slice(2).find(arg=>!arg.startsWith('--'))||'http://127.0.0.1:8091';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const ctx=await browser.newContext();
const requests=[], errors=[], responseBodies=[], responseTasks=[];
let writesBlocked=0;
await ctx.addInitScript(({config})=>{
 localStorage.setItem('xiantu.modularTurnPlaytest.v1','true');
 localStorage.setItem('api_management_config',JSON.stringify(config));
 localStorage.setItem('ai_service_config',JSON.stringify({mode:'custom',streaming:false,maxRetries:0}));
},{config});
await ctx.route('**/*',async route=>{
 const r=route.request(),u=new URL(r.url());
 if (/\/save-storage(?:\/|$)/.test(u.pathname)) {
  if (!['GET','HEAD'].includes(r.method())) writesBlocked++;
  return route.fulfill({status:501,contentType:'application/json',body:'{}'});
 }
 if (r.method()==='POST' && /chat\/completions/.test(u.pathname)) {
  const b=r.postDataJSON();requests.push({model:b.model,chars:JSON.stringify(b.messages).length,startedAt:Date.now()});
  return route.continue();
 }
 if (!['GET','HEAD'].includes(r.method())) return route.abort();
 return route.continue();
});
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(/chat\/completions/.test(new URL(r.url()).pathname)) responseTasks.push(r.json().then(b=>responseBodies.push({model:r.request().postDataJSON().model,content:b.choices?.[0]?.message?.content})).catch(()=>{}));});
try {
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.getByText('星月湖任务线试玩',{exact:true}).first().click();
 await page.locator('[data-testid="start-xingyuehu-landing-playtest"]').click();
 await page.locator('textarea.game-input').waitFor({timeout:25000});
 await page.evaluate(save=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').loadFromSaveData(save),fixture);
 await page.locator('textarea.game-input').fill('我用霓龙丝产地线索换三个月期限。');
 const started=Date.now();await page.locator('.send-button').click();
 await page.waitForFunction(()=>!!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').systemExtensions?.回合模块试玩?.receipts?.at(-1),{},{timeout:85000});
 await page.waitForFunction(()=>!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').isAIProcessing);
 const readyMs=Date.now()-started;
 await page.waitForFunction(()=>{
  const r=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').systemExtensions?.回合模块试玩?.receipts?.at(-1);
  return r?.memory?.status!=='pending' && r?.quality?.status!=='pending';
 },{},{timeout:100000});
 const receipt=await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('gameState').systemExtensions?.回合模块试玩?.receipts?.at(-1));
 assert.equal(receipt.path,'modular');assert.ok(receipt.text);assert.deepEqual(errors,[]);
 assert.equal(hash(await readFile(configPath)),hash(before));
 await Promise.allSettled(responseTasks);
 await writeFile('.xiantu-server/module-integration/real-responses.private.json',JSON.stringify(responseBodies,null,2),{mode:0o600});
 const result={url,enableQualityInDisposableContext:enableQuality,readyMs,completedMs:Date.now()-started,receipt,requests,writesBlocked,configurationUnchanged:true,errors};
 await mkdir('.xiantu-server/module-integration',{recursive:true});
 await writeFile('.xiantu-server/module-integration/real.json',JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({...result,receipt:{...receipt,textChars:receipt.text.length,text:undefined}}));
} finally {await ctx.close();await browser.close();}
