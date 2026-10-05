// 仅用于战斗试玩构建的垫片（webpack.combat-trial.config.js 用 NormalModuleReplacementPlugin 替换）。
//
// 为什么需要：gameStateStore.toSaveData() 现在把「活的」响应式 this.relationships 放进待返回的存档，
// 再对它调用 backfillRelationshipIds——后者会 delete / defineProperty 改这个对象。toSaveData() 又会在
// MainGamePanel 的渲染里被多次调用，于是每次渲染都改响应式状态、触发下一次渲染，
// 直到 "Maximum recursive updates exceeded"，期间页面冻结约 40 秒（原版清羽开局存档同样复现）。
//
// backfill 会写：关系表（delete / 赋值 / defineProperty），以及关系矩阵（matrix.nodes 每次都赋新数组）。
// 做法：遇到响应式的关系表、关系矩阵时先换成普通对象的深拷贝再回填，不再改动 store 的状态。
// 其余导出原样转发。上游把 toSaveData 修好后，把 webpack 配置里的这条替换删掉即可。
import { isReactive } from 'vue';
import * as real from '../../../modules/scenarioMods/ledger/affinityIdentity';

export * from '../../../modules/scenarioMods/ledger/affinityIdentity';

export function backfillRelationshipIds(save: any, characters?: any, log?: any): void {
  for (const field of ['关系', '关系矩阵']) {
    const value = save?.社交?.[field];
    if (value && isReactive(value)) save.社交[field] = JSON.parse(JSON.stringify(value));
  }
  return (real.backfillRelationshipIds as any)(save, characters, log);
}
