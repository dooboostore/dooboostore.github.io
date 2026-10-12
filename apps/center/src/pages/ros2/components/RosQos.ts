import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-qos';

type Rel = 'reliable' | 'best_effort';
type Dur = 'volatile' | 'transient_local';

type Policy = { id: string; name: string; kind: string; desc: string; demo: string };

const POLICIES: Policy[] = [
  { id: 'rel', name: 'Reliability', kind: '신뢰성', desc: '메시지 도착 보장 여부. Reliable=재전송으로 반드시 전달(느려질 수 있음), BestEffort=떨어지면 버리고 최신만(빠름). 센서 스트림은 BestEffort, 서비스·파라미터는 Reliable이 정석.', demo: '아래 계약 게임의 왼쪽 손잡이. BestEffort 발행자 ↔ Reliable 구독자는 ❌.' },
  { id: 'dur', name: 'Durability', kind: '지속성', desc: '늦게 온 구독자에게 과거를 줄지. Volatile=지금부터만, TransientLocal=마지막 값 보관 후 전달(파라미터·지도 latch용).', demo: '계약 게임의 오른쪽 손잡이. 뒤늦게 ros2 topic echo를 켜도 값이 보이는지가 여기 달림.' },
  { id: 'his', name: 'History + Depth', kind: '보관', desc: 'KeepLast(N)=최근 N개만 보관, KeepAll=전부(메모리 주의). 센서는 depth 5~10으로 작게 — 아래 depth 시뮬레이터로 버려짐을 직접 보세요.', demo: 'depth 슬라이더: 15개 도착 중 depth개만 생존.' },
  { id: 'ddl', name: 'Deadline', kind: '마감', desc: '이 주기로 꼭 와야 한다는 계약. 발행자가 약속을 어기면 구독자에 missed-deadline 이벤트. "10Hz로 온다"는 가정을 코드로 박는 것.', demo: '발행 Hz를 deadline 밑으로 내리면 경고등. 센서 감시용.' },
  { id: 'life', name: 'Lifespan', kind: '수명', desc: '메시지의 유통기한. 기간이 지나면 수신 측에서 폐기. 오래된 명령(cmd_vel)이 뒤늦게 실행되는 사고 방지.', demo: '수명을 짧게 + 지연을 크게 = 도착해도 버려짐.' },
  { id: 'live', name: 'Liveliness', kind: '생존', desc: '노드가 살아있는지 자동/수동으로 알림. lease_duration 안에 신호 없으면 "죽음" 판정 — 모니터·복구 로직의 입력.', demo: '자동(Automatic)=DDS가 알아서, 수동=노드가 직접 갱신.' },
];

const PRESETS: { label: string; pub: [Rel, Dur]; sub: [Rel, Dur]; note: string }[] = [
  { label: '센서 데이터', pub: ['best_effort', 'volatile'], sub: ['best_effort', 'volatile'], note: 'qos_profile_sensor_data — 최신만, depth 5' },
  { label: '서비스', pub: ['reliable', 'volatile'], sub: ['reliable', 'volatile'], note: '요청-응답은 reliable 기본' },
  { label: '파라미터', pub: ['reliable', 'transient_local'], sub: ['reliable', 'transient_local'], note: '늦게 온 구독자도 마지막 값 수신' },
  { label: '시스템 기본', pub: ['reliable', 'volatile'], sub: ['reliable', 'volatile'], note: '아무 지정 없으면 이 값 (system_default)' },
];

