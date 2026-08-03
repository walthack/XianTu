# R3-5 关系密档小批量：谢艺持有小紫父系事实（G1）

日期：2026-08-03

## 结论

本批只新增一条 confirmed NPC 私有事实：谢艺知道“小紫是岳帅的亲生女儿”。该事实跨 `lcq.stage_05→06` 幂等继承，不进入普通关系、关系矩阵、通用 prompt 或角色档案；当前没有匹配的确定性玩家揭露 effect，因此运行时只向聚焦谢艺提供不含答案的行为 cue。

## 新边界

- holder 与 subject 必须是当前关卡实体。
- 秘密对端岳帅不在当前关卡，不为通过校验而物化；`objectId` 只允许引用全局 registry 已登记角色。
- registry-only object 仅用于语义匹配以及规范名／全部 aliases 的安全闭包；不会投影角色档案或关系事实，未知 ID 硬拒绝。
- 同一 holder 有多条已确认 claim 时，明确点名“小紫／生父”等主题只核对对应 claim；无主题的泛问才要求全部 claim，避免扩量后被门禁强迫连带披露。

## 回归

- validator：registry-only object 接受，未知 object 拒绝。
- holder/non-holder：谢艺只得无答案 cue，云苍峰零注入；通用 prompt state 无私有账本或 claim。
- alias 矩阵：小紫／紫妈妈／紫丫头 × 岳帅／岳鸟人／岳鹏举／武穆王 × 全 predicate，在正文与结构化命令两通道均拒绝。
- 生命周期：模拟玩家 confirmed 后，谢艺可逐字复述原子 claim；普通关系写入仍按裁定 #149 永久拒绝。
- JSON 重载与 `stage_05→06` 转换保持 factId 幂等、来源与 learnedAtTurn 不丢失。

验证：`npm run type-check` PASS；聚焦测试 11/11 PASS；`npm run canon:build` 37 关 schema、人工裁定执法、主轴／存档契约、538/538 测试全绿。

真机前置闭环：job `claude-2026-08-03T00-17-22-363Z-18507b54`，B1 fail-closed + B2 命令拒绝 + C non-holder 防泄漏共 22/22 PASS，源码守卫与工作树均干净。
