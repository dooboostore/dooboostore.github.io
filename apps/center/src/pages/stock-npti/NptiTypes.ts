// NPTI 도감 — 8개 항목(E/I/N/S/P/J/F/T) + 16개 조합 유형 설명

export interface NptiTypeInfo {
  code: string;
  name: string;       // 한국어 아키타입 이름
  tagline: string;    // 한 줄 요약
  desc: string;       // HTML 설명
  emoji?: string;     // 대표 이모지
}

// ── 차원 색상 config ──────────────────────────────────────────────
// 차원(쌍)별 대표 색상 — E-I 수급 / N-S 추세 / P-J 변동성 / F-T 심리
export const AXIS_DIM_COLOR: Record<string, string> = {
  E: '#ef4444', I: '#ef4444',
  N: '#10b981', S: '#10b981',
  P: '#8b5cf6', J: '#8b5cf6',
  F: '#3b82f6', T: '#3b82f6',
};

export const DIM_COLOR_NAME: Record<string, string> = {
  'E-I': '#ef4444', 'N-S': '#10b981', 'P-J': '#8b5cf6', 'F-T': '#3b82f6',
};

export function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// 도감 항목별 쌍(pair) 카드 — 배경은 흰색, 차원 색상은 보더/라벨에만 적용
export function pairFillStyle(pair: string): string {
  const color = DIM_COLOR_NAME[pair];
  return `--axis-fill:#ffffff;--axis-border:${color};--axis-color:${color}`;
}

export const NPTI_AXIS_INFO: Record<string, NptiTypeInfo> = {
  E: {
    code: 'E',
    name: '외향 · 수급왕',
    tagline: '거래대금 회전율이 높은 활발한 종목',
    desc: `<p><strong>E (수급/외향)</strong>는 시장 참여자의 관심이 몰리는 종목입니다. 거래대금이 시가총액 대비 크게 돌고 있어 수급이 살아있는 상태입니다.</p>
      <ul><li>자금이 몰려들어 주가 탄력이 좋다</li><li>뉴스·이슈 노출도가 높다</li><li>추격 매수 시 슬리피지에 주의</li></ul>`,
  },
  I: {
    code: 'I',
    name: '내향 · 조용한 강자',
    tagline: '거래대금 회전율이 낮은 소외된 종목',
    desc: `<p><strong>I (내향)</strong>는 거래대금이 시가총액 대비 적어 수급이 한산한 종목입니다. 관심 밖에 있지만 그만큼 과열이 덜합니다.</p>
      <ul><li>관심이 쏠리면 급격히 상승할 여지가 있다</li><li>거래가 적어 출렁임도 상대적으로 크지 않다</li><li>유동성 낮은 종목은 청산 위험 주의</li></ul>`,
  },
  N: {
    code: 'N',
    name: '성장 · 상승 추세',
    tagline: '해당 구간 수익률이 플러스인 상승 종목',
    desc: `<p><strong>N (성장)</strong>은 평가 구간 동안 가격이 오른 종목입니다. 추세가 살아있어 매수 심리를 자극합니다.</p>
      <ul><li>우상향 추세 유지 중</li><li>조정 시 매수 기회로 보는 시각</li><li>과열 추격은 고점 매수 위험</li></ul>`,
  },
  S: {
    code: 'S',
    name: '실적 · 하락/정체',
    tagline: '해당 구간 수익률이 마이너스이거나 침체',
    desc: `<p><strong>S (실적)</strong>은 평가 구간 동안 가격이 내리거나 횡보한 종목입니다. 추세가 약해 수익 실현이 어려운 구간입니다.</p>
      <ul><li>하락 추세 또는 박스권</li><li>반등 시 매도 압력이 나올 수 있다</li><li>바닥 확인 전 선매수 주의</li></ul>`,
  },
  P: {
    code: 'P',
    name: '변동 · 롤러코스터',
    tagline: '등락폭이 커서 출렁임이 심한 종목',
    desc: `<p><strong>P (변동)</strong>은 캔들 간 고저폭이 커서 가격이 크게 출렁이는 종목입니다. 위험과 수익이 모두 큽니다.</p>
      <ul><li>단타에 유리하지만 손실도 크다</li><li>손절 라인 설정이 필수</li><li>대형 뉴스에 민감하게 반응</li></ul>`,
  },
  J: {
    code: 'J',
    name: '안정 · 담백한 흐름',
    tagline: '등락폭이 작아 움직임이 차분한 종목',
    desc: `<p><strong>J (안정)</strong>은 고저폭이 작아 가격 움직임이 차분한 종목입니다. 변동성이 낮아 안정적인 자금 운용이 가능합니다.</p>
      <ul><li>손실 위험이 상대적으로 작다</li><li>대형주/우량주에서 자주 보인다</li><li>수익률도 작을 수 있다</li></ul>`,
  },
  F: {
    code: 'F',
    name: '심리 · 상승 의지',
    tagline: '종가가 고가 부근에 위치한 강한 매수 심리',
    desc: `<p><strong>F (심리)</strong>는 대부분의 캔들이 고가 부근에서 마감해 매수 심리가 강한 종목입니다. 힘(파워)이 남아 있습니다.</p>
      <ul><li>장중 반등 시 상승 마감 확률이 높다</li><li>매수세가 우위</li><li>차익 실현 매물과의 경합 관찰 필요</li></ul>`,
  },
  T: {
    code: 'T',
    name: '데이터 · 하락 의지',
    tagline: '종가가 저가 부근에 위치한 약한 매수 심리',
    desc: `<p><strong>T (데이터)</strong>는 대부분의 캔들이 저가 부근에서 마감해 매수 심리가 약한 종목입니다. 힘이 빠진 상태입니다.</p>
      <ul><li>반등해도 다시 눌리는 패턴</li><li>매도 압력이 우위</li><li>추세 전환 신호 확인 전 신중</li></ul>`,
  },
};

