import { elementDefine, onConnectedBodyShadow, onInitialize, onConnectedAfter, innerHtmlLight, eventDelegateShadow, eventDelegateLight, onConnectedBefore, innerHtml, setAttribute } from "@dooboostore/simple-web-component";
import { Router } from "@dooboostore/core-web";

const tagName = "center-stock-brain-checker-page";

type Mode = "select" | "sell" | "buy" | "result";
type ResultType = "danger" | "warning" | "success" | "neutral";

interface Result {
  type: ResultType;
  title: string;
  desc: string;
  tip?: string;
}

interface QuestionNode {
  q: string;
  sub?: string;
  yes: string;
  no: string;
}

// 팔 때 트리 — 친구처럼 까면서 잡아주는 8단계 ㅋㅋ
const SELL_TREE: Record<string, QuestionNode | Result> = {
  S1: { q: "야 솔직히... 지금 손 떨려서 팔려는거 맞지? 😰", sub: "어제보다 5% 넘게 꼬라박았으면 인정, 패닉 맞음", yes: "S2", no: "S1N" },
  S1N: { type: "warning", title: "그럼 왜 팔아? 심심해서? 🤔", desc: "떨어지지도 않았는데 불안해서 파는건<br>그냥 손이 근질거려서 버튼 누르고 싶은거임 ㅋㅋ<br>계획한 익절/손절가 온거 맞아?", tip: "계획없이 누르는 매도는 90% 다음날 이불킥함. 매매일지부터 펴봐 형" } as Result,
  S2: { q: "코스피, 나스닥 다 같이 떡락 중이야? 🌊", sub: "나만 처맞는지, 온 장이 처맞는지", yes: "S3", no: "S4" },
  S3: { q: "근데 내 종목이 지수보다 더 처맞고 있어?", sub: "지수가 -3%인데 난 -10%면 심각", yes: "S4", no: "S3N" },
  S3N: { type: "danger", title: "야 그럼 넌 덜 맞은거야 ㅋㅋ 참아! 🛑", desc: "시장 다같이 빠지는데 넌 덜 빠졌잖아<br>이때 팔면 국장 탈출한 애들보다 더 뇌동임 ㅋㅋ<br>다 같이 맞을 땐 같이 버텨야지", tip: "시장 반등하면 넌 제일 먼저 올라가. 하루만 존버 ㄱㄱ" } as Result,
  S4: { q: "내 종목만 터진 악재 있어? 공시 떴어? 📰", sub: "횡령, 불성실, 실적쇼크, 유증 등", yes: "S5", no: "S4N" },
  S4N: { type: "danger", title: "이유도 모르면서 팔면 그냥 세력한테 돈 갖다주는거야 🤦‍♂️", desc: "아무 이유 없이 내꺼만 빠지면 세력 털기일 확률 높음<br>이유도 안 찾고 팔면 니 돈으로 세력 배불리는거야", tip: "거래대금 터졌는지, 외인/기관 던졌는지부터 봐. 이유 없는 하락은 80% 회복함" } as Result,
  S5: { q: "그 악재가 회사 망하는 급이야? 펀더 박살났어? 💣", sub: "적자전환, 자본잠식, 대주주 횡령급?", yes: "S5B", no: "S5N" },
  S5N: { type: "danger", title: "그럼 감기야, 암 아님 🤧", desc: "일시적 수급악재면 펀더 살아있으면 다시 올라와<br>지금 팔면 세력이 제일 좋아해 ㅋㅋ<br>코로나 때 상한가에서 판 개미랑 똑같은 짓이야", tip: "일시적 악재에 파는건 감기 걸렸다고 장기 적출하는 꼴" } as Result,
  S5B: { q: "근데 이 종목 비중 30% 넘게 몰빵했어? 😱", sub: "비중 크면 3% 빠져도 심장이 쫄깃하지", yes: "S5B_Y", no: "S6" },
  S5B_Y: { type: "warning", title: "비중 과하면 3% 빠져도 심장 쫄깃한게 정상임 😅", desc: "30% 넘게 몰빵하면 작은 하락에도 멘탈 나가는게 당연해<br>전량매도 말고 1/3만 줄여서 숨통 트여", tip: "비중 때문에 잠 못자면 그건 투자 아니고 도박임. 분할매도 ㄱㄱ" } as Result,
  S6: { q: "처음에 '이거 때문에 산다' 한 이유 아직 살아있어?", sub: "한 문장으로 말할 수 있어? 없으면 뇌동이야", yes: "S7", no: "S6N" },
  S6Y: { type: "danger", title: "그럼 가격 보고 파는거네? 그건 뇌동이야 형 🧠", desc: "산 이유 그대로인데 가격 떨어졌다고 팔면<br>믿음 말고 차트에 흔들리는거야. 그럼 처음에 왜 샀어?", tip: "믿음이 깨진게 아니면 존버. 논리로 팔고 가격으로 팔지마" } as Result,
  S6N: { type: "warning", title: "논리 깨졌으면 인정, 근데 몰빵 매도 ㄴㄴ ✋", desc: "투자 논리 깨진건 인정. 근데 한방에 다 팔면 내일 후회 100%<br>며칠 나눠서 분할매도로 빼", tip: "오늘 다 팔고 내일 10% 오르면 현타온다. 나눠서 팔자" } as Result,
  S7: { q: "지금 혈압 오르고 빡쳐서 누르려는거야? 🤬", sub: "손 떨리고 심장 쿵쾅이면 감정매매 맞음", yes: "S7Y", no: "S6Y" },
  S7Y: { type: "danger", title: "그 상태로 누르면 99% 이불킥이야 🛏️", desc: "빡쳐서 누르는 매도는 다음날 100% 후회함<br>물 한잔 마시고 30분 뒤에 다시 생각해. 제발", tip: "빡친 상태 매매 = 술취해 전여친한테 카톡 = 다음날 후회" } as Result,
};

