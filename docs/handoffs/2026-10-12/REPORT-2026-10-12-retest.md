# 1012RETEST2 补测续跑报告（2026-10-13）

## 范围与门禁

- 仅做 UI 真机复测；未改产品源码、未提交或推送、未重建或重启 8097。
- 开测与收测均核对到 8097 listener PID `65144`、`dev/combat-trial/serve.mjs --port 8097 --host 0.0.0.0`，`combat-trial.js` 为 `23,116,160` 字节，SHA-256 `f112193cb6bc9db5bf036aa9e2dd4cafceed401b52c9c06ed0ee0fdf818431a8`。本轮只读 GET。
- 私有 profile 的 `main`、`instruction_generation`、`text_optimization` 均指向 `api_1782316385574_8wsfb6ors / MiniMax-M2.7-highspeed`；Jev 与 Deepseek 配置在 profile 中禁用并从分配中移除。三项完整预检快照在 `evidence/preflight-routing-snapshot.json` 与 `evidence/preflight-nanhuang1-routing.json`。恢复页面的首个模型请求前复核通过；本次实际聊天请求均由拦截器确认模型为 MiniMax-M2.7-highspeed，未向 Jev 或 Deepseek 发送请求。
- 15 份受保护文件逐项比较 SHA-256、大小、mtime，全部不变；正式 API 配置文件也未变（SHA-256 `8e5b312ffec5413c6863119f9d32a35966e09841f864b889ea5fd0437f4c2b26`）。前后清单见私有证据 `guard-pre.json`、`evidence/guard-post.json`。
- 浏览器将云存档写入请求拦截在私有 profile；没有写入 8097 存档服务。无骰点控制、无重掷。

## F07 第 87 章盘问与 UI 导出

以真实败局档 `CF07-lose-full-save.json` 经游戏 UI 导入，沿真实路径推进至第 87 章并完成盘问，随后从游戏 UI 导出存档。结构化结果：

- `currentChapterId = lcq.chapter.stage_05b_investigation`
- `lcq.f07.escaped = true`
- `lcq.f07.geluo_checked = true`
- `lcq.f07.geluo_suspicious = false`
- 社交判定预览 DC 11、加值 +1；自然判定成功，盘问链路触发。

**门禁：PASS。** UI 导出及 SHA-256 在 `evidence/structured-save-verification.json`；原始导出为 `evidence/exports/1791822524170-仙途-F07真实败局来源-2026-10-13.json`。另一份盘问后导出 `1791822501256-...json` 同样保留两个必需标记。

## F09 一阳记录持久化

F09 阴煞战后第一份 UI 导出确认：`event.yiyang_repels_yinsha.done = true`、`scene.combat.f09.yinsha.done = true`、`scene.combat.f09.yinsha.outcome = win`。但在随后推进 F07 并再次 UI 导出同一角色存档时，`event.yiyang_repels_yinsha.done` 已缺失；`scene.combat.f09.yinsha.done = true` 和 `scene.combat.f09.yinsha.outcome = win` 仍在。

**门禁：FAIL（持久性缺口已复现）。** 不能据初次导出判定事件标记已持久保留。初次导出 `evidence/exports/1791821780516-仙途-F07真实败局来源-2026-10-13.json`；后续盘问导出见上一节。未改产品数据或源码。

## nanhuang-1 从五原断点继续

通过清羽记开局试玩 UI 的“继续上次试玩”加载原隔离档；断点为五原白湖商馆、已谈妥六十金铢并取出器物。随后自然推进：取得阿姬曼身契 → 选择当面撕契还她自由、改道出城 → 武二郎明确答应同行 → 铁索桥伏击。

铁索桥第一拍攻击预览为难度 16、加值 −4、失败率 75%、大失败率 20%。自然骰面 3，总值 −1，判为大失败；角色获得失衡及外伤。第二拍在重伤劣势下选择防守，预览加值 −7、难度 12；自然骰面 1，总值 −6，再次大失败并倒下。UI 显示“游戏结束”；结构化场面历史为 `combat.f01.iron_bridge / outcome=lose / endingId=lcq.ending.fail.combat`，来源事件 `lcq.event.iron_bridge_ambush`，结算回合 32。

