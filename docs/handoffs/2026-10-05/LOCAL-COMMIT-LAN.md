# 本地整批提交与LAN刷新（2026-10-05 13:20授权）

本次一次本地提交包含：事实/秘密/好感与角色ID账本的累积依赖、称呼分出口/逐章投影、南荒返修及原著冲突勘误、E07新版与F13大败结局配置、结局配图与资源、模块策划sceneModule/战斗试玩实现与测试、对应数据/生成产物/交接。

未修改合规内容；未强制加入ignored源文件或产物；_newbot_tmp原始试玩记录和临时文件排除。没有推送。

提交前门禁：tsc0错误；npm test 1457项＝1452通过/0失败/5跳过；canon:build全绿54.1秒。首轮canon单测发生Node IPC deserialize异常，scenarioModStoryContext单独31/31过、完整canon重跑全绿，未改测试期望。git diff --check通过。

LAN发布：提交后以git archive生成该commit独立快照，r13lan监听0.0.0.0:8100，继续使用原r13/lan/save-storage。其它端口和测试快照不动。发布具体commit、URL及HTTP检查由提交后回报与r13/lan发布记录确认。这里只验证包刷新及可加载，不等于110回合剧情真机通过。