// 살 때 트리 — 친구가 옆에서 까면서 잡아주는 9단계 ㅋㅋ
const BUY_TREE: Record<string, QuestionNode | Result> = {
  B1: { q: "솔직히 남들 +20% 가는거 보고 배아파서 사는거지? 👀", sub: "FOMO 왔지? 인정해 ㅋㅋ", yes: "B1Y", no: "B2" },
  B1Y: { type: "danger", title: "배아픔으로 사면 네가 고점이야 ㅋㅋ 📉", desc: "남들 수익 인증 보고 따라가면 너가 유동성 공급책이야<br>오늘 하루만 참아봐, 내일이면 식어있을거야", tip: "조급할 때 24시간 법칙: 하루 자고 결정해. 급할수록 천천히" } as Result,
  B2: { q: "이거 왜 사는지 10초 안에 설명 가능해? 🤔", sub: "실적, 신제품, 턴어라운드 뭐든", yes: "B3", no: "B2N" },
  B2N: { type: "danger", title: "설명도 못하면서 사는건 그냥 로또야 🎰", desc: "왜 사는지 말도 못하면서 사면<br>물렸을 때 할 말이 없어. 그냥 도박임", tip: "친구한테 왜 샀는지 설명 못하면 사지마. 설명 못하면 뇌동임" } as Result,
  B3: { q: "그 호재 뉴스 뜬지 3일 넘었어? 📰", sub: "3일 지났으면 이미 다 반영된거야", yes: "B3Y", no: "B4" },
  B3Y: { type: "warning", title: "3일 지났으면 세력 다 먹고 빠진거야 🍽️", desc: "호재 터지고 급등했으면 너가 들어갈 자리는 없어<br>지금 들어가면 너가 세력한테 돈 갖다주는거야", tip: "호재는 터지기 전에 사는거지, 터지고 사는건 추격매수" } as Result,
  B4: { q: "그 섹터 최근에 미친듯이 올랐어? 10% 넘게? 🚀", sub: "2차전지, 초전도체처럼 다 같이 날아간거", yes: "B4Y", no: "B5" },
  B4Y: { type: "warning", title: "섹터 불장 끝자락에 타면 꼭지야 😅", desc: "섹터 전체가 불장일 때 들어가면 섹터 꺾일 때 같이 쓸려 내려가<br>섹터 식을 때까지 기다려", tip: "섹터 불장 끝자락에 타면 다음날 -10%는 기본임" } as Result,
  B5: { q: "이 회사 돈은 벌어? 영업이익 흑자야? 💰", sub: "당기순이익 까봐, 적자면 걍 도박", yes: "B6", no: "B5N" },
  B5N: { type: "danger", title: "적자회사 꿈만 먹고 사는건 로또임 🎰", desc: "실적도 없이 꿈만 먹고 사는 종목은<br>빠지면 변명도 못해. 그냥 도박이야", tip: "실적 없는 종목은 빠져도 할 말 없는 종목임. 사지마" } as Result,
  B6: { q: "빚내서 사려고? 미수/신용 영끌하려고? 💳", sub: "영끌하려고? ㄹㅇ?", yes: "B6X", no: "B7" },
  B6X: { type: "danger", title: "빚투는 뇌동보다 100배 위험해 ☠️", desc: "레버리지로 추격매수하면 -7%에도 반대매매로 강제청산<br>현금으로만 해, 제발. 빚투는 깡통 지름길이야", tip: "빚투는 깡통 지름길. 현금 없으면 그냥 안 사는게 이득" } as Result,
  B7: { q: "한 종목에 올인하려고? 비중 30% 넘게? 🎲", sub: "인생역전 노리는거야?", yes: "B7Y", no: "B8" },
  B7Y: { type: "warning", title: "몰빵은 뇌동의 완성이다 형 😇", desc: "한 종목 몰빵은 맞으면 대박 틀리면 쪽박<br>아무리 확신 있어도 20% 이하로", tip: "계란 한 바구니에 담지마. 분산이 답이다" } as Result,
  B8: { q: "3일 전에도 이 종목 사고 싶었어? 아님 어제 갑자기 꽂혔어? ⏰", sub: "일주일 고민 vs 어제 유튜브 보고 꽂힘", yes: "B9", no: "B8N" },
  B8N: { type: "danger", title: "어제 생긴 충동은 3일 뒤면 식어 ㅋㅋ ❄️", desc: "어제까지 관심 없던 종목 갑자기 사고 싶으면<br>그건 유튜브 썸네일에 홀린거야", tip: "충동은 3일만 지나면 90% 사라짐. 급할수록 천천히" } as Result,
  B9: { q: "일봉/주봉 봤을 때 바닥 초입이야? 아님 천정이야? 📊", sub: "고점인지 초입인지", yes: "B9Y", no: "B9N" },
  B9Y: { type: "success", title: "오케이, 그럼 소액으로 찔러봐 ✅", desc: "턴어라운드 초입이면 기회일 수 있어<br>근데 몰빵 금지! 분할로 3번 나눠서 1차는 소액으로", tip: "1차는 발 담그기, 2차는 확인 후 추가. 몰빵은 ㄴㄴ" } as Result,
  B9N: { type: "warning", title: "떨어지는 칼날 잡지마 🔪", desc: "고점이거나 하락추세면 지금 사는건 칼날 잡는거야<br>바닥 확인될 때까지 기다려", tip: "바닥 찍고 올라오는거 확인하고 사도 늦지 않아" } as Result,
};

