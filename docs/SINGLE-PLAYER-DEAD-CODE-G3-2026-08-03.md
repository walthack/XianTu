# 单机化清理 G3：联机死代码与运行态收口

日期：2026-08-03

## 结论

G3 删除了已经从路由与生产 bundle 不可达的旧联机页面／服务，并移除了仍会被打包的联机 prompt 与 AI 穿越注入。应用读取任何 V3 存档时都只建立单机运行态；旧联机字段继续保留在 schema 与迁移兼容层中，不删除来源缓存。

## 删除前证据

- 3 个旧 view、2 个联机面板只被自身或同一死代码簇引用；路由中无动态／静态入口。
- travel、presence、workshop、travel-note queue 的 API 只被上述死代码簇引用。
- G2 后的 `build:single` 产物中，`OnlineTravelPanel`、presence/workshop endpoint 已不存在，证明这 6,120 行叶节点不进入发布产物。
- 同一产物仍包含“联机模式基础规则”“系统.联机.服务器日志”“联机穿越 - 入侵者身份”，说明 prompt 与 AI 注入不是纯仓库垃圾，必须显式拆除。

## 实施

### 1. 删除不可达叶节点

- 删除登录、账号中心、创意工坊 view。
- 删除联机游历面板、联机地图面板。
- 删除 onlineTravel、presence、workshop、travel-note queue 的 service/API 及 barrel export。

### 2. 收口 prompt 与 AI 运行态

- 删除 5 组联机 prompt 定义、分类、条件过滤与自动注入。
- 删除 `AIBidirectionalSystem` 内穿越状态大段 system prompt、入侵者身份和离线玩家代理注入。
- 保留窄范围安全兜底：若旧自定义 prompt 仍生成 `系统.联机.服务器日志` 命令，单机版继续丢弃，不写存档。
- `gameStateStore` 读写统一生成单机运行态；旧存档里残留的房间、玩家和穿越目标不恢复，地图坐标不再因旧联机标记被剥离。

### 3. 清理展示尾巴

- 提示词管理页移除联机只读条件，单机版始终允许本地编辑。
- 删除已经没有调用者的登录、穿越、邀请码、离线代理与入侵报告翻译键。

## 明确保留

- `src/utils/indexedDBManager.ts` 的旧 `云端修行/存档` 本地 key 兼容。
- `src/utils/legacyOnlineSaveMigration.ts` 与 profile 上的迁移来源标记。
- V3 `系统.联机` schema 字段（写出固定单机形状，保障旧档与 validator 兼容）。
- `src/utils/cloudDataSync.ts`、`src/services/api/cloudData.ts`、API 管理和 devserver/save-storage 链。
- 旧联机角色与其 IndexedDB SaveData；本批不删除、不覆盖来源。

## 回归门

- 新增死文件清单、prompt 注入缺席、兼容链保留的静态回归。
- 扩展 game-state 实例回归：输入带旧房间／穿越目标的 V3，输出固定单机态且保留位置坐标。
- `type-check`、定向单机化测试、37 关 `canon:build`（551/551 测试）、`build:single` 与生产 bundle 字符串核验全部通过。
- ESLint 对本批改动源码为 0 error；既有宽类型等 warning 不在本批扩大范围。
- 提交后交 Claude 只读二审；P0/P1 修复，P2/P3 仅登记。

## 下一批边界

创角 store、角色 store、Save/GameVariable/Sect 等可达文件中仍有不可触发的旧联机条件分支。它们不再能从 UI 进入，但仍增加维护面；下一批按调用点逐函数删除远程角色创建／云存档分支，同时继续保留“单机获取云端创建素材”的 `cloudDataSync` 能力。
