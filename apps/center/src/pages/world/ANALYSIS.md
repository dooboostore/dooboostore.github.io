# 힐링 월드 (SVG) — lazycollect 엔진 분석 & 전환 설계

> 작성 2026-11-21 · 대상 원본: `lazycollect/apps/lazycollect/src/world` (약 5.3k lines) + `@dooboostore/core` 의 `RenderTransactionDrawObj`
> 목표: 서버 없는 static(GitHub Pages) 방치형 힐링 월드. 실제 세계지도(위도·경도) 위에 나라별 랜드마크·캐릭터가 돌아다니고, 그 위치의 라디오를 듣는다. 렌더링은 SVG, 애니메이션은 최대한 SVG/CSS 내장 기능에 맡긴다.

---

## 1. lazycollect 엔진 구조 요약

### 1.1 클래스 계층

```
RenderDrawObj (core)                       render() → draw()
└ RenderTransactionDrawObj (core)          키프레임 보간 엔진 (cubic-bezier 프레임 미리 계산)
  └ RenderTransactionRunnableDrawObj
    ├ WorldEngine                          카메라(x,y,z=줌) + 월드 전체 루프
    ├ LayerDrawObject                      Objet 하나 (캐릭터/건물/아이템)
    └ LayerDrawSubObject                   Objet 를 이루는 도형 하나 (rect/ellipse/path/image/text)
ToolBase                                   MiniMap / Zoom / Weather / Editor (오버레이 도구)
Manager: WorldEventManager / WorldResourceManager / WorldSyncCacheManager
```

### 1.2 데이터 흐름

```
서버 DB ──6초 polling──▶ WorldSyncCacheManager ──SyncDataInlineSet──▶ WorldEngine.sync()
  { syncData: Worlds(w,h,color,objets[]), categories: SubLayer[], layers: SubLayer[] }

WorldEngine.sync()
  └ objet 마다 LayerDrawObject 생성/갱신
      ├ 이동 방향(xd,yd) 으로 LayerDirection(front/back/left/right) 결정
      ├ objet.objetHasCategories → 카테고리 템플릿 레이어 찾기 → slot 에 bindLayerSeqs 끼워넣기
      ├ LayerStore.sync() → SubLayer 마다 LayerDrawSubObject, animation[] 키프레임을 calc 로 등록
      └ 0~3초 랜덤 지연 후 transaction(targetPoint) → 목표 좌표로 bezier 이동

requestAnimationFrame (fps 분할)
  └ WorldEngine.render() → draw()
      ├ 카메라 x,y,z 로 tileSize = min(w,h)/z, offset 계산
      ├ snapShot(): 그리드 전체(w×h) 순회 → 타일별 objet 수집 → 가시성(culling) 판정
      ├ z 정렬 (z = y + 타입order·world.w)  ← 아래쪽에 있을수록 앞에 그림
      └ LayerDrawObject.render() → translate/rotate → 각 SubObject.render() → ctx.fill/stroke/drawImage
```

### 1.3 핵심 개념 정리

| 개념 | lazycollect 구현 | 비고 |
|---|---|---|
| 월드 | `Worlds { w, h, color, objets[] }` 정수 그리드 | 좌표 단위 = 타일 |
| 카메라 | WorldEngine 자신의 `x, y, z` (z = 화면에 보이는 타일 수 = 줌) | 이동도 transaction 으로 bezier |
| 오브젝트(Objet) | `x,y,w,h,rotate,z,type,frame,b(bezier),talk,objetHasCategories` | type 별 order 로 레이어 순서 |
| 외형(Layer) | 카테고리 템플릿 + direction 별 변형 + slot 바인딩 | 캐릭터 = 몸통 템플릿 + 옷/얼굴 슬롯 |
| 도형(SubLayer) | `rect / ellipse / path / image / text / group / slot` + `parentTransform`(2D matrix) + `rotate` + `stroke` | path 는 이름 붙은 하위 path 배열 |
| 애니메이션 | `animation[]` 키프레임 + 키프레임별 bezier `b` + `frame`(속도 배수) + `animationIterationCount: infinite` + `animationDirection: reverse` | **= CSS/SMIL 키프레임 그 자체** |
| 보간 | `MathUtil.cubicBezier` 로 모든 프레임 값을 배열로 미리 계산, render 때 index++ | 숫자·숫자배열(path 좌표)·RGBA 채널별 |
| 이벤트 | 캔버스 좌표 → 회전된 rect 직접 hit-test (CLICK/CANVAS_CLICK/DRAGING/KEY/RESIZE) | DOM 이 해주는 일을 직접 구현 |
| 편집 | 선택/드래그/8방향 리사이즈/회전 핸들을 캔버스에 직접 그리고 계산 (~400 lines) | |
| 날씨 | Weather 툴: 구름 ellipse, 빗방울 파티클을 매 프레임 이동 | |
| 미니맵 | MiniMap 툴: 같은 데이터를 작게 한 번 더 그림 | |
| 썸네일 | worker.ts: OffscreenCanvas 에 1프레임 렌더 → ImageBitmap | |
| 리소스 | WorldResourceManager: 이미지 URL → ImageBitmap 캐시 | |

### 1.4 canvas 방식에서 비용이 컸던 지점 (= SVG 로 오면 사라지는 것)

1. **매 프레임 전체 재그리기** — 그리드 w×h 전체를 순회(snapShot)하고 모든 objet 을 다시 그림. 정지된 건물도 매 프레임 비용.
2. **보간 엔진 직접 구현** — `RenderTransactionDrawObj` 가 bezier 프레임을 미리 계산, `LayerStore` 가 도형 속성마다 `calc` 키(`rect-w`, `path-xxx-color-r` …)를 수십 개씩 등록. 브라우저의 `cubic-bezier()` / `keySplines` 가 하는 일.
3. **DPR·리사이즈 처리** — `devicePixelRatio` 스케일, getBoundingClientRect 재계산. 기기별 선명도 차이의 원인.
4. **hit-test·편집 핸들 수작업** — 회전 사각형 판정, 드래그 상태머신.
5. **z 정렬** — 매 프레임 sort.

---

## 2. SVG 로의 1:1 매핑

| lazycollect | SVG 대응 | JS 필요량 |
|---|---|---|
| WorldEngine 카메라 x,y,z | 루트 `<g id="camera">` 의 `transform` (또는 `viewBox`) + CSS `transition: transform .8s cubic-bezier(...)` | 휠/드래그 → transform 값 세팅만 |
| 매 프레임 draw 루프 | **없음** (retained mode, 브라우저가 알아서 그림) | 0 |
| Worlds 그리드 | 위경도 좌표계 (`x = lon`, `y = -lat`, viewBox `-180 -90 360 180`) | 0 |
| LayerDrawObject (Objet) | `<g class="objet" transform="translate(x y) rotate(r)">` | 0 |
| 카테고리 템플릿 + direction | `<defs><symbol id="char-front">…` + `<use href="#char-front">` | 방향 바뀔 때 `href` 교체 1줄 |
| slot 바인딩 | symbol 안에 `<use href="#hat-01">` 중첩 | 0 |
| SubLayer rect/ellipse/path/image/text | `<rect>/<ellipse>/<path>/<image>/<text>` 그대로 | 0 |
| parentTransform (matrix t0~t5) | `transform="matrix(a b c d e f)"` 그대로 | 0 |
| animation[] 키프레임 + bezier b | `<animate values="…" keyTimes="…" keySplines="…" calcMode="spline">` / `<animateTransform>` | 0 |
| animationIterationCount infinite | `repeatCount="indefinite"` | 0 |
| animationDirection reverse | `values` 를 왕복으로 나열 (a;b;a) 또는 CSS `animation-direction: alternate` | 0 |
| frame (속도 배수) | `dur` 값 | 0 |
| path 모핑 (path-xxx values 배열) | `<animate attributeName="d" values="…">` (명령 구조 동일해야 함 — 기존 제약과 같음) | 0 |
| 색 보간 (RGBA 채널별 calc) | `<animate attributeName="fill" values="#a;#b">` | 0 |
| objet 이동 transaction | CSS `transition: transform Ns linear` + `transitionend` 에서 다음 목적지 / 또는 `<animateMotion path>` 순찰 경로 | 배회 AI 수십 줄 |
| z 정렬 | DOM 순서. 건물은 정적이라 데이터에서 y 순 정렬 1회. 캐릭터는 별도 레이어 | 목적지 도착 시만 재정렬(필요하면) |
| WorldEventManager hit-test | `addEventListener('click')` on `<g>` / `pointer-events` | 0 |
| 편집 핸들 | **당분간 안 만듦** — 데이터 파일(JSON/SVG)을 직접 편집 | — |
| Weather | `<pattern>` 빗줄기 + `<animateTransform>` 흘리기, 구름 = ellipse 묶음 + 느린 translate | 0 |
| MiniMap | 두 번째 `<svg>` 에서 `<use href="#world-land">` — 같은 지도 재사용 | 0 |
| worker 썸네일 | 불필요 (SVG 직렬화가 곧 스냅샷) | — |
| WorldResourceManager | 브라우저 캐시 + `<image href>` | 0 |
| WorldSyncCacheManager (6초 polling, DB) | 레포 안 static JSON / SVG 파일 | fetch 1회 |

