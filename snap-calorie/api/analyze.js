import { analyze, parseImages, friendly, hasKey, MAX_PHOTOS } from '../lib/analyze.mjs';
import { json, readBody, codeKey, needCode } from '../lib/http.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 요청이에요.' });

  if (needCode && !codeKey(req)) {
    return json(res, 401, { error: '접속 코드가 맞지 않아요.', needCode: true });
  }
  if (!hasKey()) {
    return json(res, 500, { error: 'ANTHROPIC_API_KEY가 설정되지 않았어요.' });
  }

  try {
    const body = await readBody(req);
    const raw = Array.isArray(body.images) ? body.images : (body.image ? [body.image] : []);
    const memo = typeof body.memo === 'string' ? body.memo.trim().slice(0, 500) : '';

    if (!raw.length && !memo) return json(res, 400, { error: '사진이나 메모 중 하나는 있어야 해요.' });
    if (raw.length > MAX_PHOTOS) {
      return json(res, 400, { error: `사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.` });
    }

    const images = parseImages(raw);
    const started = Date.now();
    const out = await analyze({ images, memo });
    console.log(
      `[분석] ${images.length ? `사진 ${images.length}장` : '메모'} · ${out.result.dish_name} · ` +
      `${out.result.total_kcal}kcal · ${((Date.now() - started) / 1000).toFixed(1)}s · ` +
      `in ${out.usage.input_tokens} / out ${out.usage.output_tokens}`,
    );
    return json(res, 200, out);
  } catch (err) {
    console.error('[오류]', err.message);
    return json(res, 500, { error: friendly(err) });
  }
}