function isResult(node: QuestionNode | Result): node is Result {
  return "type" in node;
}

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class StockBrainCheckerPage extends w.HTMLElement {
    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector("title"), { valueKey: "titleBody" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), "content", { valueKey: "ogTitle" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), "content", { valueKey: "desc" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), "content", { valueKey: "ogDesc" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:image"]'), "content", { valueKey: "ogImage" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:image"]'), "content", { valueKey: "twitterImage" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:title"]'), "content", { valueKey: "twitterTitle" })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:description"]'), "content", { valueKey: "twitterDesc" })
    setPageMeta() {
      return {
        titleBody: "뇌동매매 잠깐! | @dooboostore",
        ogTitle: "뇌동매매 잠깐! | @dooboostore",
        desc: "주식 매매 전 체크리스트로 뇌동매매를 막아보세요.",
        ogDesc: "주식 매매 전 체크리스트로 뇌동매매를 막아보세요.",
        ogImage: "/assets/images/stock-brain-checker-og.png",
        twitterImage: "/assets/images/stock-brain-checker-og.png",
        twitterTitle: "뇌동매매 잠깐! | @dooboostore",
        twitterDesc: "주식 매매 전 체크리스트로 뇌동매매를 막아보세요.",
      };
    }

    private router!: Router;
    private mode: Mode = "select";
    private treeType: "sell" | "buy" = "sell";
    private currentId: string = "S1";
    private history: string[] = [];
    private result: Result | null = null;

    @onInitialize
    async onInitialized(router: Router): Promise<void> {
      this.router = router;
    }

    @onConnectedAfter
    onConnected() {
      this.renderContent();
    }

    private startSell() {
      this.treeType = "sell";
      this.currentId = "S1";
      this.history = [];
      this.result = null;
      this.mode = "sell";
      this.renderPage();
    }

    private startBuy() {
      this.treeType = "buy";
      this.currentId = "B1";
      this.history = [];
      this.result = null;
      this.mode = "buy";
      this.renderPage();
    }

    private answer(choice: "yes" | "no") {
      const tree = this.treeType === "sell" ? SELL_TREE : BUY_TREE;
      const node = tree[this.currentId] as QuestionNode;
      const nextId = choice === "yes" ? node.yes : node.no;
      const next = tree[nextId];
      if (!next) return;
      if (isResult(next)) {
        this.result = next;
        this.mode = "result";
      } else {
        this.history.push(this.currentId);
        this.currentId = nextId;
      }
      this.renderPage();
    }

    private goBack() {
      if (this.history.length > 0) {
        this.currentId = this.history.pop()!;
        this.renderPage();
      } else {
        this.mode = "select";
        this.renderPage();
      }
    }

    private reset() {
      this.mode = "select";
      this.history = [];
      this.result = null;
      this.renderPage();
    }

    private getProgress(): { cur: number; total: number } {
      const cur = this.history.length + 1;
      return { cur, total: 7 };
    }

    @eventDelegateShadow(".header-back", "click")
    onBackClick() {
      this.router?.go("/");
    }

    private renderPage() {
      (this as any).renderContent();
    }

    @eventDelegateLight(".mode-btn-sell", "click")
    onSellClick() {
      this.startSell();
    }

    @eventDelegateLight(".mode-btn-buy", "click")
    onBuyClick() {
      this.startBuy();
    }

    @eventDelegateLight(".answer-yes", "click")
    onYes() {
      this.answer("yes");
    }

    @eventDelegateLight(".answer-no", "click")
    onNo() {
      this.answer("no");
    }

    @eventDelegateLight(".btn-back", "click")
    onBackBtn() {
      this.goBack();
    }

    @eventDelegateLight(".btn-reset", "click")
    onResetBtn() {
      this.reset();
    }

    @eventDelegateLight(".btn-home", "click")
    onHomeBtn() {
      this.router.go("/");
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display: block; min-height: 100vh; background: #f0f2f5; }
          .header {
            display: flex; align-items: center; gap: 12px;
            padding: 16px 24px;
            background: linear-gradient(135deg, #1565c0 0%, #1976d2 60%, #42a5f5 100%);
            color: white;
            height: 72px;
            flex-shrink: 0;
            box-sizing: border-box;
          }
          .header-back {
            background: rgba(255,255,255,0.2); border: none; color: white;
            width: 40px; height: 40px; border-radius: 8px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-size: 20px;
          }
          .header-back:hover { background: rgba(255,255,255,0.3); }
          .header-title { font-size: 22px; font-weight: 700; flex: 1; }
          .header-subtitle { font-size: 12px; opacity: 0.85; }
          .header-hits { height: 20px; border-radius: 4px; opacity: 0.9; margin-left: auto; }
          .content { padding: 20px; }
          @media (max-width: 600px) {
            .header { padding: 14px 16px; }
            .header-title { font-size: 18px; }
            .content { padding: 12px; }
          }
          ::slotted(.select-wrap) { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
          ::slotted(.intro-box) { background: white; border-radius: 12px; padding: 16px; margin-top: 20px; border-left: 4px solid #f59e0b; font-size: 13px; color: #475569; line-height: 1.6; }
          ::slotted(.progress-bar) { height: 4px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-bottom: 20px; }
          ::slotted(.q-card) { background: white; border-radius: 16px; padding: 28px 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.07); text-align: center; }
          ::slotted(.result-card) { background: white; border-radius: 16px; padding: 32px 24px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.07); }
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
            </button>
          <div>
            <div class="header-title">뇌동매매 잠깐! 🛑</div>
            <div class="header-subtitle">체크리스트로 냉정하게 점검하기</div>
          </div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-stock-brain-checker.svg?style=plastic&amp;"/>
        </div>

        <main class="content">
          <slot></slot>
        </main>
      `;
    }


    private contentStyles(): string {
      return `
        <style>
          .select-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
          .mode-card {
            background: white; border-radius: 16px; padding: 32px 20px;
            text-align: center; cursor: pointer; border: 2px solid transparent;
            transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.07);
          }
          .mode-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
          .mode-card.sell:hover { border-color: #3b82f6; }
          .mode-card.buy:hover { border-color: #ef4444; }
          .mode-icon { font-size: 48px; margin-bottom: 12px; }
          .mode-title { font-size: 20px; font-weight: 800; color: #1e293b; }
          .mode-desc { font-size: 12px; color: #94a3b8; margin-top: 6px; line-height: 1.4; }
          .mode-badge {
            display: inline-block; margin-top: 10px; font-size: 11px; font-weight: 700;
            padding: 3px 10px; border-radius: 999px;
          }
          .mode-card.sell .mode-badge { background: #dbeafe; color: #1d4ed8; }
          .mode-card.buy .mode-badge { background: #fee2e2; color: #b91c1c; }

          .intro-box {
            background: white; border-radius: 12px; padding: 16px; margin-top: 20px;
            border-left: 4px solid #f59e0b; font-size: 13px; color: #475569; line-height: 1.6;
          }
          .intro-box strong { color: #1e293b; }

          .progress-bar { height: 4px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-bottom: 20px; }
          .progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 999px; transition: width 0.3s; }
          .progress-text { font-size: 11px; color: #94a3b8; text-align: right; margin-bottom: 6px; }
          .q-card {
            background: white; border-radius: 16px; padding: 28px 24px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.07); text-align: center;
          }
          .q-badge {
            display: inline-block; font-size: 11px; font-weight: 700; padding: 4px 12px;
            border-radius: 999px; margin-bottom: 14px;
          }
          .q-badge.sell { background: #dbeafe; color: #1d4ed8; }
          .q-badge.buy { background: #fee2e2; color: #b91c1c; }
          .q-text { font-size: 19px; font-weight: 800; color: #1e293b; line-height: 1.4; }
          .q-sub { font-size: 12px; color: #94a3b8; margin-top: 8px; }
          .answer-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
          .answer-btn {
            padding: 16px; border-radius: 12px; font-size: 16px; font-weight: 800;
            cursor: pointer; border: 2px solid #e2e8f0; background: white; transition: all 0.15s;
          }
          .answer-btn:hover { transform: scale(1.02); }
          .answer-yes { color: #1d4ed8; }
          .answer-yes:hover { background: #dbeafe; border-color: #3b82f6; }
          .answer-no { color: #64748b; }
          .answer-no:hover { background: #f1f5f9; border-color: #94a3b8; }
          .btn-back {
            display: block; width: 100%; margin-top: 12px; padding: 10px;
            background: none; border: 1px solid #e2e8f0; border-radius: 8px;
            color: #94a3b8; font-size: 13px; cursor: pointer;
          }
          .btn-back:hover { background: #f8fafc; color: #475569; }

          .result-card {
            background: white; border-radius: 16px; padding: 32px 24px;
            text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.07);
          }
          .result-icon { font-size: 48px; margin-bottom: 12px; }
          .result-title { font-size: 20px; font-weight: 800; line-height: 1.3; }
          .result-title.danger { color: #dc2626; }
          .result-title.warning { color: #d97706; }
          .result-title.success { color: #16a34a; }
          .result-title.neutral { color: #475569; }
          .result-desc { font-size: 14px; color: #475569; line-height: 1.6; margin-top: 12px; }
          .result-tip {
            margin-top: 16px; background: #f8fafc; border: 1px solid #e2e8f0;
            border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #64748b;
            text-align: left; line-height: 1.5;
          }
          .result-tip::before { content: "💡 TIP: "; font-weight: 700; color: #f59e0b; }
          .result-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; }
          .btn-reset {
            padding: 14px; border-radius: 10px; font-size: 14px; font-weight: 700;
            cursor: pointer; border: none;
          }
          .btn-reset.primary { background: #1e293b; color: white; }
          .btn-reset.secondary { background: white; border: 1px solid #e2e8f0; color: #475569; }

          @media (max-width: 500px) {
            .select-wrap { grid-template-columns: 1fr; }
            .q-text { font-size: 17px; }
          }
        </style>
      `;
    }

    @innerHtmlLight
    private renderContent(): string {
      const s = this.contentStyles();
      if (this.mode === "select") {
        return s + `
          <div class="select-wrap">
            <div class="mode-card sell mode-btn-sell">
              <div class="mode-icon">📉</div>
              <div class="mode-title">팔려고 해요</div>
              <div class="mode-desc">불안해서 손절하려는<br>순간인가요?</div>
              <span class="mode-badge">매도 체크 →</span>
            </div>
            <div class="mode-card buy mode-btn-buy">
              <div class="mode-icon">📈</div>
              <div class="mode-title">사려고 해요</div>
              <div class="mode-desc">조급해서 추격매수<br>하려는 순간인가요?</div>
              <span class="mode-badge">매수 체크 →</span>
            </div>
          </div>
          <div class="intro-box">
            <strong>어떻게 사용하나요?</strong><br>
            팔거나 사고 싶은 순간, 몇 가지 질문에 답해보세요.<br>
            마지막에 <strong>뇌동 여부 판정</strong>과 함께 냉정한 조언을 드려요.
            급할수록 한 템포 쉬어가세요.
          </div>
        `;
      }

      if (this.mode === "result" && this.result) {
        const icons: Record<string, string> = { danger: "🛑", warning: "⚠️", success: "✅", neutral: "🤔" };
        return s + `
          <div class="result-card">
            <div class="result-icon">${icons[this.result.type]}</div>
            <div class="result-title ${this.result.type}">${this.result.title}</div>
            <div class="result-desc">${this.result.desc}</div>
            ${this.result.tip ? `<div class="result-tip">${this.result.tip}</div>` : ""}
            <div class="result-actions">
              <button class="btn-reset secondary btn-home">홈으로</button>
              <button class="btn-reset primary btn-reset">처음으로 ↺</button>
            </div>
          </div>
        `;
      }

      const tree = this.treeType === "sell" ? SELL_TREE : BUY_TREE;
      const node = tree[this.currentId] as QuestionNode;
      const prog = this.getProgress();
      const pct = Math.round((prog.cur / prog.total) * 100);
      return s + `
        <div class="progress-text">${prog.cur} / ${prog.total}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="q-card">
          <span class="q-badge ${this.treeType}">${this.treeType === "sell" ? "📉 매도 체크" : "📈 매수 체크"}</span>
          <div class="q-text">${node.q}</div>
          ${node.sub ? `<div class="q-sub">${node.sub}</div>` : ""}
          <div class="answer-row">
            <button class="answer-btn answer-yes">네, 맞아요</button>
            <button class="answer-btn answer-no">아니에요</button>
          </div>
          <button class="btn-back">← 뒤로</button>
        </div>
      `;
    }
  }

  return tagName;
};
