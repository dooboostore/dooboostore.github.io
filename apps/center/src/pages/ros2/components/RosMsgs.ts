import {
  addEventListener,
  elementDefine,
  onConnectedBodyShadow,
  subscribeSwcAppRouteChange,
  swcAppRouteGo,
  swcAppRouteQueryParam,
} from '@dooboostore/simple-web-component';
import { MSG_DOCS, MSG_IDS, PKG_DESC, toMsgId, type MsgDoc } from './RosMsgsData';
import { echoYaml, flowYaml, json, sectionCount, shapeOf } from './RosMsgsShape';

const tagName = 'center-ros2-msgs';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const anchor = (id: string) => `msg-${id.replace('/', '__')}`;
const KIND_LABEL = { msg: 'msg · 토픽', srv: 'srv · 서비스', action: 'action · 액션' } as const;
const KIND_PATH = { msg: 'msg', srv: 'srv', action: 'action' } as const;

/** 정의 본문의 'pkg/Name' 타입을 같은 사전 카드로 가는 버튼으로 (주석 부분은 그대로) */
const linkDef = (def: string, self: string) =>
  def.split('\n').map(line => {
    const i = line.indexOf('#');
    const code = i < 0 ? line : line.slice(0, i);
    const comment = i < 0 ? '' : line.slice(i);
    const linked = esc(code).replace(/\b([a-z0-9_]+\/[A-Z]\w*)/g, (m) => {
      const id = toMsgId(m);
      return id && id !== self ? `<button class="rm-ref" data-msg="${id}">${m}</button>` : m;
    });
    return linked + (comment ? `<span class="rm-cm">${esc(comment)}</span>` : '');
  }).join('\n');

/** 모든 카드에 붙는 기본 CLI — 종류별로 정의 확인·찾기·직접 호출 */
const baseCli = (d: MsgDoc, full: string) => {
  const name = d.id.split('/')[1];
  const snake = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (d.kind === 'msg') return [
    `ros2 interface show ${full}      # 정의 (설치된 버전 원본)`,
    `ros2 interface proto ${full}     # 기본값으로 채운 YAML 틀`,
    `ros2 topic find ${full}          # 이 타입을 쓰는 토픽 찾기`,
  ].join('\n');
  if (d.kind === 'srv') return [
    `ros2 interface show ${full}`,
    `ros2 service find ${full}        # 이 타입의 서비스 찾기`,
    `ros2 service call /${snake} ${full} "${flowYaml(shapeOf(d.def, 0))}"`,
  ].join('\n');
  return [
    `ros2 interface show ${full}`,
    `ros2 action list -t | grep ${name}    # 이 타입의 액션 찾기`,
    `ros2 action send_goal /${snake} ${full} "${flowYaml(shapeOf(d.def, 0))}" --feedback`,
  ].join('\n');
};

/** 실제로 오가는 데이터 모양 — msg는 echo YAML + JSON, srv·action은 구역별 JSON */
const shapes = (d: MsgDoc) => {
  const box = (title: string, body: string) => `<div class="rm-shape"><div class="rm-shapet">${title}</div><pre><code>${esc(body)}</code></pre></div>`;
  if (d.kind === 'msg') {
    const n = shapeOf(d.def, 0);
    return `<h5>📦 데이터 모양 <small>(기본값으로 채운 예시)</small></h5><div class="rm-shapes">${box('ros2 topic echo 출력 (YAML)', echoYaml(n))}${box('JSON (rosbridge · roslibjs 등)', json(n))}</div>`;
  }
  const names = d.kind === 'srv' ? ['요청 Request', '응답 Response'] : ['Goal', 'Result', 'Feedback'];
  const k = Math.min(sectionCount(d.def), names.length);
  return `<h5>📦 데이터 모양 <small>(JSON, 기본값으로 채운 예시)</small></h5><div class="rm-shapes n${k}">${names.slice(0, k).map((t, i) => box(t, json(shapeOf(d.def, i)))).join('')}</div>`;
};

