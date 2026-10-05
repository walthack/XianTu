// 战斗试玩静态服务：纯静态文件，默认 0.0.0.0:8097。不代理 /api，不读写任何存档目录。
//   node dev/combat-trial/serve.mjs [--port 8097] [--host 0.0.0.0]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, 'dist');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const port = Number(arg('port', '8097'));
const host = arg('host', '0.0.0.0');

// 主服务和其它试玩占用的端口，绝不使用。
const RESERVED = new Map([[8091, '主服务'], [8095, '战斗原型 A'], [8096, '战斗原型 B'], [8080, 'webpack 默认端口']]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`端口不合法：${arg('port')}`);
if (RESERVED.has(port)) throw new Error(`端口 ${port} 是${RESERVED.get(port)}，战斗试玩不使用`);
if (!existsSync(join(dist, 'index.html'))) throw new Error('还没有构建产物：先运行 node dev/combat-trial/build.mjs');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  // 没有后端：/api/* 一律返回 404 JSON，让前端按「后端不可用」走本地存档。
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ detail: '战斗试玩没有后端' }));
    return;
  }
  const relative = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^([/\\])+/, '');
  const file = resolve(dist, relative);
  if (file !== dist && !file.startsWith(dist + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
}).listen(port, host, () => {
  console.log(`[combat-trial] 静态服务已启动：${host}:${port}`);
  console.log(`  本机   http://localhost:${port}/`);
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) console.log(`  局域网 http://${item.address}:${port}/`);
    }
  }
});
