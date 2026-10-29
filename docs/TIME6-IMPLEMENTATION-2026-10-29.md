# 六档时间实装 · 2026-10-29

状态：**PARTIAL，未提交、未 push**。基线 `aced8310e354f8c321e2743bd1fdca7fbb4642dd`，分支 `feat/fast-no-legacy`。全链完成仍受下述冻结缺口与生产源依赖阻挡。

## 已实现

- `story.actionTime` 配置及逐叶 numbersRegistry：六档、数日上限30、修炼1–3650、30×12历法；SAV035–040连续登记。非数日days忽略并诊断。
- 非冻结 actionTime 服务：可信来源选择、0分钟、动作回执幂等、顺序修炼、拍卡档位与旧拍120兼容。dayPart改为显示；路程通过既有runtime克隆预演提前结算相同行旅回执，不改变正式runtime的回合/事件推进，不叠加演出耗时。
- 模块演出JSON信封保留action_time；缺档片刻兜底，不重试正文。旧自定义提示升级说明与实际编译边界协议提示同步。
- 模型全局日历/相对日/祖先覆盖/时间回执禁写；跨国及未知位置写入拒绝，正文明确跨国到达守卫。状态生成时间允许。
- 修炼选择结构化传递，旧按钮打开天数选择，队列多个选择顺序结算，取消/改输入清除输入选择，成功提交后才消费队列。Vue响应式选择先转普通对象，防DataCloneError。
- 整场战斗收束计片刻；内容包stage_01末拍s01_06首次成功完成四年跳跃，旧完成档不追补；runtime.ts未改。
- 单一历法换算、旧绝对分钟原子平移、calendarVersion幂等；伤势/麻古/救治/自由行动冷却与重复窗口保留elapsed，旧效果保留剩余时长，永久null保留。统一推进后同步麻古与到期状态，大跨度跨过两个阈值直接按实际经过时间结算。
- 地图前往与内容包mapRoutes合同：端点、登记路程、解锁事件、过期起点、重复回执核验。**生产主动跨国路线表为空**：仓库无获批主动跨国路程资产，未估算或开放；南荒既有forced路线仍由原入口自动处理。合法跨国路线用离线夹具验证。
- 国别：总表 **86个唯一地点**（3541处JSON定义/阶段副本字段），南荒TS节点同步国别；53个未判定地点留空。原region、坐标、人物保护字段不变。

## 冻结差分

仅AIBS原行号：导入、306 ProcessOptions、873读取模块正文、900/916–920保留action_time、1902–1918透传可信选择与动作ID、2736–2744委托统一时间服务。其余未改。frozen-baseline仅更新AIBS哈希及授权说明。

- AIBS SHA-256：`aa5c87970f0ea7c616fe3b3a285eb50e7513b5799ff29e4bde60eea40942c382`
- runtime SHA-256：`ef306b5b9bd980b9d995e7923323c3610bb0397d661682b1a575619e30a17bef`（与原基线一致）

## 验证证据

- 最终 `npm test`：**2932测，2919通过，0失败，13跳过**，243.6秒；日志 `/tmp/xiantu-time-final-verified.log`。
- 新增 `tests/actionTime.test.mjs`：52测全部通过（六档/禁写/地图合法及拒绝/修炼/历法迁移/国别/作者跳跃/阈值补结算）。
- `npm run type-check`：仅 `src/modules/sceneModule/host/controller.ts:202` 既有TS2559；日志 `/tmp/xiantu-time-final-verified-tsc.log`。
- `node scripts/content-packs.mjs --check`：PASS，目录版本 `1571ec96c99f5120`，只由编译器生成catalog。
- 四个修改Vue组件 parse/compileScript/compileTemplate：PASS；`git diff --check`：PASS。
- 冻结/诊断守卫20测PASS。原有行为断言按本次用户裁定更新（路线0.5天、普通缺档15分钟、全面日期禁写、JSON协议字段），未跳过用例。
- `npm run canon:build`：**FAIL**，在枚举 `mod-kit/generated/deepseek-v4-flash/qingyu/stages` 时ENOENT，未进入管线。未伪造源数据或放宽门禁。

仅离线替身与存档夹具、组件编译；浏览器UI、真实模型、真人体验、付费二审未测。没有读取凭据或调用付费API。

## 未完成与下一步

1. 旧叙事AIBS standardize（原约5276–5305）丢弃action_time，不在用户解冻行段中，**未擅改**，目前旧链只能片刻兜底。待额外授权的一行补丁已写到工作区草稿；异步澄清尚未答复。不能把模块链通过声称为全链完成。
2. 恢复当前正典对应的权威生产源（阶段目录及角色卡等），完整跑canon:build。其他工作区旧源未获一致性证明，未反向导入。AGENTS要求canon:build全绿才能commit，故当前**没有新提交哈希**；NAS镜像同步未做。
3. 策划补主动跨国路线端点/路程/解锁资产，再启用生产路线并做浏览器交互与真人体验验收。

外部交付：
- [方案外问题](/workspace/narrative-drafts/2026-10-29-六档时间实装-方案外问题.md)
- [待批准旧解析器接线补丁](/workspace/narrative-drafts/2026-10-29-六档时间-待批准旧解析器接线.patch)
- [地点国别未判定清单](/workspace/narrative-drafts/2026-10-29-地点国别未判定清单.md)
