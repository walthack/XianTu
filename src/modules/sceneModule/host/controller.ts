import {statusNamePattern} from '../statuses';
import {acknowledgeStageEntryPresentation} from '@/modules/scenarioMods/runtime';
import { evalExpr } from '../conditions';
import type { SaveData } from '@/types/game';
import { advanceScenarioRuntime, getCurrentStoryEventActions, recordStoryEventStructuredAction, type ScenarioEventActionSelection } from '@/modules/scenarioMods/runtime';
import { interrogationMaterial, interrogationChapter, wantsInterrogation } from './information';
import { validateProposal } from '../plan';
import { restoreSceneInjuries } from './injuries';
import { fixedEndingNarrative, endingBridge, BATTLE_LOSS_ENDINGS } from '@/modules/scenarioMods/fixedEndingNarratives';
import { endingPresentation } from '@/modules/scenarioMods/endingPresentation';
import { advanceClock } from '@/modules/scenarioMods/travel/travelLedger';
import { applyPlayerChoice, beginScene, buildSceneBrief, closeScene, confirmAction, matchPlayerChoice, previewAction, renderResultLines, classifyByRules, resolveInputPolicy, route, appendInput, type Contract } from '../index';
import { sceneContractById, sceneContractForEvent } from '../contracts/registry';
import { activeScene, cloneSave, newActive, readExt, sceneModuleEnabled, writeExt, type ActiveScene } from './ext';
import { sceneContext, snapshotLevels } from './factors';
import { partyName, renderRefs, runtimeOf } from './refs';
import { parseRecognition, recognizeAction, type ModelRequest } from './recognize';
import { narrateBeat } from './narrate';
import { applyWriteBack, syncSceneStatuses } from './writeback';

export interface HostDeps {
  persist: (save: SaveData) => Promise<void>;
  askIntent?: (request: ModelRequest) => Promise<string>;
  askNarrative?: (request: ModelRequest) => Promise<string>;
  aborted?: () => boolean;
}
function alignContract(a: ActiveScene, c: Contract): boolean {
  if (a.state.contractVersion === c.meta.version) return false;
  if (!c.meta.compatibleStateVersions?.includes(a.state.contractVersion)) throw new Error('场面合同版本不兼容，请保留存档并报告');
  // The new tracks only append terminal labels. Keep every roll/status, invalidate the old preview.
  a.state.contractVersion = c.meta.version; a.pending = null; a.choice = null;
  a.notice = '本场合同已更新，请重新输入打法并确认预览。';
  return true;
}
function checkAbort(deps: HostDeps): void { if (deps.aborted?.()) throw new Error('scene_host_aborted'); }
function history(save: SaveData): any[] { return ((save as any).系统.历史 ||= {}).叙事 ||= []; }
function appendHistory(save: SaveData, text: string, playerText = '', image?: string | null): number {
  acknowledgeStageEntryPresentation(save,runtimeOf(save)?.modId);
  const rows = history(save); rows.push({ type: 'gm', role: 'assistant', content: text, time: '', userIntent: playerText, actionOptions: [], ...(image ? { image } : {}) }); return rows.length - 1;
}
export function sceneCandidate(save: SaveData, selected?: { eventId?: string; actionId?: string }): { contract: Contract; selection: ScenarioEventActionSelection } | undefined {
  if (!sceneModuleEnabled()) return undefined;
  const actions = getCurrentStoryEventActions(save);
  const selection = actions.find(action => {
    const c = sceneContractForEvent(action.eventId,runtimeOf(save)?.flags);
    return c && action.actionId === c.meta.hook.actionId && (!selected?.eventId || selected.eventId === action.eventId);
  });
  const contract = selection && sceneContractForEvent(selection.eventId,runtimeOf(save)?.flags);
  return contract && selection ? { contract, selection } : undefined;
}
export function hostNeeded(save: SaveData, selected?: { eventId?: string; actionId?: string }): boolean {
  return Boolean(activeScene(save) || sceneCandidate(save, selected));
}
/** Player-facing brief excludes model instructions, identifiers and implementation verbs. */
export function sceneBrief(save: SaveData): string {
  const a=activeScene(save), c=a && sceneContractById(a.contractId);
  if(!a || !c)return '';
  const lines=[c.objective.phases?.find(phase => evalExpr(phase.when,c,a.state))?.text || c.objective.text];
  for(const party of c.parties.filter(p=>a.state.present[p.id]!==false && !p.absent || a.state.present[p.id]===true)) {
    if(a.state.departed.includes(party.id))continue;
    const tracks=(party.tracks||[]).map(track=>{
      const id=track.track || track.id || '';
      return track.scale?.[a.state.tracks[party.id]?.[id] || 0] || '';
    }).filter(Boolean);
    lines.push(`${partyName(c,runtimeOf(save),party.id)}${tracks.length ? '：'+tracks.join('、') : ''}`);
  }
  for(const [party,statuses] of Object.entries(a.state.statuses)){if(statuses.length)lines.push(partyName(c,runtimeOf(save),party)+'：'+statuses.map(status=>c.statuses?.find(def=>def.id===status.id)?.label || '状态变化').join('、'));}
  const tags=a.state.tags.map(tag=>tag.label);
  if(tags.length)lines.push('当前局势：'+tags.join('、'));
  const elements=(c.elements||[]).filter(element=>(!element.availability?.fromBeat || a.state.beat>=element.availability.fromBeat) && (!element.availability?.untilBeat || a.state.beat<=element.availability.untilBeat));
  if(elements.length)lines.push('可用：'+elements.map(element=>element.label).join('、'));
  const beat=c.beats?.[Math.min(a.state.beat-1,c.beats.length-1)];
  if(beat?.prompt)lines.push(renderRefs(beat.prompt,runtimeOf(save)));
  return lines.join('\n');
}

