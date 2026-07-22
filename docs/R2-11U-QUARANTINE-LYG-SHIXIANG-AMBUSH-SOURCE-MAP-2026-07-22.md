# R2-11U · `lyg.shixiang_ambush` 来源重建

## 边界

- stage-plan：`sourceStartIndex=69`、`sourceEndIndex=84`。
- 开场：第 669 章《公敌》上院法旨已经下达；杨玉环刚派人相邀，`yange.69.2` 尚未落账。
- 收尾：第 684 章《蕃密》首次审讯飞鸟萤子；下一关从 `yange.85.1` 拜访李药师开始。
- 仍在 `DEFAULT_LINE_QUARANTINED_STAGE_IDS`，来源重建与人工合同不等于解除隔离。

## 旧稿缺陷

1. opening 提前写入第 679–680 章才发生的水香楼邀捕、毒方刺客和女忍潜伏。
2. 九个冻结事件跨章倒序；`yange.79.2` 重复三次，`yange.83.2` 重复两次。
3. 事件目标把侦察、诱捕、寺院爆破和终局混成并发自由稿，无法形成可重放因果链。
4. 66 人整库卡把后期身份、能力和关系回灌到本关；本轮收口为 15 名实际演员及其时点投影。

## 可玩合同映射

| 顺序 | event id | 轴点 | 承重内容 |
|---:|---|---|---|
| 1 | `shixiang_s10` | `yange.69.2 / 1093` | 杨玉环说明北司与佛门查探方向 |
| 2 | `investigate_te_master` | `yange.71.1 + 72.1 / 1096` | 摩尼寺被夺后潜入青龙寺侦察 |
| 3 | `shixiang_s11` | `yange.73.1 / 1097` | 鸿胪寺补救与元正朝会资格 |
| 4 | `shixiang_s12` | `yange.74.1 + 75.2 / 1100` | 红莲演法与唐皇约束僧众 |
| 5 | `shixiang_s13` | `yange.76.1 + 77.1 / 1102` | 元正朝会核验徐君房与地球仪 |
| 6 | `track_dagger_attacker` | `yange.77.2 / 1103` | 宣平坊宦官命案 |
| 7 | `shixiang_s14` | `yange.78.1 / 1104` | 兴庆宫地下入口 |
| 8 | `escape_or_counter` | `yange.79.1 / 1105` | 太子误伤救治与消息控制 |
| 9 | `lure_pan_jinlian` | `yange.79.2 / 1106` | 水香楼诱捕布置 |
| 10 | `ambush_at_shuixiang` | `yange.80.1 / 1107` | 毒方刺客与楼内封锁 |
| 11 | `final_showdown` | `yange.80.2 + 80.3 + 81.1 / 1110` | 池畔混战、识破示弱并擒获女忍 |
| 12 | `raid_qinglongsi` | `yange.83.1 / 1113` | 摩尼寺爆破营救失败 |
| 13 | `forewarned_from_xinyong` | `yange.83.2 / 1114` | 信永揭示蕃密内幕 |
| 14 | `capture_feiniao` | `yange.84.1 / 1115` | 三项询问与拒答结果 |

九个旧 event id 和原 completion path 全部保留；`shixiang_s10–s14` 为 append-only 新 ID。四个冻结 chapter id 也保留并按新因果链重新分段。

## 明确不合同化的内容

- `yange.70.1 / 1094`：吕雉浴房私密场景，不承担本关主线转折。
- `yange.81.2 / 1111`、`yange.82.1 / 1112`：水香楼成人场景。擒获结果已由 `1110` 落账，后续蕃密线从 `1113` 承接；不为追求“一轴一卡”机械扩写。
- `yange.75.1 / 1099`：除夕兄弟宴作为氛围与关系拍折入时段背景，不单独生成完成真值。

## 门禁

- 14 拍均为人工双步 `objective_action`，无 `advance_declared_objective`。
- 事件严格单链可达；旧 `triggered/done` completion path 按 SAVE-CONTRACT 原样保持。
- 15 名演员只保留本关所需身份、来历与性格投影；技能、功法、物品、境界和 content access 清空。
- 构建、运行时重放、JSON 往返幂等和 quarantine 状态由 `tests/r2_11u_lyg_shixiang_ambush_source_rebuild.test.mjs` 固定。
