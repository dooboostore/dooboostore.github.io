// 다국어 (한국어 · English · 中文)
// 데이터의 글자는 문자열이거나 { ko, en, zh } — tr() 이 지금 언어로 고르고, 없으면 한국어 → 아무거나 순으로 대신한다.
// 화면 문구(메뉴·토스트)는 아래 UI 사전에서 t(키, 값...) 로 꺼낸다. {0} {1} 은 자리 채우기.
export type Lang = 'ko' | 'en' | 'zh';
export type Text = string | Partial<Record<Lang, string>>;
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ko', label: '한' },
  { id: 'en', label: 'EN' },
  { id: 'zh', label: '中' },
];

let lang: Lang = 'ko';
export const getLang = () => lang;
export const setLang = (l: Lang) => (lang = l);
export const isLang = (x: unknown): x is Lang => x === 'ko' || x === 'en' || x === 'zh';

export const tr = (v: Text | undefined): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[lang] ?? v.ko ?? Object.values(v).find(Boolean) ?? '';
};

const UI: Record<string, Record<Lang, string>> = {
  title: { ko: '작은 지구', en: 'Little Earth', zh: '小小地球' },
  home: { ko: '홈으로', en: 'Home', zh: '首页' },
  env: { ko: '하늘과 날씨', en: 'Sky & weather', zh: '天空与天气' },
  random: { ko: '랜덤 여행', en: 'Random trip', zh: '随机旅行' },
  tourOn: { ko: '만들어진 지역 자동 여행 켜기', en: 'Start auto tour', zh: '开始自动旅行' },
  tourOff: { ko: '자동 여행 끄기', en: 'Stop auto tour', zh: '停止自动旅行' },
  me: { ko: '내 위치로', en: 'My location', zh: '我的位置' },
  share: { ko: '지금 보는 곳 공유', en: 'Share this view', zh: '分享当前位置' },
  search: { ko: '지역 찾기', en: 'Find a region', zh: '查找地区' },
  worlds: { ko: '세계 고르기', en: 'Choose a world', zh: '选择世界' },
  radio: { ko: '라디오', en: 'Radio', zh: '电台' },
  close: { ko: '닫기', en: 'Close', zh: '关闭' },
  time: { ko: '시간', en: 'Time', zh: '时间' },
  weather: { ko: '날씨', en: 'Weather', zh: '天气' },
  globe: { ko: '지구', en: 'Globe', zh: '地球' },
  spin: { ko: '자전', en: 'Spin', zh: '自转' },
  local: { ko: '현지', en: 'Local', zh: '当地' },
  cycle: { ko: '돌아가며', en: 'Cycle', zh: '轮播' },
  live: { ko: '실시간', en: 'Live', zh: '实时' },
  stop: { ko: '멈춤', en: 'Stop', zh: '停止' },
  globeOn: { ko: '지구본 구름·태풍 보임', en: 'Clouds & storms on', zh: '显示云与台风' },
  globeOff: { ko: '지구본 구름·태풍 숨김', en: 'Clouds & storms off', zh: '隐藏云与台风' },
  dawn: { ko: '새벽', en: 'Dawn', zh: '黎明' },
  morning: { ko: '아침', en: 'Morning', zh: '早晨' },
  day: { ko: '낮', en: 'Day', zh: '白天' },
  sunset: { ko: '노을', en: 'Sunset', zh: '晚霞' },
  dusk: { ko: '저녁', en: 'Dusk', zh: '傍晚' },
  night: { ko: '밤', en: 'Night', zh: '夜晚' },
  clear: { ko: '맑음', en: 'Clear', zh: '晴' },
  cloudy: { ko: '흐림', en: 'Cloudy', zh: '多云' },
  rain: { ko: '비', en: 'Rain', zh: '雨' },
  storm: { ko: '뇌우', en: 'Storm', zh: '雷雨' },
  snow: { ko: '눈', en: 'Snow', zh: '雪' },
  fog: { ko: '안개', en: 'Fog', zh: '雾' },
  regions: { ko: '🔍 만들어진 지역', en: '🔍 Built regions', zh: '🔍 已建地区' },
  searchPh: { ko: '도시·나라·세계 이름', en: 'City, country or world', zh: '城市、国家或世界' },
  searchRandom: { ko: '이 목록에서 랜덤', en: 'Random from this list', zh: '从列表中随机' },
  noRegion: { ko: "'{0}' 에 맞는 지역이 아직 없어요", en: "No region matches '{0}' yet", zh: "还没有与'{0}'相符的地区" },
  noPick: { ko: '🎲 고를 지역이 없어요', en: '🎲 Nothing to choose from', zh: '🎲 没有可选的地区' },
  goTo: { ko: '{0}(으)로 떠나요', en: 'Off to {0}', zh: '出发去{0}' },
  goingTo: { ko: '{0}(으)로 가요', en: 'Heading to {0}', zh: '前往{0}' },
  arrived: { ko: '{0}에 왔어요', en: 'Welcome to {0}', zh: '来到{0}' },
  tourStopped: { ko: '⏸️ 자동 여행을 멈췄어요', en: '⏸️ Auto tour stopped', zh: '⏸️ 自动旅行已停止' },
  soon: { ko: '🚧 아직 준비 중인 곳이에요', en: '🚧 Not built yet', zh: '🚧 还在建设中' },
  soonSpace: { ko: '🚧 아직 아무도 살지 않는 곳이에요', en: '🚧 Nobody lives here yet', zh: '🚧 这里还没有人居住' },
  otherRegion: { ko: '🎲 다른 지역 가기 →', en: '🎲 Go somewhere else →', zh: '🎲 去别的地区 →' },
  loading: { ko: '{0} 불러오는 중…', en: 'Loading {0}…', zh: '正在加载{0}…' },
  sea: { ko: '🌊 바다 위', en: '🌊 Over the sea', zh: '🌊 海上' },
  hint: { ko: '드래그로 돌리고 · 스크롤/핀치로 다가가고 · 이름을 누르면 날아가요', en: 'Drag to spin · scroll/pinch to zoom · tap a name to fly', zh: '拖动旋转 · 滚动/捏合缩放 · 点击名称飞过去' },
  follow: { ko: '🎥 따라가기', en: '🎥 Follow', zh: '🎥 跟随' },
  unfollow: { ko: '⏹ 그만 따라가기', en: '⏹ Stop following', zh: '⏹ 停止跟随' },
  following: { ko: '🎥 따라가는 중이에요 · 화면을 움직이면 멈춰요', en: '🎥 Following · touch the map to stop', zh: '🎥 正在跟随 · 拖动画面即可停止' },
  noStory: { ko: '아직 도감에 적힌 이야기가 없어요.', en: 'No story in the guide yet.', zh: '图鉴里还没有介绍。' },
  placeName: { ko: '지명', en: 'Place', zh: '地名' },
  overview: { ko: '🔭 전체 보기', en: '🔭 Overview', zh: '🔭 总览' },
  noAir: { ko: '🌌 {0}에는 대기가 없어 하늘빛·날씨가 없어요', en: '🌌 {0} has no atmosphere — no sky colors or weather', zh: '🌌 {0}没有大气，没有天色和天气' },
  stations: { ko: '📻 {0} {1} 방송 {2}곳 · 가까운 순', en: '📻 {0} {1} · {2} stations · nearest first', zh: '📻 {0} {1} · {2}个电台 · 由近到远' },
  stationsTitle: { ko: '📻 방송국', en: '📻 Stations', zh: '📻 电台' },
  pickStation: { ko: '아래에서 방송을 골라 보세요', en: 'Pick a station below', zh: '请在下面选择电台' },
  noRadioSpace: { ko: '🌌 우주에서는 방송이 잡히지 않아요', en: '🌌 No radio in space', zh: '🌌 太空中收不到广播' },
  noStations: { ko: '이 나라는 들을 수 있는 방송이 없어요', en: 'No stations for this country', zh: '这个国家没有可收听的电台' },
  landForRadio: { ko: '땅 위로 가면 그 나라 방송국이 잡혀요', en: 'Move over land to tune in', zh: '移到陆地上就能收到当地电台' },
  paused: { ko: ' (멈춤)', en: ' (paused)', zh: ' (暂停)' },
  linkCopied: { ko: '🔗 지금 보는 곳 링크를 복사했어요', en: '🔗 Link copied', zh: '🔗 链接已复制' },
  lang: { ko: '언어', en: 'Language', zh: '语言' },
  littleWorld: { ko: '작은 {0}', en: 'Little {0}', zh: '小小{0}' },
  loadFail: { ko: '데이터를 불러오지 못했어요', en: "Couldn't load the data", zh: '数据加载失败' },
  soonTag: { ko: '준비 중', en: 'soon', zh: '筹备中' },
  whereTo: { ko: '어디로 갈까요?', en: 'Where to?', zh: '去哪里？' },
  next: { ko: '다음 방송', en: 'Next station', zh: '下一个电台' },
  pinOn: { ko: '이 방송 고정 (나라를 옮겨도 계속)', en: 'Pin this station (keeps playing anywhere)', zh: '固定此电台（换国家也继续）' },
  pinOff: { ko: '고정 풀기 (나라를 옮기면 그 나라 방송으로)', en: 'Unpin (switch with the country)', zh: '取消固定（随国家切换）' },
  tuning: { ko: '📡 주파수를 찾는 중…', en: '📡 Tuning in…', zh: '📡 正在搜索频道…' },
  radioDown: { ko: '라디오 서버에 연결할 수 없어요', en: "Can't reach the radio server", zh: '无法连接电台服务器' },
  keepPlaying: { ko: '📻 {0}엔 들을 수 있는 방송이 없어 {1} 을(를) 계속 들려드려요', en: '📻 No stations in {0} — still playing {1}', zh: '📻 {0}没有可收听的电台，继续播放{1}' },
  noAnswer: { ko: '📻 {0} 이(가) 응답이 없어 다음 방송으로', en: '📻 {0} is not responding — next station', zh: '📻 {0}没有响应，切换到下一个' },
  pinFirst: { ko: '📌 먼저 방송을 하나 골라 주세요', en: '📌 Pick a station first', zh: '📌 请先选择一个电台' },
  pinned: { ko: '📌 {0} 고정 — 어디로 가든 계속 들려드려요', en: '📌 {0} pinned — it keeps playing wherever you go', zh: '📌 已固定{0}，去哪里都继续播放' },
  unpinned: { ko: '📌 고정을 풀었어요 — 나라를 옮기면 그 나라 방송으로 바뀌어요', en: "📌 Unpinned — it'll switch with the country", zh: '📌 已取消固定，换国家时会切换电台' },
  geoHttps: { ko: '📍 내 위치는 https(또는 localhost) 주소에서만 쓸 수 있어요', en: '📍 Location only works over https (or localhost)', zh: '📍 定位仅在 https（或 localhost）下可用' },
  geoFinding: { ko: '📍 위치를 찾는 중…', en: '📍 Finding your location…', zh: '📍 正在定位…' },
  geoIn: { ko: '📍 지금 {0}에 계시네요', en: "📍 You're in {0}", zh: '📍 你现在在{0}' },
  geoHere: { ko: '📍 여기가 지금 계신 곳이에요', en: '📍 This is where you are', zh: '📍 这里就是你的位置' },
  geoDenied: { ko: '📍 위치 권한이 막혀 있어요. 주소창 왼쪽 자물쇠 → 위치 허용 (macOS 는 시스템 설정 › 개인정보 보호 › 위치 서비스도 확인)', en: '📍 Location permission is blocked. Allow it from the lock icon in the address bar (on macOS also check System Settings › Privacy › Location Services)', zh: '📍 定位权限被阻止。请在地址栏左侧的锁图标中允许定位（macOS 还需检查 系统设置 › 隐私 › 定位服务）' },
  geoUnknown: { ko: '📍 지금 위치를 알 수 없어요. Wi‑Fi 를 켜면 잡힐 수 있어요', en: '📍 Location unavailable. Turning on Wi‑Fi may help', zh: '📍 无法获取位置，打开 Wi‑Fi 可能有帮助' },
  geoTimeout: { ko: '📍 위치를 찾는 데 너무 오래 걸렸어요. 다시 눌러 주세요', en: '📍 Location timed out. Please try again', zh: '📍 定位超时，请再试一次' },
  geoFail: { ko: '📍 위치를 찾지 못했어요', en: "📍 Couldn't find your location", zh: '📍 无法定位' },
  onOff: { ko: '켜기/끄기', en: 'On/off', zh: '开/关' },
  timeWx: { ko: '시간·날씨', en: 'Time & weather', zh: '时间与天气' },
};

