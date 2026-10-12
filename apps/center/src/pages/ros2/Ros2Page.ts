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

const tagName = 'center-ros2-page';

type RosConcept =
  | 'distro' | 'install'
  | 'node' | 'patterns' | 'comm' | 'param' | 'launch'
  | 'dds' | 'qos'
  | 'cli' | 'pkg' | 'bag' | 'tf' | 'urdf'
  | 'eco';

const CONCEPTS: { id: RosConcept; label: string; el: string; group?: string }[] = [
  { id: 'distro', label: '배포판 지도', el: 'center-ros2-distro', group: 'start' },
  { id: 'install', label: '설치', el: 'center-ros2-install', group: 'start' },
  { id: 'node', label: '노드', el: 'center-ros2-node', group: 'core' },
  { id: 'patterns', label: '노드구성', el: 'center-ros2-patterns', group: 'core' },
  { id: 'comm', label: '토픽·서비스·액션', el: 'center-ros2-comm', group: 'core' },
  { id: 'param', label: '파라미터', el: 'center-ros2-param', group: 'core' },
  { id: 'launch', label: 'Launch', el: 'center-ros2-launch', group: 'core' },
  { id: 'dds', label: 'DDS·RMW', el: 'center-ros2-dds', group: 'mw' },
  { id: 'qos', label: 'QoS', el: 'center-ros2-qos', group: 'mw' },
  { id: 'cli', label: 'CLI 치트', el: 'center-ros2-cli', group: 'tools' },
  { id: 'pkg', label: '패키지·colcon', el: 'center-ros2-pkg', group: 'tools' },
  { id: 'bag', label: 'rosbag', el: 'center-ros2-bag', group: 'tools' },
  { id: 'tf', label: 'TF2', el: 'center-ros2-tf', group: 'tools' },
  { id: 'urdf', label: 'URDF·암', el: 'center-ros2-urdf', group: 'tools' },
  { id: 'eco', label: '생태계', el: 'center-ros2-eco', group: 'eco' },
];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class Ros2Page extends w.HTMLElement {
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
        titleBody: 'ROS 2 개념 | @dooboostore',
        ogTitle: 'ROS 2 개념 | @dooboostore',
        desc: 'ROS 2를 설치부터 개념까지 인터랙션으로 배워보세요.',
        ogDesc: 'ROS 2를 설치부터 개념까지 인터랙션으로 배워보세요.',
        ogImage: '/assets/images/ros2-og.png',
        twitterImage: '/assets/images/ros2-og.png',
        twitterTitle: 'ROS 2 개념 | @dooboostore',
        twitterDesc: 'ROS 2를 설치부터 개념까지 인터랙션으로 배워보세요.',
      };
    }

    private router!: Router;
    private activeConcept: RosConcept = 'distro';

    @onInitialize
    onInit(router: Router) {
      this.router = router;
      try {
        const c = router?.getSearchParams?.()?.get('concept') as RosConcept | null;
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
      this.activeConcept = btn.dataset.value as RosConcept;
      try { this.router?.replaceUpsertSearchParam?.({ concept: this.activeConcept }); } catch {}
      this.syncTabs();
      this.renderView();
    }

    @addEventListener('#ros2-share-fab', 'click')
    async onShareFab() {
      const url = (this.ownerDocument as Document).defaultView?.location.href ?? window.location.href;
      const fab = this.shadowRoot?.querySelector('#ros2-share-fab') as HTMLElement;
      const flash = () => {
        if (!fab) return;
        fab.textContent = '✓';
        fab.classList.add('copied');
        setTimeout(() => { if (fab.textContent === '✓') { fab.textContent = '🔗'; fab.classList.remove('copied'); } }, 1500);
      };
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title: 'ROS 2 개념 | @dooboostore', text: 'ROS 2를 설치부터 개념까지 확인해보세요!', url });
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
      const view = this.shadowRoot?.querySelector('#ros2-view') as HTMLElement;
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
          .header { display:flex; align-items:center; gap:12px; padding:16px 20px; background:linear-gradient(135deg,#22314e 0%,#3b82c4 60%,#7dd3fc 100%); color:#fff; }
          .header-back { background:rgba(255,255,255,0.2); border:none; color:#fff; width:38px; height:38px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
          .header-back:hover { background:rgba(255,255,255,0.35); }
          .header-title { font-size:20px; font-weight:700; flex:1; }
          .header-hits { height:20px; border-radius:4px; opacity:0.9; margin-left:auto; }
          @media(max-width:600px){ .header{padding:12px 14px} .header-title{font-size:17px} }
          .content { padding:16px; display:flex; flex-direction:column; gap:12px; }
          @media(max-width:600px){ .content{padding:10px;gap:10px} }
          .card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07); overflow:hidden; }
          .card-header { background:linear-gradient(135deg,#22314e,#3b82c4); color:#fff; padding:10px 14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
          .card-title { font-size:14px; font-weight:700; }
          .card-body { padding:12px 14px; }
          .tab-group { display:flex; gap:6px; flex-wrap:wrap; }
          .tab { padding:5px 13px; border-radius:20px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; transition:all .15s ease; white-space:nowrap; }
          .tab:hover { border-color:#94a3b8; color:#334155; }
          .tab.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; box-shadow:0 2px 8px rgba(34,49,78,0.3); }
          .tab-seg { display:inline-flex; flex-wrap:wrap; gap:5px; max-width:100%; padding:5px; border:1.5px dashed #bae6fd; border-radius:16px; background:#f0f9ff; }
          .tab-seg .tab { background:#fff; }
          .tab-seg .tab.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          #ros2-view { padding:12px 14px; }
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#22314e,#7dd3fc);color:#fff;border:none;box-shadow:0 6px 20px rgba(34,49,78,0.45);cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:900;transition:transform .15s ease,box-shadow .15s ease}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(34,49,78,0.55)}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45)}
          .copyright{text-align:center;padding:14px 16px;color:#aaa;font-size:12px;margin-top:8px}
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">🤖 ROS 2 개념</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-ros2.svg?style=plastic&amp;"/>
        </div>

        <div class="content">
          <div class="card">
            <div class="card-header"><span class="card-title">📚 개념 선택</span></div>
            <div class="card-body"><div class="tab-group">${tabs}</div></div>
          </div>

          <div class="card">
            <div class="card-header"><span class="card-title">📈 그래프</span></div>
            <div id="ros2-view"><${meta.el}></${meta.el}></div>
          </div>
        </div>

        <button id="ros2-share-fab" class="share-fab" title="공유">🔗</button>
        <footer class="copyright">© ${new Date().getFullYear()} dooboostore</footer>
      `;
    }
  }

  return tagName;
};
