import webpack from 'webpack'
import path from 'path'
import fs from 'fs'
import { VueLoaderPlugin } from 'vue-loader'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import HtmlInlineScriptPlugin from 'html-inline-script-webpack-plugin'
import TavernLiveReloadPlugin from './webpack/TavernLiveReloadPlugin.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf8'));

export default (env, argv) => {
  const isProduction = argv.mode === 'production'
  const isWatch = argv.watch === true // 检测是否是 watch 模式
  const isSingleFile = env?.single === true // 检测是否是单文件模式
  const ollamaProxyTarget = process.env.OLLAMA_PROXY_TARGET || 'http://192.168.50.51:11434'
  const backendProxyTarget =
    process.env.XIANTU_BACKEND_URL ||
    process.env.BACKEND_BASE_URL ||
    'http://192.168.50.51:8080'
  const backendBaseUrl = process.env.BACKEND_BASE_URL || ''
  const saveStorageDir =
    process.env.XIANTU_SAVE_STORAGE_DIR ||
    path.resolve(__dirname, '.xiantu-server/save-storage')

  const storageFileForKey = (key) => {
    const safeName = encodeURIComponent(key).replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    )
    return path.join(saveStorageDir, `${safeName}.json`)
  }

  const readJsonBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', () => {
        if (!raw.trim()) {
          resolve({})
          return
        }
        try {
          resolve(JSON.parse(raw))
        } catch (error) {
          reject(error)
        }
      })
      req.on('error', reject)
    })

  const sendJson = (res, status, payload) => {
    res.status(status)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.send(JSON.stringify(payload))
  }

  return {
    mode: isProduction ? 'production' : 'development',
    entry: './src/main.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: (isWatch || isSingleFile) ? 'inline.js' : 'XianTu.js',
      // clean 时保留世界地图背景：prebuild(sync-builtin-mods)先拷图 → 若全清会把图抹掉(地图底图丢失bug 2026-07-03)
      clean: { keep: /liuchao-world-map\.jpg/ },
      publicPath: (isProduction || isWatch) ? './' : '/', // dev server 用 /，打包用 ./
    },
    devtool: isProduction ? false : (isWatch ? false : 'eval-source-map'),
    optimization: {
      splitChunks: false, // 完全禁用代码分割
      runtimeChunk: false, // 禁用运行时chunk
      moduleIds: 'deterministic',
      chunkIds: 'deterministic',
      // 强制所有模块打包到主bundle
      concatenateModules: true,
    },
    performance: {
      maxAssetSize: 100000000, // 增加资源大小限制到100MB
      maxEntrypointSize: 100000000, // 增加入口点大小限制
    },
    resolve: {
      extensions: ['.ts', '.js', '.vue', '.json'],
      alias: {
        '@': path.resolve(__dirname, 'src/'),
      },
    },
    externals: [
      ({ context, request }, callback) => {
        if (!context || !request) {
          return callback();
        }

        // 检查是否是本地文件引用
        if (
          request.startsWith('.') ||
          request.startsWith('/') ||
          path.isAbsolute(request)
        ) {
          return callback();
        }

        const builtin = {
          jquery: '$',
          lodash: '_',
          toastr: 'toastr',
          vue: 'Vue',
          'vue-router': 'VueRouter',
          yaml: 'YAML',
          zod: 'z',
        };

        if (request in builtin) {
          return callback(null, 'var ' + builtin[request]);
        }

        // 对于不在 builtin 列表中的其他npm包，正常打包，不作为外部依赖处理
        return callback();
      },
    ],
    module: {
      rules: [
        {
          test: /\.vue$/,
          loader: 'vue-loader',
        },
        {
          test: /\.ts$/,
          loader: 'ts-loader',
          options: {
            appendTsSuffixTo: [/\.vue$/],
            transpileOnly: true, // Skip type checking for faster builds
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(mp3|ogg|wav|m4a)$/i,
          type: 'asset/resource',
          generator: {
            filename: 'assets/audio/[name][ext]',
          },
        },
      ],
    },
    plugins: [
      new VueLoaderPlugin(),
      new webpack.optimize.LimitChunkCountPlugin({
        maxChunks: 1 // 强制只生成一个chunk
      }),
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: JSON.stringify(true),
        __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
        'APP_VERSION': JSON.stringify(packageJson.version),
        'BACKEND_BASE_URL': JSON.stringify(backendBaseUrl), // 后端路径；开发/局域网测试默认走同源 /api 代理
        'REMOTE_SAVE_STORAGE_ENABLED': JSON.stringify(process.env.REMOTE_SAVE_STORAGE_ENABLED !== 'false')
      }),
      new HtmlWebpackPlugin({
        template: './index.html',
        inject: 'body',
        minify: isProduction ? {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: false,
          minifyCSS: true,
          minifyURLs: true,
        } : false
      }),
      // watch 或 single 模式下内联 JS 到 HTML
      (isWatch || isSingleFile) ? new HtmlInlineScriptPlugin({
        htmlMatchPattern: [/index\.html$/],
        scriptMatchPattern: [/inline\.js$/],
      }) : null,
      // watch 或 single 模式下删除临时 JS 文件
      (isWatch || isSingleFile) ? {
        apply: (compiler) => {
          compiler.hooks.afterEmit.tap('DeleteInlineJS', (compilation) => {
            const inlineJsPath = path.join(__dirname, 'dist', 'inline.js');
            if (fs.existsSync(inlineJsPath)) {
              fs.unlinkSync(inlineJsPath);
            }
          });
        }
      } : null,
      // !isProduction && !isWatch ? new TavernLiveReloadPlugin({ port: 6620 }) : null,
    ].filter(Boolean),
    devServer: {
      static: {
        directory: path.join(__dirname, 'dist'),
      },
      compress: true,
      port: 8080,
      hot: true,
      historyApiFallback: true,
      // 配置代理，解决CORS问题（webpack-dev-server v5 格式）
      proxy: [
        {
          context: ['/ollama-api'],
          target: ollamaProxyTarget,
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/ollama-api': '' },
          on: {
            proxyReq: (proxyReq, req) => {
              console.log('[Ollama代理请求]', req.method, req.url);
            },
            proxyRes: (proxyRes, req) => {
              console.log('[Ollama代理响应]', proxyRes.statusCode, req.url);
            },
            error: (err) => {
              console.error('[Ollama代理错误]', err);
            }
          }
        },
        {
          context: ['/api'],
          target: backendProxyTarget,
          changeOrigin: true,
          secure: false,
          on: {
            proxyReq: (proxyReq, req) => {
              console.log('[代理请求]', req.method, req.url);
            },
            proxyRes: (proxyRes, req) => {
              console.log('[代理响应]', proxyRes.statusCode, req.url);
            },
            error: (err) => {
              console.error('[代理错误]', err);
            }
          }
        }
      ],
      setupMiddlewares: (middlewares, devServer) => {
        if (!devServer.app) return middlewares

        fs.mkdirSync(saveStorageDir, { recursive: true })
        console.log('[本地存储] save-storage 目录:', saveStorageDir)

        devServer.app.options('/api/v1/save-storage/:key', (_req, res) => {
          res.status(204).end()
        })

        devServer.app.get('/api/v1/save-storage/:key', (req, res) => {
          const filePath = storageFileForKey(req.params.key)
          if (!fs.existsSync(filePath)) {
            sendJson(res, 404, { detail: 'not found' })
            return
          }

          try {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.send(fs.readFileSync(filePath, 'utf8'))
          } catch (error) {
            sendJson(res, 500, {
              detail: error instanceof Error ? error.message : 'read failed',
            })
          }
        })

        devServer.app.put('/api/v1/save-storage/:key', async (req, res) => {
          try {
            const body = await readJsonBody(req)
            const payload = body && typeof body === 'object' ? body : {}
            const timestamp =
              typeof payload.timestamp === 'string'
                ? payload.timestamp
                : new Date().toISOString()
            const record = {
              id: req.params.key,
              data: Object.prototype.hasOwnProperty.call(payload, 'data')
                ? payload.data
                : payload,
              timestamp,
            }

            fs.writeFileSync(
              storageFileForKey(req.params.key),
              `${JSON.stringify(record, null, 2)}\n`,
              'utf8'
            )
            sendJson(res, 200, { ok: true, id: req.params.key, timestamp })
          } catch (error) {
            sendJson(res, 400, {
              detail: error instanceof Error ? error.message : 'invalid json',
            })
          }
        })

        devServer.app.delete('/api/v1/save-storage', (req, res) => {
          const prefix =
            typeof req.query.prefix === 'string'
              ? req.query.prefix
              : ''
          if (!prefix) {
            sendJson(res, 400, { detail: 'missing prefix' })
            return
          }

          let deleted = 0
          for (const fileName of fs.readdirSync(saveStorageDir)) {
            if (!fileName.endsWith('.json')) continue
            const key = decodeURIComponent(fileName.slice(0, -5))
            if (!key.startsWith(prefix)) continue
            fs.unlinkSync(path.join(saveStorageDir, fileName))
            deleted += 1
          }
          sendJson(res, 200, { ok: true, prefix, deleted })
        })

        devServer.app.delete('/api/v1/save-storage/:key', (req, res) => {
          const filePath = storageFileForKey(req.params.key)
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
          res.status(204).end()
        })

        return middlewares
      },
      // 允许通过任意host访问
      allowedHosts: 'all',
    },
  }
}