// 도감 분류 (데이터의 kind 는 한국어로 적혀 있다)
const KINDS: Record<string, Record<Lang, string>> = {
  랜드마크: { ko: '랜드마크', en: 'Landmark', zh: '地标' },
  건물: { ko: '건물', en: 'Building', zh: '建筑' },
  자연: { ko: '자연', en: 'Nature', zh: '自然' },
  동물: { ko: '동물', en: 'Animal', zh: '动物' },
  사람: { ko: '사람', en: 'People', zh: '人物' },
  탈것: { ko: '탈것', en: 'Vehicle', zh: '交通工具' },
  구조물: { ko: '구조물', en: 'Structure', zh: '设施' },
  지명: { ko: '지명', en: 'Place', zh: '地名' },
  지역: { ko: '지역', en: 'Region', zh: '地区' },
  하늘: { ko: '하늘', en: 'Sky', zh: '天空' },
  바다: { ko: '바다', en: 'Sea', zh: '海洋' },
};
export const tKind = (k?: string) => (k ? KINDS[k]?.[lang] ?? k : '');

export const t = (key: keyof typeof UI | string, ...args: (string | number)[]) =>
  (UI[key]?.[lang] ?? UI[key]?.ko ?? key).replace(/\{(\d)\}/g, (_, i) => String(args[+i] ?? ''));
