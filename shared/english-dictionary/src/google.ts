/**
 * Google 비공식 번역 엔드포인트 (translate.googleapis.com, 키 불필요).
 * Papago nsmt 구 API가 폐기(404)되어 문장 번역용으로 사용한다. 순수 — fetch 주입 가능.
 * 실패 시 ''.
 */
export async function translateGoogle(
  text: string,
  source = 'en',
  target = 'ko',
  fetchFn: typeof fetch = fetch
): Promise<string> {
  try {
    const q = encodeURIComponent(text);
    const response = await fetchFn(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${q}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!response.ok) return '';
    const data = (await response.json()) as Array<Array<Array<string | null>>>;
    const parts = data?.[0];
    if (!Array.isArray(parts)) return '';
    return parts.map(seg => seg?.[0] ?? '').join('');
  } catch {
    return '';
  }
}