function logInput(a: ActiveScene, c: Contract, text: string, model: { used: boolean; class?: 'chat'|'action'|'unclear' }, decision?: 'intercept'|'redirectAction'|'clarify'|'passThrough', judgement?: {rollIndex:number;tier:string}): void {
  const {policy,winningLayer}=resolveInputPolicy([c.meta.hook.inputPolicy as any, a.trial ? {mode:'interceptAll'} : undefined],a.inputLog.fallbackActive);
  const rule=classifyByRules(c,text); const routed=route(policy,'engaged',rule,model);
  a.inputLog=appendInput(a.inputLog,{contractId:c.meta.id,beat:a.state.beat,phase:'engaged',text,rule,model,decision:decision||routed.decision,reason:routed.reason,policy:{mode:policy.mode,fallbackActive:a.inputLog.fallbackActive,layer:winningLayer},disagreement:routed.disagreement,suspect:false,judgement},policy);
}
/** Single input gate. It returns true even for clarification; never leaks an unresolved scene to the story engine. */
export async function submitSceneInput(source: SaveData, text: string, deps: HostDeps, selected?: {eventId?:string;actionId?:string}): Promise<boolean> {
  const save=cloneSave(source); const ext=cloneSave(readExt(save)); let a=ext.active;
  if (!a) {
    const candidate=sceneCandidate(save,selected); if(!candidate)return false;
    const {contract:c,selection}=candidate;
    const rule=classifyByRules(c,text);
    ext.stall[c.meta.id]=(ext.stall[c.meta.id]||0)+1;
    // Observe/chat cannot complete the old objective. The counter is persisted, and the contract owns the ambush threshold.
    if(rule.class==='chat' && !wantsInterrogation(c,text) && ext.stall[c.meta.id] < (c.meta.hook.ambushAfterStall||Infinity)) {
      writeExt(save,ext);appendHistory(save,'眼前的交锋尚未解决，请说出你准备采取的行动。',text);await deps.persist(save);return true;
    }
    const opened=beginScene(c);
    snapshotLevels(save,c,opened.state);
    restoreSceneInjuries(save,c,opened.state);
    a=newActive({contractId:c.meta.id,eventId:selection.eventId,actionId:selection.actionId,playerLine:selection.playerLine||selection.actionText,state:opened.state,narrativeIndex:appendHistory(save,renderRefs((!Array.isArray(c.narration?.fixedTexts) ? c.narration?.fixedTexts?.engage : undefined) || c.objective.text,runtimeOf(save))),});
    ext.active=a;writeExt(save,ext);await deps.persist(save);checkAbort(deps);
  }
  const c=sceneContractById(a.contractId);if(!c)throw new Error('场面合同缺失，未回退旧路径');
  alignContract(a,c);
  if(c.levelContext)snapshotLevels(save,c,a.state);
  if(a.state.status==='decided'){await closeHost(save,ext,c,deps);return true;}
  const choice=matchPlayerChoice(c,text);
  if(choice){logInput(a,c,text,{used:false},'intercept');a.choice={choiceId:choice.id,label:choice.label,confirmText:choice.confirmText,endingId:choice.endingId};a.pending=null;writeExt(save,ext);await deps.persist(save);return true;}
  let modelClass: 'chat'|'action'|'unclear'|undefined;
  const ask=deps.askIntent ? async(req:ModelRequest)=>{const raw=await deps.askIntent!({...req,system:req.system+'\n另加 inputClass 字段：chat/action/unclear。闲聊必须没有任何行动。'});const obj=parseRecognition(raw);modelClass=['chat','action','unclear'].includes(String(obj?.inputClass))?obj!.inputClass as any:undefined;return raw;} : undefined;
  const recognitionKey = JSON.stringify([c.meta.version,text,a.state.beat,a.state.cursors,a.state.tracks,a.state.statuses,a.state.tags,a.state.departed,a.state.leverUses]);
  const cached = a.recognitionCache?.find(entry => entry.key === recognitionKey);
  let recognized = cached ? structuredClone(cached.recognized) : await recognizeAction(c,a.state,text,runtimeOf(save),ask);
  if(cached)modelClass=cached.modelClass;
  else a.recognitionCache=[...(a.recognitionCache || []).slice(-7),{key:recognitionKey,recognized:structuredClone(recognized),modelClass}];
  checkAbort(deps);
  const interrogating=wantsInterrogation(c,text);
  if(interrogating) {
    if(c.interrogation?.requires && !evalExpr(c.interrogation.requires,c,a.state)) {
      a.pending=null;a.notice='尚未制住可供审问的活口。';writeExt(save,ext);await deps.persist(save);return true;
    }
    const goal=c.interrogation!.goalIds[0],checked=validateProposal(c,a.state,{goal,claim:{magnitude:1,scope:'single',targets:[]}},text);
    recognized={plan:checked.plan,dropped:checked.dropped,by:'rules'};
  }
  const {policy}=resolveInputPolicy([c.meta.hook.inputPolicy as any, a.trial ? {mode:'interceptAll'} : undefined],a.inputLog.fallbackActive);
  const routed=route(policy,'engaged',interrogating ? {class:'action',evidence:['审问合同动作']} : classifyByRules(c,text),interrogating ? {used:false} : {used:!!modelClass,class:modelClass});
  if(routed.decision==='passThrough') {
    // Chat has a dedicated no-commands path. Neither story progression nor object registration can run here.
    let reply='你们简短交换了几句话，交锋的局面没有改变。';
    try { if(deps.askNarrative) reply=await deps.askNarrative({system:'只回答场内闲聊，第二人称。不得改变局势、人物状态、位置或物品，不替玩家采取行动，只输出正文。'+(c.interrogation ? '不生成供词、来历或幕后情报；这些请求只能进入代码审问合同。' : ''),user:sceneBrief(save)+'\n玩家：'+text}); } catch { /* conversational fallback */ }
    checkAbort(deps);
    if(new RegExp(`战斗结束|战斗胜利|敌人(?:${statusNamePattern('incapacitated')})|获得|收入背包|已经逃离|<[^>]+>`).test(reply)){reply='对方没有回应，眼前的交锋仍未解决。';logInput(a,c,text,{used:!!modelClass,class:modelClass},'clarify');}
    else logInput(a,c,text,{used:!!modelClass,class:modelClass},'passThrough');
    appendHistory(save,reply,text);a.notice='';writeExt(save,ext);await deps.persist(save);return true;
  }
  if(!recognized.plan||routed.decision==='clarify') {a.pending=null;a.notice='请用陈述句说明本拍目标和打法；可用要素见场面简报。';logInput(a,c,text,{used:!!modelClass,class:modelClass},'clarify');}
  else {const previewContext=sceneContext(save,c,text);if(recognized.plan.goal==='yield_guard'||recognized.plan.goal==='expose_self')previewContext.playerDefense=-100;a.choice=null;a.pending={plan:recognized.plan,text,preview:previewAction(c,a.state,recognized.plan,previewContext),by:recognized.by,dropped:recognized.dropped,cursor:a.state.cursors.action};a.notice='请确认预览后掷骰。';logInput(a,c,text,{used:!!modelClass,class:modelClass},'redirectAction');}
  writeExt(save,ext);await deps.persist(save);return true;
}
export async function confirmSceneAction(source: SaveData,deps:HostDeps): Promise<void> {
  const save=cloneSave(source),ext=cloneSave(readExt(save)),a=ext.active; if(!a||!a.pending||a.phase!=='fighting')throw new Error('没有待确认的场面行动');
  const c=sceneContractById(a.contractId)!;
  if(alignContract(a,c)){writeExt(save,ext);await deps.persist(save);return;}
  const p=a.pending!;if(p.cursor!==a.state.cursors.action)throw new Error('stale_scene_preview');
  const context=sceneContext(save,c,p.text);
  if(p.plan.goal==='yield_guard'||p.plan.goal==='expose_self')context.playerDefense=-100;
  const confirmed=confirmAction(c,a.state,p.plan,context);a.state=confirmed.state;a.pending=null;
  if(c.levelContext)snapshotLevels(save,c,a.state);
  const lines=renderResultLines(c,confirmed.result).map(line=>renderRefs(line,runtimeOf(save)));
  a.last={playerText:p.text,result:confirmed.result,lines,text:''};a.narrativeIndex=appendHistory(save,lines.join('\n'),p.text);
  const entry=a.inputLog.entries.at(-1);
  if(entry && entry.text===p.text){entry.judgement={rollIndex:confirmed.result.index,tier:confirmed.result.tier};a.inputLog.counters.judgements++;}
  else logInput(a,c,p.text,{used:p.by==='model',class:'action'},'redirectAction',{rollIndex:confirmed.result.index,tier:confirmed.result.tier});
  if(c.interrogation?.goalIds.includes(confirmed.result.goal)) {
    const runtime=runtimeOf(save),ledger=runtime.sceneLedger ||= {receipts:[],actors:{},injuries:{},names:{},worldFacts:[]};
    const receiptId=`${c.meta.id}:${confirmed.result.index}`;
    const receipts=ledger.interrogationReceipts ||= [];
    if(!receipts.some((r:any)=>r.id===receiptId))receipts.push({id:receiptId,contractId:c.meta.id,chapter:interrogationChapter(c,runtime),success:['success','great_success'].includes(confirmed.result.tier),facts:interrogationMaterial(c,a.state,confirmed.result.goal,runtime,['success','great_success'].includes(confirmed.result.tier))});
  }
  syncSceneStatuses(save,c,a.state);
  runtimeOf(save).worldTurn+=1;advanceClock(save,{minutes:1},'scene.'+c.meta.id);writeExt(save,ext);
  await deps.persist(save);checkAbort(deps); // Dice checkpoint BEFORE any model request.
  const narration=await narrateBeat(c,a.state,confirmed.result,p.text,runtimeOf(save),deps.askNarrative);checkAbort(deps);
  a.last.text=narration.text;history(save)[a.narrativeIndex].content=[narration.text,...lines].join('\n\n');
  if(a.state.status==='decided') await closeHost(save,ext,c,deps); else {a.notice='';writeExt(save,ext);await deps.persist(save);}
}
async function closeHost(save:SaveData,ext:ReturnType<typeof readExt>,c:Contract,deps:HostDeps):Promise<void> {
  const a=ext.active!;const closed=closeScene(c,a.state,sceneContext(save,c));
  if(closed.writeBack.violations.redLines.length || closed.writeBack.violations.afterState.length)throw new Error('场面红线校验未过，未推进剧情');
  a.state=closed.state;a.phase='closing';a.closing={text:renderRefs(closed.writeBack.closingText||closed.writeBack.memoryNote,runtimeOf(save)),outcome:closed.writeBack.outcome.kind,reason:closed.writeBack.outcome.reason};
  const written=applyWriteBack(save,c,a.state,closed.writeBack);writeExt(save,ext);
  if(closed.writeBack.outcome.endingId) {
    const id=closed.writeBack.outcome.endingId;
    runtimeOf(save).gameOver={endingId:id,title:id==='lcq.ending.fail.combat' ? '游戏结束' : BATTLE_LOSS_ENDINGS.find(ending=>ending.endingId===id)?.title || '本局结束',facts:[a.closing.text],sourceEventId:a.eventId,atTurn:runtimeOf(save).worldTurn,presentation:endingPresentation({endingId:id,sourceEventId:a.eventId})};
    const fixed=fixedEndingNarrative(runtimeOf(save).gameOver);appendHistory(save,(fixed || [endingBridge('',id),a.closing.text].join('\n\n')),'',endingPresentation(runtimeOf(save).gameOver).image);
  } else {
    // The engine checks the persisted CLOSED state, event/action and contract version before honoring this completion.
    const selection=getCurrentStoryEventActions(save).find(s=>s.eventId===a.eventId&&s.actionId===a.actionId);
    if(!selection)throw new Error('场面收束对应的剧情动作已过期');
    const settled=recordStoryEventStructuredAction(save,selection);if(!settled.attempted)throw new Error('场面剧情收束未成立：'+settled.reason);
    const terminal=closed.writeBack.finalStates.filter(row=>c.parties.find(p=>p.id===row.party)?.side==='opposed').map(row=>`${partyName(c,runtimeOf(save),row.party)}：${row.label}`);
    appendHistory(save,[a.closing.text,...written.notes,...terminal].join('\n'));
  }
  ext.history.push({contractId:a.contractId,eventId:a.eventId,outcome:a.closing.outcome,endingId:closed.writeBack.outcome.endingId,beats:closed.writeBack.beats,memoryNote:renderRefs(closed.writeBack.memoryNote,runtimeOf(save)),state:cloneSave(a.state),inputLog:cloneSave(a.inputLog)});
  ext.active=null;writeExt(save,ext);const advanced=advanceScenarioRuntime(save).saveData;await deps.persist(advanced);
}
export async function confirmSceneChoice(source:SaveData,deps:HostDeps):Promise<void>{
 const save=cloneSave(source),ext=cloneSave(readExt(save)),a=ext.active;if(!a?.choice)throw new Error('没有待确认的终局选择');
 const c=sceneContractById(a.contractId)!;if(alignContract(a,c)){writeExt(save,ext);await deps.persist(save);return;}a.state=applyPlayerChoice(c,a.state,a.choice.choiceId);a.choice=null;writeExt(save,ext);await deps.persist(save);checkAbort(deps);await closeHost(save,ext,c,deps);
}
export async function editSceneAction(source:SaveData,deps:HostDeps):Promise<void>{const save=cloneSave(source),ext=cloneSave(readExt(save));if(ext.active){ext.active.pending=null;ext.active.choice=null;ext.active.notice='请重新输入打法。';writeExt(save,ext);await deps.persist(save);}}

/** Reload after a persisted roll resumes closure without rolling again. */
export async function finishScene(source:SaveData,deps:HostDeps):Promise<void>{const save=cloneSave(source),ext=cloneSave(readExt(save)),a=ext.active;if(!a||a.state.status!=='decided')return;const c=sceneContractById(a.contractId)!;alignContract(a,c);await closeHost(save,ext,c,deps);}

/** Explicit test-only dice control; no effect until the tester enables it on an active scene. */
export async function setSceneTestDice(source:SaveData,deps:HostDeps,face:1|20|null,enabled:boolean):Promise<void>{
 if(!enabled)throw Error('scene_test_controls_disabled');const save=cloneSave(source),ext=cloneSave(readExt(save));if(!ext.active||ext.active.phase!=='fighting')throw Error('no_active_scene');
 ext.active.state.forced=face===null?undefined:{action:Array.from({length:256},()=>face),defense:Array.from({length:2048},()=>face)};
 ext.active.pending=null;ext.active.notice=face===null?'已恢复随机掷骰。':`测试固定骰：${face}。请重新输入行动。`;writeExt(save,ext);await deps.persist(save);
}
