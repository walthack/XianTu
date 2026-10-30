# QIN-ENTRY-20261030 · 秦入口接线

用户本轮仅解冻 runtime.ts 的秦入口接线；基于 feat/fast-no-legacy / bbcb6c3c，未提交。

## 已实现

- 内容包 manifest 的 `mapEntries` 指向 JSON 入口合同，编译器验证目标关/事件并生成 catalog。三线阈值继续读取现有 numbers 配置，不新增数值或错误码。
- runtime 仅增加 import 与 `syncPlayerLedgers` 后同步调用两行。达到 `compass.qinEntryReady` 后把已有 Q-1 商会伙计口信和两动作装入当前关；作为可选动作与主线共存。投递状态保存在系统扩展，正式存档承接预览副本才生效；跨关只恢复未选择的动作，不重新投递。“先记下”后以 done/编年史及持久标记防重复。
- 地图的现有“前往此地”按钮调用 selectMapTravel / settleMapTravel：咸阳未达标拒绝，达标切入秦关。文字意图继续只叙述准备并提示地图，两传话动作均不直接移动。
- 切关复用既有身份、相识、关系、知识、编年史及收束档继承；源运行时和位置保存于 `系统.扩展.mapEntryResume`。旧档已有 Q-1 done 而无新投递标记也不重提。未编造地图路程或旅行耗时。
- frozen-baseline 仅更新 runtime SHA-256 与 note；AIBS 哈希与 approvedAt 保持原值。

## 范围与证据

入口接线已完成；不是完整秦线全流程交付。未改 rail 首拍条件缺陷、AIBS、大祭或秦第三幕；保存续点但本批不实现秦线收束后的返回流程。浏览器、真人、真实模型体验未测。

专项：`tests/qinEntryWiring.test.mjs` 七项通过，覆盖正式主线阈值触发、先记下跨关去重、未达标拒绝、达标切关及续点、文字不切关、未选择换关、旧档与预览隔离。全量（非沙箱复跑）2957 项：2944 pass / 0 fail / 13 skip。

此前沙箱内的 spawnSync EPERM 失败为沙箱环境所致，非沙箱复跑全部通过；debugLog 路径归类已补 mapEntries.ts。

`npm run type-check` 仅 `src/modules/sceneModule/host/controller.ts(202,42)` TS2559（允许的既有错误）；无新增类型错误。内容包 `--check`、`git diff --check` 和冻结哈希校验通过。runtime 新行号 1、4034，各增一行；原 rail 3967–3980 内容未改，AIBS 无 diff。

后续建议：按独立授权处理返回流程与 rail 首拍缺陷，开展浏览器/真实模型验证。控制面与审核路由不变。
