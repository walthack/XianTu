# CG

用户 2026-11-16 定：新的立绘、场景图、CG 都放在仓库 `src/assets/` 下，各一个子目录（与 `endings/` 并列）。本目录放CG。

- 文件名约定：`cg/<包id>/<事件id>__<序号>.<扩展名>`
- 扩展名只用小写的 png／webp／jpg／jpeg。
- 放进来的图要在所属内容包的 `assets.json` 里登记才会被用到；登记的 `file` 从 `src/assets/` 起算（即以 `cg/` 开头）。格式与缺图回落见 `docs/handoffs/2026-10-11/CONTENT-PACK-CONTRACT.md`「图片挂位 assets」。
- 界面还没接（怎么摆未定；接入要改构建配置，须先问用户）。现在放图进来不会显示，也不影响游戏。
