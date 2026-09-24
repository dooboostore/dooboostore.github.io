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

const tagName = 'center-vision-page';

type VisionConcept =
  | 'saturatewrap' | 'colorspace' | 'filtering' | 'morphology' | 'pipeline'
  | 'pinhole' | 'intrinsicK' | 'distortion' | 'camerachain'
  | 'pnp' | 'reprojection' | 'ambiguity' | 'distancesolutions'
  | 'hsvtuning' | 'contourfilter' | 'emastabilize' | 'detectionrate'
  | 'calibsetup' | 'calibrms' | 'calibsanity' | 'calibpnpupgrade'
  | 'rospipeline' | 'cvbridge' | 'bandwidth' | 'qoscompare'
  | 'pipelineintegration' | 'backprojection' | 'pipelinevalidation';

const CONCEPTS: { id: VisionConcept; label: string; el: string; group?: string }[] = [
  { id: 'saturatewrap', label: '포화·오버플로', el: 'center-vision-saturate-wrap', group: 'ocv16' },
  { id: 'colorspace', label: '색공간(HSV)', el: 'center-vision-color-space', group: 'ocv16' },
  { id: 'filtering', label: '필터링(블러)', el: 'center-vision-filtering', group: 'ocv16' },
  { id: 'morphology', label: '이진화·모폴로지', el: 'center-vision-morphology', group: 'ocv16' },
  { id: 'pipeline', label: '파이프라인 조립', el: 'center-vision-pipeline', group: 'ocv16' },
  { id: 'pinhole', label: '핀홀 모델', el: 'center-vision-pinhole', group: 'ocv17' },
  { id: 'intrinsicK', label: '내부파라미터 K', el: 'center-vision-intrinsic-k', group: 'ocv17' },
  { id: 'distortion', label: '렌즈 왜곡', el: 'center-vision-lens-distortion', group: 'ocv17' },
  { id: 'camerachain', label: '카메라 체인 조립', el: 'center-vision-camera-chain', group: 'ocv17' },
  { id: 'pnp', label: 'PnP 포즈 추정', el: 'center-vision-pnp', group: 'ocv18' },
  { id: 'reprojection', label: '재투영 오차', el: 'center-vision-reprojection-error', group: 'ocv18' },
  { id: 'ambiguity', label: '단안 거리 모호성', el: 'center-vision-monocular-ambiguity', group: 'ocv18' },
  { id: 'distancesolutions', label: '거리 해결책 3가지', el: 'center-vision-distance-solutions', group: 'ocv18' },
  { id: 'hsvtuning', label: 'HSV 범위 튜닝', el: 'center-vision-hsv-tuning', group: 'ocv19' },
  { id: 'contourfilter', label: '컨투어 필터', el: 'center-vision-contour-filter', group: 'ocv19' },
  { id: 'emastabilize', label: '시간축 안정화(EMA)', el: 'center-vision-ema-stabilize', group: 'ocv19' },
  { id: 'detectionrate', label: '검출률 매트릭스', el: 'center-vision-detection-rate', group: 'ocv19' },
  { id: 'calibsetup', label: '왜 여러 장인가', el: 'center-vision-calib-setup', group: 'ocv20' },
  { id: 'calibrms', label: 'RMS 재투영 오차', el: 'center-vision-calib-rms', group: 'ocv20' },
  { id: 'calibsanity', label: '상식·눈 검사', el: 'center-vision-calib-sanity', group: 'ocv20' },
  { id: 'calibpnpupgrade', label: '캘리브레이션→PnP', el: 'center-vision-calib-pnp-upgrade', group: 'ocv20' },
  { id: 'rospipeline', label: 'ROS2 이미지 파이프라인', el: 'center-vision-ros-pipeline', group: 'ocv21' },
  { id: 'cvbridge', label: 'cv_bridge 번역기', el: 'center-vision-cv-bridge', group: 'ocv21' },
  { id: 'bandwidth', label: '대역폭 계산기', el: 'center-vision-bandwidth-calc', group: 'ocv21' },
  { id: 'qoscompare', label: 'QoS 비교', el: 'center-vision-qos-compare', group: 'ocv21' },
  { id: 'pipelineintegration', label: '통합 파이프라인', el: 'center-vision-pipeline-integration', group: 'ocv22' },
  { id: 'backprojection', label: '색 경로 역투영', el: 'center-vision-back-projection', group: 'ocv22' },
  { id: 'pipelinevalidation', label: '검증 3종', el: 'center-vision-pipeline-validation', group: 'ocv22' },
];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionPage extends w.HTMLElement {
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
        titleBody: '비전 개념 | @dooboostore',
        ogTitle: '비전 개념 | @dooboostore',
        desc: '영상처리·로보틱스 비전 개념을 그래프와 인터랙션으로 시각화해 보세요.',
        ogDesc: '영상처리·로보틱스 비전 개념을 그래프와 인터랙션으로 시각화해 보세요.',
        ogImage: '/assets/images/vision-og.png',
        twitterImage: '/assets/images/vision-og.png',
        twitterTitle: '비전 개념 | @dooboostore',
        twitterDesc: '영상처리·로보틱스 비전 개념을 그래프와 인터랙션으로 시각화해 보세요.',
      };
    }

    private router!: Router;
    private activeConcept: VisionConcept = 'saturatewrap';

    @onInitialize
    onInit(router: Router) {
      this.router = router;
      try {
        const c = router?.getSearchParams?.()?.get('concept') as VisionConcept | null;
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
      this.activeConcept = btn.dataset.value as VisionConcept;
      try { this.router?.replaceUpsertSearchParam?.({ concept: this.activeConcept }); } catch {}
      this.syncTabs();
      this.renderView();
    }

    @addEventListener('#vision-share-fab', 'click')
    async onShareFab() {
      const url = (this.ownerDocument as Document).defaultView?.location.href ?? window.location.href;
      const fab = this.shadowRoot?.querySelector('#vision-share-fab') as HTMLElement;
      const flash = () => {
        if (!fab) return;
        fab.textContent = '✓';
        fab.classList.add('copied');
        setTimeout(() => { if (fab.textContent === '✓') { fab.textContent = '🔗'; fab.classList.remove('copied'); } }, 1500);
      };
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title: '비전 개념 | @dooboostore', text: '영상처리·로보틱스 비전 개념을 확인해보세요!', url });
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
      const view = this.shadowRoot?.querySelector('#vision-view') as HTMLElement;
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
          .header { display:flex; align-items:center; gap:12px; padding:16px 20px; background:linear-gradient(135deg,#0369a1 0%,#0ea5e9 60%,#7dd3fc 100%); color:#fff; }
          .header-back { background:rgba(255,255,255,0.2); border:none; color:#fff; width:38px; height:38px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
          .header-back:hover { background:rgba(255,255,255,0.35); }
          .header-title { font-size:20px; font-weight:700; flex:1; }
          .header-hits { height:20px; border-radius:4px; opacity:0.9; margin-left:auto; }
          @media(max-width:600px){ .header{padding:12px 14px} .header-title{font-size:17px} }
          .content { padding:16px; display:flex; flex-direction:column; gap:12px; }
          @media(max-width:600px){ .content{padding:10px;gap:10px} }
          .card { background:#fff; border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.07); overflow:hidden; }
          .card-header { background:linear-gradient(135deg,#0369a1,#0ea5e9); color:#fff; padding:10px 14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
          .card-title { font-size:14px; font-weight:700; }
          .card-body { padding:12px 14px; }
          .tab-group { display:flex; gap:6px; flex-wrap:wrap; }
          .tab { padding:5px 13px; border-radius:20px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; transition:all .15s ease; white-space:nowrap; }
          .tab:hover { border-color:#94a3b8; color:#334155; }
          .tab.active { background:linear-gradient(135deg,#0369a1,#7dd3fc); color:#fff; border-color:transparent; box-shadow:0 2px 8px rgba(3,105,161,0.3); }
          .tab-seg { display:inline-flex; flex-wrap:wrap; gap:5px; max-width:100%; padding:5px; border:1.5px dashed #bae6fd; border-radius:16px; background:#f0f9ff; }
          .tab-seg .tab { background:#fff; }
          .tab-seg .tab.active { background:linear-gradient(135deg,#0369a1,#7dd3fc); color:#fff; border-color:transparent; }
          #vision-view { padding:12px 14px; }
          .share-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#0369a1,#7dd3fc);color:#fff;border:none;box-shadow:0 6px 20px rgba(3,105,161,0.45);cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:900;transition:transform .15s ease,box-shadow .15s ease}
          .share-fab:hover{transform:scale(1.08);box-shadow:0 8px 24px rgba(3,105,161,0.55)}
          .share-fab.copied{background:#10b981;box-shadow:0 6px 20px rgba(16,185,129,0.45)}
          .copyright{text-align:center;padding:14px 16px;color:#aaa;font-size:12px;margin-top:8px}
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div class="header-title">👁️ 비전 개념</div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-vision.svg?style=plastic&amp;"/>
        </div>

        <div class="content">
          <div class="card">
            <div class="card-header"><span class="card-title">📚 개념 선택</span></div>
            <div class="card-body"><div class="tab-group">${tabs}</div></div>
          </div>

          <div class="card">
            <div class="card-header"><span class="card-title">📈 그래프</span></div>
            <div id="vision-view"><${meta.el}></${meta.el}></div>
          </div>
        </div>

        <button id="vision-share-fab" class="share-fab" title="공유">🔗</button>
        <footer class="copyright">© ${new Date().getFullYear()} dooboostore</footer>
      `;
    }
  }

  return tagName;
};
