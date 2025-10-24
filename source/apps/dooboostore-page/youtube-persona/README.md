# YouTube Persona Recommendation Collector

유튜브의 페르소나별 추천 알고리즘을 수집하는 프로그램입니다.

## 기능

- 50개의 다양한 페르소나 정의
- 각 페르소나마다 완전히 새로운 브라우저 세션 (캐시 없음)
- 페르소나별 키워드 검색으로 알고리즘 학습
- 홈 화면 추천 영상 수집

## 설치

```bash
cd source/apps/dooboostore-page/youtube-persona
npm install
```

## 실행

```bash
npm start
```

## 페르소나 추가

`personas.json` 파일을 수정하여 페르소나를 추가/수정할 수 있습니다:

```json
[
  {
    "persona": "페르소나 설명",
    "keywords": ["키워드1", "키워드2", "키워드3"]
  }
]
```

## 출력

- `dist-youtube-persona/` 디렉토리에 결과 저장
- 각 페르소나별 개별 JSON 파일
- `all-results.json`: 전체 결과 통합 파일

## 결과 형식

```json
{
  "persona": "우주, 과학을 좋아하는 IT개발자",
  "keywords": ["우주", "블랙홀", ...],
  "recommendations": [
    {
      "title": "영상 제목",
      "channel": "채널명",
      "videoId": "비디오ID",
      "thumbnail": "썸네일 URL",
      "url": "영상 URL"
    }
  ],
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```
