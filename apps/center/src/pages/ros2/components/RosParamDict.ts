import {
  addEventListener,
  elementDefine,
  onConnectedBodyShadow,
  subscribeSwcAppRouteChange,
  swcAppRouteGo,
  swcAppRouteQueryParam,
} from '@dooboostore/simple-web-component';
import { PARAM_GROUPS, type ParamDoc, type ParamGroup } from './RosParamsData';

const tagName = 'center-ros2-param-dict';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rowId = (g: string, p: string) => `pd-${g}--${p.replace(/[^\w]/g, '_')}`;
const CATS = [...new Set(PARAM_GROUPS.map(g => g.cat))];
const GROUP_IDS = new Set(PARAM_GROUPS.map(g => g.id));

/** 그룹 카드의 CLI — 목록·저장·조회 예시 */
const groupCli = (g: ParamGroup) => {
  const sample = g.params.find(p => p.key);
  const lines = [
    `ros2 param list ${g.node}                 # 이 노드의 파라미터 전체`,
    `ros2 param dump ${g.node} > params.yaml    # 현재 값을 YAML로 저장`,
  ];
  if (sample?.key) {
    lines.push(`ros2 param get ${g.node} ${sample.key}`);
    lines.push(`ros2 param describe ${g.node} ${sample.key}   # 타입·범위·읽기전용 여부`);
  }
  return lines.join('\n');
};

/** 그룹 카드의 YAML 위치 예시 — 설계값이 있으면 그 값, 없으면 기본값 */
const groupYaml = (g: ParamGroup) => {
  if (g.id === 'common') return `<노드 이름>:\n  ros__parameters:\n    use_sim_time: false`;
  // /local_costmap/local_costmap → local_costmap: local_costmap: ros__parameters: 처럼 경로대로 중첩
  const segs = g.node.split('/').filter(Boolean);
  const head = segs.map((s, i) => `${'  '.repeat(i)}${s}:`).join('\n');
  const base = segs.length;
  // YAML 값으로 그대로 쓸 수 있는 단순한 값만 (설명이 붙은 설계값·'—' 등은 제외)
  const simple = (v?: string) => {
    const s = v?.split(' (')[0].split(' / ')[0].trim();
    return s && /^[\w.\-+]+$|^\[[^\]]*\]$|^'[^']*'$|^"[^"]*"$/.test(s) ? s : undefined;
  };
  const picks = g.params.filter(p => p.key && (simple(p.design) ?? simple(p.default)))
    .sort((a, b) => Number(!!simple(b.design)) - Number(!!simple(a.design))).slice(0, 3);
  // 키 경로를 트리로 합쳐서 같은 부모(FollowPath 등)가 한 번만 나오게
  type Tree = { [k: string]: Tree | string };
  const tree: Tree = {};
  for (const p of picks) {
    const parts = p.key!.split('.');
    let cur = tree;
    parts.forEach((k, i) => {
      if (i === parts.length - 1) cur[k] = simple(p.design) ?? simple(p.default)!;
      else cur = (typeof cur[k] === 'object' ? cur[k] : (cur[k] = {})) as Tree;
    });
  }
  const emit = (t: Tree, depth: number): string => Object.entries(t)
    .map(([k, v]) => typeof v === 'string' ? `${'  '.repeat(depth)}${k}: ${v}` : `${'  '.repeat(depth)}${k}:\n${emit(v, depth + 1)}`).join('\n');
  const body = emit(tree, base + 1);
  return `${head}\n${'  '.repeat(base)}ros__parameters:\n${body}`;
};

const row = (g: ParamGroup, p: ParamDoc) => {
  const search = `${g.title} ${g.pkg} ${p.name} ${p.key ?? ''} ${p.ko} ${p.en ?? ''} ${p.design ? `★ 설계값 ${p.design}` : ''}`.toLowerCase();
  return `
    <tr id="${rowId(g.id, p.name)}" data-search="${esc(search)}">
      <td class="pd-name"><code>${esc(p.name)}</code>${p.key && p.key !== p.name ? `<div class="pd-key">키 <code>${esc(p.key)}</code></div>` : ''}${p.ro ? '<span class="pd-ro">읽기 전용</span>' : ''}</td>
      <td data-h="타입"><code>${esc(p.type)}</code></td>
      <td data-h="기본값"><code>${esc(p.default)}</code></td>
      <td data-h="설명">${esc(p.ko)}${p.design ? `<div class="pd-design">★ 설계값 <code>${esc(p.design)}</code></div>` : ''}${p.en ? `<details class="pd-en"><summary>원문</summary>${esc(p.en)}</details>` : ''}</td>
    </tr>`;
};

