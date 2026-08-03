# 单机化清理 G1：公共入口与运行时副作用

## 目标

先把用户可达面与正常游戏回合收成单机，避免账号、联机游历和创意工坊继续被误触；本批不删除旧联机角色或 IndexedDB 数据。

## 已完成

- 首页只保留单机入口；新角色由应用层再次强制写为 `单机`，激活槽固定为 `存档1`。
- 删除 `/login`、`/account`、`/workshop`、`/game/travel` 路由；旧链接统一回首页。
- 删除非游戏菜单中的账号/工坊入口和游戏侧栏中的穿越/后台入口。
- 删除应用在线心跳、页面卸载穿越 beacon、启动时穿越日志补发。
- AI 回合不再向联机服务器补发日志；旧 `系统.联机.服务器日志` 命令只被忽略，不写入存档。
- 世界地图不再显示联机世界主人标记或联机文字地图；主阅读面不再显示穿越状态。
- 旧联机角色仍显示在角色列表，但只读保留、不会验证 token、跳转登录或拉取远端存档。

## 明确保留

- IndexedDB 本地角色/存档与定时保存链。
- API 管理与玩家自带模型配置。
- `src/utils/cloudDataSync.ts` 及 devserver 本地存档链。
- 旧联机角色与原 IndexedDB key，直至下一批完成可恢复迁移。

## 验证

- `node --test tests/single_player_surface.test.mjs`：4/4。
- `npm run type-check`：PASS。
- `node --test --test-concurrency=1 tests/*.test.mjs`：542/542。
- `npm run build:single`：PASS。
- `npm run canon:build`：37 关、542/542、canon 执法与合同校验全绿。

首次并行 `npm test` 出现一次 Node test runner 的跨进程反序列化错误；对应 `r3_5_npc_private_knowledge` 单文件复跑 11/11，随后串行全量 542/542，判定为 runner 瞬时故障而非项目用例失败。

## 下一批

1. 检测旧联机角色是否有本地 `云端修行` 缓存，提供复制到新本地槽的可恢复迁移。
2. 迁移成功前不删除旧 key；迁移结果需可重放、幂等并保留失败提示。
3. 迁移闭环后再删无引用的 Login/Account/Workshop/OnlineTravel view、service、API、prompt 与 i18n 死代码。
