// 构建战斗试玩快照：webpack（development）→ dev/combat-trial/dist，并复制本地脚本。
// 不走 npm run build（它的 prebuild 会重写 builtins、跑正典校验）。
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'dev/combat-trial/dist');
const vendor = resolve(dist, 'vendor');

const webpackCli = resolve(root, 'node_modules/webpack-cli/bin/cli.js');
if (!existsSync(webpackCli)) throw new Error('缺少 node_modules/webpack-cli，请先在仓库根目录安装依赖');

const run = spawnSync(process.execPath, [webpackCli, '--config', 'webpack.combat-trial.config.js', '--mode', 'development'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, REMOTE_SAVE_STORAGE_ENABLED: 'false', BACKEND_BASE_URL: '' },
});
if (run.status !== 0) process.exit(run.status ?? 1);

mkdirSync(vendor, { recursive: true });
for (const [from, to] of [
  ['node_modules/vue/dist/vue.global.js', 'vue.global.js'],
  ['node_modules/vue-router/dist/vue-router.global.js', 'vue-router.global.js'],
  ['node_modules/lodash/lodash.min.js', 'lodash.min.js'],
  ['node_modules/jquery/dist/jquery.min.js', 'jquery.min.js'],
]) {
  const source = resolve(root, from);
  if (!existsSync(source)) throw new Error(`缺少 ${from}`);
  copyFileSync(source, resolve(vendor, to));
}
console.log(`[combat-trial] 构建完成：${dist}`);