const card = (g: ParamGroup) => `
  <section class="pd-card" id="pg-${g.id}" data-group="${g.id}">
    <header>
      <span class="pd-kind">${esc(g.kind)}</span>
      <h4>${esc(g.title)}</h4>
      <code class="pd-node">${esc(g.node)}</code>
    </header>
    <p class="pd-desc">${esc(g.desc)}</p>
    <div class="pd-meta"><span>패키지 <code>${esc(g.pkg)}</code></span><span>파라미터 ${g.params.length}개</span><span class="pd-src">출처 ${esc(g.source)}</span></div>
    <div class="pd-two">
      <div><div class="pd-sub">YAML 위치 예시</div><pre><code>${esc(groupYaml(g))}</code></pre></div>
      <div><div class="pd-sub">CLI</div><pre><code>${esc(groupCli(g))}</code></pre></div>
    </div>
    <table class="pd-table"><thead><tr><th>이름</th><th>타입</th><th>기본값</th><th>설명</th></tr></thead>
      <tbody>${g.params.map(p => row(g, p)).join('')}</tbody></table>
  </section>`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosParamDict extends w.HTMLElement {
    private focusKey?: string;                      // 'group|param' 또는 'group|'
    private scrollMemo = new Map<string, number>(); // 뒤로가기 때 스크롤 복원

    /** ?pg=그룹&p=파라미터 — 클릭 push·뒤로/앞으로 가기·딥링크 모두 여기서 */
    @subscribeSwcAppRouteChange('/ros2', { trigger: 'connectedDone' })
    onRoute(
      @swcAppRouteQueryParam('concept') concept: string | null,
      @swcAppRouteQueryParam('pg') pg: string | null,
      @swcAppRouteQueryParam('p') p: string | null,
    ) {
      if (concept !== 'param') return;
      const key = pg && GROUP_IDS.has(pg) ? `${pg}|${p ?? ''}` : undefined;
      if (key === this.focusKey) return;
      this.focusKey = key;
      const saved = this.scrollMemo.get(key ?? '');
      if (saved !== undefined) { this.clearFlash(); w.scrollTo(0, saved); return; }
      if (key) this.scrollToKey(key);
    }

    @swcAppRouteGo
    private goTo(pg: string, p?: string) {
      const key = `${pg}|${p ?? ''}`;
      if (key === this.focusKey) { this.scrollToKey(key); return false; }
      this.scrollMemo.set(this.focusKey ?? '', w.scrollY);
      const q = new URLSearchParams({ concept: 'param', pg });
      if (p) q.set('p', p);
      return { path: `/ros2?${q.toString()}`, scrollToTop: false };
    }

    private clearFlash() {
      this.shadowRoot?.querySelectorAll('.flash').forEach(c => c.classList.remove('flash'));
    }

    private scrollToKey(key: string) {
      const [pg, p] = key.split('|');
      const el = (p ? this.shadowRoot?.querySelector(`#${rowId(pg, p)}`) : null)
        ?? this.shadowRoot?.querySelector(`#pg-${pg}`) as HTMLElement | null;
      if (!el) return;
      if ((el as HTMLElement).hidden || (el.closest('[hidden]'))) {
        const input = this.shadowRoot?.querySelector('.pd-search') as HTMLInputElement;
        if (input) { input.value = ''; this.applySearch(''); }
      }
      el.scrollIntoView({ behavior: 'smooth', block: p ? 'center' : 'start' });
      this.clearFlash();
      void (el as HTMLElement).offsetWidth;
      el.classList.add('flash');
    }

    private applySearch(q: string) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      const root = this.shadowRoot!;
      root.querySelectorAll<HTMLElement>('.pd-card').forEach(c => {
        let any = false;
        c.querySelectorAll<HTMLElement>('tbody tr').forEach(tr => {
          const hit = words.every(t => (tr.dataset.search ?? '').includes(t));
          tr.hidden = !hit;
          if (hit) { any = true; shown++; }
        });
        c.hidden = !any;
        const btn = root.querySelector<HTMLElement>(`.pd-ref[data-pg="${c.dataset.group}"]`);
        if (btn) btn.hidden = !any;
      });
      root.querySelectorAll<HTMLElement>('.pd-cat').forEach(sec => { sec.hidden = !sec.querySelector('.pd-card:not([hidden])'); });
      root.querySelectorAll<HTMLElement>('.pd-idx').forEach(r => { r.hidden = !r.querySelector('.pd-ref:not([hidden])'); });
      const total = PARAM_GROUPS.reduce((n, g) => n + g.params.length, 0);
      const count = root.querySelector('.pd-count');
      if (count) count.textContent = words.length ? `${shown}개 일치` : `전체 ${total}개`;
      const empty = root.querySelector<HTMLElement>('.pd-empty');
      if (empty) empty.hidden = shown > 0;
    }

    @addEventListener('.pd-search', 'input')
    onSearch(e: Event) {
      this.applySearch((e.target as HTMLInputElement).value);
    }

    @addEventListener('.pd-ref', 'click', { delegate: true })
    onRef(e: Event) {
      const btn = (e.target as HTMLElement).closest('.pd-ref') as HTMLElement;
      if (btn?.dataset.pg) this.goTo(btn.dataset.pg);
    }

    /** 파라미터 이름을 누르면 그 행으로 딥링크 (주소 공유용) */
    @addEventListener('.pd-name code', 'click', { delegate: true })
    onName(e: Event) {
      const tr = (e.target as HTMLElement).closest('tr') as HTMLElement;
      const card = tr?.closest('.pd-card') as HTMLElement;
      const name = (e.target as HTMLElement).closest('.pd-name')?.querySelector('code')?.textContent;
      if (card?.dataset.group && name) this.goTo(card.dataset.group, name);
    }

    @onConnectedBodyShadow
    render() {
      const total = PARAM_GROUPS.reduce((n, g) => n + g.params.length, 0);
      const index = CATS.map(c => `<div class="pd-idx"><b>${c}</b>${PARAM_GROUPS.filter(g => g.cat === c)
        .map(g => `<button class="pd-ref" data-pg="${g.id}">${esc(g.title)}<small>${g.params.length}</small></button>`).join('')}</div>`).join('');
      const body = CATS.map(c => `<div class="pd-cat"><h3>${c}</h3>${PARAM_GROUPS.filter(g => g.cat === c).map(card).join('')}</div>`).join('');
      return `
        <style>
          :host { display:block; margin-top:28px; font-size:13px; color:#334155; line-height:1.7; }
          * { box-sizing:border-box; }
          h2 { font-size:17px; font-weight:800; color:#1e293b; margin:0 0 8px; padding-bottom:4px; border-bottom:2px solid #e0f2fe; }
          .pd-intro { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px; }
          .pd-intro ul { margin:6px 0 0; padding-left:18px; }
          .pd-intro pre { margin:6px 0 0; }
          code { background:#f1f5f9; border-radius:4px; padding:0 4px; font-size:12px; overflow-wrap:anywhere; }
          pre { margin:0; padding:9px 12px; border-radius:8px; overflow-x:auto; font-size:12px; line-height:1.55; background:#f8fafc; border:1px solid #e2e8f0; }
          pre code { background:none; padding:0; }
          .pd-tools { position:sticky; top:0; z-index:2; display:flex; gap:8px; align-items:center; padding:8px 0; background:#fff; }
          .pd-search { flex:1; min-width:0; padding:8px 12px; border:1.5px solid #bae6fd; border-radius:18px; font-size:13px; font-family:inherit; outline:none; }
          .pd-search:focus { border-color:#3b82c4; box-shadow:0 0 0 3px rgba(59,130,196,0.15); }
          .pd-count { font-size:12px; color:#64748b; white-space:nowrap; }
          .pd-index { display:flex; flex-direction:column; gap:5px; margin:6px 0 14px; }
          .pd-idx { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
          .pd-idx b { font-size:12px; color:#22314e; min-width:110px; }
          .pd-ref { padding:0 7px; border-radius:9px; border:1px solid #bae6fd; background:#f0f9ff; color:#1e3a8a; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
          .pd-ref:hover { background:#dbeafe; }
          .pd-ref small { margin-left:4px; font-size:10px; color:#64748b; font-weight:600; }
          .pd-cat h3 { margin:44px 0 16px; padding:4px 10px; font-size:14px; font-weight:800; color:#22314e; background:#f0f9ff; border-left:4px solid #3b82c4; border-radius:0 6px 6px 0; }
          .pd-card { border:1px solid #e2e8f0; border-left:5px solid #3b82c4; border-radius:12px; padding:16px 20px; margin:0 0 28px; scroll-margin-top:60px; background:#fff; box-shadow:0 2px 10px rgba(15,23,42,0.06); }
          .pd-card header { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; }
          .pd-card h4 { margin:0; font-size:15px; font-weight:800; color:#1e293b; }
          .pd-kind { font-size:11px; font-weight:800; padding:1px 8px; border-radius:9px; background:#e0f2fe; color:#075985; }
          .pd-node { font-size:11.5px; color:#64748b; }
          .pd-desc { margin:6px 0 4px; }
          .pd-meta { display:flex; flex-wrap:wrap; gap:2px 14px; font-size:11.5px; color:#64748b; margin-bottom:8px; }
          .pd-two { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; margin-bottom:10px; }
          .pd-sub { font-size:11.5px; font-weight:800; color:#475569; margin-bottom:3px; }
          .pd-table { width:100%; border-collapse:collapse; font-size:12.5px; }
          .pd-table th, .pd-table td { border-bottom:1px solid #eef2f7; padding:7px 8px; text-align:left; vertical-align:top; }
          .pd-table th { background:#f8fafc; font-size:12px; color:#475569; white-space:nowrap; }
          .pd-table td:nth-child(1) { width:28%; }
          .pd-table td:nth-child(2) { width:12%; }
          .pd-table td:nth-child(3) { width:14%; }
          .pd-name code { cursor:pointer; font-weight:700; color:#1e3a8a; background:#eff6ff; }
          .pd-key { margin-top:2px; font-size:11px; color:#64748b; }
          .pd-ro { display:inline-block; margin-top:3px; font-size:10.5px; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:0 6px; }
          .pd-design { margin-top:4px; font-size:12px; font-weight:700; color:#b45309; }
          .pd-design code { background:#fffbeb; }
          .pd-en { margin-top:3px; font-size:11.5px; color:#64748b; }
          .pd-en summary { cursor:pointer; color:#94a3b8; }
          tr.flash td, .pd-card.flash { animation:pdflash 1.8s ease-out; }
          @keyframes pdflash { 0%,30% { background:#dbeafe; } 100% { background:transparent; } }
          .pd-empty { margin:10px 0; padding:14px; text-align:center; color:#64748b; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; }
          [hidden] { display:none !important; }
          @media(max-width:600px){
            .pd-idx b { min-width:auto; width:100%; } .pd-card { padding:12px; margin-bottom:20px; } .pd-two { grid-template-columns:1fr; }
            .pd-table thead { display:none; }
            .pd-table, .pd-table tbody, .pd-table tr, .pd-table td { display:block; width:100% !important; }
            .pd-table tr { border:1px solid #e2e8f0; border-radius:8px; padding:6px 8px; margin-bottom:6px; }
            .pd-table td { border:none; padding:1px 0; }
            .pd-table td[data-h]::before { content:attr(data-h); display:inline-block; min-width:48px; font-size:11px; font-weight:700; color:#64748b; }
          }
        </style>

        <h2>📒 파라미터 사전</h2>
        <div class="pd-intro">
          ROS 2 패키지들이 <b>열어 둔(선언한) 파라미터</b> 모음입니다. 실전노드설계에서 쓰는 노드·컨트롤러·플러그인 위주로 ${total}개를 정리했습니다.
          <ul>
            <li>파라미터는 YAML의 <code>노드이름 → ros__parameters</code> 아래에 두고 launch에서 넘깁니다. 플러그인 파라미터는 플러그인 이름 아래에 중첩됩니다 (예: <code>FollowPath.max_vel_x</code>). 각 행의 "키"가 <code>ros2 param</code>에 쓰는 실제 이름입니다.</li>
            <li>★ 설계값은 실전노드설계에서 정한 값입니다. 이름을 누르면 그 행 주소가 만들어져 공유할 수 있습니다.</li>
            <li>이름·타입·기본값은 공식 원본(Nav2 문서, ros2_controllers·ros2_control 파라미터 정의 파일, robot_localization 문서, realsense-ros README, rtabmap 소스)에서 가져왔고, 설명은 원문을 바탕으로 한국어로 정리했습니다(행마다 "원문"으로 확인). 문서에 기본값이 없으면 "—"입니다.</li>
            <li>설치된 버전의 실제 목록은 아래 명령으로 확인하세요. 버전에 따라 이름·기본값이 다를 수 있습니다.</li>
          </ul>
          <pre><code>ros2 param list /controller_server
ros2 param describe /controller_server FollowPath.max_vel_x
ros2 param set /controller_server FollowPath.max_vel_x 0.2     # 실행 중 변경 (재시작하면 YAML 값으로)
ros2 param dump /controller_server > controller_server.yaml
ros2 run &lt;패키지&gt; &lt;실행파일&gt; --ros-args --params-file controller_server.yaml</code></pre>
        </div>
        <div class="pd-tools">
          <input class="pd-search" type="search" placeholder="검색: max_vel, inflation, frame_id, 설계값 ..." />
          <span class="pd-count">전체 ${total}개</span>
        </div>
        <div class="pd-index">${index}</div>
        <p class="pd-empty" hidden>일치하는 파라미터가 없습니다.</p>
        ${body}
      `;
    }
  }

  return tagName;
};
