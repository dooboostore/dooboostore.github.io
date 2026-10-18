import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ml-tree';

const W = 340, H = 260;
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
  for (let i = 0; i < Math.floor(n / 2); i++) pts.push({ x: 2 + g() * 1.3, y: 2 + g() * 1.3, label: 0 });
  for (let i = 0; i < Math.ceil(n / 2); i++) pts.push({ x: 5 + g() * 1.3, y: 5 + g() * 1.3, label: 1 });
  pts.push({ x: 5.5, y: 1.5, label: 0 });
  pts.push({ x: 1.5, y: 5.5, label: 1 });
  return pts;
}
const TRAIN = gen(60, 8);
const TEST = gen(30, 52);

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
  if (depth >= maxDepth || pts.length < 5 || c0 === 0 || c1 === 0) {
    return { leaf: true, cls: majority(pts), feat: 0, thr: 0, left: null, right: null };
  }
  const base = gini(c0, c1);
  let best: { feat: number; thr: number; gain: number } | null = null;
  for (let feat = 0; feat < 2; feat++) {
    const vs = [...new Set(pts.map(p => (feat === 0 ? p.x : p.y)))].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(vs.length / 24));
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
  while (!cur.leaf) {
    cur = ((cur.feat === 0 ? x : y) <= cur.thr ? cur.left : cur.right)!;
  }
  return cur.cls;
}
function countNodes(n: TNode): number {
  return 1 + (n.left ? countNodes(n.left) : 0) + (n.right ? countNodes(n.right) : 0);
}

const MD = `
## 결정 트리 — 예/아니오 스무고개
- 질문 하나(예: 당도 ≤ 0.5?)로 데이터를 둘로 가릅니다. **지니 불순도**가 가장 많이 떨어지는 질문을 골라 되풀이하면 트리가 자랍니다.
- 깊이가 깊을수록 훈련은 잘 맞추지만, 이빨 빠진 점 2개(예외 샘플)까지 외워버려 테스트에서 틀립니다. **max_depth가 가지치기 가위**입니다.
- 책의 코드: \`DecisionTreeClassifier(max_depth=d)\` → 와인 분류 문제 그대로입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MlTree extends w.HTMLElement {
    private depth = 2;

    private refresh() {
      const canvas = this.shadowRoot?.querySelector('#mt-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      const tree = buildTree(TRAIN, 0, this.depth);
      const px = (x: number) => (x / DOMAIN) * W;
      const py = (y: number) => H - (y / DOMAIN) * H;
      if (ctx) {
        const G = 64;
        for (let i = 0; i < G; i++) {
          for (let j = 0; j < G; j++) {
            const x = ((i + 0.5) / G) * DOMAIN;
            const y = ((j + 0.5) / G) * DOMAIN;
            ctx.fillStyle = predict(tree, x, y) === 0 ? '#dbeafe' : '#fef3c7';
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
      let teOk = 0;
      TEST.forEach(p => { if (predict(tree, p.x, p.y) === p.label) teOk++; });
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#mt-depth-val', String(this.depth));
      setText('#mt-stat', `노드 ${countNodes(tree)}개 · 테스트 정확도 ${(teOk / TEST.length).toFixed(3)}`);
    }

    @addEventListener('#mt-depth', 'input')
    onDepth(e: Event) { this.depth = Number((e.target as HTMLInputElement).value); this.refresh(); }

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
          .mt-stat { text-align:center; font-size:12.5px; font-weight:700; color:#1e293b; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-top:8px; font-family:monospace; }
          .mm-legend { display:flex; gap:12px; justify-content:center; font-size:11px; color:#64748b; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
          .mm-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .mm-intro b { color:#14532d; }
          .mm-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .mm-def b { color:#14532d; display:inline-block; min-width:36px; }
        </style>

        <div class="mm-def">
  <div><b>정의</b> 예/아니오 질문으로 데이터를 둘로 나누는 분할을 반복해 나무 모양 규칙을 만드는 모델입니다.</div>
  <div><b>언제</b> 해석 가능한 분류·회귀가 필요할 때 씁니다.</div>
  <div><b>예시</b> 와인 분류, 대출 심사, 질병 진단</div>
</div>
        <div class="mm-intro">
          와인 분류(05-1) 축소판입니다. 배경색이 트리의 구역 나눔입니다. <b>깊이</b>를 1→4로 올리면 구역이 잘게 쪼개지며 테스트 정확도가 어떻게 되는지 보세요.
        </div>

        <div class="ctl"><label>최대 깊이 <input id="mt-depth" type="range" min="1" max="4" step="1" value="${this.depth}"><b id="mt-depth-val">${this.depth}</b></label></div>
        <canvas id="mt-canvas" width="${W}" height="${H}"></canvas>
        <div class="mm-legend"><span><span style="color:#3b82c4">●</span> 클래스 A(훈련)</span><span><span style="color:#f59e0b">●</span> 클래스 B(훈련)</span><span>연한 점 = 테스트</span></div>
        <div class="mt-stat" id="mt-stat"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