**결론:** 엔진 5.3k 줄 중 실제로 SVG 에서 다시 짜야 하는 건 ① 카메라 팬/줌 ② 캐릭터 배회(다음 목적지 고르기) ③ 줌 레벨별 표시(LOD) ④ 라디오 정도. 나머지는 마크업(데이터)으로 바뀐다. 엔진 코드를 포팅하는 게 아니라 **데이터 형식(SubLayer + animation)을 SVG 마크업으로 옮기는 것**이 전환의 본질.

---

## 3. 확정 설계 (2026-11-21, 1단계 구현 완료)

> 처음에 제안했던 equirectangular 평면 지도(`x=경도, y=-위도`)는 **"360도 돌리는 지구본"** 요구 때문에 버렸다.

### 3.1 좌표·투영: 지구본 → 지역 평면

| 줌 | 투영 | 그리는 것 | 비용 |
|---|---|---|---|
| 지구본 (k 작음) | `d3-geo` 정사영(orthographic). 회전·클리핑은 d3 가 처리 | 바다·국경 path 177개·경위선·마커 | 회전/줌하는 프레임에만 path 재계산 |
| 지역 (k 큼) | sector 의 local 평면 좌표. 투영 없음 | 지면 svg + entity 배치 + 배회 | 정지 상태면 JS 0, SMIL/CSS 만 동작 |

- 카메라 = 화면 중심의 경위도 `(lon, lat)` + 줌 `k` (k=1 이면 지구 전체가 화면에 들어옴, `K_MAX=4000`).
- 지역 장면은 색인의 `bounds`(실제 경위도 사각형)를 투영한 북서·남동 모서리에 맞춰 **평평하게** 올린다. 도시 하나 크기에서는 곡률을 무시해도 된다.
- 장면의 로컬 좌표 = bounds 를 등장방형으로 펼친 것이다. 그래서 `tools/geo-local.mjs` 로 실제 경위도를 로컬 좌표로 바꾸면 한강·남산·광화문이 실제 위치에 놓인다.
- 가장자리는 **실제 행정 경계(boundary.json, 경위도 폴리곤)** 를 투영한 clipPath 로 자르고 경계선만 그린다. 뿌옇게 녹이는 처리는 하지 않는다 (2026-11-21 사용자 요청).
- 데이터 출처: 서울 경계는 southkorea-maps (kostat 2013, simplified), 한강은 Natural Earth 10m 하천 중심선.
- 국경: Natural Earth 110m → `tools/build-countries.mjs` 로 1회 변환 → `countries.json` (174KB, `iso`·한글 `name` 만 유지).
- 국기 이모지는 ISO 코드로 계산한다 (`🇰🇷`). 데이터에 따로 저장하지 않는다.

### 3.2 줌 단계별 표시 (LOD) — 리소스 절약

| 조건 | 동작 |
|---|---|
| `k` 가 sector `zoom: [min, max]` 범위 안이고, 지구 앞면에 있음 | 마커 표시 (나라는 국기 + 이름, 도시는 이름) |
| local sector 의 장면(bounds) 폭이 **80px 초과** | `sector.json` 과 사용하는 entity 를 불러와 DOM 에 붙임. opacity 가 80→300px 구간에서 0→1 |
| 장면 폭이 **40px 미만** 이거나 지구 뒷면으로 넘어감 | DOM 에서 제거 + 배회 타이머 정지 |
| `k < 2.2` 이고 5초 동안 입력 없음 | 지구본이 천천히 자전 |

| `k ≥ 6` 이고 땅 위인데, 보이는 장면이 없음 | **🚧 이 지역은 아직 준비 중이에요** + "서울 구경 가기" 버튼 |
| 색인에 있지만 `local` 이 아닌 도시 | 마커 옆에 `준비 중` 태그 (부산·도쿄·파리·뉴욕) |

애니메이션 비용은 "지금 화면에 붙어 있는 지역"만큼만 든다.

### 3.3 현재 위치 판정 = 세계 경계

- "세계 선택" UI 는 없다. 화면 중심이 어느 나라 폴리곤 안에 있는지(`geoContains`)로 판정하고, 카메라가 멈춘 뒤 250ms 에 한 번 계산한다.
- 결과는 HUD 이름 표시(`🇰🇷 대한민국 · 서울`), 나라 강조색, 라디오 전환에 쓰인다.
- 국경을 넘으면 그냥 다른 나라가 된다.

### 3.4 파일 구조 (실제)

```
apps/center/src/pages/world/
  WorldPage.ts        페이지: 지구본 투영, 입력(드래그/휠/핀치/더블클릭), LOD, 마커, HUD, 라디오 UI
  entity.ts           entity 로더 → <defs><symbol> 등록, id 접두어, 순환 검사
  scene.ts            sector 장면: 지면 + placements + 행동(wander / route)
  radio.ts            radio-browser 조회 (https·HLS 필터, 가까운 순 정렬)
  tools/build-countries.mjs   Natural Earth → countries.json (1회성)
  tools/check-data.mjs        datas/world 정합성 검사 (색인·참조·순환·viewBox·bounds)
  tools/geo-local.mjs         경위도 → 로컬 좌표 / 실측 선 → 부드러운 path (도시 만들 때)

datas/world/
  worlds.json                 ★ 세계·섹터 색인 (이름·geo·zoom·local 여부)
  entities.json               ★ entity 색인
  worlds/earth/world.json     지구본 설정 (바다·땅 색, 자전 속도, 국경 파일)
  worlds/earth/countries.json
  worlds/earth/korea/seoul/sector.json + ground.svg + boundary.json
  entities/<분류>/<이름>.svg                 svg 하나로 끝나는 entity
  entities/<분류>/<이름>/entity.json + *.svg  조립·방향·행동이 있는 entity
```

---

## 4. 라디오

검증 결과 (2026-11-21, 직접 호출):

- `https://de1.api.radio-browser.info/json/stations/search?has_geo_info=true&countrycode=KR` → **CORS `Access-Control-Allow-Origin: *`** — 브라우저에서 바로 호출 가능, 서버 불필요.
- 응답에 `geo_lat`, `geo_long`, `url_resolved`, `codec` 포함 → 지도 위경도와 그대로 일치.
- ⚠️ **Mixed content**: GitHub Pages 는 https 라서 `http://` 스트림은 브라우저가 차단. KR 예시 23개 중 https 는 9개. → `url_resolved.startsWith('https')` 만 사용.
- 선택 규칙: 카메라 중심에서 가장 가까운 (https) 방송국. 나라가 바뀌면 그 나라 목록에서 다시 고름.
- 재생: `<audio>` 하나로 충분. 다음 방송국 넘기기 버튼 정도.
- 서버 미러: 2026-11-21 기준 응답하는 건 `de1`, `de2` (fi1/at1/nl1 은 응답 없음) → 순서대로 재시도.
- ⚠️ **HLS**: KR https 38개 중 29개가 `.m3u8`(HLS)이고, Safari 만 `<audio>` 로 재생 가능. `canPlayType('application/vnd.apple.mpegurl')` 가 비면 HLS 를 제외한다 → Chrome 에서 KR 은 9개. KBS/MBC/SBS 같은 주요 방송은 Chrome 에서 빠짐. 필요하면 hls.js 를 붙이는데, 스트림 서버의 CORS 가 필요하다.
- 구현: 📻 를 누르면 켜짐(자동재생 정책 때문). 켜져 있으면 나라가 바뀔 때 1.2초 뒤 그 나라 방송으로 넘어감. 재생이 실패하면 다음 방송국으로 넘어가고, 최대 8번까지 시도.
- GPS: sector 마다 `geo`(위경도). 라디오는 **화면 중심 좌표**에서 가장 가까운 방송국을 고름. 📍 버튼은 기기 위치(`navigator.geolocation`)로 날아감.

