# R2-11V · `lyg.ganlu_bian` 来源重建

## 修正后的边界

- opening：source126《滴漏》之后；王守澄已死，李昂已在清思殿决定后日借发丧诛宦。
- playable：source127–132，先传李昂密令，后经阳禄门院、权宦追凶与甘露情报，收在 source132《程宅战榜》。
- handoff：source133《以武争盟》起由 `lyg.liangzhou_league` 持有。
- 原 stage-plan `sourceEndIndex=135` 与下一关 source132–138 重叠，现纠正为 132；仍保留 quarantine。

## 旧稿问题

1. 十个事件无序并发，首事件从 seq1200 开始，随后倒跳 seq1194、1192。
2. `release_jingnian` 与 `yang_yuhuan_report` 重复绑定 `yange.131.2`；`jia_wenhe_plan` 无来源轴。
3. 把 source133 凉州盟、source134 招魂与 source135 小紫闭关写进本关，和下一关重复持有。
4. opening 提前宣布黎锦香与飞鸟秘密、小紫即将闭关、仇士良夺军和李郑内讧等关内结果。
5. 47 人整库演员与后期卡回灌；本轮收口为 14 名实际演员并锁定构建期卡与 affiliations。

## 十个冻结事件的新时序

| 顺序 | 冻结 event id | 来源 | 重建语义 |
|---:|---|---|---|
| 1 | `li_jinxiang_meeting` | `yange.127.1 / 1193` | 李昂托杨玉环传闭门密令并牵制鱼朝恩 |
| 2 | `yang_yuhuan_report` | `yange.128.1 / 1195` | 赴阳禄门院会见黎锦香 |
| 3 | `jia_wenhe_plan` | `yange.128.2 / 1196` | 广源行等级控制与周飞受控 |
| 4 | `soul_summoning` | `yange.129.1 / 1198` | 周飞与十方丛林合谋针对程宅 |
| 5 | `bai_nichang_defeat` | `yange.130.1 / 1199` | 黎锦香承认潜入程宅并劫走飞鸟 |
| 6 | `liangzhou_victory` | `yange.130.2 / 1200` | 飞鸟供出雇佣目标、剑柄与印信线索 |
| 7 | `release_jingnian` | `yange.131.1 / 1201` | 博陆王府权宦追凶分工 |
| 8 | `su_sha_identified` | `yange.131.2 / 1202` | 杨玉环汇报甘露局势、贾文和献释放番僧计 |
| 9 | `xiao_zi_departure` | source132，`reviewed-no-anchor` | 小紫向白霓裳核对强提气海的代价；尚未闭关 |
| 10 | `ganlu_crisis_final` | source132，`reviewed-no-anchor` | 杨玉环击败白霓裳并张贴程宅战榜 |

所有 event/chapter ID 与 SAVE-CONTRACT completion path 保持原值；未新增事件 ID。

## 明确不合同化

- `yange.127.2 / 1194`、`yange.128.3 / 1197`：成人私密与双修修伤拍，不承担甘露/广源行/权宦追凶的下游因果。
- source132 吕雉活扣与潘金莲、燕姣然诊病：生活/医疗旁支，不承担下一关凉州盟开场。
- source126 的家宴与清思殿密谋属于 opening 前已完成事实，不伪装成关内可重玩事件。

## 门禁与验证

- Claude 二审 P1 已修：冻结 chapter completion path 不动，按实际 eventIds 重写章节标题／摘要；`release_jingnian` 所在章节现在明确写“权宦追凶”，下一章只写甘露搅局与小紫问法，避免 UI／prompt 稳定错帧。
- P3 单记：gitignored 的 `lyg.ganlu_bian.sources.md` 仍是 source135 旧边界构建参考，不被 runtime、测试或发布产物读取；后续若重做来源文档生成链再统一清理。
- 十拍人工双步 `objective_action`，机械动作 `advance_declared_objective` 永久禁入。
- 4 个冻结 chapter 保留，按新顺序重新分组；空档可完成全部十拍并跨 JSON 往返幂等。
- 14 名演员只保留本时点最小身份；技能、功法、物品、境界、content access、静态 affiliations 与派生关系不回灌。
- `tests/r2_11v_lyg_ganlu_bian_source_rebuild.test.mjs` 固定切点、旧存档路径、演员闭包、运行时重放和 quarantine。