const MD = `
## QoS — 계약서 매칭
- 발행자(Offered)와 구독자(Requested)가 **계약을 맺습니다**. 한쪽이라도 안 맞으면 연결 자체가 안 됩니다.
- 위 도감의 6정책 중 **연결 여부를 가르는 건 Reliability·Durability**(+Deadline·Lifespan·Liveliness의 수치 비교)입니다. History·Depth는 로컬 보관이라 연결과 무관합니다.
- **History depth**: 몇 개까지 보관할지. 센서는 5~10으로 작게(신선도), 파라미터는 크게.
- vision QoS 탭의 reliable 누적 지연 그래프가 바로 "계약을 잘못 맺었을 때"의 결과입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosQos extends w.HTMLElement {
    private policy = 'rel';
    private pubRel: Rel = 'best_effort';
    private pubDur: Dur = 'volatile';
    private subRel: Rel = 'reliable';
    private subDur: Dur = 'volatile';
    private depth = 5;

    private refresh() {
      const relOk = this.pubRel === 'reliable' || this.subRel === 'best_effort';
      const durOk = this.pubDur === 'transient_local' || this.subDur === 'volatile';
      const ok = relOk && durOk;
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      const relLine = (r: Rel, d: Dur) => `${r === 'reliable' ? 'Reliable' : 'BestEffort'} + ${d === 'transient_local' ? 'TransientLocal' : 'Volatile'}`;
      setText('#rq-pub', `발행자(Offered): ${relLine(this.pubRel, this.pubDur)}`);
      setText('#rq-sub', `구독자(Requested): ${relLine(this.subRel, this.subDur)}`);
      const v = this.shadowRoot?.querySelector('#rq-verdict') as HTMLElement;
      if (v) {
        const reasons: string[] = [];
        if (!relOk) reasons.push('Reliability 불일치 (Reliable 요구 ↔ BestEffort 제공)');
        if (!durOk) reasons.push('Durability 불일치 (TransientLocal 요구 ↔ Volatile 제공)');
        v.textContent = ok ? '✅ 계약 성립 — 토픽이 연결됩니다' : `❌ 연결 안 됨 — ${reasons.join(' · ')}`;
        v.style.background = ok ? '#dcfce7' : '#fee2e2';
        v.style.color = ok ? '#166534' : '#991b1b';
        v.style.borderColor = ok ? '#bbf7d0' : '#fecaca';
      }
      const sync = (name: string, val: string) => {
        this.shadowRoot?.querySelectorAll(`[data-${name}]`).forEach(el =>
          (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset[name] === val));
      };
      sync('prel', this.pubRel); sync('pdur', this.pubDur);
      sync('srel', this.subRel); sync('sdur', this.subDur);

      // 정책 도감
      const p = POLICIES.find(x => x.id === this.policy)!;
      setText('#rq-pname', `${p.name} — ${p.kind}`);
      setText('#rq-pdesc', p.desc);
      setText('#rq-pdemo', p.demo);
      this.shadowRoot?.querySelectorAll('.rq-pol').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.pol === this.policy));

      // depth 데모: 15개 중 depth개 생존
      const total = 15;
      setText('#rq-depth-val', String(this.depth));
      const dq = this.shadowRoot?.querySelector('#rq-depth-svg') as HTMLElement;
      if (dq) {
        const W = 320, BW = (W - 10) / total;
        dq.innerHTML = Array.from({ length: total }, (_, i) => {
          const alive = i >= total - this.depth;
          return `<rect x="${(5 + i * BW).toFixed(1)}" y="8" width="${(BW - 2).toFixed(1)}" height="26" rx="3" fill="${alive ? '#16a34a' : '#e2e8f0'}"/>`;
        }).join('') +
          `<text x="5" y="50" font-size="10" fill="#64748b">15개 도착 → depth ${this.depth}개만 보관, 나머지 버려짐 (KeepLast)</text>`;
      }
    }

    @addEventListener('.rq-pol', 'click', { delegate: true })
    onPol(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rq-pol') as HTMLElement;
      if (!btn) return;
      this.policy = btn.dataset.pol ?? 'rel';
      this.refresh();
    }

    @addEventListener('.rq-opt', 'click', { delegate: true })
    onOpt(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rq-opt') as HTMLElement;
      if (!btn || !btn.dataset.group || !btn.dataset.value) return;
      (this as any)[btn.dataset.group] = btn.dataset.value;
      this.refresh();
    }

    @addEventListener('.rq-preset', 'click', { delegate: true })
    onPreset(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rq-preset') as HTMLElement;
      if (!btn || btn.dataset.idx === undefined) return;
      const p = PRESETS[Number(btn.dataset.idx)];
      [this.pubRel, this.pubDur] = [p.pub[0], p.pub[1]];
      [this.subRel, this.subDur] = [p.sub[0], p.sub[1]];
      const note = this.shadowRoot?.querySelector('#rq-note') as HTMLElement;
      if (note) note.textContent = p.note;
      this.refresh();
    }

    @addEventListener('#rq-depth', 'input')
    onDepth(e: Event) { this.depth = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const opt = (group: string, attr: string, val: string, label: string) =>
        `<button class="rq-opt" data-group="${group}" data-value="${val}" data-${attr}="${val}">${label}</button>`;
      return `
        <style>
          :host { display:block; }
          .rq-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rq-intro b { color:#22314e; }
          .rq-sec { font-size:12.5px; font-weight:800; color:#22314e; margin:16px 0 6px; }
          .rq-pols { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:6px; }
          .rq-pol { padding:8px 10px; border-radius:8px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#475569; font-size:11.5px; font-weight:700; cursor:pointer; text-align:left; }
          .rq-pol small { display:block; font-weight:600; color:#94a3b8; font-size:10.5px; }
          .rq-pol.active { border-color:#22314e; background:#eff6ff; color:#0c4a6e; }
          .rq-pdetail { background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:10px 12px; margin-top:8px; }
          .rq-pdetail b { color:#0c4a6e; font-size:13px; }
          .rq-pdetail p { font-size:12.5px; color:#334155; line-height:1.7; margin:6px 0 0; }
          .rq-pdetail .demo { font-size:12px; color:#92400e; margin-top:6px; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:40px; text-align:right; color:#1e293b; }
          svg.rq-depth { display:block; width:100%; max-width:320px; margin:8px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .rq-side { margin-top:10px; }
          .rq-side-title { font-size:12px; font-weight:800; color:#22314e; margin-bottom:4px; }
          .rq-opts { display:flex; gap:6px; flex-wrap:wrap; }
          .rq-opt { padding:5px 12px; border-radius:14px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:11.5px; font-weight:700; cursor:pointer; }
          .rq-opt.active { background:#22314e; color:#fff; border-color:#22314e; }
          .rq-lines { font-size:12.5px; font-weight:700; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; margin-top:12px; display:flex; flex-direction:column; gap:4px; }
          .rq-verdict { text-align:center; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 12px; margin-top:8px; border:1px solid; }
          .rq-presets { display:flex; gap:6px; justify-content:center; margin-top:12px; flex-wrap:wrap; }
          .rq-preset { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rq-note { text-align:center; font-size:11.5px; color:#64748b; margin-top:6px; min-height:17px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rq-intro">
          QoS는 <b>6개 정책의 묶음</b>입니다. 위에서 정책을 골라 뜻을 보고, 아래에서 발행자·구독자 계약을 직접 맞춰보세요.
        </div>

        <div class="rq-sec">① 정책 도감 — 눌러서 뜻 확인</div>
        <div class="rq-pols">
          ${POLICIES.map(p => `<button class="rq-pol" data-pol="${p.id}">${p.name}<small>${p.kind}</small></button>`).join('')}
        </div>
        <div class="rq-pdetail"><b id="rq-pname"></b><p id="rq-pdesc"></p><div class="demo" id="rq-pdemo"></div></div>

        <div class="ctl"><label>History depth <input id="rq-depth" type="range" min="1" max="15" step="1" value="${this.depth}"><b id="rq-depth-val"></b></label></div>
        <svg class="rq-depth" viewBox="0 0 320 56"><g id="rq-depth-svg"></g></svg>

        <div class="rq-sec">② 계약 게임 — 같은 이름이어도 QoS가 안 맞으면 연결 안 됨</div>
        <div class="rq-side">
          <div class="rq-side-title">발행자 (제공, Offered)</div>
          <div class="rq-opts">
            ${opt('pubRel', 'prel', 'reliable', 'Reliable')}${opt('pubRel', 'prel', 'best_effort', 'BestEffort')}
            ${opt('pubDur', 'pdur', 'volatile', 'Volatile')}${opt('pubDur', 'pdur', 'transient_local', 'TransientLocal')}
          </div>
        </div>
        <div class="rq-side">
          <div class="rq-side-title">구독자 (요구, Requested)</div>
          <div class="rq-opts">
            ${opt('subRel', 'srel', 'reliable', 'Reliable')}${opt('subRel', 'srel', 'best_effort', 'BestEffort')}
            ${opt('subDur', 'sdur', 'volatile', 'Volatile')}${opt('subDur', 'sdur', 'transient_local', 'TransientLocal')}
          </div>
        </div>

        <div class="rq-lines"><span id="rq-pub"></span><span id="rq-sub"></span></div>
        <div class="rq-verdict" id="rq-verdict"></div>

        <div class="rq-presets">
          ${PRESETS.map((p, i) => `<button class="rq-preset" data-idx="${i}">${p.label}</button>`).join('')}
        </div>
        <div class="rq-note" id="rq-note"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
