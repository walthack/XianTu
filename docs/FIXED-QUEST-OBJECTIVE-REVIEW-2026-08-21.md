# 三级任务固定目标复审（2026-08-21）

## 结果

- 制作侧摘要：主轴 16、二级线 382、人物线 54、人物单点高光 64，全部由旧 `text` 改名为 `reviewSummary`，原文案不丢失。
- 玩家侧目标：所有真实可走节点都以绑定 event 的本地 `objective` 为唯一来源；`pending/new` 不进入当前目标。
- 全量映射覆盖：主轴 13/13、二级线 374/374、人物真实 event 49/49 均有固定 objective。
- Grok 4.6 全量比对筛出 67 条候选问题；Codex 逐条对照 event description 与 completion contract 后，采纳 52 条表现层改写。
- 未采纳 15 条：原文是合法的当前战斗／营救目标，或 Grok 把它改成“决定是否”，但本地 completion contract 仍只有一条固定动作。只改文案会虚构玩家选择，故暂不接。

## 数据合同

```text
reviewSummary  制作／审阅：这一拍完成后发生了什么；可含结果，不进玩家 UI 与 prompt
eventId         任务节点与本地 event 的稳定绑定
objective       event 内固定的玩家当前目标；LLM 无写入权
override        仅处理去剧透、去元语言、去错误主体；不改 event 或完成合同
```

覆盖实现位于 `src/modules/scenarioMods/fixedQuestObjectives.ts`。它只改变 UI、主叙事提示词、事件叙事视图与按钮预填句的表现，不能改变：

- event id、激活条件与完成条件；
- playerCompletionContract、contract hash 或 action payload；
- Canon Rail 结果或 IF；
- 任何背包、关系、知识或世界真值。

## 采纳类型

1. 开发者元语言：`招牌登场`、`首次接触`、`不预写真相`。
2. 目标与事件不符：例如“大潮突至”仍显示“前往云苍峰”、横塘围攻仍显示“迫使卓云君屈服”。
3. 提前公开调查结果：白纸信笺、宫禁闹鬼、汉宫兵变、超级用户点验。
4. NPC 固定结果提前写死：武二郎斩达古、星月湖开库、产业接管。
5. 不适合玩家栏的露骨词：保留事件事实与审阅摘要，玩家目标改为中性的现场行动。

## 暂不采纳的典型项

- `lcq.event.free_ajiman`：目标“取得身契并还她自由”是明确可执行任务，不是结果剧透；Grok 的“再决定怎么处置”会与唯一完成合同冲突。
- `lcq.event.s12_10_rescue_xiao`：营救被擒同伴是合法 RPG 目标；改成“决定救不救”却没有拒救合同，会制造假选择。
- `lcq.event.yuanxingjian_disposed`、`lcq.event.quanyuji_soul_pill`、`lyl.event.sacred_against_lin`：是否开放选择属于 completion contract／IF 设计，不能只靠目标文案偷改。
- 明确战斗目标（斩鸦人、斩吴行德、水鬼暗杀、兴唐寺杀手、救白霓裳）暂保留；它们描述当前要对付的对象，不预告战斗已经成功。

若以后要让上述固定结果真正可拒绝，应新增本地分支动作与后果，再同步改 objective，而不是先把任务栏写成“你可以选择”。
