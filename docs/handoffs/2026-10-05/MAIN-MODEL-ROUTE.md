> **当前对外包已更新**：本文主模型轮MD5 `85aeeb7fe4365fd4e5d2cef75bec1f69` 是历史验证包；W-48补挂后最新8097为 `f5e92d4eeb2a2418778fb3127d3ec8fc`，主模型听后台配置的实现完整保留。最新门禁与未测项见[日终交接](DAY-END.md)，本轮未重新构建。

# 后台主模型路由 · 2026-10-05

用户裁定四个游戏模块跟后台主模型配置，独立小改，不开启第2阶段。

## 改动

- `src/services/gameModelModules.ts:12`：删除按模型名和MiniMax端点强制筛选M3；识别、演出、记忆、审计读取 `getAPIForType('main')`。旧模块独立分配和记忆功能分配不覆盖这四个模块；其他功能未改。酒馆环境仍继承宿主主流程；请求在首次await前冻结配置的机制保留。主模型不可用时沿用API管理默认连接/无连接报错，不偷偷寻找M3。
- `src/services/aiService.ts:2169`：M3原有关闭思考保留；MiniMax直连M2.7及highspeed的模块流式请求加reasoning_split，将思考和正文分开，保留reasoningEffort=none时不把reasoning兜底成正文的机制。没有强制改写model。
- `tests/gameModelMainRoute.test.mjs`：覆盖四模块跟随主模型、旧M3/独立分配不抢路由、更换主模型生效，以及M2.7/highspeed/M3请求体和正文字段分离。
- `tests/modularTurn.test.mjs`、`tests/run4FollowupRepairs.test.mjs`、`tests/batch9Pipeline.test.mjs`：夹具明确分配后台main连接并恢复原分配；业务断言未放宽。
- 文档：本交接、COMBAT-WIRING、PROJECT-STATUS、PLANNING-ROUNDS。

## M2.7关闭思考核对

仓库此前thinking.type=disabled只覆盖M3，没有覆盖M2.7/highspeed。MiniMax官方OpenAI兼容文档明确M2.x不能关闭思考，disabled被接受但忽略；reasoning_split只控制返回字段。因此本轮实现正文分离，不声称服务端关闭思考，也不为了关闭思考强制换回M3。
来源：https://platform.minimax.io/docs/api-reference/text-openai-api （Thinking Control / reasoning_split，2026-10-05核对）。代理平台是否实现额外开关未验证，不对未知代理发MiniMax专用字段。M2.7推理token仍计输出预算，响应耗时需后续真模型观察。

## 验证与包

定向72/72；tsc0错；串行全量1515项，1510过/0败/5既有skip；git diff --check通过。canon:build全绿56.8秒，内含同计数单测。日志 `/tmp/xiantu-main-route-{tests,tsc,full,canon,8097}.log`。
8097已重建，LAN与本地JS逐字节一致，MD5 `85aeeb7fe4365fd4e5d2cef75bec1f69`。包已含第1阶段通用能力和本轮主模型配置路由。未做真实模型/UI复测；未提交推送、未删文件、未操作受保护端口/PID、未改合规内容，既有工作区改动保留。
