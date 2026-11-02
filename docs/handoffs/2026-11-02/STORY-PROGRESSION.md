# 剧情推进机制接手交付（2026-11-02）

分支：`feat/fast-no-legacy`。依据：`/workspace/narrative-drafts/2026-11-02-剧情推进机制设计.md` 与用户本轮拍板 1–6；冲突时以本轮拍板为准。

## 已有提交（保留）

- `c4e5aceedba21f95c9d5f34f122549547a7be2fd`：fix(剧情推进 ①): 彻底废除「正文关键词共现」结算——高光证据词、谢艺／碧姬正文快路、模型读正文对账全部删除
- `516dacb1b363ab3b3371abc84216115622749e5a`：feat(剧情推进 ②): 推进入口统一到本拍动作表（beatProgress.ts）——手打对不上不推进只提示并记 miss；撤掉通用停滞代结算与空转自动启程；跨国启程改走地图
- 前置独立叙事时限提交 `511052a8` / `45fde7b8` 保留，未修改 narrativeTurnBudget 配置或时限实现。`e174ed57` / `5667716d` 的相冲突行为由上述两提交与本轮统一写回取代。

## 本轮工作区交付

1. `sceneModule/host/combatWriteback.ts` 定义 CombatResult、统一气血/伤势/短期记忆写回及判负首行。场面每拍同步仍保留可恢复的掷骰检查点，状态投影调用同一写回函数而不重复记录收场记忆。收场、随机战、自由交手与旧判定余波共用写入口；自由行动结果不再重复计算气血。
2. 修复气血 1 → 倒下 → 恢复 1 时因为前后相等跳过战斗结果的问题。自由交手判负首行在普通回合成功后同步至最终响应与历史；失败回合沿用事务快照回滚。伤势只采用引擎给出的结构化状态，不根据低气血猜伤势。
3. 剧情战缺少作者败局出口时写 gameOver，并记 LCQ-SAV-055；作者的 continue、lose 收束和国家线 `story.lineOutcome` 保持。秦 Q-20/Q-21 的 fatalEventIds 在两份数值配置与 registry 登记；两拍尚未启用，未擅自补扶持对象或第三幕剧情。
4. LCQ-SAV-056 记录 combat.writeback（来源、气血、判负、伤势、来源判定/合同与回合）。沿用 sceneModule / combat 类；ERROR-CODES 与 DEBUG-LOG 同步。新增战斗元数据纳入判定回执规范化与防篡改校验，避免旧判定可信回执失效。
5. 保留并实跑 reportEf57 中新档逐拍点 action 到 s03_07（当前默认线实际 id 为 `lcq.event.iron_bridge_ambush`）、s01_05 后启程接 s02_01 王哲传功、南荒判负首行与记忆、手打 miss、空转不自动启程、跨国地图及 s01_06 deadline 配置回归。补齐旧 runtime 检查早于停滞累加导致的晚一回合问题：发送事务内用已有 forcedWorldEventIds 预备到点，失败随快照回退，玩家动作仍优先；精确测试默认第 5 回合、配置改为 2 后第 2 回合收束；没有 deadline 的拍不会通用代结算。
6. 增加 combatWriteback 五项测试、回执元数据篡改/重载断言；更新旧战败结局测试，要求判负首行 + 原结局正文，原正文只出现一次。
7. 为 vue-tsc 零错误修复模板联合类型、空档访问、动作图标字段、结局来源类型及现有货币显示引用。APIManagementPanel 只有非空类型断言，编译后无行为差异；没有修改模型/API配置或读取凭据。

本轮未改 builtins/data、canon-authority-overlays 或 generated/catalog.json，故无数据双写、manifest 重算或 NAS 同步事项；现有 s01_06 作者合同保留，通过已提交的 applyBeatDeadlines 读取配置对齐旧档快照。

## 验证

- 战斗与旧判定专项：74/74 通过。
- 新增 combatWriteback：5/5 通过（包含真实宿主 gameOver、日志与正文，不调模型）。
- content-packs --check：通过。
- 最终 npm test、tsc、vue-tsc：待最终全量运行结果回填。
- 冻结文件需要解冻的点：**无**。本轮 `src/**/runtime.ts`、`src/utils/AIBidirectionalSystem.ts`、`tests/frozen-baseline.json` 无差异。
- 未进行真实模型调用、浏览器/真机验收、push 或部署。

## 提交阻塞与尚未落地项

`npm run canon:build` 在任何构建步骤开始前失败：缺少 `mod-kit/generated/deepseek-v4-flash/qingyu/stages`（ENOENT，scripts/canon-build.mjs:41）。用户提供的 AGENTS.md 提交纪律明确要求该命令全绿才可 commit，因此本轮没有新增提交，未假造源数据、跳过门禁或用 --fast 冒充通过。

恢复正典构建源后可按三批提交：①战斗统一写回/失败策略/日志及相关测试；②deadline 精确回合修复与回归；③Vue 类型检查修复及交付记录。各批均须重新通过 canon:build 后提交。

秦 Q-20/Q-21 仍为待裁定剧情，见 `docs/handoffs/2026-10-28/QIN-FILL.md:30`：本轮交付的是可接入的已定判负策略与测试，不能宣称已实机跑通尚未启用的两拍。其余要求已有离线证据，真实模型与浏览器表现仍未测。