const card = (d: MsgDoc) => {
  const [pkg, name] = d.id.split('/');
  const full = `${pkg}/${KIND_PATH[d.kind]}/${name}`;
  const search = `${d.id} ${full} ${d.desc} ${d.def} ${(d.usedIn ?? []).join(' ')}`.toLowerCase();
  return `
  <section class="rm-card ${d.kind}" id="${anchor(d.id)}" data-search="${esc(search)}">
    <header>
      <span class="rm-kind">${KIND_LABEL[d.kind]}</span>
      <h4>${esc(name)}</h4>
      <code class="rm-full">${esc(full)}</code>
    </header>
    <p class="rm-desc">${esc(d.desc)}</p>
    <pre class="rm-def"><code>${linkDef(d.def, d.id)}</code></pre>
    ${shapes(d)}
    ${d.notes?.length ? `<h5>📝 알아 둘 점</h5><ul>${d.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${d.usedIn?.length ? `<h5>🤖 실전노드설계에서 쓰는 곳</h5><ul class="rm-used">${d.usedIn.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <h5>⌨️ CLI</h5><pre class="rm-cli"><code>${esc(baseCli(d, full))}${d.cli ? `\n\n<span class="rm-cm"># 예시 (실전노드설계 기준)</span>\n${esc(d.cli)}` : ''}</code></pre>
    ${d.kind !== 'msg' ? `<p class="rm-clinote">서비스·액션 이름(<code>/${esc(d.id.split('/')[1].replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase())}</code>)은 예시입니다. 실제 이름은 위의 찾기 명령으로 확인하세요. YAML은 요청/goal 필드를 기본값으로 채운 틀입니다.</p>` : ''}
  </section>`;
};

const PKGS = [...new Set(MSG_DOCS.map(d => d.id.split('/')[0]))];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosMsgs extends w.HTMLElement {
    private focusMsg?: string;
    private scrollMemo = new Map<string, number>(); // 카드별 스크롤 위치 — 뒤로가기 때 복원

    /** ?msg= 가 바뀔 때마다 (클릭 push·뒤로/앞으로 가기·딥링크) 해당 카드로 */
    @subscribeSwcAppRouteChange('/ros2', { trigger: 'connectedDone' })
    onRoute(@swcAppRouteQueryParam('concept') concept: string | null, @swcAppRouteQueryParam('msg') msgParam: string | null) {
      if (concept !== 'msgs') return;
      const id = msgParam && MSG_IDS.has(msgParam) ? msgParam : undefined;
      if (id === this.focusMsg) return;
      this.focusMsg = id;
      const saved = this.scrollMemo.get(id ?? '');
      if (saved !== undefined) { this.clearFlash(); w.scrollTo(0, saved); return; }
      if (id) this.scrollToCard(id);
    }

    @swcAppRouteGo
    private goMsg(id: string) {
      if (id === this.focusMsg) { this.scrollToCard(id); return false; }
      this.scrollMemo.set(this.focusMsg ?? '', w.scrollY);
      return { path: `/ros2?concept=msgs&msg=${encodeURIComponent(id)}`, scrollToTop: false };
    }

    private clearFlash() {
      this.shadowRoot?.querySelectorAll('.rm-card.flash').forEach(c => c.classList.remove('flash'));
    }

    private scrollToCard(id: string) {
      const el = this.shadowRoot?.querySelector(`#${anchor(id)}`) as HTMLElement | null;
      if (!el) return;
      // 검색으로 숨겨져 있으면 검색을 풀어서 보이게
      if (el.hidden) {
        const input = this.shadowRoot?.querySelector('.rm-search') as HTMLInputElement;
        if (input) { input.value = ''; this.applySearch(''); }
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.clearFlash();
      void el.offsetWidth;
      el.classList.add('flash');
    }

    private applySearch(q: string) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      this.shadowRoot?.querySelectorAll<HTMLElement>('.rm-card').forEach(c => {
        const hit = words.every(t => (c.dataset.search ?? '').includes(t));
        c.hidden = !hit;
        if (hit) shown++;
      });
      this.shadowRoot?.querySelectorAll<HTMLElement>('.rm-pkg').forEach(sec => {
        sec.hidden = !sec.querySelector('.rm-card:not([hidden])');
      });
      // 목차도 같은 결과로 — 일치한 타입 버튼만 남기고, 남은 게 없는 패키지 줄은 숨김
      this.shadowRoot?.querySelectorAll<HTMLElement>('.rm-idx').forEach(row => {
        let any = false;
        row.querySelectorAll<HTMLElement>('.rm-ref').forEach(btn => {
          const card = this.shadowRoot?.querySelector<HTMLElement>(`#${anchor(btn.dataset.msg ?? '')}`);
          btn.hidden = !!card?.hidden;
          if (!btn.hidden) any = true;
        });
        row.hidden = !any;
      });
      const empty = this.shadowRoot?.querySelector<HTMLElement>('.rm-empty');
      if (empty) empty.hidden = shown > 0;
      const count = this.shadowRoot?.querySelector('.rm-count');
      if (count) count.textContent = words.length ? `${shown}개 일치` : `전체 ${MSG_DOCS.length}개`;
    }

    @addEventListener('.rm-search', 'input')
    onSearch(e: Event) {
      this.applySearch((e.target as HTMLInputElement).value);
    }

    @addEventListener('.rm-ref', 'click', { delegate: true })
    onRef(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rm-ref') as HTMLElement;
      if (btn?.dataset.msg) this.goMsg(btn.dataset.msg);
    }

    @onConnectedBodyShadow
    render() {
      const index = PKGS.map(p => `<div class="rm-idx"><b>${p}</b>${MSG_DOCS.filter(d => d.id.startsWith(p + '/'))
        .map(d => `<button class="rm-ref" data-msg="${d.id}">${d.id.split('/')[1]}${d.kind === 'msg' ? '' : `<small>${d.kind}</small>`}</button>`).join('')}</div>`).join('');
      const body = PKGS.map(p => `
        <div class="rm-pkg">
          <h3>${p}</h3>
          <p class="rm-pdesc">${esc(PKG_DESC[p] ?? '')}</p>
          ${MSG_DOCS.filter(d => d.id.startsWith(p + '/')).map(card).join('')}
        </div>`).join('');
      return `
        <style>
          :host { display:block; font-size:13px; color:#334155; line-height:1.7; }
          * { box-sizing:border-box; }
          .rm-intro { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px; }
          .rm-intro b { color:#22314e; }
          .rm-intro ul { margin:6px 0 0; padding-left:18px; }
          .rm-tools { position:sticky; top:0; z-index:2; display:flex; gap:8px; align-items:center; padding:8px 0; background:#fff; }
          .rm-search { flex:1; min-width:0; padding:8px 12px; border:1.5px solid #bae6fd; border-radius:18px; font-size:13px; font-family:inherit; outline:none; }
          .rm-search:focus { border-color:#3b82c4; box-shadow:0 0 0 3px rgba(59,130,196,0.15); }
          .rm-count { font-size:12px; color:#64748b; white-space:nowrap; }
          .rm-index { display:flex; flex-direction:column; gap:5px; margin:6px 0 14px; }
          .rm-idx { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
          .rm-idx b { font-size:12px; color:#22314e; min-width:150px; }
          .rm-ref { padding:0 7px; border-radius:9px; border:1px solid #bae6fd; background:#f0f9ff; color:#1e3a8a; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
          .rm-ref:hover { background:#dbeafe; }
          .rm-ref small { margin-left:3px; font-size:10px; color:#e65100; }
          .rm-pkg h3 { margin:44px 0 4px; padding:4px 10px; font-size:14px; font-weight:800; color:#22314e; background:#f0f9ff; border-left:4px solid #3b82c4; border-radius:0 6px 6px 0; }
          .rm-pdesc { margin:4px 0 16px; color:#64748b; font-size:12.5px; }
          .rm-card { border:1px solid #e2e8f0; border-left:5px solid #3b82c4; border-radius:12px; padding:16px 20px; margin:0 0 28px; scroll-margin-top:60px; background:#fff; box-shadow:0 2px 10px rgba(15,23,42,0.06); }
          .rm-shapes { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
          .rm-shapes.n3 { grid-template-columns:repeat(3, minmax(0, 1fr)); }
          .rm-shape pre { margin:0; max-height:360px; overflow:auto; background:#f8fafc; border:1px solid #e2e8f0; color:#0f172a; }
          .rm-shapet { font-size:11.5px; font-weight:800; color:#475569; margin-bottom:3px; }
          .rm-card h5 small { font-weight:600; color:#94a3b8; }
          .rm-card.srv { border-left-color:#7c3aed; }
          .rm-card.action { border-left-color:#e65100; }
          .rm-card.flash { animation:rmflash 1.8s ease-out; }
          @keyframes rmflash { 0%,30% { box-shadow:0 0 0 4px rgba(59,130,196,0.55); background:#eff6ff; } 100% { box-shadow:none; background:#fff; } }
          .rm-card header { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; }
          .rm-card h4 { margin:0; font-size:15px; font-weight:800; color:#1e293b; }
          .rm-kind { font-size:11px; font-weight:800; padding:1px 8px; border-radius:9px; background:#e0f2fe; color:#075985; }
          .rm-card.srv .rm-kind { background:#ede9fe; color:#5b21b6; }
          .rm-card.action .rm-kind { background:#fff3e0; color:#bf360c; }
          .rm-full { font-size:11.5px; color:#64748b; background:#f1f5f9; border-radius:4px; padding:0 5px; }
          .rm-desc { margin:6px 0; }
          .rm-card h5 { margin:10px 0 2px; font-size:12.5px; font-weight:800; color:#22314e; }
          .rm-card ul { margin:2px 0; padding-left:18px; }
          .rm-used li { color:#1e3a8a; }
          pre { margin:6px 0; padding:9px 12px; border-radius:8px; overflow-x:auto; font-size:12px; line-height:1.55; }
          .rm-def { background:#0f172a; color:#e2e8f0; }
          .rm-def .rm-cm { color:#94a3b8; }
          .rm-def .rm-ref { background:#1e3a5f; border-color:#3b82c4; color:#bae6fd; font-family:inherit; font-size:11.5px; padding:0 4px; }
          .rm-cli { background:#f8fafc; border:1px solid #e2e8f0; color:#0f172a; }
          .rm-cli .rm-cm { color:#64748b; }
          .rm-clinote { margin:2px 0 0; font-size:11.5px; color:#64748b; }
          .rm-empty { margin:10px 0; padding:14px; text-align:center; color:#64748b; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; }
          [hidden] { display:none !important; }
          @media(max-width:600px){ .rm-idx b { min-width:auto; width:100%; } .rm-card { padding:12px 12px; margin-bottom:20px; } .rm-shapes, .rm-shapes.n3 { grid-template-columns:1fr; } }
        </style>

        <div class="rm-intro">
          ROS 2가 기본 제공하는 <b>메시지(msg)·서비스(srv)·액션(action) 타입</b> 사전입니다. 노드들은 이 타입으로 데이터를 주고받습니다.
          <ul>
            <li>정의 안의 타입 이름(예: <code>geometry_msgs/Point</code>)을 누르면 그 타입으로 이동하고, 브라우저 뒤로가기로 돌아옵니다.</li>
            <li>코드에서 쓰는 이름은 <code>패키지/msg/이름</code> (예: <code>geometry_msgs/msg/Twist</code>)입니다. srv·action은 가운데가 srv·action.</li>
            <li>실전노드설계 탭의 노드 사전에서 메시지 타입을 눌러도 여기로 옵니다. 설계에서 쓰는 곳은 🤖 항목에 적었습니다.</li>
            <li>필드 정의는 공식 원본(GitHub <code>ros2/common_interfaces</code>·<code>ros2/rcl_interfaces</code>·<code>ros2/geometry2</code>·<code>ros-controls/control_msgs</code>·<code>ros-navigation/navigation2</code>의 jazzy 브랜치, <code>moveit/moveit_msgs</code> ros2 브랜치)과 대조했습니다. 원본 주석은 빼고 한국어 설명을 붙였고, 일부 카드는 긴 상수 목록을 줄였습니다. 설치된 버전의 원본은 <code>ros2 interface show geometry_msgs/msg/Twist</code>로 확인할 수 있습니다.</li>
            <li>내부·테스트용 패키지(<code>type_description_interfaces</code>, <code>service_msgs</code>, <code>test_msgs</code>, Nav2 내부의 <code>dwb_msgs</code>·<code>nav_2d_msgs</code>)와 ROS 1 유산인 <code>actionlib_msgs</code>는 뺐습니다. <code>moveit_msgs</code>는 이 설계에서 쓰는 것만 넣었습니다.</li>
          </ul>
        </div>
        <div class="rm-tools">
          <input class="rm-search" type="search" placeholder="검색: Twist, odom, 카메라, covariance ..." />
          <span class="rm-count">전체 ${MSG_DOCS.length}개</span>
        </div>
        <div class="rm-index">${index}</div>
        <p class="rm-empty" hidden>일치하는 타입이 없습니다.</p>
        ${body}
      `;
    }
  }

  return tagName;
};