**门禁：到达允许的真实败局终点后停止；未到 `lcq.event.enter_dong_with_migu`。** 本轮没有重开或重掷。终态 UI 快照为 `evidence/050-NH1-terminal-final-diagnostics.json`，只读结构化终态为 `evidence/terminal-game-state.json`。本段手感偏难：五原交涉节点不需掷骰；铁索桥两次检定均自然大失败，第二次已经进入倒下终局。

## 30 秒与请求诊断

三个页面诊断代次分别为 F07 到南荒新档前、nanhuang-1 初次推进、nanhuang-1 恢复后到终局。按页面内请求 ID 去重，合计 **141 个请求、64 个回合**：132 completed、6 timeout、3 cancelled；全部 HTTP 状态为 200，**没有 503**。模块请求总数：narrative 43、intent 39、memory 35、audit 13、embedding_index 11。完整逐请求分类、各回合耗时和汇总见私有 `evidence/diagnostics-rollup.json`；页面快照：`093-pre-nanhuang1.json`、`212-NH1-action-29-final.json`、`050-NH1-terminal-final-diagnostics.json`。

所有未完成请求逐项如下：

| 页面 / 请求序号 | 模块 | 前台/后台 | 结果与阶段 | 取消来源 |
|---|---|---|---|---|
| F07 前新档 / 27 | audit | 后台 | 30.002 秒 deadline；first_byte / await_content；HTTP 200 | deadline |
| F07 前新档 / 39 | audit | 后台 | 30.002 秒 deadline；first_byte / await_content；HTTP 200 | deadline |
| F07 前新档 / 54 | memory | 后台 | 30.001 秒 deadline；first_byte / await_content；HTTP 200 | deadline |
| F07 前新档 / 65 | audit | 后台 | 10.095 秒后 cancelled；HTTP 200 | foreground_yield：前台新回合启动时由请求生命周期逻辑取消 |
| nanhuang 初次 / 28 | narrative | 前台 | 30.002 秒 deadline；first_byte / await_content；HTTP 200 | deadline |
| nanhuang 初次 / 38 | audit | 后台 | 18.347 秒后 cancelled；HTTP 200 | foreground_yield：前台新回合启动时由请求生命周期逻辑取消 |
| nanhuang 初次 / 58 | audit | 后台 | 18.271 秒后 cancelled；HTTP 200 | foreground_yield：前台新回合启动时由请求生命周期逻辑取消 |
| nanhuang 初次 / 62 | audit | 后台 | 30.001 秒 deadline；first_byte / await_content；HTTP 200 | deadline |
| nanhuang 初次 / 67 | audit | 后台 | 30.002 秒 deadline；first_byte / await_content；HTTP 200 | deadline |

两个初次页面各有 2 个前台就绪时间超过 30 秒（F07 页面约 31.6、32.9 秒；nanhuang 初次页面约 50.7、35.9 秒）。计入后台收尾后，总耗时至少 30 秒的回合分别为 13、14 个；恢复页没有 30 秒前台回合或中止，最慢请求是后台 audit 18.79 秒。所有页面最终快照均为 0 个在途请求。

另有 UI 自动化等待记录：nanhuang 恢复页的阿姬曼身契动作，助手触发器约 177 秒后才返回，因为页面已显示剧情分支、等待测试者选项，触发器一直等输入框重新可用；期间无模型请求、无在途请求、页面已停止 processing。分支选择后继续正常推进。这是测试驱动器等待 UI 决策的耗时，不应归为 177 秒模型请求或服务端卡死。

**诊断门禁：未发现 503；6 个 30 秒 deadline 与 3 个后台前台切换取消均有模块、前后台、阶段及取消源。30 秒 SLA 仍未通过。**

## 证据文件

证据保存在权限受限的 `_newbot_tmp/1012retest2-codex-01/evidence/`（目录权限 700）。汇总文件为 `structured-save-verification.json`、`diagnostics-rollup.json`、`terminal-game-state.json`、`guard-post.json` 和 `browser-events.json`。无 API 密钥写入报告、快照或事件日志。
