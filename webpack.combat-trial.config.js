// 战斗试玩的独立构建：复用主 webpack 配置（loader / alias / externals / DefinePlugin），
// 只换入口、输出目录和 HTML 模板。不改 webpack.config.js，不写 dist/，不依赖 dev-server。
//
//   node dev/combat-trial/build.mjs          # 构建 + 复制本地脚本
//   node dev/combat-trial/serve.mjs          # 0.0.0.0:8097 静态服务
import path from 'path'
import webpack from 'webpack'
import { fileURLToPath } from 'url'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import baseFactory from './webpack.config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default (env = {}, argv = {}) => {
  // 必须在调用主配置前设：局域网 IP（192.168./10./172.16-31）会被 isBackendConfigured 视为「开发服务器」，
  // 若不关远程存档，试玩档会走 /api/v1/save-storage 写进主服务的目录。
  process.env.REMOTE_SAVE_STORAGE_ENABLED = 'false'
  process.env.BACKEND_BASE_URL = ''

  const base = baseFactory(env, { ...argv, mode: 'development', watch: false })
  return {
    ...base,
    mode: 'development',
    entry: './src/dev/combatTrial/main.ts',
    output: {
      path: path.resolve(__dirname, 'dev/combat-trial/dist'),
      filename: 'combat-trial.js',
      publicPath: './',
      // 只覆盖同名产物，不清目录（不删文件）。
      clean: false,
    },
    devtool: false,
    plugins: [
      ...base.plugins.filter(plugin => plugin?.constructor?.name !== 'HtmlWebpackPlugin'),
      new HtmlWebpackPlugin({
        template: './dev/combat-trial/index.html',
        filename: 'index.html',
        inject: 'body',
      }),
    ],
    devServer: undefined,
  }
}
