// Offline review artifact. Reads cached visible outputs; contains no credentials or full saves.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {parseJson} from './module-demo-core.mjs';
const root=process.cwd(),dir=path.join(root,'.xiantu-server/module-demo-adapted-20261001');
const output=path.join(root,'docs/artifacts/module-demo-20261001');await mkdir(output,{recursive:true});
const d=JSON.parse(await readFile(path.join(dir,'results.json'),'utf8'));
const rows=[];
for(const r of d.runs){
 const label=`r${r.round}-${r.mode}`,file=path.join(dir,label+(r.mode==='legacy'?'':'-narrative')+'.json');
 let text='';try {const v=JSON.parse(await readFile(file,'utf8'));try{text=parseJson(v.content).text;}catch{text=v.content;}}catch{}
 rows.push({...r,text,calls:d.calls.filter(c=>c.label===label||c.label.startsWith(label+'-'))});
}
const payload={routes:d.routes,packet:d.packet,runs:rows,configurationUnchanged:d.configurationUnchanged,
 limitations:['同一白湖第1步隔离样本，两次重复；不是全线真机。','旧路径正文625/648字，新异步正文319/335字，输出量不等，不能把全部提速归因于架构。','旧值仅主模型请求，不含原游戏后处理和UI耗时。串行控制是同一新模块实现的阻塞版本，不代表旧游戏实际调度。','优化正式开关关闭；仅此Demo调用，输出仅为提案。','严格验证拒绝不合格记忆；后台失败／迟到不覆盖主状态。']};
await writeFile(path.join(output,'results.json'),JSON.stringify(payload,null,2));
const encoded=JSON.stringify(payload).replace(/</g,'\\u003c');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>六朝 · 模块解耦最小 Demo</title>
<style>body{background:#10151d;color:#e5edf6;font:16px/1.65 system-ui;margin:0}main{max-width:1000px;margin:auto;padding:35px 24px}h1{font-size:28px}small,.muted{color:#a6b4c7}section{background:#1b2431;border:1px solid #344257;border-radius:12px;padding:20px;margin:20px 0}select{padding:9px;background:#273447;color:white;border:1px solid #66758b;border-radius:6px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #344257}.track{background:#10151d;position:relative;height:34px;margin:12px 0;overflow:hidden;border-radius:5px}.bar{position:absolute;height:34px;display:flex;align-items:center;background:#476fa7;font-size:13px;padding-left:8px;box-sizing:border-box;min-width:100px}.memory{background:#407c69}.optimization{background:#8160a2}pre{white-space:pre-wrap;word-break:break-word;font:15px/1.85 system-ui}.tag{color:#a4d4ff}.warning{color:#ffcb8e}</style>
<main><small>隔离真实API验证 · 2026-10-01 · 尚未接入正式游戏</small><h1>正文先返回，记忆与优化异步汇总</h1><p>本地合同预演 → Jev叙事 → 验证提交 → MiniMax记忆与DeepSeek优化并行。模型不直接写存档。</p><section><h2>前后对照</h2><table><thead><tr><th>模式</th><th>第1次可返回</th><th>第2次可返回</th></tr></thead><tbody id="comparison"></tbody></table><p class="warning">主流程可返回不代表后台任务全部成功；完整状态在下方逐轮显示。</p></section>
<section><label>查看一轮 <select id="choose"></select></label><p id="metrics"></p><div id="timeline"></div><p id="modules"></p></section>
<section><h2>已接受正文</h2><pre id="narrative"></pre><h2>后台结果与验证</h2><pre id="sidecars"></pre></section><section><h2>模型路由与边界</h2><pre id="routes"></pre><ul id="limitations"></ul><p>输入：旧主请求约87.6K字符；Demo主请求815字符。完整存档未交给后台模块。上下文材料为人工校准的单场景包，尚非通用生产编译器。</p></section></main>
<script>const data=${encoded};const sec=x=>x==null?'—':(x/1000).toFixed(2)+'秒';const names={legacy:'现有完整主请求',serial:'新模块串行阻塞',async:'新模块后台异步'};const select=document.querySelector('#choose');
for(const mode of ['legacy','serial','async']){const row=document.createElement('tr');for(const value of [names[mode],...data.runs.filter(r=>r.mode===mode).map(r=>sec(r.readyMs)+' · '+r.status)]){const c=document.createElement('td');c.textContent=value;row.append(c);}document.querySelector('#comparison').append(row);}
data.runs.forEach((r,i)=>{const option=document.createElement('option');option.value=i;option.textContent='第'+r.round+'次 · '+names[r.mode];select.append(option);});
document.querySelector('#routes').textContent=JSON.stringify(data.routes,null,2);data.limitations.forEach(t=>{const li=document.createElement('li');li.textContent=t;document.querySelector('#limitations').append(li);});
function show(){const r=data.runs[Number(select.value)];document.querySelector('#metrics').textContent='主流程返回：'+sec(r.readyMs)+'；全部模块结束：'+sec(r.completedMs)+'；状态：'+r.status;document.querySelector('#narrative').textContent=r.text;document.querySelector('#sidecars').textContent=JSON.stringify(r.sidecars||[],null,2);document.querySelector('#modules').textContent=r.calls.map(c=>c.role+' → '+c.model+'：'+sec(c.elapsedMs)+' / '+c.status).join('；');const timeline=document.querySelector('#timeline');timeline.replaceChildren();const base=Math.min(...r.calls.map(c=>Date.parse(c.startedAt)));const end=Math.max(...r.calls.map(c=>Date.parse(c.startedAt)-base+c.elapsedMs));r.calls.forEach(c=>{const track=document.createElement('div');track.className='track';const bar=document.createElement('div');bar.className='bar '+c.role;bar.style.left=((Date.parse(c.startedAt)-base)/end*100)+'%';bar.style.width=(c.elapsedMs/end*100)+'%';bar.textContent=c.role+' '+sec(c.elapsedMs);track.append(bar);timeline.append(track);});}select.value=data.runs.findIndex(r=>r.mode==='async');select.onchange=show;show();</script></html>`;
await writeFile(path.join(output,'index.html'),html);
console.log(output);