lazycollect 쪽 라디오 연결 방식: §7.2 참고.

---

## 5. 성능 주의점 (SVG 의 천장)

| 위험 | 내용 | 대응 |
|---|---|---|
| SMIL 애니메이션 수 | 화면 밖 요소도 애니메이션은 계속 돔. 수천 개면 CPU 소모 | 나라별 lazy load + 화면 밖 나라는 DOM 에서 제거 |
| 국경 path 복잡도 | 50m 데이터는 무겁다 | 110m 로 시작, 필요 시 국가별 단순화 |
| 필터(blur/shadow) | SVG filter 는 비쌈 | 쓰지 않거나 정적 요소에만 |
| 줌 중 transform 애니메이션 | 큰 DOM 전체 리페인트 | `will-change: transform` on camera group |

어디까지 버티는지는 실제로 나라 몇 개 채워보고 측정. 천장에 닿으면 그 때 culling 강화.

---

## 6. 진행 상황

- [x] 1단계: 지구본(d3-geo 정사영) + 드래그/휠/핀치/더블클릭 + 자전 + 현재 나라 판정
- [x] 라디오: 현재 나라 → https 방송국, 가까운 순, HLS 필터
- [x] 서울: 지면(북악산·광화문 광장·종로·남산·강변북로·한강·다리·강남 강변) + entity 13종
- [x] 배회(wander)·경로(route)·방향별 view·CSS 변수 색 주입
- [x] 데이터 검사 스크립트
- [x] 서울을 실제 지형으로: bounds·행정 경계 clip·실측 한강·청계천·다리 4곳·지명, 준비 중 표시, 📍 내 위치 마커와 원인별 안내
- [ ] 다음 후보: 낮밤(경도 기준 현지 시각), 날씨, 다른 나라(파리·교토…), 달/화성 + 세계 전환, 나무 뒤로 지나가는 깊이 정렬

lazycollect 의 기존 SubLayer 데이터(비둘기 등)를 재사용하려면 **SubLayer JSON → SVG 변환 스크립트**(1회성)를 만드는 게 엔진을 포팅하는 것보다 훨씬 싸다.

---

## 7. lazycollect 데이터 모델 · 라디오 사용처 (조사)

엔티티는 `lazycollect/shares/entities/` 에 있음 (`@shares` alias).

### 7.1 엔티티

- **World** (`World.ts`): `w, h`(그리드 크기), `color`, `address`(문자열일 뿐이고 좌표로 변환되지 않음), `weather`(CLEAR…STORM), `timeRatio`. `Worlds` 가 여기에 `objets[]` 를 붙임. Tile 엔티티는 없음 — `GROUND` 타입 objet 이 타일 역할을 함.
- **Objet** (`Objet.ts`): `type, x,y,z,w,h, rotate, frame, b(bezier), talk`.
  - `ObjetType`: GROUND, GROUND_ITEM, GROUND_STRUCTURE, OBJECT_ITEM_ISSUE, OBJECT_GROUND_STRUCTURE, OBJECT_USER, FOR_GROUND_STRUCTURE, FOR_GROUND_SKY.
  - `ObjetTypeMetaData` 에 타입별 그리기 순서 `order`(10~80) 와 `editable` 여부가 있음.
  → SVG 에서는 이 order 를 **레이어 `<g>` 순서**로 쓰면 됨 (ground → structure → user → sky).
- **Layer** (`Layer.ts`, `LayerType.ts`): 0..1 정규화 좌표를 쓰는 벡터 트리.
  - 타입: rect, img, text, path(line, bezier, rect, ellipse), ellipse, group, slot.
  - 그 밖의 필드: `parentTransform`, `animation[]`, `animationIterationCount`, `animationDirection`.
  - `LayerCategoryCode`: pigeon, normalStatic, normalSpin, normalBounce, normalTilt 계열.
  - `LayerDirection`: front, back, left, right.
  → **0..1 좌표계는 `<symbol viewBox="0 0 1 1">` 과 정확히 같다.** 변환 스크립트가 아주 단순해짐.
- **샘플**: `src/data/pigeon.ts` (5.5k lines) 는 손으로 만든 벡터 비둘기임. 방향 4개마다 몸통·꼬리·그림자 group/slot 이 있고, 회전 키프레임이 반복됨. `normal.ts` 는 기본 모션 템플릿(spin/bounce/tilt), `layer-data/flower/*` 는 bezier path 꽃, `talk.ts` 는 말풍선 문장 모음.
  → 비둘기·꽃·기본 모션은 **SVG 로 변환해서 재사용할 1순위 자산**. normalSpin/Bounce/Tilt 는 CSS `@keyframes` 클래스 몇 개(`.spin`, `.bounce`, `.tilt`)로 대체 가능.
- 스프라이트시트나 프레임 인덱스 개념은 없음. 모두 벡터 키프레임 tween 이라 SVG 와 궁합이 좋음.
- **배회/AI 코드 없음**: 이동은 서버가 objet 좌표를 바꾸면 클라이언트가 보간해서 보여주는 방식이었음. static 에서는 클라이언트가 목적지를 직접 골라야 하므로 `wander.ts` 는 **새로 작성**해야 함.

### 7.2 라디오 (lazycollect)

- `apps/lazycollect/src/pages/worlds/{world}/world.component.ts:750` 에서 `radio-browser-api` 패키지로 `searchStations({countryCode:'KR', limit:100})` 를 호출함. **나라가 KR 로 하드코딩**되어 있고, 결과를 셔플해 `<select>` + `<audio>` 로 재생함.
- 방송국을 월드나 위치에 연결하는 로직은 없음. 위경도를 쓰지 않음.
- ISO 3166 국가 코드 목록(`@dooboostore/core/code/IOS3166_1`)은 불러오지만 UI 에서는 쓰지 않음.
- → 이번에 새로 붙는 것: **현재 나라 판정 → countrycode, 카메라 중심 → `geo_lat/geo_long` 최근접 방송국, https 필터.** 패키지 없이 `fetch` 로 충분함 (§4).

### 7.3 지리

- lazycollect 에는 세계지도·국가·위경도 모델이 없음. `World.address` 는 문자열일 뿐임. 지도 레이어는 완전히 새로 만드는 부분.

---

## 8. 데이터 형식

### 8.1 색인 — `worlds.json`

```jsonc
{ "worlds": [ { "id": "earth", "name": "지구", "sectors": [
  { "id": "korea",       "name": "대한민국", "geo": { "lat": 36.4,  "lon": 127.9 }, "zoom": [1.8, 60] },
  { "id": "korea/seoul", "name": "서울",     "geo": { "lat": 37.56, "lon": 126.98 }, "zoom": [9, 400], "local": true,
    "bounds": [[126.76, 37.42], [127.19, 37.7]] },                     // [[서경,남위],[동경,북위]] — 장면이 놓일 실제 영역
  { "id": "korea/busan", "name": "부산", "geo": { "lat": 35.18, "lon": 129.08 }, "zoom": [9, 400] }   // local 없음 → 준비 중
] } ] }
```

- **색인 = "무엇이 어디에 있나"** (이름·geo·zoom·bounds), **sector.json = "그 안에 무엇이 있나"** (내용). 같은 정보를 두 곳에 두지 않는다. 📍 내 위치가 어느 도시 안인지도 색인의 bounds 로 판정한다.
- sector `id` 는 폴더 경로다. `local: true` 일 때만 `worlds/<world>/<id>/sector.json` 을 불러오므로 404 가 나지 않는다.
- 지구본 단계는 색인 하나만으로 마커를 그린다. sector 파일을 여러 번 요청하지 않는다.
- 달·화성은 같은 구조로 `worlds[]` 에 추가하면 된다 (라디오만 없음). 세계 전환 UI 는 아직 없다.

