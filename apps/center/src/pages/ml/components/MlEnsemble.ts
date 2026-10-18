import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-ensemble';

const W = 340, H = 240;
const DOMAIN = 7;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = { x: number; y: number; label: 0 | 1 };
function gen(n: number, seed: number): Pt[] {
  const r = mulberry(seed);
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  const pts: Pt[] = [];
  for (let i = 0; i < n / 2; i++) pts.push({ x: 2.5 + g() * 1.5, y: 2.5 + g() * 1.5, label: 0 });
  for (let i = 0; i < n / 2; i++) pts.push({ x: 4.5 + g() * 1.5, y: 4.5 + g() * 1.5, label: 1 });
  return pts;
}
const TRAIN = gen(40, 12);
const TEST = gen(60, 34);

type TNode = { leaf: boolean; cls: 0 | 1; feat: number; thr: number; left: TNode | null; right: TNode | null };

function gini(c0: number, c1: number): number {
  const n = c0 + c1;
  if (!n) return 0;
  const p0 = c0 / n, p1 = c1 / n;
  return 1 - p0 * p0 - p1 * p1;
}
function majority(pts: Pt[]): 0 | 1 {
  let c1 = 0;
  pts.forEach(p => { if (p.label === 1) c1++; });
  return c1 * 2 >= pts.length ? 1 : 0;
}
function buildTree(pts: Pt[], depth: number, maxDepth: number): TNode {
  const c0 = pts.filter(p => p.label === 0).length;
  const c1 = pts.length - c0;
  if (depth >= maxDepth || pts.length < 4 || c0 === 0 || c1 === 0) {
    return { leaf: true, cls: majority(pts), feat: 0, thr: 0, left: null, right: null };
  }
  const base = gini(c0, c1);
  let best: { feat: number; thr: number; gain: number } | null = null;
  for (let feat = 0; feat < 2; feat++) {
    const vs = [...new Set(pts.map(p => (feat === 0 ? p.x : p.y)))].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(vs.length / 20));
    for (let i = 0; i < vs.length - 1; i += step) {
      const thr = (vs[i] + vs[i + 1]) / 2;
      const L = pts.filter(p => (feat === 0 ? p.x : p.y) <= thr);
      const R = pts.filter(p => (feat === 0 ? p.x : p.y) > thr);
      if (!L.length || !R.length) continue;
      const l0 = L.filter(p => p.label === 0).length;
      const r0 = R.filter(p => p.label === 0).length;
      const gain = base - (L.length / pts.length) * gini(l0, L.length - l0) - (R.length / pts.length) * gini(r0, R.length - r0);
      if (!best || gain > best.gain) best = { feat, thr, gain };
    }
  }
  if (!best || best.gain <= 0) {
    return { leaf: true, cls: majority(pts), feat: 0, thr: 0, left: null, right: null };
  }
  const L = pts.filter(p => (best.feat === 0 ? p.x : p.y) <= best.thr);
  const R = pts.filter(p => (best.feat === 0 ? p.x : p.y) > best.thr);
  return {
    leaf: false, cls: majority(pts), feat: best.feat, thr: best.thr,
    left: buildTree(L, depth + 1, maxDepth), right: buildTree(R, depth + 1, maxDepth),
  };
}
function predict(n: TNode, x: number, y: number): 0 | 1 {
  let cur = n;
  while (!cur.leaf) cur = ((cur.feat === 0 ? x : y) <= cur.thr ? cur.left : cur.right)!;
  return cur.cls;
}

