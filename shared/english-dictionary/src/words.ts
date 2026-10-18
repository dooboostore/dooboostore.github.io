/**
 * 영문 텍스트에서 사전 조회용 단어를 추출한다.
 * apps/youtube-translate의 단어 분리 규칙과 동일:
 * 공백 분리 → 구두점 제거 → 소문자화 → 영문/아포스트로피만 통과.
 */
export function extractEnglishWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map(word => word.replace(/[,.":!?;()]/g, '').toLowerCase())
    .filter(word => word.length > 0 && /^[a-zA-Z']+$/.test(word));
}

/** 여러 텍스트에서 중복 없는 단어 집합을 만든다 (삽입 순서 유지). */
export function extractUniqueEnglishWords(texts: string[]): string[] {
  const all = new Set<string>();
  for (const text of texts) {
    for (const word of extractEnglishWords(text)) all.add(word);
  }
  return [...all];
}
