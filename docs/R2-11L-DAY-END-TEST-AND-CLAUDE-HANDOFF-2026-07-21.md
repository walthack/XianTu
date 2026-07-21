# R2-11L：日终测试与 Claude 交接（2026-07-21）

## 当前结论

R2-11 已完成全部**非隔离事件**的引擎独占完成迁移，覆盖 `308/380`。当前暂停生产改动，由用户先做游戏内测试；后续实现交给 Claude，起点为本文件列出的三个提交。

## 今日提交

1. `d435de6 fix: prioritize local completion at event deadlines`
   - 修复绝对截止同回合中，玩家已满足本地合同却被场外结算抢写的 P0。
   - `local_condition` 合同 hash 与 ready 状态匹配时，玩家完成权优先。
   - 清羽／云龙补真实休眠演员、零决策与 JSON 逐字节重放证据。
2. `8c722bf feat: migrate declared objectives to engine actions`
   - 新增 `objective_action` 合同。
   - 迁移 267 个具备明确 objective、唯一标准完成键、无多拍 evidence 的非隔离事件。
   - 迁移后覆盖 `274/380`。
3. `97c46dd feat: migrate curated special event contracts`
   - 迁移 21 个人物登场、10 个无 objective 剧情拍、3 个多步高光。
   - 修复 active 非关键合同不显示动作、ready 不落账的问题。
   - 最终覆盖 `308/380`。

## 已验证门禁

- `npm run test:g1:npc`：通过。
- `npm run validate:all`：通过，共 `418/418`。
- `npm run canon:build`：37 关与正典测试通过。
- `npm run build`：通过。
- Git 工作树在交接前干净。

## 用户真机测试重点

抽取三种事件结构，不要求先跑完全部 308 个：

1. 普通明确目标事件：应出现固定的 `【主线推进】` 动作；选择后由引擎完成，LLM 的 `done` 命令不应成为真值来源。
2. 非关键人物登场／剧情拍：即使不是当前 narrative anchor，也必须显示对应动作并可正常落账。
3. 三步高光：前两步只积累 preparation，JSON 重载后不丢；只有最终步骤完成事件。
4. 截止同回合：若玩家在绝对截止回合满足合同，应记 `participated`，不得被写成 `offscreen`。
5. 忽略事件：世界仍应按期限或既有场外合同推进，不因新增玩家合同卡死。

若发现问题，请保留 stage/event id、worldTurn、所选结构化 action、事件回执与存档；正文措辞本身不能证明引擎真值错误。

## Claude 后续执行边界

剩余 72 个事件全部位于以下八个正典隔离关：

- `lcq.stage_03`：10
- `lcq.stage_05`：10
- `lcq.stage_06`：6
- `lyl.lin_an_black_sea`：15
- `lyl.luoyang_coup`：7
- `lyl.taiquan_expedition`：5
- `lyg.ganlu_bian`：10
- `lyg.shixiang_ambush`：9

Claude 必须先读 `PROJECT-STATUS.md`、`CANON-DECISIONS.md` 的 #61/#62/#64/#118，以及 DeepSeek／MiniMax 的 quarantine review。现有复核显示重复 axis、事件顺序冲突、超时或证据不足；不得直接运行普通批量迁移脚本，不得把旧自由稿目标自动合法化，也不得把隔离关重新接入默认 Canon Rail。

正确顺序是：

1. 逐关建立非成人的逐拍来源映射与确定顺序；双模型均为 `supported` 只能作为候选证据，不能覆盖确定性 blocker。
2. 对重复／无来源 axis 作人工裁定，并在同一提交更新 `CANON-DECISIONS.md`。
3. 来源确认后，再按事件实际结构选择 `objective_action`、多步 sequence 或 `local_condition`，不可按事件名猜合同。
4. 每关独立提交并跑 `npm run canon:build`；八关全部完成后再更新 `308/380` 覆盖数字。

现有审计产物：

- `mod-kit/generated/deepseek-v4-flash/character-canon/canon-rail/quarantine-deepseek-review/`
- `mod-kit/generated/deepseek-v4-flash/character-canon/canon-rail/quarantine-minimax-review/`

## 停止点

当前停止在 `97c46dd` 之后。用户先做真机测试；在结果回来前，不继续改生产代码，也不解除八个隔离关。
