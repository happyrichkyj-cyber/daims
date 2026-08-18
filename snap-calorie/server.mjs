// 로컬 개발 서버 — Vercel과 같은 핸들러를 그대로 쓴다.
// 실행: npm start  →  http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

// --- .env 로드 (별도 패키지 없이) ---------------------------------------
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env 없어도 환경변수로 넣었으면 동작 */ }

// .env를 읽은 뒤에 불러야 모듈 안에서 환경변수를 볼 수 있다
const { MODEL, hasKey } = await import('./lib/analyze.mjs');
const { needCode } = await import('./lib/http.mjs');
const { storageKind } = await import('./lib/store.mjs');
const analyzeHandler = (await import('./api/analyze.js')).default;
const dataHandler = (await import('./api/data.js')).default;

const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, hasKey: hasKey(), model: MODEL, needCode, storage: storageKind }));
    return;
  }
  if (url.pathname === '/api/analyze') return analyzeHandler(req, res);
  if (url.pathname === '/api/data') return dataHandler(req, res);

  // 정적 파일
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('찾을 수 없음');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      // 고칠 때마다 새로고침으로 바로 반영되도록 캐시를 끈다 (로컬 전용이라 비용 없음)
      'cache-control': 'no-store, must-revalidate',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list || []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => [name, i.address]));
  console.log('');
  console.log(`  snap-calorie 실행 중  (모델: ${MODEL} · 저장소: ${storageKind}${needCode ? ' · 접속 코드 있음' : ''})`);
  console.log(`  PC 브라우저:   http://localhost:${PORT}`);
  for (const [name, ip] of ips) console.log(`  폰 브라우저:   http://${ip}:${PORT}   (${name})`);
  if (!hasKey()) console.log('\n  ⚠  ANTHROPIC_API_KEY가 없습니다. .env 파일을 만들어 주세요.');
  console.log('');
});
