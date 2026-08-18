// 로컬 http 서버와 Vercel Function이 같은 핸들러를 쓰도록 맞춰 주는 도우미.
import crypto from 'node:crypto';

// ACCESS_CODE는 쉼표로 여러 개를 둘 수 있다 — 코드마다 저장 서랍이 따로 생긴다.
const CODES = (process.env.ACCESS_CODE || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

export const needCode = CODES.length > 0;

// 맞는 코드면 그 코드로 만든 저장 키를, 아니면 null을 준다.
export function codeKey(req) {
  if (!needCode) return 'shared';
  const given = String(req.headers['x-access-code'] || '');
  // 길이가 달라도 타이밍이 새지 않도록 해시끼리 비교한다
  const givenHash = sha(given);
  const hit = CODES.find((c) => crypto.timingSafeEqual(Buffer.from(sha(c)), Buffer.from(givenHash)));
  return hit ? sha(hit).slice(0, 24) : null;
}

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

export function json(res, code, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': buf.length,
    'cache-control': 'no-store',
  });
  res.end(buf);
}

// Vercel은 req.body를 미리 채워 주고, 로컬 http 서버는 스트림 그대로 준다.
export function readBody(req, limit = 12 * 1024 * 1024) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(JSON.parse(req.body));
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('요청이 너무 커요.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('요청 형식이 올바르지 않아요.')); }
    });
    req.on('error', reject);
  });
}