### 8.2 색인 — `entities.json`

`{ "entities": [ { "id": "people/walker", "name": "산책하는 사람" }, ... ] }` — 검사 스크립트가 "색인에 없는 entity 참조"와 "어디서도 안 쓰는 entity"를 잡아낸다.

### 8.3 entity

| 형태 | id 예 | 파일 |
|---|---|---|
| svg 하나 | `nature/ginkgo.svg` | `entities/nature/ginkgo.svg` |
| 조립형 (사람·동물: 앞/뒤/옆 view, 부품 교체) | `people/walker` | `entities/people/walker/entity.json` + `*.svg` |

**탈것은 조립형을 쓰지 않는다** — 바퀴·그림자를 `body.svg` 안에 직접 넣어 `<이름>.svg` 하나로 둔다 (`vehicle/bus.svg`).
탈것은 view 가 하나뿐이고 부품을 갈아 끼울 일이 없어서, 폴더로 쪼개면 파일만 4배가 된다.
바퀴 회전은 합친 svg 안에서 `<animateTransform>` 으로 그대로 살린다.
기존 조립형 탈것은 `tools/merge-vehicles.mjs` 로 한 번에 합친다 (사람·동물은 그대로 둔다).

```jsonc
// entities/people/walker/entity.json  ← 조립형은 사람·동물처럼 view/부품 조합이 필요할 때만
{
  "svg": "body.svg",                // 자기 폴더 기준 상대경로. 크기 = viewBox
  "foot": [0.5, 1],                 // 기준점(viewBox 비율): 배치 좌표·y정렬 기준
  "parts": [                        // 조립: 다른 entity 참조 (entities/ 루트 기준 id)
    { "use": "parts/shadow.svg", "at": [6, 17.6], "scale": 1, "under": true }
  ],
  "behavior": { "type": "wander", "speed": 5, "pause": [2, 9] }   // 선택, 배치에서 덮어씀
}
// 방향이 있는 entity: "svg" 대신 "views": { "front": {"svg":..}, "left": {..}, "right": {"mirror":"left"}, "back": {..} }
```

- part 필드: `use`, `at`(부모 viewBox 좌표), `scale`, `rotate`, `anim`(`spin` 등 CSS 클래스), `under`(본체 아래에 그림).
- 방향 선택: front/back 이 있으면 세로 이동에 쓰고, left/right 가 있으면 가로 이동에 쓴다. 없는 방향은 첫 view 로 대신한다.

**svg 작성 규칙**

1. `viewBox` 는 필수다.
2. svg-only entity 의 기준점은 `data-foot="0.5 0.5"` 속성으로 정한다 (기본은 바닥 중앙).
3. 자체 애니메이션은 SMIL (`<animate>`, `<animateTransform>`, `<animateMotion>`) 로 쓴다.
4. `<style>` 태그는 쓰지 않는다 (인라인되면 전역으로 섞임). 색은 속성으로 지정한다.
5. 바꿔 쓸 색은 `fill="var(--shirt, #8cbfdc)"` 로 둔다. 배치할 때 `vars` 로 주입하며, CSS 변수가 `<use>` 안쪽까지 상속된다 (lazycollect 의 slot 색 바인딩을 대체).
6. 파일 안 `id` 는 자유롭게 써도 된다. 로더가 entity 별 접두어를 붙인다.

**로더 동작** (`entity.ts`)

1. fetch 하고, id 에 접두어를 붙인 뒤 DOMParser 로 파싱한다.
2. parts 를 재귀로 불러온다. 순환 참조는 에러로 처리한다.
3. `<defs>` 에 view 마다 `<symbol>` 을 **한 번만** 등록한다.
4. 배치는 전부 `<use href>` 로 한다. 같은 entity 를 100개 놓아도 정의는 1개다.

### 8.4 sector — `sector.json`

```jsonc
{
  "local": { "size": [960, 789], "ground": "ground.svg", "boundary": "boundary.json" },   // 로컬 좌표 크기(bounds 비율), 지면 svg, 행정 경계(경위도 GeoJSON)
  "placements": [
    { "use": "building/gwanghwamun.svg", "at": [240, 104] },                     // 하나
    { "use": "nature/ginkgo.svg", "at": [[20, 136], [60, 136]] },                // 여러 개
    { "use": "people/walker", "count": 14, "area": [150, 130, 230, 56],          // 영역 안에 무작위 + 배회
      "vars": { "--shirt": ["#8cbfdc", "#e9a6a1"] } },                           // 배열이면 무작위로 고름
    { "use": "vehicle/bus.svg", "count": 2, "flip": true, "vars": { "--bus": "#5d8fd6" },
      "behavior": { "type": "route", "path": "M520 124 H-40", "dur": 48 } }     // 경로 순환 (SMIL animateMotion)
  ]
}
```

- 정적 배치는 foot y 기준으로 한 번 정렬한다 (아래쪽이 앞).
- 움직이는 것은 정적 레이어 위의 별도 레이어에 둔다.
  - ponytail 메모: 나무 뒤로 지나가는 깊이 표현이 필요해지면, 목적지에 도착할 때마다 재정렬하면 된다.
- wander 이동은 JS 가 목적지만 고르고, 실제 움직임은 CSS `transition: transform` 이 처리한다. 걷는 동안에는 `.walking` 클래스를 붙여 몸을 들썩이게 한다.

### 8.5 새 도시 만드는 순서

1. 실제 영역을 정한다. `node tools/geo-local.mjs size <서경> <남위> <동경> <북위> 960` → 비율이 맞는 `size`.
2. `worlds.json` 에 `bounds`·`local: true` 를 넣고, 폴더에 `boundary.json`(행정 경계 GeoJSON)을 둔다.
3. 강·해안선은 `geo-local.mjs line` 으로, 랜드마크 위치는 `geo-local.mjs point` 로 로컬 좌표를 얻는다.
4. 위 좌표로 `ground.svg` 와 `sector.json` placements 를 작성한다.
5. `node apps/center/src/pages/world/tools/check-data.mjs` 로 검사한다.

주의: entity 는 실제보다 10배쯤 과장해서 그리므로, 실제로 가까운 랜드마크끼리는 겹칠 수 있다. 그럴 때는 위치를 조금씩 벌린다 (예: 북촌 한옥은 광화문 동쪽으로 이동).

### 8.6 그림체 가이드 (힐링 게임 2D, 2026-11-21)

- **부드럽게 (필수, 2026-11-21 사용자 지시)**: 날카로운 직각·뾰족한 끝은 쓰지 않는다.
  - 사각형은 `rx` 로 둥글린다.
  - 지붕 처마 끝은 `C` 곡선으로 말아 올리고, 끝에 둥근 마감을 단다.
  - 선은 `stroke-linecap/linejoin="round"`.
  - 언덕·산은 밑단까지 둥글게 땅에 앉힌다 (밑에 납작한 그림자 타원).
- **빈틈 금지**: 지붕 아랫면과 벽 윗면 사이에는 처마 밑 서까래 띠(`#8a5a3f`)를 넣어 메운다. 배경이 비쳐 보이면 안 된다.
- **물 위에 놓지 않기**: `scene.ts` 가 정적 배치의 바닥면 9곳을 검사한다. 무작위 배치는 애초에 걸러내고, 명시 좌표(`at`)는 `scene.issues` 와 콘솔 경고로 알린다.
- **머리카락은 정수리를 덮는다 (2026-11-21 대머리 버그)**: 머리 윗선은 머리 원(반지름 4.7)보다 조금 큰 **원호**로 그린다. 예: 앞모습 `M1.15 7.2 A4.95 4.95 0 1 1 10.85 7.2 …`, 옆모습 `M1.3 5.6 A4.95 4.95 0 1 1 10.9 6.6 …`.
  - 끝점이 머리 중심보다 아래면 **큰 호 플래그 `1 1`**, 위면(모자 등) `0 1` 이다.
  - 베지어 제어점을 머리 끝에 두면 곡선이 거기까지 닿지 않아 정수리 피부가 드러난다.
  - 새 사람을 만들면 앞·옆·뒤를 한 화면에 모아 렌더해서 확인한다.