const MD = `
## 트리의 앙상블 — 여럿이 낫다
- 하나의 깊은 트리는 훈련을 외워버립니다. 대신 **부트스트랩**(중복 허용 뽑기)으로 조금씩 다른 훈련 세트를 만들어 얕은 트리를 여러 개 키우고 **다수결**합니다. 이게 **랜덤 포레스트**입니다.
- **엑스트라 트리**는 분할 기준점까지 무작위로 뽑아 더 흔들리게, **그레이디언트 부스팅**은 앞 트리의 오차를 다음 트리가 고치며 순차적으로 쌓습니다. **HistGB**는 빠른 구현입니다.
- 트리 수를 늘려보세요. 단일 깊은 트리보다 포레스트의 테스트 정확도가 높고 안정적인 게 보입니다.
- 책의 코드: \`RandomForestClassifier()\` → \`ExtraTreesClassifier()\` → \`GradientBoostingClassifier()\` → \`HistGradientBoostingClassifier()\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlEnsemble extends w.HTMLElement {
    private nTrees = 5;

    private forest(): TNode[] {
      const trees: TNode[] = [];
      for (let t = 0; t < this.nTrees; t++) {
        const r = mulberry(100 + t);
        const boot: Pt[] = [];
        for (let i = 0; i < TRAIN.length; i++) boot.push(TRAIN[Math.floor(r() * TRAIN.length)]);
        trees.push(buildTree(boot, 0, 1));
      }
      return trees;
    }

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#me-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const trees = this.forest();
      const vote = (x: number, y: number): 0 | 1 => {
        let c1 = 0;
        trees.forEach(t => { if (predict(t, x, y) === 1) c1++; });
        return c1 * 2 >= trees.length ? 1 : 0;
      };
      const px = (x: number) => (x / DOMAIN) * W;
      const py = (y: number) => H - (y / DOMAIN) * H;
      if (ctx) {
        const G = 56;
        for (let i = 0; i < G; i++) {
          for (let j = 0; j < G; j++) {
            const x = ((i + 0.5) / G) * DOMAIN;
            const y = ((j + 0.5) / G) * DOMAIN;
            ctx.fillStyle = vote(x, y) === 0 ? '#dbeafe' : '#fef3c7';
            ctx.fillRect((i / G) * W, H - ((j + 1) / G) * H, W / G, H / G);
          }
        }
        const drawPts = (pts: Pt[], r: number, alpha: number) => {
          pts.forEach(p => {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.label === 0 ? '#3b82c4' : '#f59e0b';
            ctx.beginPath();
            ctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.globalAlpha = 1;
        };
        drawPts(TEST, 2.5, 0.45);
        drawPts(TRAIN, 4, 1);
      }
      const single = buildTree(TRAIN, 0, 5);
      let sOk = 0, fOk = 0;
      TEST.forEach(p => {
        if (predict(single, p.x, p.y) === p.label) sOk++;
        if (vote(p.x, p.y) === p.label) fOk++;
      });
      const sAcc = sOk / TEST.length, fAcc = fOk / TEST.length;
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#me-n-val', String(this.nTrees));
      const bar = (sel: string, v: number) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.style.width = `${Math.round(v * 100)}%`;
      };
      bar('#me-bar-single', sAcc);
      bar('#me-bar-forest', fAcc);
      setText('#me-v-single', `단일 트리(깊이 5): ${sAcc.toFixed(3)}`);
      setText('#me-v-forest', `포레스트(스텀프 ${this.nTrees}개 투표): ${fAcc.toFixed(3)}`);
    }

    @addEventListener('#me-n', 'input')
    onN(e: Event) { this.nTrees = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          canvas { display:block; width:100%; max-width:${W}px; margin:12px auto; border-radius:8px; border:1px solid #e2e8f0; }
          .me-bars { margin-top:10px; display:flex; flex-direction:column; gap:6px; }
          .me-row { display:flex; align-items:center; gap:8px; font-size:11.5px; font-weight:700; color:#475569; }
          .me-row span:first-child { width:190px; flex-shrink:0; }
          .me-track { flex:1; background:#f1f5f9; border-radius:4px; height:14px; }
          .me-fill { display:block; height:100%; background:linear-gradient(90deg,#14532d,#4ade80); border-radius:4px; transition:width .15s; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 여러 모델을 키워 투표·가중 평균으로 합치는 방법으로, 단일 모델의 외우기·흔들림을 줄입니다.</div>
  <div><b>언제</b> 단일 모델의 한계를 넘고 안정성이 필요할 때 씁니다.</div>
  <div><b>예시</b> 랜덤 포레스트, 그레이디언트 부스팅, 캐글 앙상블</div>
</div>
        <div class="mm-intro">
          배경이 포레스트의 구역 나눔입니다. <b>트리 수</b>를 1→15로 늘리면 막대(테스트 정확도)가 단일 깊은 트리를 앞지르는 게 보입니다.
        </div>

        <div class="ctl"><label>트리 수 <input id="me-n" type="range" min="1" max="15" step="1" value="${this.nTrees}"><b id="me-n-val">${this.nTrees}</b></label></div>
        <canvas id="me-canvas" width="${W}" height="${H}"></canvas>
        <div class="me-bars">
          <div class="me-row"><span id="me-v-single"></span><div class="me-track"><span class="me-fill" id="me-bar-single"></span></div></div>
          <div class="me-row"><span id="me-v-forest"></span><div class="me-track"><span class="me-fill" id="me-bar-forest"></span></div></div>
        </div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
