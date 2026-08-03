# 单机化清理 G4A：创角会话固定单机

日期：2026-08-03

## 结论

创角流程现在只有一种会话形态：单机。页面、store 与五个选择步骤不再保留可切换的云端角色模式，新角色 payload 固定写出 `单机`；本地创角素材、剧本预制、自定义条目与本地 AI 推演不变。

## 删除的旧链路

- 创角 store 的 `single/cloud` 模式状态、切换器与云端初始化分支。
- 创角页的联机模式展示、token／后端登录门禁、仙缘信物弹窗、兑换码验证与云端 AI 保存。
- 世界、天资、出身、灵根、天赋及预览中的 `isLocalCreation` 双分支。
- App 启动创角时多余的模式 setter。

## 明确保留

- `CloudDataSync` 按钮与 `fetchAllCloudData()`：用户仍可显式获取云端创角素材并合并到当前单机选择集。
- IndexedDB 中的 `customCreationData`、本地素材与自定义增删改。
- 剧本模组预制、七步创角、开局 AI 生成配置与最终 `creation-complete` 事件。
- 旧联机角色 profile、旧存档 key、只读展示与复制为单机角色的 G2 迁移链；本批不触碰角色存档。

## 回归

- 新增静态合同：创角 view/store 不含联机会话、兑换码或 token 门禁，payload 固定单机；同时断言云端素材同步函数仍存在并调用五类素材 API。
- 将本批修改的创角 view 与步骤组件加入 SFC 编译回归。
- `type-check`、定向 7/7 回归、37 关 `canon:build`（552/552）与 `build:single` 全部通过。

## 下一批

G4B 收口 `characterStore` 中的联机角色创建、联网加载、云端保存/回写与旧多存档分支；旧联机 profile 继续只读保留，只允许本地缓存复制迁移。随后清理 Save、GameVariable、Sect 与 game-map 的服务器权威展示尾巴。