- **외곽선**: 모든 형태에 `stroke="#5b4636"` (따뜻한 갈색) + `stroke-linejoin="round"`. 굵기는 entity 크기에 비례한다 (사람 0.45, 건물 0.55~0.6, 산 1).
- **2톤 명암**: 윗면에는 흰색 하이라이트(opacity 0.2~0.3), 아래쪽에는 검정 그림자(opacity 0.08~0.12)를 덧칠한다.
- **바닥 그림자**: `#3b5a2e`, opacity 0.2 의 납작한 타원 (`parts/shadow.svg` 또는 svg 안에 직접 그림).
- **사람**: 치비 비율 (머리 반지름 4.7 / 키 18). 큰 눈 + 눈 하이라이트 + 볼터치.
- **팔레트**: 잔디 `#b3de92` + 무늬 패턴, 물 `#7cc6ea` + 흰 물거품 테두리, 길 `#e9e3d7`, 기와 `#5d6c7a`/`#66788a`, 단청 빨강 `#c2523f` · 초록 `#3f9a80`, 은행잎 `#f6c944`.
- **밤 불빛**: 불이 켜지는 요소는 `style="opacity: var(--night, 0)"` 로 쓴다 (항상 켜진 창 일부는 `calc(0.35 + var(--night, 0) * 0.65)`). `--night` 는 엔진이 `#scenes` 에 0~1 로 넣는다.
- **XML 주석 안에 `--` 금지**: CSS 변수 이름을 주석에 쓰면 DOMParser 가 파싱에 실패한다. `check-data.mjs` 가 검사한다.
- **낮밤 처리**: 화면 중심 경도의 현지 태양시를 쓴다 (새벽 5~6.5, 낮 ~17, 노을 ~18.5, 저녁 ~20, 그 뒤는 밤). 화면 전체에 multiply 색조를 깔고, 줌 4~10 구간에서 서서히 짙어진다. 🕐 버튼으로 자동 → 낮 → 노을 → 밤 순서로 고정할 수 있다.
  - ponytail 메모: 지금은 불빛도 어둠 색조 아래에 있다. 불빛을 더 쨍하게 하려면 "빛 레이어"를 색조 위로 분리해야 하는데, 그러려면 entity 구조를 바꿔야 해서 보류했다.

### 8.7 지형 구역 · 레이어 · 날씨 (2026-11-21)

**지형 구역** (`data-zone`)
- 지면 svg 요소에 `data-zone="water|road|bridge"` 를 단다. `fill="none"` 인 선은 stroke 영역으로, 나머지는 fill 영역으로 판정한다 (`isPointInStroke` / `isPointInFill`, 브라우저 내장).
- wander 의 `avoid`(기본 `["water"]`)·`allow`(기본 `["bridge"]`):
  - 목적지는 물론 **가는 길 전체**를 3단위 간격으로 검사한다.
  - 사람: `avoid: ["water","road"]`. 강 건너편으로는 다리로만 건넌다.
  - 비둘기: `avoid: ["water","road"]`.
  - 나비: `avoid: []`. 물 위를 날 수 있다.
- 무작위 배치(`count + area`)도 avoid 구역을 피한다. 명시 좌표(`at`)가 막힌 구역에 있으면 콘솔에 경고가 뜬다.
- 검증 (헤드리스, 30초 샘플링):
  - 사람: 720회 중 물·도로 0
  - 비둘기: 180회 중 0
  - 깊이 순서: 5,040번 비교해서 오류 0

**레이어** (아래 → 위)
1. ground: 지면
2. water: `placement.layer="water"` — 유람선
3. over: 지면 svg 의 `<g data-layer="over">` — 다리, 분수
4. world: 건물·나무·사람·버스 — 발 y 로 정렬, 400ms 마다 다시 정렬
5. sky: `layer="sky"` — 새 떼

배회 이동은 Web Animations API 로 한다. CSS transition 은 노드를 재정렬(재삽입)할 때 취소되기 때문이다.

**바퀴**: part `anim:"spin"` 은 SMIL `animateTransform rotate` 로 처리한다. CSS `transform-box` 는 `<use>` 인스턴스 트리 안에서 회전 중심이 어긋났다.

**시간·날씨 패널 (⛅)**
- 시간: 자동(현지 태양시) / 새벽 / 아침 / 낮 / 노을 / 저녁 / 밤
- 날씨: 맑음 / 흐림 / 비 / 뇌우 / 눈 / 안개
- 효과는 화면 공간 오버레이다. 비·눈은 `patternTransform` SMIL, 뇌우 번개는 opacity 깜빡임, 흐림·안개는 떠다니는 그림자·안개 덩어리로 표현한다.
- 고른 값은 localStorage 에 저장한다. 실패해도 동작은 그대로다.

### 8.8 세계 · 교통 · URL · 모바일 (2026-11-21)

**세계 (지구 · 달 · 화성)**
- `worlds.json` 의 `worlds[]` 에 `id / name / icon / sectors` 를 둔다.
- `worlds/<id>/world.json` 필드:
  - `surface`: 구 그라디언트
  - `glow`
  - `countries`(지구) 또는 `features` + `styles`(달·화성)
  - `radio`, `atmosphere`
  - `traffic`
- 달·화성 지형은 `tools/build-bodies.mjs` 가 생성한다. 실제 경위도·지름을 원(`circle: [lon, lat, 반지름°]`)으로 근사하고, 계곡·광조는 선(`line` + `width°`)으로 그린다. 작은 크레이터는 시드 고정 난수로 채운다.
- 대기가 없는 세계(`atmosphere: false`)에는 하늘빛·날씨가 없다. HUD 는 화면 중심을 품은 가장 작은 이름 있는 지형을 보여준다 (예: 🔴 화성 · 타르시스 고원).
- 지구 밖 sector(착륙 지점 등)는 모두 "준비 중" 이다.

**교통 (`world.json` 의 `traffic`)**
- `{ use, kind: sea|air, path: [[lon, lat]…], dur, count, pingpong, size, vars }`
- 경로는 대권으로 보간한다. 엔진은 매 프레임 투영하고, 진행 방향으로 회전시킨다. 줌 60 미만에서만 보인다.
- 비행기·컨테이너선·항공모함은 위에서 본 entity 다 (`vehicle/airplane.svg` 등).
- `check-data.mjs` 가 **배 항로가 육지를 지나는지** 25km 간격으로 검사한다. 110m 국경 데이터가 거칠어서 해협은 경유점을 촘촘히 둬야 한다 (말라카·바브엘만데브).

**사람과 다리**: wander 가 목적지로 바로 못 가면 다리 양 끝을 출입구로 써서 `이쪽 → 다리 → 저쪽` 경유점을 만든다.
- 검증 (30초): 사람 31명 중 16명이 다리를 건넜다. 물·도로 위는 1,860회 샘플 중 0회.

**URL · 공유**
- `?w=earth&lat=37.53&lon=126.99&z=1105&t=day&wx=rain` 형식이다. `t` 와 `wx` 는 자동·맑음이 아닐 때만 들어간다.
- 카메라가 멈출 때마다 `history.replaceState` 로 갱신한다. 이 URL 로 들어오면 그 세계·위치·줌·시간·날씨로 시작하고, 30초 동안은 자전하지 않는다.
- 🔗 버튼: `navigator.share` 를 쓰고, 없으면 클립보드에 복사한다.

**바다 물결**: 화면에 고정된 패턴은 지구를 돌려도 움직이지 않아 헷갈린다. 그래서 위경도 격자(6.5°×9°, 엇갈림) 중 바다인 606개 지점을 투영해 `~` 를 그린다. 지구와 함께 돌고, 가장자리일수록 작아진다.

**라디오 UI**: 화면을 최대한 비우기 위해 오른쪽 아래 📻 아이콘 하나로 줄였다. 재생 중이면 음파 배지가 움직인다. 누르면 시트가 열리고, 그 안에 현재 방송 · ⏭ · ⏯ · 방송국 목록(가까운 순)이 있다.

