// Isolated orchestration prototype: immutable inputs, critical path and revision-bound side jobs.
import { performance } from 'node:perf_hooks';

export function visibleContent(text) {
  const t=String(text).replace(/<(think|minimax:think)>[\s\S]*?<\/\1>/gi,'').trim();
  if (/<(?:think|minimax:think)>/i.test(t)) throw new Error('incomplete_thinking_block');
  return t;
}
export function parseJson(text) {
  const t=visibleContent(text).replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  return JSON.parse(t);
}

export class DemoLedger {
  constructor(scope) { this.scope={...scope}; this.receipts=new Map(); this.sidecars=new Map(); }
  isCurrent(e) {return ['characterId','slotId','revision','turnId'].every(k=>e[k]===this.scope[k]);}
  commit(e,value) {
    if (!this.isCurrent(e)) return {accepted:false,reason:'stale_scope'};
    if (this.receipts.has(e.turnId)) return {accepted:false,reason:'duplicate'};
    this.receipts.set(e.turnId,structuredClone(value));return {accepted:true};
  }
  attach(e,name,value) {
    if (!this.isCurrent(e)||!this.receipts.has(e.turnId)) return {accepted:false,reason:'stale_or_uncommitted'};
    const key=e.turnId+':'+name;
    if (this.sidecars.has(key)) return {accepted:false,reason:'duplicate'};
    this.sidecars.set(key,structuredClone(value));return {accepted:true};
  }
}

export async function runDemo({scope,ledger,render,summarize,optimize,validate,mode='async'}) {
  const start=performance.now();
  const narrative=await render();validate(narrative);
  const commit=ledger.commit(scope,narrative);
  if (!commit.accepted) throw new Error('Commit rejected: '+commit.reason);
  const criticalMs=performance.now()-start;
  const runSide=async (name,fn)=>{
    try {const value=await fn(narrative);return {name,value,attachment:ledger.attach(scope,name,value)};}
    catch(e) {return {name,error:e.name||'Error',attachment:{accepted:false,reason:'module_failure'}};}
  };
  if (mode==='serial') {
    const summary=await runSide('memory',summarize),quality=await runSide('optimization',optimize);
    return {narrative,criticalMs,readyMs:performance.now()-start,completedMs:performance.now()-start,sidecars:[summary,quality]};
  }
  const background=Promise.all([runSide('memory',summarize),runSide('optimization',optimize)])
    .then(sidecars=>({sidecars,completedMs:performance.now()-start}));
  return {narrative,criticalMs,readyMs:performance.now()-start,background};
}
