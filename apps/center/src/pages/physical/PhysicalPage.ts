import {
  elementDefine,
  onConnectedBodyShadow,
  onConnectedBefore,
  onConnectedAfter,
  onInitialize,
  addEventListener,
  innerHtml,
  setAttribute,
} from '@dooboostore/simple-web-component';
import { Router } from '@dooboostore/core-web';

const tagName = 'center-physical-page';

type PhysicalConcept = 'gearratio' | 'statictorque' | 'imu' | 'dof' | 'encoder' | 'xm430';

const CONCEPTS: { id: PhysicalConcept; label: string; el: string; group?: string }[] = [
  { id: 'gearratio', label: '기어비·토크-속도', el: 'center-physical-gearratio' },
  { id: 'statictorque', label: '정하중 토크(서보 선정)', el: 'center-physical-statictorque' },
  { id: 'imu', label: 'IMU(가속도계·자이로)', el: 'center-physical-imu' },
  { id: 'dof', label: '자유도(DOF)·여분자유도', el: 'center-physical-dof' },
  { id: 'encoder', label: '엔코더(분해능·신호주기)', el: 'center-physical-encoder' },
  { id: 'xm430', label: 'XM430 실시간 시뮬레이터', el: 'center-physical-xm430' },
];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class PhysicalPage extends w.HTMLElement {
    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector('title'), { valueKey: 'titleBody' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), 'content', { valueKey: 'ogTitle' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), 'content', { valueKey: 'desc' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), 'content', { valueKey: 'ogDesc' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[property="og:image"]'), 'content', { valueKey: 'ogImage' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:image"]'), 'content', { valueKey: 'twitterImage' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:title"]'), 'content', { valueKey: 'twitterTitle' })
    @setAttribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:description"]'), 'content', { valueKey: 'twitterDesc' })
    setPageMeta() {
      return {
        titleBody: '피지컬 AI 개념 | @dooboostore',
        ogTitle: '피지컬 AI 개념 | @dooboostore',
        desc: '로봇·피지컬 AI에서 쓰는 하드웨어·센서·역학 개념을 그래프로 시각화해 보세요.',
        ogDesc: '로봇·피지컬 AI에서 쓰는 하드웨어·센서·역학 개념을 그래프로 시각화해 보세요.',
        ogImage: '/assets/images/physical-og.png',
        twitterImage: '/assets/images/physical-og.png',
        twitterTitle: '피지컬 AI 개념 | @dooboostore',
        twitterDesc: '로봇·피지컬 AI에서 쓰는 하드웨어·센서·역학 개념을 그래프로 시각화해 보세요.',
      };
    }

    private router!: Router;
    private activeConcept: PhysicalConcept = 'gearratio';

    @onInitialize
    onInit(router: Router) {
      this.router = router;
      try {
        const c = router?.getSearchParams?.()?.get('concept') as PhysicalConcept | null;
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
      this.activeConcept = btn.dataset.value as PhysicalConcept;
      try { this.router?.replaceUpsertSearchParam?.({ concept: this.activeConcept }); } catch {}
      this.syncTabs();
      this.renderView();
    }

    @addEventListener('#physical-share-fab', 'click')
    async onShareFab() {
      const url = (this.ownerDocument as Document).defaultView?.location.href ?? window.location.href;
      const fab = this.shadowRoot?.querySelector('#physical-share-fab') as HTMLElement;
      const flash = () => {
        if (!fab) return;
        fab.textContent = '✓';
        fab.classList.add('copied');
        setTimeout(() => { if (fab.textContent === '✓') { fab.textContent = '🔗'; fab.classList.remove('copied'); } }, 1500);
      };
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title: '피지컬 AI 개념 | @dooboostore', text: '로봇·피지컬 AI 개념을 그래프로 확인해보세요!', url });
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

    /** 활성 개념 컴포넌트를 뷰 영역에 꽂음 — 각 컴포넌트가 자기 그래프를 직접 그림 */
    private renderView() {
      const view = this.shadowRoot?.querySelector('#physical-view') as HTMLElement;
      if (!view) return;
      const meta = CONCEPTS.find(k => k.id === this.activeConcept)!;
      view.innerHTML = `<${meta.el}></${meta.el}>`;
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
          .header { display:flex; align-items:center; gap:12px; padding:16px 20px; background:linear-gradient(135deg,#0f766e 0%,#14b8a6 60%,#5eead4 100%); color:#fff; }
          .header-back { background:rgba(255,255,255,0.2); border:none; color:#fff; width:38px; height:38px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
          .header-back:hover { background:rgba(255,255,255,0.35); }
          .header-title { font-size:20px; font-weight:700; flex:1; }
          .header-hits { height:20px; border-radius:4px; opacity:0.9; margin-left:auto; }
          @media(max-width:600px){ .header{padding:12px 14px} .header-title{font-size:17px} }
          .content { padding:16px; display:flex; flex-direction:column; gap:12px; }
          @media(max-width:600px){ .content{padding:10px;gap:10px} }
          .card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07); overflow:hidden; }
          .card-header { background:linear-gradient(135deg,#0f766e,#14b8a6); color:#fff; padding:10px 14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
          .card-title { font-size:14px; font-weight:700; }
          .card-body { padding:12px 14px; }
          .tab-group { display:flex; gap:6px; flex-wrap:wrap; }
          .tab { padding:5px 13px; border-radius:20px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; transition:all .15s ease; white-space:nowrap; }
          .tab:hover { border-color:#94a3b8; color:#334155; }
          .tab.active { background:linear-gradient(135deg,#0f766e,#5eead4); color:#fff; border-color:transparent; box-shadow:0 2px 8px rgba(15,118,110,0.3); }
          .tab-seg { display:inline-flex; flex-wrap:wrap; gap:5px; max-width:100%; padding:5px; border:1.5px dashed #99e6d9; border-radius:16px; background:#ecfdf9; }
          .tab-seg .tab { background:#fff; }
          .tab-seg .tab.active { background:linear-gradient(135deg,#0f766e,#5eead4); color:#fff; border-color:transparent; }
          #physical-view { padding:12px 14px; }
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#0f766e,#5eead4);color:#fff;border:none;box-shadow:0 6px 20px rgba(15,118,110,0.45);cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:900;transition:transform .15s ease,box-shadow .15s ease}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(15,118,110,0.55)}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45)}
          .copyright{text-align:center;padding:14px 16px;color:#aaa;font-size:12px;margin-top:8px}
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">🦾 피지컬 AI 개념</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-physical.svg?style=plastic&amp;"/>
        </div>

        <div class="content">
          <div class="card">
            <div class="card-header"><span class="card-title">📚 개념 선택</span></div>
            <div class="card-body"><div class="tab-group">${tabs}</div></div>
          </div>

          <div class="card">
            <div class="card-header"><span class="card-title">📈 그래프</span></div>
            <div id="physical-view"><${meta.el}></${meta.el}></div>
          </div>
        </div>

        <button id="physical-share-fab" class="share-fab" title="공유">🔗</button>
        <footer class="copyright">© ${new Date().getFullYear()} dooboostore</footer>
      `;
    }
  }

  return tagName;
};
