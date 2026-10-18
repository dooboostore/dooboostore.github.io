import type { PapagoCredentials } from './types';

/**
 * PAPAGO_TRANSLATE_AUTH / PAPAGO_COOKIE / PAPAGO_DEVICE_ID 환경변수에서 읽는다.
 * 없으면 null (live 세션 또는 익명으로 폴백).
 */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): PapagoCredentials | null {
  const translateCookie = env.PAPAGO_COOKIE ?? '';
  const translateAuthorization = env.PAPAGO_TRANSLATE_AUTH ?? '';
  if (!translateCookie && !translateAuthorization) return null;
  return {
    translateAuthorization,
    translateCookie,
    deviceId: env.PAPAGO_DEVICE_ID
  };
}

/**
 * credentials 결정: 환경변수 → live 세션(주입) → 익명({}).
 * fetchLive는 Playwright 등으로 papago.naver.com 쿠키를 모아오는 함수.
 */
export async function resolveCredentials(
  fetchLive: () => Promise<string | null>,
  log: (message: string) => void = console.log
): Promise<PapagoCredentials> {
  const fromEnv = credentialsFromEnv();
  if (fromEnv) {
    log('🔑 Using Papago credentials from environment');
    return fromEnv;
  }
  log('🍪 Fetching live Papago session (anonymous)...');
  const liveCookie = await fetchLive();
  if (liveCookie) {
    log('✅ Live session acquired');
    return { translateCookie: liveCookie };
  }
  log('⚠️ Live session failed — proceeding anonymously');
  return {};
}
