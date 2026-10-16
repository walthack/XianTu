# 1012DEPLOYTRACE：30秒中止复测与日志导出

## 固定开测步骤 · 1012TESTCFG（用户2026-10-12 22:16裁定）

后续执行本文真机/复测前，先只读正式 `.xiantu-server/save-storage/user_config_api_management_v1.json` 的实际配置，注入本轮**测试私有浏览器profile**，不改原文件、不上传正式后台、密钥不外露；加载/刷新前在测试驱动中隔离API配置同步读取与写回，避免正式后台覆盖私有副本。私有副本main固定「minimax high speed」：`MiniMax-M2.7-highspeed`，`api_1782316385574_8wsfb6ors`；Jev/Deepseek按需付费，测试一律不用，所有指向它们的功能/模块/继承分配均在私有profile改到此ID，并禁用被禁连接以防回退。首个请求前核对页面实际路由与发送前payload.model，先把实际apiId/model写进报告；配置不可读、目标连接不可用、仍指向禁用模型或回退`gpt-4o`默认时，拦截请求、停下报告，不得用默认值开测。

本条优先于下文旧模型选择/“沿用后台main”说明，只约束新轮测试，不改写历史结果；原环境与存档守卫继续有效。组织者在开测前完成配置，测试者不接触密钥。完整注入、继承检查与安全报告字段见[统一开测规则](../../TRUE-DEVICE-TEST-API-PREFLIGHT-1012TESTCFG.md)。


用户2026-10-12 09:02授权。源码HEAD：`af7aa6d94e220f7fde4af55094d09392e64797e9`。本次只部署已有诊断，不改超时、重试、输出预算、模型策略或tuning。

部署包SHA-256：`f112193cb6bc9db5bf036aa9e2dd4cafceed401b52c9c06ed0ee0fdf818431a8`。完整门禁及发布检查见本文末交付记录。

## 日志在哪里

- 浏览器开发者工具Console：`[AI请求诊断]`记录每次传输、发起取消与实际结束；`[AI回合诊断] foreground_ready`和`background_drained`分开记录前台恢复操作与后台全部结束。
- 页面内存快照：`window.__xiantuRequestDiagnostics.snapshot()`，含最近500条请求及500条回合。记录时间为Unix毫秒，可结合module、turnId、generationId和requestId定位。
- **没有服务端日志文件、自动上传或HTTP日志接口**。通过下方脚本下载后，JSON文件才落到测试员浏览器的下载目录。页面刷新/关闭会清空内存；Console的Preserve log只保留控制台输出，不会保留页面内存快照。
- 手机复测需要远程调试查看手机上该页面的Console，再在那个页面执行导出；电脑上另开同一地址的Console不能读取手机页面内存。

## 复测步骤

0. 组织者先完成上方1012TESTCFG配置注入、后台配置读取隔离和实际模型核对，在报告登记；配置不通过则停止，不进入测例。
1. 在已配置的私有profile里测试开始前刷新8097页面，确保加载新包。在Console开启Preserve log、显示Info级别；执行 `typeof window.__xiantuRequestDiagnostics?.snapshot` 应得到`"function"`。不是function则当前页面未加载诊断包，先重新加载，不开始测例。
2. 按本轮固定样本正常操作，不控骰、不修改模型/超时/重试/tuning；记下样本编号、实际输入、操作时间、角色与槽、是否主动点停止/切档。上述测例说明单独填写，不把完整输入/存档/密钥混入诊断JSON。
3. 出现约30秒中止、503或长时间等待后，**先导出一次**，不要刷新、切档或重开。此时记录可能仍是running，但cancelRequestedAt已有值，说明取消已发起而传输尚未实际结束。
4. 保持同页，等该turnId的inFlightRequests和backgroundPending归零、backgroundEndedAt有值，再导出第二次。若仍不归零，约60秒后也导出一份并注明仍在途；不要为使日志“完结”主动停止请求或清状态。保留失败、取消、重试及未结束项。
5. 每个固定测例结束都导出，避免500条环形保留淘汰旧记录。连同测例说明和截图交总策划。不要导出包含Authorization/header/完整提示词的HAR作为本诊断交付。

