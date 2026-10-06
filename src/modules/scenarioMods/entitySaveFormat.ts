import access from '../../../mod-kit/entity-catalog/stage-access.json';
export const ENTITY_SAVE_FORMAT=2;
/** This catalog rollout deliberately requires a fresh project save; no guessed migration from names. */
export function assertEntitySaveFormat(save:unknown):void {
 const runtime=(save as any)?.世界?.状态?.剧本模组;
 if(runtime&&Object.hasOwn(access.stages,runtime.modId)&&runtime.entitySaveFormat!==ENTITY_SAVE_FORMAT)
  throw new Error('本次实体总表使用新档格式，请新开档或导入本轮重新导出的检查点。旧档不迁移。');
}
