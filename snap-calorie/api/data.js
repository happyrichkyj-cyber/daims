// 즐겨찾기와 기록을 기기 사이에 맞춰 준다.
// GET  /api/data → { favs, log, updatedAt }
// PUT  /api/data ← { favs, log }
import { getJSON, setJSON, canStore } from '../lib/store.mjs';
import { json, readBody, codeKey, needCode } from '../lib/http.mjs';

const MAX_BYTES = 512 * 1024; // 한 사람 몫으로 넉넉하다

export default async function handler(req, res) {
  const key = codeKey(req);
  if (needCode && !key) return json(res, 401, { error: '접속 코드가 맞지 않아요.', needCode: true });
  if (!canStore) return json(res, 200, { off: true, favs: [], log: [] });

  const id = `snapcal:${key}`;

  try {
    if (req.method === 'GET') {
      const data = await getJSON(id);
      return json(res, 200, data || { favs: [], log: [], updatedAt: 0 });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      const favs = Array.isArray(body.favs) ? body.favs : [];
      const log = Array.isArray(body.log) ? body.log : [];
      const next = { favs, log, updatedAt: Date.now() };

      if (JSON.stringify(next).length > MAX_BYTES) {
        return json(res, 413, { error: '기록이 너무 많아요. 오래된 항목을 지워 주세요.' });
      }
      await setJSON(id, next);
      return json(res, 200, { ok: true, updatedAt: next.updatedAt });
    }

    return json(res, 405, { error: '허용되지 않은 요청이에요.' });
  } catch (err) {
    console.error('[저장소 오류]', err.message);
    return json(res, 500, { error: '저장소에 연결하지 못했어요.' });
  }
}
