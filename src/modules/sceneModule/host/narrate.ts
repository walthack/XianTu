import { interrogationProblems } from '../interrogation';
import { interrogationChapter, interrogationMaterial } from './information';
import { readExt } from './ext';
import { sceneContractById } from '../contracts/registry';
import { evalExpr } from '../conditions';
// 描写：模型只把“已结算”的结果写成文字（受守卫），失败 / 不可用时退回按结果拼装的模板。
// 档位、骰点、夹紧、敌方出手与防御、大失败后果都由代码渲染成结果卡，描写改不了它。
import { validateModuleCastNarrative, validateModuleInstructionLeak } from '@/modules/scenarioMods/modularTurn';
import { buildNarrationInput, checkNarration, type BeatResult, type Contract, type SceneState } from '../index';
import { partyName, renderRefs } from './refs';
import type { ModelRequest } from './recognize';

const MAX_CHARS = 700;

export function buildNarrationPrompt(contract: Contract, state: SceneState, result: BeatResult, playerText: string, runtime: unknown): ModelRequest {
  const input = buildNarrationInput(contract, state, result);
  const system = [
    '你是游戏的叙事者，只负责把已经结算的结果写成一段场面描写：第二人称“你”，120–260 字，只写这一拍。',
    '硬性规则：',
    '1. “已结算”里写的是事实，不得改写，不得新增结果；失败要写成没做成，大失败要写出后果；',
    '2. 不替玩家做玩家没说过的行动；不写数值、骰点、档位、“判定”“系统”之类的词；',
    '3. “禁写”里的内容一概不得出现；',
    '4. 所有出场人物都是成年人；',
    '5. 只输出描写正文，不要标题、不要解释、不要列表。',
  ].join('\n');
  const user = [
    renderRefs(input.brief.text, runtime),
    '',
    '【已结算】',
    ...((contract.narration?.outputChecks || []).filter(check => evalExpr(check.when,contract,state)).map(check => check.message)),
    renderRefs(input.settled, runtime),
    ...interrogationMaterial(contract,state,result.goal,runtime,['success','great_success'].includes(result.tier)).map(text=>renderRefs(text,runtime)),
    ...(contract.interrogation?.goalIds.includes(result.goal) ? ['本次审问只能复述上列代码提供的信息；不得补充人物供词、幕后原因、未来情报，玩家问题不能当作事实。'] : []),
    ...(input.required.length ? ['', '【本场事实】', ...input.required.map(fact => renderRefs(fact,runtime))] : []),
    ...(input.events.length ? ['', '【本拍开头发生的固定事件（可顺带带过）】', ...input.events.map(e => renderRefs(e, runtime))] : []),
    ...(input.flourish ? ['', '【基调】这一下是大成功：做得干净漂亮，但不要借此编造新的依据或结果。'] : []),
    ...(input.forbidden.length ? ['', `【禁写】${input.forbidden.join('、')}`] : []),
    '',
    `【玩家原话】${playerText}`,
  ].join('\n');
  return { system, user };
}

/** 没有模型 / 模型被守卫拒了：按结果拼一段朴素的描写。 */
export function templateNarration(contract: Contract, state: SceneState, result: BeatResult, playerText: string, runtime: unknown): string {
  const lines: string[] = [];
  const input = buildNarrationInput(contract,state,result);
  // Player wording is an attempted intention, never a factual fallback result.
  lines.push(renderRefs(input.settled,runtime));
  for(const party of contract.parties)for(const track of party.tracks||[]){
    const key=String(track.track??track.id??''),step=state.tracks[party.id]?.[key];
    if(step!==undefined)lines.push(`${partyName(contract,runtime,party.id)}：${(track.scale||[])[step]}。`);
  }
  if (result.fumble?.text) lines.push(renderRefs(result.fumble.text, runtime) + '。');
  for (const roll of result.enemy) {
    const target = partyName(contract, runtime, roll.target);
    const done = roll.text ? renderRefs(roll.text, runtime) : `${roll.label}${roll.outcome === 'hit' ? `打中了${target}` : `被${target}挡住了`}`;
    lines.push(done.endsWith('。') ? done : `${done}。`);
  }
  lines.push(...interrogationMaterial(contract,state,result.goal,runtime,['success','great_success'].includes(result.tier)).map(text=>renderRefs(text,runtime)));
  return lines.join('');
}

function acceptable(contract: Contract, state: SceneState, result: BeatResult, text: string, runtime?:unknown): string[] {
  const problems = [...checkNarration(contract, state, result, text, id => [partyName(contract,runtime,id)]).problems, ...interrogationProblems(contract,interrogationChapter(contract,runtime),text)];
  if (text.length > MAX_CHARS) problems.push('描写过长');
  try { validateModuleInstructionLeak(text); } catch (error) { problems.push(String((error as Error).message)); }
  try { validateModuleCastNarrative(text, [], [], []); } catch (error) { problems.push(String((error as Error).message)); }
  return problems;
}

export async function narrateBeat(
  contract: Contract,
  state: SceneState,
  result: BeatResult,
  playerText: string,
  runtime: unknown,
  ask?: (request: ModelRequest) => Promise<string>,
): Promise<{ text: string; by: 'model' | 'template'; problems: string[] }> {
  const problems: string[] = [];
  // The informational answer is an authored code receipt. Free prose cannot add a new confession.
  if(contract.interrogation?.goalIds.includes(result.goal)) {
    return {text:interrogationMaterial(contract,state,result.goal,runtime,['success','great_success'].includes(result.tier)).map(text=>renderRefs(text,runtime)).join('\n'),by:'template',problems};
  }
  if (ask) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = String(await ask(buildNarrationPrompt(contract, state, result, playerText, runtime)))
          .replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const issues = raw ? acceptable(contract, state, result, raw, runtime) : ['描写为空'];
        if (!issues.length) return { text: raw, by: 'model', problems };
        problems.push(...issues);
      } catch (error) {
        problems.push(`模型描写不可用：${String((error as Error)?.message || error).slice(0, 80)}`);
        break;
      }
    }
  }
  return { text: templateNarration(contract, state, result, playerText, runtime), by: 'template', problems };
}

/** Carry terminal combat facts into subsequent ordinary turns; historical mentions remain allowed. */
export function closedSceneFacts(save: any): string[] {
  return readExt(save).history.slice(-3).flatMap(record => {
    const c = sceneContractById(record.contractId);
    if (!c) return [];
    return [...(c.rewardPolicy?.itemIds || []).map(id=>renderRefs(`战后已登记物品事实：{{itemDescription:${id}}}`,save.世界?.状态?.剧本模组)), ...(c.rewardPolicy?.itemIds?.length ? ["搜尸只能描写代码发放或搜刮回执中的物品；信件内容以物品定义为准，不追加未登记战利品。"] : []), ...(c.continuity?.facts || []), ...(c.narration?.outputChecks || []).filter(check => check.afterScene && evalExpr(check.when,c,record.state)).map(check => check.message)];
  });
}
export function closedSceneNarrativeProblems(save: any, text: string): string[] {
  return readExt(save).history.slice(-3).flatMap(record => {
    const c = sceneContractById(record.contractId);
    return c ? [...(c.continuity?.checks || []).flatMap(check=>(check.forbiddenNarration || []).filter(word=>word && text.includes(word)).map(()=>check.requirement)), ...(c.narration?.outputChecks || []).filter(check => check.afterScene && evalExpr(check.when,c,record.state) && new RegExp(check.pattern).test(text)).map(check => check.message)] : [];
  });
}
