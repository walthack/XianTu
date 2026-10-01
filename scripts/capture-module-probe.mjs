// Capture an actual prompt in a disposable COPY of the playtest profile. All model/storage writes intercepted.
import { chromium } from 'playwright-core';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const out = path.resolve(root, '.xiantu-server/module-probe-20261001');
const profile = path.join(out, 'profile-copy');
await mkdir(out, {recursive:true, mode:0o700});
await cp(path.resolve(root, '../playtest-2026-09-28/profile'), profile, {
  recursive:true, filter:src=>!/(SingletonLock|SingletonCookie|SingletonSocket)$/.test(src),
});
const ctx = await chromium.launchPersistentContext(profile, {headless:true, channel:'chrome'});
let captured;
let writesBlocked=0;
await ctx.route('**/*', async route=>{
  const r=route.request(), u=new URL(r.url());
  if (/\/save-storage(?:\/|$)/.test(u.pathname)) {
    if (!['GET','HEAD'].includes(r.method())) writesBlocked++;
    return route.fulfill({status:501,contentType:'application/json',body:'{}'});
  }
  if (r.method()==='POST' && /chat\/completions/.test(u.pathname)) {
    const b=r.postDataJSON();
    if (Number(b.max_tokens)>1024 && !captured) captured={messages:b.messages, stream:b.stream,max_tokens:b.max_tokens,reasoning:b.reasoning};
    const content=Number(b.max_tokens)<=1024 ? JSON.stringify({actionId:'none',certainty:'high',evidence:''})
      : JSON.stringify({text:'你等候苏妲己回应当前提议。',mid_term_memory:'测试捕获；不用于实际游戏。',tavern_commands:[],action_options:[]});
    const body=b.stream ? `data: ${JSON.stringify({choices:[{delta:{content},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`
      : JSON.stringify({choices:[{message:{content},finish_reason:'stop'}]});
    return route.fulfill({status:200,contentType:b.stream?'text/event-stream':'application/json',body});
  }
  if (!['GET','HEAD'].includes(r.method())) return route.abort();
  return route.continue();
});
try {
  const p=ctx.pages()[0]||await ctx.newPage();
  await p.goto('http://127.0.0.1:8091',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.has('characterV3'));
  const fixture=await p.evaluate(async ()=>{
    const app=document.querySelector('#app').__vue_app__, pinia=app.config.globalProperties.$pinia;
    const c=pinia._s.get('characterV3');
    await c.initializeStore();
    const entry=Object.entries(c.rootState.角色列表).find(([id,profile])=>profile.隔离试玩信息?.localOnly===true && profile.存档列表?.['R5-谈期限前']);
    if (!entry) throw new Error('Missing isolated R5 pact checkpoint in profile copy');
    if (!await c.loadGame(entry[0],'R5-谈期限前')) throw new Error('Cannot load copied checkpoint');
    await app.config.globalProperties.$router.push('/game');
    const save=pinia._s.get('gameState').toSaveData();
    return {save,slot:'R5-谈期限前'};
  });
  const input=p.locator('textarea.game-input');await input.waitFor();
  await input.fill('我用霓龙丝产地线索换三个月期限。');
  await p.locator('.send-button').click();
  const until=Date.now()+25000;
  while (!captured && Date.now()<until) await new Promise(r=>setTimeout(r,100));
  assert.ok(captured,'Did not capture production narrative request');
  await writeFile(path.join(out,'fixture.private.json'),JSON.stringify(fixture,null,2),{mode:0o600});
  await writeFile(path.join(out,'baseline.private.json'),JSON.stringify(captured,null,2),{mode:0o600});
  console.log(JSON.stringify({captured:true,chars:JSON.stringify(captured.messages).length,stage:fixture.save.世界.状态.剧本模组.modId,writesBlocked}));
} finally {await ctx.close();}
