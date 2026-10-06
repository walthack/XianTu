# 第1阶段收口补挂 W-48

依据剧情侧人物状态B类4.3与31号§23。只补挂，不开启第2阶段，不回退主模型路由。

## 文件与行为

- `src/modules/sceneModule/contracts/statuses.json:465`：新增统一状态 `yin.sha_arm`（阴煞噬臂轻档），来源、外貌与近战出力影响、解除规则放在目录。原稿未定扣幅/根治时长，本轮仅描述性效果，不加数值、自动倒计时、休息即愈；等明确解除事件才消除。仍可参战，化虎暂鼓肌肉不算治愈。该定义不绑定角色id，普通状态接口可给任一符合成因的人使用。
- `src/modules/sceneModule/contracts/f13.json:377`：胜利fixedCosts给原著被噬臂者wu_er_lang引用 `yin.sha_arm`、severity1，不内嵌效果；输了/弃守进E07，不挂这项收束代价。合同升至v6，v5加入兼容版本，旧场内进度/骰流不重置。未碰F14/W52龙爪废功。
- 同文件`:424`：requiredFacts引用W49娄蒙可救、萨安默认死、硬救须有人替代被吸；W50心脏仅叙事物件不入玩家背包、星阵仍能拉心。奖励白名单保持空；本轮不扩救援动作/结算流程。
- `tests/sceneCommonCapabilities.test.mjs:23`：撤除状态id未提供的过期断言，新增胜利轻档、败局/弃守无该代价、按角色id写回、JSON读档恢复、不致倒下、不自动治愈、无心脏奖励测试。
- 交接与共享索引：COMMON-CAPABILITIES-STAGE1、COMBAT-WIRING、PROJECT-STATUS、PLANNING-ROUNDS；此前“待id”记录为历史，本节覆盖。

## 门禁与包

定向22/22；tsc0；串行全量1516项，1511通过/0失败/5既有skip。canon:build全绿60.7秒（内含同计数单测），git diff --check通过。门禁后8097已重建，LAN与本地逐字节一致，MD5 `f5e92d4eeb2a2418778fb3127d3ec8fc`。日志 `/tmp/xiantu-w48-{focused,tsc,full,canon,8097}.log`。
没有真实模型/玩家复测；不提交推送、不删除、不改合规、不操作受保护端口/PID；既有主模型听后台配置完整保留。
