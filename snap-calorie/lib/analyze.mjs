// 칼로리 추정 로직 — 로컬 서버와 Vercel Function이 함께 쓴다.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.MODEL || 'claude-opus-5';
export const MAX_PHOTOS = 4;

let client;
export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const ITEM = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '음식 이름 (한국어)' },
    portion: {
      type: 'string',
      description:
        '눈대중 분량을 짧게. 예: "한 공기", "3조각", "반 그릇". ' +
        '중량은 grams 필드에 따로 넣고 여기엔 g 숫자를 쓰지 않는다. 12자 이내.',
    },
    grams: { type: 'number', description: '추정 중량(g)' },
    kcal: { type: 'number' },
    carb_g: { type: 'number' },
    protein_g: { type: 'number' },
    fat_g: { type: 'number' },
  },
  required: ['name', 'portion', 'grams', 'kcal', 'carb_g', 'protein_g', 'fat_g'],
  additionalProperties: false,
};

const SCHEMA = {
  type: 'object',
  properties: {
    is_food: { type: 'boolean', description: '사진에 음식이 있으면 true' },
    dish_name: { type: 'string', description: '한 끼 전체를 부르는 이름' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    items: { type: 'array', items: ITEM },
    total_kcal: { type: 'number' },
    total_carb_g: { type: 'number' },
    total_protein_g: { type: 'number' },
    total_fat_g: { type: 'number' },
    note: { type: 'string', description: '추정 근거나 주의사항. 음식이 아니면 그 이유.' },
  },
  required: ['is_food', 'dish_name', 'confidence', 'items',
    'total_kcal', 'total_carb_g', 'total_protein_g', 'total_fat_g', 'note'],
  additionalProperties: false,
};

const SYSTEM = `너는 한국 음식에 밝은 영양 분석가다. 음식 사진을 보고 항목별 칼로리와 탄단지를 추정한다.

원칙:
- 사진에 보이는 것만 센다. 안 보이는 반찬이나 음료를 상상해서 추가하지 마라.
- **사진이 여러 장이면 같은 한 끼를 다른 각도·거리에서 찍은 것이다.** 사진마다 따로 계산해 더하지 마라.
  여러 장에 걸쳐 보이는 같은 음식은 한 번만 센다. 한 장에서만 보이는 음식은 빠뜨리지 말고 포함한다.
  결과는 언제나 "이 한 끼 전체" 하나로 낸다.
- 그릇 크기, 수저, 젓가락, 손 같은 주변 사물을 기준자로 삼아 분량을 먼저 잡고, 그 다음 칼로리를 계산해라.
- 조리법이 보이면 반영해라. 튀김·볶음은 흡수된 기름을, 국물류는 실제로 먹는 양을 감안한다.
- total_* 값은 items의 합과 일치시켜라.
- confidence: 흔한 음식이고 분량이 명확하면 high, 종류는 알겠으나 양이 애매하면 medium, 가림·흐림·생소한 음식이면 low.
- 사진 없이 글로만 설명이 오면(예: "당근 50g", "아메리카노 톨") 그 설명만으로 추정한다.
  분량이 적혀 있으면 그대로 쓰고, 없으면 한국인 기준 1인분으로 잡은 뒤 note에 그렇게 봤다고 밝힌다.
- 음식이 아니면 is_food를 false로, items를 빈 배열로, 모든 수치를 0으로 두고 note에 이유를 적어라.
- 이건 정밀 측정이 아니라 추정이다. 애매하면 중간값을 택하고 note에 무엇이 불확실한지 밝혀라.

사용자에게 보이는 문구(dish_name, portion, note)는 이렇게 쓴다:
- **해요체로 쓴다.** "~해요", "~예요"로 끝낸다. 격식체(~합니다/~입니다)도, 평서체(~다/~이다)도 쓰지 않는다.
- 과장("최고의", "완벽한")이나 챗봇 말투("~해보세요!", 느낌표)를 쓰지 않는다.
- note는 두 문장 안으로. 무엇을 근거로 잡았는지, 무엇이 불확실한지만 담는다.
- 이모지를 쓰지 않는다.`;

export async function analyze({ images, memo }) {
  let ask;
  if (!images.length) {
    ask = `사진 없이 글로만 알려준다. 다음 음식의 칼로리를 추정해줘.\n${memo}`;
  } else {
    ask = images.length > 1
      ? `아래 사진 ${images.length}장은 같은 한 끼를 여러 각도에서 찍은 것이다. ` +
        `겹치는 음식을 중복해서 세지 말고, 전부 합쳐 하나의 상차림으로 칼로리를 추정해줘.`
      : '이 사진의 칼로리를 추정해줘.';
    if (memo) ask += `\n사용자가 남긴 메모: ${memo}`;
  }

  const content = [
    ...images.map((im) => ({
      type: 'image',
      source: { type: 'base64', media_type: im.mediaType, data: im.base64 },
    })),
    { type: 'text', text: ask },
  ];

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      effort: 'low', // 응답 속도 우선. 정확도를 올리려면 'medium' / 'high'
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{ role: 'user', content }],
  });

  if (res.stop_reason === 'refusal') throw new Error('모델이 이 이미지에 대한 응답을 거절했어요.');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('모델이 빈 응답을 반환했어요.');

  return {
    result: JSON.parse(text),
    usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
  };
}

// data URL 배열을 검증해 {mediaType, base64}[] 로 바꾼다. 문제가 있으면 Error를 던진다.
export function parseImages(raw) {
  const images = [];
  for (const d of raw) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(d || '');
    if (!m) throw new Error('이미지 형식이 올바르지 않아요.');
    images.push({ mediaType: m[1], base64: m[2] });
  }
  return images;
}

// API 오류를 사람이 읽을 수 있는 한 줄로 바꾼다 (원문은 로그에 남는다)
export function friendly(err) {
  const raw = err?.message || '';
  const status = err?.status;
  if (/credit balance is too low/i.test(raw)) {
    return '계정 크레딧이 부족해요. console.anthropic.com 의 Plans & Billing 에서 충전해 주세요.';
  }
  if (status === 401 || /authentication_error|API key/i.test(raw)) {
    return 'API 키가 올바르지 않아요. 환경변수 ANTHROPIC_API_KEY를 확인해 주세요.';
  }
  if (status === 403) return '이 API 키로는 접근할 수 없어요. 키 권한을 확인해 주세요.';
  if (status === 404) return `모델(${MODEL})을 찾을 수 없어요. MODEL 값을 확인해 주세요.`;
  if (status === 429) return '요청이 몰렸어요. 잠시 뒤 다시 시도해 주세요.';
  if (status === 529 || status >= 500) return 'Anthropic 서버가 혼잡해요. 잠시 뒤 다시 시도해 주세요.';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(raw)) return '인터넷 연결을 확인해 주세요.';
  return raw.slice(0, 200) || '계산하지 못했어요.';
}