**기타 UI**
- 🎲 랜덤 여행: 현재 세계 안에서 고른다. 만들어진 마을(가중치 4), 마커, 나라(지구), 이름 있는 지형(달·화성) 중 하나.
- 📻 방송국 목록 (☰ 또는 방송 이름을 누름): 그 나라 https 방송국을 가까운 순으로 보여주고, 골라서 듣는다. 재생 실패 시 다음 방송으로 넘어가며 토스트로 알린다.
- 위쪽 ⛅ 버튼은 지금 고른 시간대 아이콘을 보여주고, 맑음이 아니면 날씨 배지를 붙인다. 대기가 없는 세계에서는 🌌 이다.
- 모바일(≤640px):
  - 제목·힌트 숨김, 버튼 40px
  - 장소·라디오 바를 하단에 쌓음
  - 시간·날씨 / 방송국 / 세계 선택은 **아래에서 올라오는 시트** (한 번에 하나)
  - `env(safe-area-inset-*)` 반영
  - 핀치는 두 손가락 가운데를 기준으로 확대 (휠도 커서 기준), 터치 더블탭은 그 자리로 확대

### 8.9 높이 z 와 카메라 높이 (2026-11-21)

로봇의 `base_link` z 처럼 모든 것에 **지면 위 높이**가 있고, **카메라 높이**와 비교해 보이는지 정한다. 이전의 임의 숫자("줌 60 이상이면 교통 숨김")와 꼼수(나비 발 위치를 아래로 빼서 띄우기, 새 전용 sky 레이어)를 대체했다.

- **카메라 높이** = 화면 짧은 변에 보이는 지표 거리의 절반 (시야각 90°) = `반지름 / (0.84·k)`. 지구에서 k=1 이면 약 7,600km, 서울 전체(k≈450) 면 약 17km.
- **페이드 규칙** (교통·배치 공통): `opacity = clamp((카메라높이 / z − 1.5) / 1.5, 0, 1)`. 카메라가 z 의 3배 높이까지 내려오면 흐려지기 시작해 1.5배에서 사라진다. 카메라가 그 높이를 지나가는 것.
- **traffic `z` (km)**: 비행기 10, 배 0 (필수, 검사 스크립트가 확인). 높이 있는 것은 원근으로 `카메라높이 / (카메라높이 − z)` 배 커 보인다 (최대 3배). 배는 항상 보인다.

  | k | 카메라 높이 | 비행기 |
  |---|---|---|
  | 150 | 51km | 1.0 |
  | 300 | 25km | 0.69 |
  | 600 | 13km | 사라짐 |

- **배치 `z` (로컬 좌표 단위, 서울은 1단위 ≈ 39m)**: `placement.z ?? entity.z`. 그만큼 위로 그리고(`.lift`), 땅에는 그림자를 자동으로 둔다. 깊이 정렬은 땅 위치 기준이다. 장면에는 카메라 높이를 로컬 단위로 바꿔 넘긴다 (`scene.setCamera`, bounds 실제 폭 ÷ 로컬 폭).
  - 나비: entity `z: 7`
  - 새 떼: placement `z: 36` → k=4000(카메라 ~1.9km)에서는 새가 카메라 아래로 지나가 사라지고, 나비는 남는다.
- `layer` 는 이제 `"water"`(다리 밑으로 지나가는 배)만 쓴다. 하늘은 z 로 표현한다.

### 8.10 도시 생성 도구 · 교통 다양화 (2026-11-21)

**`tools/build-city.py`** — 서울에서 손으로 하던 과정을 자동화한 것. 실제 데이터로 도시 sector 의 기본 틀을 만든다.
- 경계: Nominatim(OSM) 행정 경계. 여러 개면 합집합으로 만든다 (도쿄 23구 = 구 23개 합침).
- 물: OSM 수면 **면**(`natural=water`, `waterway=riverbank`) — 섬은 구멍으로 남는다 (파리 시테섬). 바다는 `영역 − Natural Earth 10m 육지` 로 구한다. `data-zone="water"`.
- 도로: OSM `highway` (등급은 도시마다 지정). `data-zone="road"`.
- 출력: `boundary.json`, `ground.svg` (끝의 `도시 장식` 주석 아래에 손으로 그린다), `sector.json` 골격, 그리고 `worlds.json` 에 넣을 bounds·size.
- 실행 환경: `shapely` + `certifi` 가 든 venv 에서 `python build-city.py --id france/paris --land ne_10m_land.json`. Nominatim 은 1초 간격으로 요청하고, Overpass 가 429/502/504 를 주면 기다렸다 다시 시도한다.
- `geo-local.mjs point earth/france/paris lon,lat` — sector id 만으로 로컬 좌표를 바로 얻는다.
- 수도 1차: 도쿄(23구, 수면 133), 파리(37), 런던(Greater London, 101), 워싱턴 D.C.(55).

**교통 다양화** (전부 위에서 본 모습, 진행 방향이 위쪽)
- 비행기 3종: `airplane`(소형 쌍발), `jumbo`(4발 + 2층 혹), `turboprop`(프로펠러 회전). 도색은 `--body` · `--stripe` · `--tail` 로 바꾼다. 실제 항공사 도색은 흉내 내지 않는다.
- 배 6종: `container-ship`, `carrier`, `cruise-ship`(`--funnel`), `tanker`, `fishing-boat`(`--hull`), `sailboat`(`--sail`).
- 항로 23개: 대륙 간 노선, 김포↔제주·오슬로↔베르겐 프로펠러기, 카리브·지중해 크루즈, 호르무즈 유조선, 남해·북해 어선, 에게해·시드니 요트. 배 항로는 모두 육지 검사를 통과했다.

### 8.11 라디오: 재생과 목록 분리 · 📌 고정 (2026-11-21)

**예전 버그**: "재생 중인 방송"과 "보고 있는 나라의 목록"을 같은 상태 하나로 써서 생긴 문제다.
- 방송이 없는 나라로 가면 목록은 비는데 오디오는 이전 방송을 계속 틀었다. 그래서 목록에 없는 방송이 나왔다.
- 나라를 빠르게 넘으면 늦게 도착한 이전 요청이 목록을 덮어썼다.

**지금**:
- `playing`(재생 중: 방송 + 나라 + 그 나라 목록)과 `stations`(보고 있는 나라 목록)을 분리했다.
- 목록 요청마다 토큰을 붙여 늦게 도착한 응답은 버린다.
- 재생 줄은 목록 위에 국기와 함께 따로 표시한다.
- 고정하지 않았으면 나라가 바뀔 때 그 나라에서 가장 가까운 방송으로 바꾼다. 방송이 0곳이면 지금 방송을 계속 틀고 토스트로 알린다.
- 📌 고정하면 나라를 옮겨도 바꾸지 않는다. 고정한 방송은 localStorage(`world.radio`)에 저장한다. 다시 열면 재생 줄에 남아 있고, ▶ 를 누르면 이어 듣는다 (자동재생 정책 때문에 바로 틀지는 않는다).
- 재생에 실패하면 **재생 중인 방송의 나라 목록** 안에서 다음 방송으로 넘어간다. 최대 8번 시도한다.

**검증** (헤드리스):
- 고정 없이 KR → KP → JP 로 옮기면 그 나라 방송으로 바뀌고, 재생 중인 방송이 항상 목록에 있다.
- 📌 고정 후 FR 로 가도 JP 방송이 유지된다.
- DE → IT → ES 를 연속으로 넘으면 ES 로 정착한다.
- 방송 0곳인 나라(EH)로 가면 이전 방송을 유지하고 알림을 띄운다.
- 새로고침 후에도 고정이 복원된다.

### 8.12 바다 생물 · 해양 시설, 깊이 정렬 보강 (2026-11-21)

- 지구본 물결 `~` 는 제거했다 (사용자 요청).
- `world.json` traffic 에 바다 생물과 해양 시설을 넣었다. 시설은 경유점 1개짜리 항로로, 움직이지 않는다.
  - 혹등고래 (하와이·아이슬란드·남극해·동해): 천천히 오르내리며 물을 뿜는다.
  - 돌고래 떼 (제주·지중해·플로리다·뉴질랜드): 셋이 번갈아 솟고 물보라를 남긴다.
  - 석유 시추선 (북해·멕시코만·페르시아만): 크레인이 돌고 불꽃이 일렁인다.
  - 해상 풍력단지 (영국 북해·덴마크·서남해·대만해협): 날개가 돈다.
  - `check-data` 가 경로와 한 점짜리 시설 모두 육지 위인지 검사한다.
