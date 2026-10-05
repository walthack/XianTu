import overrides from '../../../../mod-kit/entity-ledger/overrides.json';

/** 显示标签不是自报姓名。所有渠道以角色id读同一章门表，不反向以标签建人物。 */
export type NamingChannel = 'panel' | 'narration' | 'protagonistAddress' | 'protagonistThought' | 'npcAddress' | 'selfReportedName';
type Runtime = { modId?: string; events?: { id: string; axisAnchor?: string }[]; activeEventIds?: string[]; completedEventIds?: string[]; travelLedger?: { doneEventIds?: string[] }; canon?: { characters?: any[] } };
const entities = overrides.entities;
export function namingChapter(runtime: Runtime): number {
  const done = new Set([...(runtime.completedEventIds || []), ...(runtime.travelLedger?.doneEventIds || [])]);
  const chapterOf = (event: {axisAnchor?: string}) => Number(event.axisAnchor?.match(/第(\d+)章|qingyu\.(\d+)\./)?.slice(1).find(Boolean) || 0);
  const active = (runtime.events || []).filter(e => runtime.activeEventIds?.includes(e.id)).map(chapterOf).filter(Boolean);
  const floor = (overrides.stageOpeningChapters as Record<string,number>)[runtime.modId || ''] || 0;
  const milestones = Object.entries(overrides.namingMilestones).filter(([id])=>done.has(id)).map(([,chapter])=>chapter);
  return Math.max(floor, ...milestones, ...(runtime.events || []).filter(e => done.has(e.id)).map(chapterOf), ...(active.length ? [Math.min(...active)] : []));
}
export function namingFor(id: string, chapter: number, channel: NamingChannel = 'panel') {
  const entry = entities.find(e => e.id === id);
  const steps = entry?.naming[channel];
  return steps?.filter(s => s.fromChapter <= chapter).at(-1);
}
export function namingAliases(id: string): string[] { return entities.find(e => e.id === id)?.aliases || []; }
export function projectNamingText(text: string, runtime: Runtime, channel: NamingChannel = 'panel'): string {
  // 只重映射本存档中已有实体的专名，不用「使者／护卫」等泛称猜身份。
  const chapter = namingChapter(runtime);
  let result = text;
  for (const entry of entities) {
    if (!runtime.canon?.characters?.some(c => c.id === entry.id)) continue;
    const target = namingFor(entry.id, chapter, channel)?.text;
    if (!target) continue;
    if (channel === 'narration' && overrides.historicalNamePreservationIds.includes(entry.id)) continue; // 旧事中的姓名保留当时写法；在场形态由演员id投影
    for (const alias of [...entry.aliases].sort((a,b) => b.length-a.length)) {
      if (alias === target || overrides.nonReplacingAliases.includes(alias)) continue;
      if (entry.id === overrides.historicalAliases.id && chapter < overrides.historicalAliases.beforeChapter && overrides.historicalAliases.names.includes(alias)) continue;
      // 亲昵称呼由独立通道决定，不把对白里的亲密别称等改成姓名。
      const displayAliases = new Set([...entry.naming.panel, ...entry.naming.narration].map(s=>s.text));
      if (!displayAliases.has(alias) && !overrides.legacyDisplayAliases.includes(alias)) continue;
      const parts = result.split(alias);
      result = parts.reduce((joined, part, index) => {
        if (!index) return part;
        const protectedUse = overrides.nameProtectedSuffixes.some(s => part.startsWith(s)) || overrides.selfIntroductionPrefixes.some(prefix => joined.endsWith(prefix));
        return joined + (protectedUse ? alias : target) + part;
      }, '');
    }
  }
  return result;
}
export function syncCharacterNaming(runtime: Runtime): void {
  if (!runtime.modId?.startsWith('lcq.')) return;
  const chapter = namingChapter(runtime);
  for (const c of runtime.canon?.characters || []) {
    const display = namingFor(c.id, chapter);
    if (!display) continue;
    c.name = display.text;
    // 母系是已知事实，名字仍按称呼门展示，不改变血缘真值。
    if (c.id === 'liuchao.character.xiao_zi' && c.profile) {
      const names = entities.find(e=>e.id==='liuchao.character.bi_ji')!.naming.panel;
      const earlier=names[0].text, later=names[1].text;
      for (const key of ['race','origin']) if (typeof c.profile[key] === 'string') c.profile[key] = chapter < 115 ? c.profile[key].split(later).join(earlier) : c.profile[key].split(earlier).join(later);
      for (const key of ['notes','memories']) if (Array.isArray(c.profile[key])) c.profile[key] = c.profile[key].map((s: string) => chapter < 115 ? s.split(later).join(earlier) : s.split(earlier).join(later));
    }
  }
}

/** 只投影模型材料副本中的文字；keys/实体id/合同及结算保持不变。 */
export function projectNamingPacket<T>(packet: T, runtime: Runtime): T {
  const visit = (value: any, key = ''): any => typeof value === 'string' ? /(?:id|Id|Ids|Hash|source|引用|出处|panelName|protagonistAddress|protagonistThought|主角心称|主角对他|selfReportedName)$/.test(key) ? value : projectNamingText(value, runtime, 'narration') : Array.isArray(value) ? value.map(v => visit(v,key)) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,visit(v,k)])) : value;
  return visit(packet);
}

export const namingInstructions = overrides.namingInstructions;

export function isSouthernStage(stageId?: string): boolean { const chapter = (overrides.stageOpeningChapters as Record<string,number>)[stageId || '']; return Boolean(chapter && chapter >= 37 && chapter <= 124); }

/** 原著无名配角只绑定已指定场景窗口；不把同名标签当成通用身份。 */
export function sceneBoundEntity(label: string, chapter: number) { return entities.find(e => 'sceneBinding' in e && e.sceneBinding && chapter >= e.sceneBinding.fromChapter && chapter <= e.sceneBinding.toChapter && e.aliases.includes(label)); }
