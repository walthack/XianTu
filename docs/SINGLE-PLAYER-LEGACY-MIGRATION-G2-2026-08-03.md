# 单机化清理 G2：旧联机本地缓存可恢复迁移

## 目标

在不恢复登录或联机入口的前提下，让旧联机角色已有的本机缓存可以显式复制为可玩的单机副本；任何失败都不得损伤来源数据。

## 数据协议

- 用户必须在旧联机角色的只读页确认“复制为单机角色”，不会自动迁移。
- 来源只调用 `loadLocalSaveData` 读取本机 IndexedDB；兼容历史 `云端修行` 与 `存档` 两种 key，不校验 token、不从远端补拉。
- Store 启动兼容层遇到旧联机 profile 会在通用展示字段就绪后立即跳过，不再自动改名槽位、删除废弃字段、改写激活槽或复制 key。
- 目标是新的单机角色，主槽固定为 `存档1`，并补齐 `上次对话`、`时间点存档` 空槽。
- `本地迁移信息` 记录版本、来源角色 ID、来源槽和迁移时间；重复执行会找到既有副本，不重复造角色。
- 若确定性目标 ID 已被其他角色占用，则递增后缀，不覆盖现有角色。
- 目标先写完整 SaveData，再提交元数据；元数据失败时回滚内存角色，保留可重试的目标记录。
- 来源角色、来源元数据及旧 IndexedDB key 永不删除；目标副本按普通单机存档链保存。

## 失败语义

- 本机没有缓存：明确报错并停止，不尝试联网补拉。
- 缓存无法迁移或 V3 校验失败：明确报错，不创建目标元数据。
- 已有迁移副本：直接复用；若其本地 `存档1` 缺失，则从仍保留的来源本地缓存重新复制。

## 验证

- `node --test tests/legacy_online_save_migration.test.mjs tests/single_player_surface.test.mjs`：11/11。
- `npm run type-check`：PASS。
- `node --test --test-concurrency=1 tests/*.test.mjs`：549/549。
- `npm run build:single`：PASS。
- `npm run canon:build`：37 关、549/549、canon 执法与合同校验全绿。
- 变更文件 ESLint：0 error；既有 `any` / 未使用变量 warning 未在本批扩修。

## 下一批

G1/G2 独立二审闭环后，生成联机模块引用图，按“不可达 → 无 bundle 引用 → 删除 → 回归”的顺序移除 Login、Account、Workshop、OnlineTravel 相关 view、service、API、prompt 与 i18n 死代码。旧存档 key 与迁移来源标记继续保留。
