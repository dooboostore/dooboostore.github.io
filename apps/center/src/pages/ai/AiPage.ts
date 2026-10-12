import {
  elementDefine,
  onConnectedBodyShadow,
  onConnectedBefore,
  onConnectedAfter,
  onInitialize,
  addEventListener,
  innerHtml,
  attribute,
} from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';

const tagName = 'center-ai-page';

type AiConcept =
  | 'rlbasic' | 'reward' | 'isaacsim' | 'isaaclab' | 'domainrand' | 'isaacros' | 'deploy'
  | 'market' | 'split' | 'scaling' | 'knnreg' | 'linreg' | 'polyreg' | 'logistic' | 'sgd'
  | 'tree' | 'cvgrid' | 'ensemble'
  | 'kmeans' | 'pca'
  | 'mlp' | 'deep' | 'trainnn'
  | 'cnn' | 'cnnviz'
  | 'rnn' | 'imdb' | 'lstm'
  | 'supervised' | 'unsupervised' | 'reinforcement' | 'selfsupervised' | 'imitation' | 'transfer';

const CONCEPTS: { id: AiConcept; label: string; el: string; pattern?: string; group?: string }[] = [
  { id: 'rlbasic', label: 'RL 기초', el: 'center-ros2-sim', pattern: 'rlbasic', group: 'Sim2Real' },
  { id: 'reward', label: '보상 설계', el: 'center-ros2-sim', pattern: 'reward', group: 'Sim2Real' },
  { id: 'isaacsim', label: 'Isaac Sim', el: 'center-ros2-sim', pattern: 'isaacsim', group: 'Sim2Real' },
  { id: 'isaaclab', label: 'Isaac Lab', el: 'center-ros2-sim', pattern: 'isaaclab', group: 'Sim2Real' },
  { id: 'domainrand', label: '도메인 랜덤화', el: 'center-ros2-sim', pattern: 'domainrand', group: 'Sim2Real' },
  { id: 'isaacros', label: 'Isaac ROS', el: 'center-ros2-sim', pattern: 'isaacros', group: 'Sim2Real' },
  { id: 'deploy', label: '배포 루프', el: 'center-ros2-sim', pattern: 'deploy', group: 'Sim2Real' },
  { id: 'market', label: '마켓과 k-NN', el: 'center-ml-market', group: '1장 첫 ML' },
  { id: 'split', label: '훈련/테스트', el: 'center-ml-split', group: '2장 데이터' },
  { id: 'scaling', label: '스케일링', el: 'center-ml-scaling', group: '2장 데이터' },
  { id: 'knnreg', label: 'k-NN 회귀', el: 'center-ml-knnreg', group: '3장 회귀' },
  { id: 'linreg', label: '선형 회귀', el: 'center-ml-linreg', group: '3장 회귀' },
  { id: 'polyreg', label: '다항+규제', el: 'center-ml-polyreg', group: '3장 회귀' },
  { id: 'logistic', label: '로지스틱 회귀', el: 'center-ml-logistic', group: '4장 분류' },
  { id: 'sgd', label: '경사 하강법', el: 'center-ml-sgd', group: '4장 분류' },
  { id: 'tree', label: '결정 트리', el: 'center-ml-tree', group: '5장 트리' },
  { id: 'cvgrid', label: '교차검증', el: 'center-ml-cvgrid', group: '5장 트리' },
  { id: 'ensemble', label: '앙상블', el: 'center-ml-ensemble', group: '5장 트리' },
  { id: 'kmeans', label: 'k-평균', el: 'center-ml-kmeans', group: '6장 비지도' },
  { id: 'pca', label: '주성분 분석', el: 'center-ml-pca', group: '6장 비지도' },
  { id: 'mlp', label: '인공 신경망', el: 'center-ml-mlp', group: '7장 딥러닝' },
  { id: 'deep', label: '심층 신경망', el: 'center-ml-deep', group: '7장 딥러닝' },
  { id: 'trainnn', label: '모델 훈련', el: 'center-ml-trainnn', group: '7장 딥러닝' },
  { id: 'cnn', label: '합성곱', el: 'center-ml-cnn', group: '8장 CNN' },
  { id: 'cnnviz', label: 'CNN 시각화', el: 'center-ml-cnnviz', group: '8장 CNN' },
  { id: 'rnn', label: '순환 신경망', el: 'center-ml-rnn', group: '9장 RNN' },
  { id: 'imdb', label: 'IMDB 분류', el: 'center-ml-imdb', group: '9장 RNN' },
  { id: 'lstm', label: 'LSTM·GRU', el: 'center-ml-lstm', group: '9장 RNN' },
  { id: 'supervised', label: '지도 학습', el: 'center-ml-supervised', group: '학습 종류' },
  { id: 'unsupervised', label: '비지도 학습', el: 'center-ml-unsupervised', group: '학습 종류' },
  { id: 'reinforcement', label: '강화 학습', el: 'center-ml-reinforcement', group: '학습 종류' },
  { id: 'selfsupervised', label: '자기지도 학습', el: 'center-ml-selfsupervised', group: '학습 종류' },
  { id: 'imitation', label: '모방 학습', el: 'center-ml-imitation', group: '학습 종류' },
  { id: 'transfer', label: '전이 학습', el: 'center-ml-transfer', group: '학습 종류' },
];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class AiPage extends w.HTMLElement {
    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector('title'), { valueKey: 'titleBody' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), 'content', { valueKey: 'ogTitle' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), 'content', { valueKey: 'desc' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), 'content', { valueKey: 'ogDesc' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:image"]'), 'content', { valueKey: 'ogImage' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:image"]'), 'content', { valueKey: 'twitterImage' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:title"]'), 'content', { valueKey: 'twitterTitle' })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:description"]'), 'content', { valueKey: 'twitterDesc' })
    setPageMeta() {
      return {
        titleBody: 'AI 개념 | @dooboostore',
        ogTitle: 'AI 개념 | @dooboostore',
        desc: '로봇 AI를 결합 위치별로, Sim2Real을 개념별로 인터랙션으로 배워보세요.',
        ogDesc: '로봇 AI를 결합 위치별로, Sim2Real을 개념별로 인터랙션으로 배워보세요.',
        ogImage: '/assets/images/ai-og.png',
        twitterImage: '/assets/images/ai-og.png',
        twitterTitle: 'AI 개념 | @dooboostore',
        twitterDesc: '로봇 AI를 결합 위치별로, Sim2Real을 개념별로 인터랙션으로 배워보세요.',
      };
    }

    private router!: Router;
    private activeConcept: AiConcept = 'rlbasic';

    @onInitialize
    onInit(router: Router) {
      this.router = router;
      try {
        const c = router?.getSearchParams?.()?.get('concept') as AiConcept | null;
        if (c && CONCEPTS.some(k => k.id === c)) this.activeConcept = c;
      } catch {}
    }

    @onConnectedAfter
    onAfterConnected() {
      this.renderView();
    }

    @addEventListener('.header-back', 'click')
    onBack() { this.router.go('/'); }

    @addEventListener('.tab-concept', 'click', { delegate: true })
    onConceptTab(e: Event) {
      const btn = (e.target as HTMLElement).closest('.tab-concept') as HTMLElement;
      if (!btn || btn.dataset.value === this.activeConcept) return;
      this.activeConcept = btn.dataset.value as AiConcept;
      try { this.router?.replaceUpsertSearchParam?.({ concept: this.activeConcept }); } catch {}
      this.syncTabs();
      this.renderView();
    }

    @addEventListener('#ai-share-fab', 'click')
    async onShareFab() {
      const url = (this.ownerDocument as Document).defaultView?.location.href ?? window.location.href;
      const fab = this.shadowRoot?.querySelector('#ai-share-fab') as HTMLElement;
      const flash = () => {
        if (!fab) return;
        fab.textContent = '✓';
        fab.classList.add('copied');
        setTimeout(() => { if (fab.textContent === '✓') { fab.textContent = '🔗'; fab.classList.remove('copied'); } }, 1500);
      };
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title: 'AI 개념 | @dooboostore', text: '로봇 AI 개념을 확인해보세요!', url });
        } else {
          await navigator.clipboard?.writeText(url);
          flash();
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          try { await navigator.clipboard?.writeText(url); flash(); } catch {}
        }
      }
    }

    private syncTabs() {
      this.shadowRoot?.querySelectorAll('.tab-concept').forEach(el =>
        el.classList.toggle('active', (el as HTMLElement).dataset.value === this.activeConcept));
    }

    /** 활성 개념을 뷰 영역에 꽂음 — pattern 고정이면 단일 개념만 표시 */
    private renderView() {
      const view = this.shadowRoot?.querySelector('#ai-view') as HTMLElement;
      if (!view) return;
      const meta = CONCEPTS.find(k => k.id === this.activeConcept)!;
      view.innerHTML = meta.pattern
        ? `<${meta.el} pattern="${meta.pattern}"></${meta.el}>`
        : `<${meta.el}></${meta.el}>`;
    }

    @onConnectedBodyShadow
    render() {
      const tabBtn = (c: (typeof CONCEPTS)[number]) =>
        `<button class="tab tab-concept${c.id === this.activeConcept ? ' active' : ''}" data-value="${c.id}">${c.label}</button>`;
      let tabs = '';
      for (let i = 0; i < CONCEPTS.length;) {
        const g = CONCEPTS[i].group;
        if (g) {
          let j = i;
          while (j < CONCEPTS.length && CONCEPTS[j].group === g) j++;
          tabs += `<span class="tab-seg">${CONCEPTS.slice(i, j).map(tabBtn).join('')}</span>`;
          i = j;
        } else {
          tabs += tabBtn(CONCEPTS[i]);
          i++;
        }
      }
      const meta = CONCEPTS.find(k => k.id === this.activeConcept)!;
      return `
        <style>
          :host { display:block; min-height:100vh; background:#f0f2f5; font-family:var(--font-family,sans-serif); }
          * { box-sizing:border-box; }
          .header { display:flex; align-items:center; gap:12px; padding:16px 20px; background:linear-gradient(135deg,#4c1d95 0%,#7c3aed 60%,#c4b5fd 100%); color:#fff; }
          .header-back { background:rgba(255,255,255,0.2); border:none; color:#fff; width:38px; height:38px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
          .header-back:hover { background:rgba(255,255,255,0.35); }
          .header-title { font-size:20px; font-weight:700; flex:1; }
          .header-hits { height:20px; border-radius:4px; opacity:0.9; margin-left:auto; }
          @media(max-width:600px){ .header{padding:12px 14px} .header-title{font-size:17px} }
          .content { padding:16px; display:flex; flex-direction:column; gap:12px; }
          @media(max-width:600px){ .content{padding:10px;gap:10px} }
          .card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07); overflow:hidden; }
          .card-header { background:linear-gradient(135deg,#4c1d95,#a78bfa); color:#fff; padding:10px 14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
          .card-title { font-size:14px; font-weight:700; }
          .card-body { padding:12px 14px; }
          .tab-group { display:flex; gap:6px; flex-wrap:wrap; }
          .tab { padding:5px 13px; border-radius:20px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; transition:all .15s ease; white-space:nowrap; }
          .tab:hover { border-color:#94a3b8; color:#334155; }
          .tab.active { background:linear-gradient(135deg,#4c1d95,#c4b5fd); color:#fff; border-color:transparent; box-shadow:0 2px 8px rgba(76,29,149,0.3); }
          .tab-seg { display:inline-flex; flex-wrap:wrap; gap:5px; max-width:100%; padding:5px; border:1.5px dashed #ddd6fe; border-radius:16px; background:#faf5ff; }
          .tab-seg .tab { background:#fff; }
          .tab-seg .tab.active { background:linear-gradient(135deg,#4c1d95,#c4b5fd); color:#fff; border-color:transparent; }
          #ai-view { padding:12px 14px; }
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#4c1d95,#c4b5fd);color:#fff;border:none;box-shadow:0 6px 20px rgba(76,29,149,0.45);cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:900;transition:transform .15s ease,box-shadow .15s ease}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(76,29,149,0.55)}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45)}
          .copyright{text-align:center;padding:14px 16px;color:#aaa;font-size:12px;margin-top:8px}
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">🧠 AI 개념</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-ai.svg?style=plastic&amp;"/>
        </div>

        <div class="content">
          <div class="card">
            <div class="card-header"><span class="card-title">📚 개념 선택</span></div>
            <div class="card-body"><div class="tab-group">${tabs}</div></div>
          </div>

          <div class="card">
            <div class="card-header"><span class="card-title">📈 그래프</span></div>
            <div id="ai-view"><${meta.el}${meta.pattern ? ` pattern="${meta.pattern}"` : ''}></${meta.el}></div>
          </div>
        </div>

        <button id="ai-share-fab" class="share-fab" title="공유">🔗</button>
        <footer class="copyright">© ${new Date().getFullYear()} dooboostore</footer>
      `;
    }
  }

  return tagName;
};
