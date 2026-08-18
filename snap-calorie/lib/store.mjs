// 즐겨찾기·기록 저장소.
// Vercel에서는 Redis REST(Vercel KV / Upstash)를, 로컬에서는 파일 하나를 쓴다.
// 둘 다 없으면 저장이 꺼진 상태로 동작한다 (앱은 브라우저 저장소만으로 계속 돌아간다).
import fs from 'node:fs/promises';
import path from 'node:path';

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const useRest = Boolean(REST_URL && REST_TOKEN);

// 로컬 파일 (Vercel의 파일시스템은 읽기 전용이라 REST가 없으면 저장이 꺼진다)
const FILE = path.join(process.cwd(), '.data', 'store.json');
const isServerless = Boolean(process.env.VERCEL);

export const storageKind = useRest ? 'redis' : (isServerless ? 'none' : 'file');
export const canStore = storageKind !== 'none';

async function redis(command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${REST_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`저장소 오류 ${res.status}`);
  return (await res.json()).result;
}

async function readFile() {
  try { return JSON.parse(await fs.readFile(FILE, 'utf8')); } catch { return {}; }
}

export async function getJSON(key) {
  if (useRest) {
    const raw = await redis(['GET', key]);
    return raw ? JSON.parse(raw) : null;
  }
  if (!canStore) return null;
  return (await readFile())[key] ?? null;
}

export async function setJSON(key, value) {
  if (useRest) { await redis(['SET', key, JSON.stringify(value)]); return; }
  if (!canStore) return;
  const all = await readFile();
  all[key] = value;
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2), 'utf8');
}
