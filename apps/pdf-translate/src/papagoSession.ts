import { chromium } from 'playwright';

/**
 * papago.naver.com 익명 접속 → 브라우저가 받은 Set-Cookie 수집 → Cookie 헤더 문자열.
 * 로그인 없음 (Naver 익명 세션). 실패 시 null (익명 호출로 폴백).
 */
export async function fetchLivePapagoCookie(timeoutMs = 30000): Promise<string | null> {
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      locale: 'ko-KR'
    });
    const page = await context.newPage();
    await page.goto('https://papago.naver.com/', {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs
    });
    await page.waitForTimeout(3000);
    const cookies = await context.cookies();
    if (cookies.length === 0) return null;
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch (error: any) {
    console.log(`⚠️ Live session failed: ${error?.message ?? error}`);
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