## 导出JSON（浏览器下载文件）

在发生问题的**同一个页面Console**执行以下整段。只需把`testTag`改成测例编号；第一次/最终导出可分别用`F06-01-early`、`F06-01-final`。

```javascript
(() => {
  const testTag = 'F06-01-early';
  const snapshot = window.__xiantuRequestDiagnostics?.snapshot;
  if (typeof snapshot !== 'function') throw new Error('本页未加载诊断包');
  const data = {
    testTag,
    sourceCommit: 'af7aa6d94e220f7fde4af55094d09392e64797e9',
    buildSha256: 'f112193cb6bc9db5bf036aa9e2dd4cafceed401b52c9c06ed0ee0fdf818431a8',
    exportedAt: new Date().toISOString(),
    ...snapshot(),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `xiantu-trace-${testTag}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})();
```

快照本身不含密钥、URL、请求头、提示词、正文或原始错误。

Chrome/Edge Console也可直接复制快照：

```javascript
copy(JSON.stringify(window.__xiantuRequestDiagnostics.snapshot(), null, 2))
```

复制版需另记测例编号、源码提交和包SHA；下载脚本已包含这些元数据。若手机远程调试不支持下载，可把JSON复制保存为文件。

## 判读边界

- `timeoutPhase`保留first_byte/total/idle；`timeoutStage`细分await_headers/await_content/content_idle。它们只记录现行计时器，不代表已修好30秒中止。
- cancelSource为取消路径，未知外部来源保留caller，不猜成用户主动停止。cancelRequestedAt与endedAt分开，endedAt为空时仍在途。
- firstContentAt只认可有效正文；心跳、推理和空白不算。TavernHelper隐藏HTTP头/流式首正文，或平台未暴露该时点时保留null；不能把null补成0或生成完成时间。
- background_drained表示已登记的请求/后台任务都结束，不等于排队待下一回合应用的记忆结果已经在新回合写入。不要把foreground_ready当全部后台结束。
- 不过滤失败、取消或重试来计算耗时；本次部署和导出验证不构成真模型性能/SLA或玩家体验PASS。


## 发布交付记录

- 从HEAD `af7aa6d94e220f7fde4af55094d09392e64797e9`重跑type-check、完整canon:build：1672过/0败/5跳（223.8秒）、内容包过期及diff检查通过。无代码改动，未新增提交或推送。
- 门禁后用标准combat-trial配置私有输出目录重建，webpack成功（5.376秒），无清目录；包与上一轮私有诊断QA包逐字同一SHA。
- 仅原8097静态产物替换，本机与`192.168.50.51:8097`、`192.168.50.164:8097`两LAN接口JS SHA一致。服务PID65144/启动时间2026-10-04 21:56:33保持不变，未重启。
- 当前220531f2旧dist完整27文件保留于 `_newbot_tmp/1012deploytrace/rollback-dist-220531f2/`，可覆盖恢复，无需删文件或重启。tuning.json原本不存在，本轮未创建/加载；超时、重试、模型策略原样。15正式存档/API文件SHA/大小/mtime前后逐项相等。
- 实际8097新包在隔离Chromium加载，诊断snapshot入口可用、0pageerror；本文下载脚本实际下载JSON，sourceCommit/包SHA和requests/turns数组结构核对通过。此次是空诊断快照的导出路径验证，不冒充真实30秒中止或模型性能验收。浏览器已关闭，下载文件与验证日志留在私有目录，未触碰正式存档。
- 私有证据：`_newbot_tmp/1012deploytrace/{before,deployed,export-check,formal-guard-final}.json`、canon/typecheck/build日志及导出JSON。当前项目整体仍PARTIAL；下一轮按本文采集真实中止日志，不追加策略优化或数值热调。