- `scene.ts` 수정:
  - 경로 검사 간격을 3 → 1단위로 줄였다. 워싱턴 록 크리크처럼 폭이 3단위도 안 되는 개울을 검사점 사이로 건너뛰는 문제가 있었다.
  - 경로 이동체(버스·자동차·자전거·새)의 깊이 y 는 SMIL 시계(`svg.getCurrentTime()`) 와 `path.getPointAtLength` 로 직접 계산한다. `getCTM` 은 순간적으로 0 을 돌려줄 때가 있었다.
  - 깊이 재정렬 주기를 400 → 200ms 로 줄였다.

### 8.13 성능 최적화 · SWC 기능으로 정리 · 🔍 지역 검색 (2026-11-21)

**원인 측정** — Long Animation Frame API 로 한 프레임이 어디에 시간을 쓰는지 쟀다.
- 도시 장면에서 한 프레임이 452ms, 그중 423ms 가 스크립트였다.
- 사람들이 다음 목적지를 고를 때 경로를 1단위 간격으로 검사했고, 그때마다 거대한 OSM path 에 `isPointInFill/Stroke` 를 불렀다. 호출 한 번이 수 ms 이고, 한 번 고를 때 수천 번 불렀다.

**고친 것**
1. **지형 비트맵**: 장면을 붙일 때 `data-zone`(물=R, 도로=G, 다리=B)을 캔버스에 `Path2D` 로 한 번 굽는다 (로컬 1단위당 최대 2px). 판정은 픽셀 하나 읽기(O(1))다. 기존 판정과 4,500번 비교해서 경계 반 픽셀 차이 22건 말고는 모두 일치했다.
2. **컬링 · LOD**: 200ms 마다 화면 밖(15% 여유)이거나 화면에서 너무 작은 개체(사람·동물·차량 8px, 정적 3px 미만)는 `display:none` 으로 숨긴다. 깊이 정렬도 보이는 것만, 순서가 틀린 노드만 옮긴다.
3. **화면 밖 장면은 뗀다**: 반 화면 이상 벗어나면 unmount 한다. 예전에는 서울에 있어도 도쿄 장면이 붙은 채로 계속 돌았다.
4. **넓은 면적 애니메이션 제거**: 구름 그림자 이동, 물결 패턴 이동(`patternTransform`), 강 물빛 점선 흐름. `build-city.py` 템플릿에서도 뺐다.
5. **교통**: 화면 밖 비행기·배는 숨기고 transform 을 쓰지 않는다.
6. **검은 배경 방지**: 확대 상태(k>3)에서는 `#stage` 배경을 땅색(장면이 보일 때) 또는 바다색으로 깐다. 드래그 중 다시 그리기가 늦어도 우주 배경이 비치지 않는다.

**결과** (헤드리스·소프트웨어 렌더 기준, 실제 GPU 기기는 더 빠르다)

| 도시 | 이전 | 이후 |
|---|---|---|
| 파리 | 4fps | 29~46fps |
| 워싱턴 | 4fps | 41fps |
| 서울 | — | 55fps |
| 도쿄 | — | 38fps |
| 런던 | — | 39fps |

드래그를 흉내 냈을 때 39fps 다. 사람이 물에 들어간 횟수는 다섯 도시 모두 0 이다.

**SWC 기능 사용** (직접 구현하던 것을 대체)
- 요소 조회: `@query` (43개, `@query('.sheet', { pick: 'all' })` 포함)
- 매 프레임 루프: `@requestAnimationFrame` (값을 반환해야 다음 프레임이 이어진다)
- 화면 크기: `@resizeObserver('#stage')`
- 1분 시계: `@setInterval(60000)`
- 이벤트: `@event`, 동적 목록은 `@eventDelegate('#stations-list .st' | '.marker' | '.region' | '#world-list [data-world]' | '#env button' | '.sheet-close')`

**SWC 라이브러리 수정** (`packages/@dooboostore/simple-web-component`)
- `@query` 가 `instanceof HTMLElement` 로 결과를 걸러서 SVG 요소를 찾지 못했다. 의도한 게 아니라 누락이었다 (소스·테스트에 SVG 언급 없음). `query.ts` 의 4곳을 `instanceof Element` 로, `applyClass`/`applyStyle` 은 `HTMLElement || SVGElement` 로 바꿨다.
- SVG 조회 테스트를 추가했다. 전체 단위 테스트 259개 통과, dist 다시 빌드.

**🔍 지역 검색**
- 위쪽 🔍 를 누르면 만들어진 지역(모든 세계의 `local` sector) 목록이 바로 나온다. 입력하면 그 안에서 거른다.
- 시트 안의 🎲 는 **걸러진 목록 안에서** 무작위로 고른다. 다른 세계의 지역이면 세계를 전환하고 날아간다.

### 8.14 전체 검토 · 해안선 · 지역 특색 · 자동 여행 (2026-11-22)

- **바다 = OSM 해안선** (`build-city.py`): Natural Earth 10m 은 도시 규모에서 수백 m 씩 틀려 골든혼·독도·울릉도가 땅으로 칠해졌다.
  - `natural=coastline`(진행 방향 왼쪽이 육지)으로 영역을 면으로 가르고, 면의 변 방향으로 육지·바다를 판정한다. 해안선이 닿지 않은 면만 NE 로 판정한다.
- **도시 설정 옵션**
  - `island`(여백 km): 섬 + 여백 바다를 경계로 쓴다 (독도·울릉도·제주).
  - `join_water`: 바다로 떨어진 구들 사이의 바다까지 한 장면으로 합친다 (이스탄불 해협, 시드니 항).
  - `clip`: OSM 에 하위 행정구역이 없는 도시는 사각형으로 자른다 (카이로).
  - `palette: desert`: 모래땅.
- **생성기 옵션**
  - `--keep-bounds`: 손으로 장식한 sector 의 bounds 와 장식을 보존한 채 지면만 다시 만든다.
  - 도로 쿼리에서 터널은 뺀다 (바다 위에 도로가 그려지지 않게).
- **움직이는 것은 가는 쪽을 본다**
  - 옆모습 그림은 오른쪽(+x)을 보고 그린다.
  - route 와 wander 는 left/right view 가 없으면 진행 방향에 따라 좌우로 뒤집는다. 그래서 차가 뒤로 가지 않는다.
  - 위에서 본 배(sailboat·fishing-boat·container-ship)는 지구본 교통 전용이다.
- **관계 규칙 검사** (scratchpad `audit.mjs` 로 숫자 검증, 16개 지역 모두 0건)
  - 배·물새의 경로는 전부 물 위여야 한다 (다리 밑은 통과).
  - 차 경로는 90% 이상 도로 위여야 한다.
  - 물에 사는 것은 땅에 두지 않는다.
  - 땅에 고정된 것의 바닥이 물에 걸치면 안 된다.
- **랜드마크·지명 위치**: Nominatim 실제 좌표 → `geo-local` 로컬 좌표.
- **지역 특색 entity**: 이탈리아·이집트·중국·튀르키예·브라질·호주 각각 사람·탈것·건물·나무를 만들었다. 다른 나라 그림을 빌려 쓰지 않는다.
- **UI**
  - 나라 마커: 모든 나라를 worlds.json 에 미리 넣었다. NE `MIN_LABEL` 로 나타나는 줌을 정한다.
  - 국기: sector 의 `country` 로 정한다.
  - 시간·날씨 🔀 랜덤: 30초마다 바뀐다.
  - ▶️/⏸️ 자동 여행: 만들어진 지역을 25초씩 무작위로 돈다.

### 8.15 로딩 표시 · 부드러운 경계 · 도감 · 지구 하늘/우주 · 극지 (2026-11-22)

- **목적지 미리 불러오기:** `flyTo` 가 목적지를 `wantId` 로 잡고, 비행 시작부터 장면을 불러온다. 손으로 움직이면 해제된다.
  - `boundary.json` 을 먼저 받아 경계선부터 그린다.
  - 도착했는데 장면이 아직이면 "○○ 불러오는 중…" 표시를 띄운다.
  - 장면이 붙은 뒤에는 0.6초 동안 서서히 나타난다.
