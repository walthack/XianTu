# 2026-10-08 六朝功能修复落档

批次：LUNA-ACCEPTANCE-20261007。用户最新指令：停止补测，把本轮修复落档。
本页为本轮最终交接入口；先前阶段记录保留，最新结论以本页为准。成熟度为 **PARTIAL：已实现、部分隔离真实UI验证通过，未整组验收、未部署**。

## 已完成的修复

| 项目 | 唯一根因类别 | 机制改动 | 验证与边界 |
|---|---|---|---|
| V03 凝羽探问不落账 | 前置验证 | 补直接询问授权；仅在合同符合受限迁移条件时同步旧档与live runtime的intentMatch及合同哈希，保留已有尝试/准备状态 | 原问句及H1有隔离真实UI成功证据；H1尝试1次、准备标记正确、事件未提前完成。完整独立同类组及全部边界尚未验收 |
| V04 乐明珠保密动作不结算 | 结算路由 | 自然动作分发接受既有exploration_engine来源，交给已有本地事件结算 | 原真实分类输出的受控UI重放落收据/记忆；后续H1/N1/A1有各自真实样本证据。不同包及受控证据不合并宣称最终整组PASS |
| V07 醉酒只有旁白 | 结算路由 | 成功modular回执接入已批准的确定性自由文本状态挂载器 | 原失败输入最终包真实UI通过：角色效果、sceneLedger各1条drunk，360分钟；邻近保密事件尝试0次。扩展边界为代码测试层，完整独立留出组未验收 |

产品改动位于 `src/components/dashboard/MainGamePanel.vue`、`src/modules/scenarioMods/naturalIntentRouter.ts`、`src/modules/scenarioMods/runtime.ts`、`src/utils/AIBidirectionalSystem.ts`、阶段02 overlay及对应builtin生成数据；测试位于 `tests/naturalIntentRouter.test.mjs`、`tests/rerun4StatusFreeText.test.mjs`。工作区还含其他既有差异，不能据此将全部dirty文件视为本轮交付。

## 证据与工程检查

- 候选基线HEAD：`3e0144dd2a68d758a8235ba40fff4a46022d2e84`；代码仍在工作区，未提交。
- 最终隔离包记录为 `index.html` SHA-256 `80491efa90cea128d048e0f4cdf9a7ede1260925d33e4d8375a8d72e84470493`；不是共享8097的部署包哈希。
- 执行记录：定向测试21/21、type-check、build:single、git diff --check通过。早期canon:build为1625通过/0失败/5跳过；不宣称对最终全部改动重跑了完整canon门禁。
- V03-H1：私有证据 `614-v03-h1-post-livefix.png`、`615-v03-h1-post-livefix-structured.json`。
- V07：私有证据 `623-v07-postfix-structured.json`、`626-v07-postfix-modular-receipt.json`、`625-v07-postfix-events-final.json`；前台两请求HTTP200，回合后后台请求中止1次，未重复重试。
- [完整验收报告](../../../../playtest-2026-09-28/REPORT-2026-10-07-luna-acceptance.md)、[修复细节](V03-V04-NATURAL-INTENT-ROUTE.md)、[进度记录](ACCEPTANCE-CLOSEOUT-PROGRESS.json)。原始证据留 `_newbot_tmp/acceptance-20261007-luna-a1/`，不复制模型正文或密钥。

## 未验收与范围外

- 用户标准仍是原失败样本、未参与修复的同类组、误判/否定/指代/邻场景同时通过才算收口。目前不能宣布三项能力整体收口。
- “必须修复前预注册，否则永远无法补验”是此前过严解释，已纠正；实际需要确认样本未参与实现或调试，并在验证前锁定输入与预期。用户现已停止补测，本轮不再补跑。
- V03-N1旁白泄露未揭事实，归四类范围外的叙事时点问题，保持开放；不扩修prompt或剧情。
- V05成功和读回不同槽；原成功槽不可见，同槽持久化未验证，不能认定数据丢失或据此修保存。
- V06公开后、其他战斗胜局/终态、路线尾段、理解度未验收。20次连续新档提交数量达标，路线未完成；F04单次自然胜局竹筒奖励通过。
- 合规观察单列，不作为本轮blocker。

## 停止与交接

用户取消刚安排的补测；不再新增模型样本、关键词、状态ID、功能或数值改动。自动跟进保持暂停。交由模块策划根据上面的已修机制和未验收边界继续打磨，后续部署/发布另行处理。

无部署、commit或push；正式存档/API配置与共享服务不修改。落档仅新增本页、更新共享状态/轮次与报告最新说明，不覆盖历史证据。