export const NPTI_TYPE_INFO: Record<string, NptiTypeInfo> = {
  ENFP: {
    code: 'ENFP',
    name: '낙관의 질주자',
    emoji: '🚀',
    tagline: '수급 좋고, 오르고, 심리도 뜨겁고, 출렁임도 크다',
    desc: `<p><strong>ENFP</strong> — 상승 수급에 성장 추세, 강한 매수 심리까지 겹친 모멘텀 최강형. 변동성도 커서 신나게 달리다 크게 흔들릴 수 있습니다.</p>
      <ul><li>추세를 타면 수익률이 압도적</li><li>변동성으로 인한 급락 리스크 동반</li><li>손절 라인을 반드시 지킬 것</li></ul>`,
  },
  ENFJ: {
    code: 'ENFJ',
    name: '시장의 온기',
    emoji: '🔥',
    tagline: '수급 좋고, 상승 추세에 심리도 긍정, 안정적',
    desc: `<p><strong>ENFJ</strong> — 활발한 수급과 상승 추세, 긍정 심리까지 고르게 갖춘 균형 잡힌 상승주. 변동성까지 낮아 안정적으로 오릅니다.</p>
      <ul><li>대형 우량주 상승 구간에서 흔함</li><li>분할 매수로 추세를 타기 좋음</li><li>추세가 꺾이는 신호만 조심</li></ul>`,
  },
  ENTP: {
    code: 'ENTP',
    name: '급등 사냥꾼',
    emoji: '🎯',
    tagline: '수급 좋고 오르지만 심리·변동성은 들쭉날쭉',
    desc: `<p><strong>ENTP</strong> — 자금이 몰리고 상승하지만, 심리와 변동성이 갈팡질팡해 예측이 어려운 종목. 한 방에 크게 오를 수 있는 급등주 스타일.</p>
      <ul><li>테마주·이슈주에서 자주 보임</li><li>출렁임이 커서 수익 실현 타이밍이 중요</li><li>베팅 시 포지션을 작게</li></ul>`,
  },
  ENTJ: {
    code: 'ENTJ',
    name: '지휘관',
    emoji: '👑',
    tagline: '수급 좋고 상승, 심리 긍정에 변동까지 큰 대형 추세주',
    desc: `<p><strong>ENTJ</strong> — 강한 수급과 상승 추세, 긍정 심리가 어우러진 대장주형. 변동성이 있어도 자금이 버텨주는 강한 종목입니다.</p>
      <ul><li>시장 주도주(리더주)로 자주 지목</li><li>조정 때마다 저가 매수가 들어옴</li><li>단기 급등 후 쉬어가는 구간 주의</li></ul>`,
  },
  ESFP: {
    code: 'ESFP',
    name: '스캘퍼',
    emoji: '⚡',
    tagline: '수급 좋고 심리 뜨겁지만 추세·변동성은 불안',
    desc: `<p><strong>ESFP</strong> — 관심과 심리는 뜨겁지만 추세가 뚜렷하지 않고 출렁임이 큰 단타형 종목. 매매가 빠르게 이뤄집니다.</p>
      <ul><li>데이트레이딩/스캘핑에 적합</li><li>양방향 출렁임에 피로도가 크다</li><li>확실한 시그널이 없으면 쉬어가기</li></ul>`,
  },
  ESFJ: {
    code: 'ESFJ',
    name: '행복회로',
    emoji: '😊',
    tagline: '수급 좋고 심리도 좋지만 추세·변동은 뚜렷하지 않음',
    desc: `<p><strong>ESFJ</strong> — 관심은 많고 심리는 긍정적이나, 추세와 변동성이 뚜렷하지 않아 박스권에서 맴도는 종목. 조급해하지 않는 게 좋습니다.</p>
      <ul><li>횡보 후 방향 결정이 임박</li><li>거래대금을 눈여겨볼 것</li><li>방향성 확인 후 대응</li></ul>`,
  },
  ESTP: {
    code: 'ESTP',
    name: '올인 플레이어',
    emoji: '🎰',
    tagline: '수급 좋고 변동성 크고 심리도 강한 공격형',
    desc: `<p><strong>ESTP</strong> — 수급과 심리가 강하고 출렁임도 큰 공격형 종목. 추세가 약해도 자금이 몰려 있어 단기 반등이 잦습니다.</p>
      <ul><li>단기 수익을 노리는 트레이더에게 인기</li><li>변동성이 수익이자 동시에 위험</li><li>절대 전재산 베팅 금지</li></ul>`,
  },
  ESTJ: {
    code: 'ESTJ',
    name: '실전 투자가',
    emoji: '📊',
    tagline: '수급 좋고 안정적이며 추세·심리도 무난한 건실형',
    desc: `<p><strong>ESTJ</strong> — 수급이 살아 있고 변동성은 낮으며 추세와 심리도 나쁘지 않은 건실한 종목. 장기 보유에도 부담이 적습니다.</p>
      <ul><li>꾸준히 오르는 우량주에서 흔함</li><li>분할 매수·분할 매도에 적합</li><li>실적 이벤트만 체크</li></ul>`,
  },
  INFP: {
    code: 'INFP',
    name: '가치 수집가',
    emoji: '💎',
    tagline: '소외됐지만 상승 추세에 심리 긍정, 변동은 큼',
    desc: `<p><strong>INFP</strong> — 관심 밖이지만 조용히 오르고 심리도 긍정적인 숨은 주식형. 변동성이 커서 남들이 모를 때 접근하기 좋습니다.</p>
      <ul><li>저평가 종목 발굴에 유리</li><li>발견되면 급등할 가능성</li><li>유동성 부족 주의</li></ul>`,
  },
  INFJ: {
    code: 'INFJ',
    name: '통찰가',
    emoji: '🔮',
    tagline: '조용하지만 상승 추세에 심리도 긍정, 안정적 상승',
    desc: `<p><strong>INFJ</strong> — 수급은 조용하지만 추세가 우상향이고 심리도 긍정적이며 변동성이 낮은 이상적인 상승 구조입니다.</p>
      <ul><li>지지선이 잘 받쳐주는 종목</li><li>조정 시 매수하기 좋음</li><li>추세 유지가 관건</li></ul>`,
  },
  INTP: {
    code: 'INTP',
    name: '분석가',
    emoji: '🔬',
    tagline: '조용하고 변동은 크지만 상승하며 심리는 들쭉날쭉',
    desc: `<p><strong>INTP</strong> — 관심은 적고 출렁임은 크지만 오르긴 오르는 종목. 변동성을 이용한 저가 매수 전략이 잘 맞습니다.</p>
      <ul><li>출렁임 구간에서 평균 매수</li><li>시장 관심을 받으면 급등</li><li>분석(밸류에이션) 접근이 유효</li></ul>`,
  },
  INTJ: {
    code: 'INTJ',
    name: '전략가',
    emoji: '♟️',
    tagline: '조용하고 변동은 크지만 상승 심리 강한 전략적 종목',
    desc: `<p><strong>INTJ</strong> — 시장의 관심 없이도 상승 추세와 강한 심리를 보여주지만 변동성이 큰 종목. 전략적으로 접근해야 합니다.</p>
      <ul><li>큰 그림을 보고 진입</li><li>손절과 목표가를 미리 정할 것</li><li>관심 몰리기 전이 기회</li></ul>`,
  },
  ISFP: {
    code: 'ISFP',
    name: '조용한 매수자',
    emoji: '🐢',
    tagline: '소외되고 안정적이며 심리도 괜찮은 조용한 종목',
    desc: `<p><strong>ISFP</strong> — 수급이 한산하고 변동성도 낮으며 심리도 나쁘지 않은 조용한 종목. 큰 수익은 기대하기 어렵지만 부담이 적습니다.</p>
      <ul><li>하방 리스크가 상대적으로 작음</li><li>서서히 쌓아가는 매수에 적합</li><li>큰 이벤트가 없으면 답답할 수 있음</li></ul>`,
  },
  ISFJ: {
    code: 'ISFJ',
    name: '저축가',
    emoji: '🐷',
    tagline: '소외되고 안정적이며 심리도 긍정적인 방어형',
    desc: `<p><strong>ISFJ</strong> — 관심 밖이지만 안정적이고 심리도 무난한 방어형 종목. 공격적 수익보다 안정성이 중요할 때 좋습니다.</p>
      <ul><li>연금/장기 투자 성격에 적합</li><li>이벤트 리스크가 낮은 편</li><li>수익률은 기대보다 낮을 수 있음</li></ul>`,
  },
  ISTP: {
    code: 'ISTP',
    name: '위기 대응가',
    emoji: '🛠️',
    tagline: '소외되고 변동성 크며 심리도 약한 함정형',
    desc: `<p><strong>ISTP</strong> — 관심 밖에 변동성은 크고 심리까지 약한 종목. 반등이 나와도 되돌림이 잦아 대응이 어렵습니다.</p>
      <ul><li>바닥 확인 전 진입 금물</li><li>숏(공매도) 관점으로 볼 수도 있음</li><li>기술적 반등만 노리기</li></ul>`,
  },
  ISTJ: {
    code: 'ISTJ',
    name: '원칙주의자',
    emoji: '📜',
    tagline: '소외되고 안정적이지만 추세·심리가 약한 방어적 종목',
    desc: `<p><strong>ISTJ</strong> — 조용하고 변동성도 낮지만 추세와 심리가 약한 종목. 손실은 작지만 수익 기회도 적습니다.</p>
      <ul><li>관망이 최선일 때가 많음</li><li>추세 전환 신호가 나오면 재평가</li><li>무리한 공격은 피할 것</li></ul>`,
  },
};

// 도감 카드에서 보여줄 항목별/조합별 순서
export const NPTI_AXIS_ORDER: readonly string[] = ['E', 'I', 'N', 'S', 'P', 'J', 'F', 'T'];

// 레이더 축 순서 (12시부터 시계방향, 보완축이 정반대) — keyof NPTI_AXIS_INFO
export const NPTI_AXES_8: readonly (keyof typeof NPTI_AXIS_INFO)[] = ['E', 'N', 'F', 'P', 'I', 'S', 'T', 'J'];

// 가능한 16개 조합: E/I × N/S × F/T × P/J
export const NPTI_TYPE_ORDER: readonly string[] = [
  'ENFP', 'ENFJ', 'ENTJ', 'ENTP',
  'ESFP', 'ESFJ', 'ESTJ', 'ESTP',
  'INFP', 'INFJ', 'INTJ', 'INTP',
  'ISFP', 'ISFJ', 'ISTJ', 'ISTP',
];