import {canonicalEntityId,resolveNamedEntityId} from './namedEntities';
/** New-save boundary: ids are authoritative; descriptions/names remain presentation caches. */
export function refreshSaveEntityReferences(save:any):void {
 const r=save?.世界?.状态?.剧本模组;if(!r)return;
 const locate=(p:any)=>{if(!p)return;const text=String(p.描述||'');const hit=[...(r.canon?.locations||[])].sort((a:any,b:any)=>String(b.name).length-String(a.name).length).find((l:any)=>text.split('·').some((part:string)=>part===l.name));const id=hit?.id||text.split('·').reverse().map((part:string)=>resolveNamedEntityId('location',part)).find(Boolean);if(id)p.locationId=canonicalEntityId('location',id);else delete p.locationId;};
 locate(save.角色?.位置);
 for(const p of Object.values(save.社交?.关系||{}) as any[]){locate(p.当前位置);const refs=(p.势力归属列表||[]).map((v:string)=>resolveNamedEntityId('faction',v)||(/^\w+\.faction\./.test(v)?canonicalEntityId('faction',v):undefined)).filter(Boolean);p.factionIds=[...new Set(refs)];p.势力归属列表=[...p.factionIds];if(p.势力归属){const id=resolveNamedEntityId('faction',p.势力归属);if(id){p.factionId=id;p.势力归属=id;}}}
 for(const p of save.世界?.信息?.地点信息||[]){const id=resolveNamedEntityId('location',p.名称);if(id)p.id=id;}
 for(const p of save.世界?.信息?.势力信息||[])if(p.id)p.id=canonicalEntityId('faction',p.id);
}