- **경계:** `soften()` 으로 모서리를 둥글린다 (닫힘 + 열림, 반지름 = 긴 변의 1.2%). 선은 크림색 동글 점선.
- **지구본 교통**
  - 장면이 보이는 bounds 안에서는 지구본 축척의 배·고래를 숨긴다 (해안선 정밀도가 달라 땅 위로 보이던 문제).
  - `kind: "space"`: 고도 z 만큼 큰 구에 정사영한다. 그래서 지구 밖 우주에도 보이고, 지구 뒤로 가면 가려진다. 멀리 볼 때만(k<4) 보인다.
  - 구름은 지표를 흐르는 air(z=600, 그림용 고도)다. 화면 고정 구름은 없앴다.
- **도감:** 개체나 지명을 누르면 정보 시트가 열린다.
  - 개체 설명은 `entities.json` 항목의 emoji/kind/desc(+title).
  - 지명 설명은 `sector.json` 의 `info{라벨: …}`.
  - 🎥 따라가기: 개체 로컬 좌표 → 경위도로 카메라를 옮기고 지역 화면의 4배까지 다가간다. 화면을 건드리면 풀린다. `scene.pick()` 이 누른 요소 → 개체/지명을 돌려준다.
- **극지:** `arctic/ny-alesund` (다산과학기지), `antarctica/king-george` (세종과학기지).
  - 생성기 옵션 `palette: snow`, `coast_margin`(사각형으로 자른 섬에 해안을 따라 바다 여백만 붙임).
  - 생성기는 sector.json 이 이미 있어도 `local.size` 를 새 지면에 맞춘다.

### 8.16 실시간 지구 (live.ts, 2026-11-22)

- 둘 다 키 없이 CORS 로 바로 받는다. 실패하면 world.json 의 그림용 구름·태풍을 그대로 쓴다.
  - 날씨·구름: Open-Meteo. 비상업 무료, 하루 약 1만 회. 여러 지점을 한 요청에 물을 수 있지만, 지점 수만큼 호출로 센다.
  - 열대저기압: GDACS `EVENTS4APP`. 지진 등이 섞여 오므로 `eventtype === 'TC' && iscurrent` 만 쓴다.
- 날씨 모드 `📡 실시간`(새 기본값): 화면 중심의 WMO 날씨 코드를 맑음·흐림·비·뇌우·눈·안개로 바꾼다. 1° 칸이 바뀌거나 15분이 지나면 다시 묻는다.
- 지구본 구름: 12° 격자 330 지점(지점마다 고정 흔들림)의 구름양이 60% 이상인 곳에만 구름을 둔다. 30분마다 다시 받는다.
- 태풍: 지금 활동 중인 것만, 실제 위치에 이름·최대 풍속과 함께 둔다 (도감 팝업에 항로 이름으로 나온다).
- (갱신) 지구 구름은 NASA GIBS 위성 영상으로 바꿨다 (Open-Meteo 시간당 한도 초과 때문).
  - MODIS Terra·Aqua 일일 구름양을 WMS 360×180 PNG 두 장으로 받아 캔버스에서 픽셀을 읽는다. 호출 한도가 없다.
  - 받는 것은 어제(UTC) 낮 영상이다. 구름양 95% 이상인 곳에만 구름을 둔다.
- 한 지점 날씨: Open-Meteo 를 localStorage 에 30분 캐시한다. 실패하거나 한도 초과로 쉬는 중이면 MET Norway(api.met.no, CORS)로 대신 받는다.
- 불러오는 중 실루엣: `tools/build-outlines.py` 가 경계를 수십 점으로 줄여 worlds.json `outline` 에 넣는다. 지역을 누르는 즉시 그 실루엣이 숨 쉬듯 깜빡인다.
- 비행기(air, z 1~100 km): 땅에 그림자를 남기고 몸체를 왼쪽 위로 띄운다.
- CORS 프록시(사용자 Cloudflare Worker, TossService 의 CORS_PROXY)는 허용된 Origin(localhost:3002, dooboostore.github.io)에서 동작을 확인했다.
  - 지금 쓰는 출처는 모두 CORS 를 열어 두어서 프록시가 필요 없다.
  - Open-Meteo 를 프록시로 부르면 모든 방문자가 Worker IP 하나로 묶여 한도가 더 빨리 찬다 → 쓰지 않는다.
- (갱신) 날씨 캐시 Worker `https://world-weather.visualkhh.workers.dev/` (코드: `tools/cloudflares/world-weather.js`, KV 바인딩 `WX`).
  - Open-Meteo·GDACS 는 Worker 만 부르고 KV 에 둔다. 방문자 수와 상관없이 호출은 칸마다 30분 1번, 구름·태풍은 1시간 1번.
  - 사이트는 Worker 를 먼저 부른다. 실패하면 날씨는 MET Norway, 구름은 NASA GIBS(어제 위성 영상), 태풍은 GDACS 직접.
  - 구름과 태풍은 도착하는 대로 따로 반영한다 (GDACS 가 멈춰도 구름은 보이게). 요청에 15초 시간 제한을 둔다.

### 8.17 비행 이동 · 무작위 규칙 · 시트 동기화 (2026-11-22)

- **비행:** `startFlight`. 앞 35%는 제자리에서 줌 아웃(떠오르기)하고, 그다음 대권을 따라 날아가며 목표 줌까지 내려앉는다.
  - 다른 세계로 갈 때(`travelToWorld`): 끝까지 줌 아웃 → 화면이 스르륵 바뀜 → 새 세계에서 날아 들어감.
- **줌 유지:** 자동·무작위 이동은 '지역 전체가 꼭 차는 줌' 대비 배율(`zoomRatio`)을 이어 간다.
- **무작위(`pickNew`):** 지금 보는 곳, 가려던 곳, 직전에 간 곳은 고르지 않는다. 돌아가며(시간·날씨)는 지금 화면에 보이는 값과 다른 것이 나온다.
- **돌아가며 버튼:** ▶️/⏸️ 로 켜고 끈다. 테두리 링이 다음 바뀜까지 남은 시간이다.
- **시트 동기화(`syncOpenSheets`):** 장소가 바뀌면 열려 있는 라디오 목록과 검색 목록을 다시 그린다. 하늘과 날씨 시트는 applyTime 이 다시 그린다.
- **교통 `set()`:** 겹쳐 불리면 마지막 호출만 그린다 (같은 교통이 두세 겹 생기던 버그).
- **SSR:** 가짜 window 에는 performance 가 없다 → `now()` 헬퍼를 쓴다.
- **새 지역:** 평양, 베를린, 방콕, 아그라, 상트페테르부르크. 지구본 북극곰·펭귄·물범도 추가.
- **build-city `nominatim()`:** 첫 결과가 점(도시 노드)이면 다음 결과 중 면을 쓴다.

### 8.18 다국어 · 지명 라벨 분리 · 부드러운 비행 (2026-11-22)

- **지명은 지도 요소가 아니라 라벨이다.** `ground.svg` 의 `<text>` 를 `sector.json` 의 `labels` 로 옮겼다 (`tools/move-labels.py`).
  - 형식: `{ text, at, size, color?, info? }`. 지명 도감도 같은 항목에 둔다.
  - 장면이 그리고, 언어를 바꾸면 `relabel()` 로 다시 쓴다.
- **다국어(`i18n.ts`):**
  - 데이터 글자는 문자열이거나 `{ ko, en, zh }` 이고 `tr()` 로 고른다. 화면 문구는 `t(키)`, 정적 HTML 은 `data-t` / `data-t-title` / `data-t-placeholder`.
  - 언어 고르는 순서: 주소 `lang=` → localStorage `world.lang` → 브라우저 언어 → 한국어.
  - 버튼: 📍 위 동그란 버튼(지금 언어)을 누르면 한/EN/中 이 펼쳐진다.
- **번역 범위:**
  - entities(이름·도감), 라벨·지명 도감, 지역·세계 이름, 교통 이름, 달·화성 지형 이름.
  - 나라 이름은 Natural Earth NAME_EN / NAME_ZH (`build-countries.mjs` 출력 `name: { ko, en, zh }`).
- **비행:** van Wijk & Nuij 부드러운 줌·이동 (d3.interpolateZoom 과 같은 식). 줌 아웃하는 동안에도 목적지로 계속 움직인다.
