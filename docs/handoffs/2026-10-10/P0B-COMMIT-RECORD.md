# P0-B · 合包部署源码版本固定（2026-10-10）

用户授权执行P0总体计划，提交本轮工作区及交付文档，不推送。对应现有8097部署脚本SHA-256：`aef6963f89fd18e9afe4c046cc8a91d073f41216939f93e30e19efc6f79a58f4`。此处“对应源码”不宣称含生成时间戳的bundle能逐字重现，提交后临时重建单独记录。

## 范围

原12个tracked工作区改动：PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md、阶段02 overlay及对应builtin、builtin registry/manifest、MainGamePanel、naturalIntentRouter、runtime、AIBidirectionalSystem及两项定向测试。
另纳入docs/handoffs/2026-10-07、2026-10-08、2026-10-10的公开执行/交接材料，以及本月真人反馈台账和指引。排除整个_newbot_tmp、备份bak、API配置、正式存档、构建产物、浏览器profiles与原始模型输出。

P0-A只操作冻结隔离包，不改产品；P0-B仅依赖工程门禁，不以行为PARTIAL为提交阻塞。8097及其服务进程不重建/重启。

## 提交门禁

本次重跑type-check通过；完整canon:build通过（182.4秒），37关和其余门禁全绿，1632测试中1627通过/0失败/5跳过。另按任务卡运行npm test通过（1632项，1627过/0败/5跳，9.3秒）；git diff --check通过。日志仅本地保存在_newbot_tmp/p0-execution-20261010。

提交使用明确路径清单，提交前初始索引为空，脱敏扫描无密钥命中；不纳入其他任务文件。实际commit身份查本记录的首次提交及git log；最终状态会另记精确hash。推送需另外授权。

## 实际提交与重建对照

源码固定提交：`2319cc55`，23文件（原12个tracked改动+公开交接/当前玩家指引与台账），未推送。提交后的临时webpack构建到 `_newbot_tmp/p0-execution-20261010/rebuild` 成功；8097包未重建/重启，served SHA仍 `aef6963f89fd18e9afe4c046cc8a91d073f41216939f93e30e19efc6f79a58f4`。

临时重建SHA：`ada9bfa36782411623f5847505459abce18ca64f584875dae1bead1c950e72a1`，与部署包并非逐字一致。实际差异来自提交前canon门禁刷新registry版本日期和generatedAt时间戳，2319cc55中已经是新元数据；临时webpack只是将该版本打包，而非重建时才生成这些差异：旧cr-2026-10-09-fb2192f0bf20d813/2026-10-09T17:02:39.501Z，新cr-2026-10-10-fb2192f0bf20d813/2026-10-10T12:57:22.450Z。两bundle将实际版本与时间戳归一化后全文件一致，未发现行为源码差异。本地对照证据为reproducibility.json；按计划登记不可逐字复现原因，不阻塞提交。

后续换8097包必须先有对应源码commit，再记部署包哈希；此规则不宣称由工作区生成的新时间戳天然可重现。
