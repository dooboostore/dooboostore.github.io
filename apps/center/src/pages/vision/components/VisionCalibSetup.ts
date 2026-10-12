import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-calib-setup';

const CORNERS = 54; // 9x6 체커보드 내부 코너
const ZONES = ['좌상', '중상', '우상', '좌중', '중앙', '우중', '좌하', '중하', '우하'];
type ShotType = 'front' | 'tilt' | 'far';
const TYPE_LABEL: Record<ShotType, string> = { front: '정면', tilt: '기울임', far: '원거리' };
const TYPE_ICON: Record<ShotType, string> = { front: '□', tilt: '◇', far: '○' };

// f·Z 바꿔치기 데모용 (보드 반폭 1m 정사각, 화면 중앙 배치)
const DEMO_CX = 160;
const DEMO_CY = 75;
const DEMO_F1 = 300;
const DEMO_Z1 = 5;

const MD = `
## 왜 체커보드를 여러 장 찍는가
- 미지수: **K 4개**(fx, fy, cx, cy) + **왜곡 5개**(k1,k2,p1,p2,k3) + **장마다 포즈 6개**(R,t) → 사진 N장이면 \`9 + 6N\`개. 관측은 장당 코너 54개 × 2 = **108개 구속**/장.
- 산수로는 1장도 구속이 충분해 보이지만, **정면 사진만으로는 보드의 모든 점이 같은 깊이 변화로 움직인 것처럼 보여** f(초점거리)와 Z(거리)가 서로 바꿔치기해도 같은 이미지를 만듭니다(18강 단안 거리 모호성의 친척).
- **보드를 기울이면** 코너마다 카메라까지의 거리가 달라져 원근(사다리꼴 찌그러짐)이 생기고, 이 찌그러짐이 f와 Z를 분리하는 추가 단서가 됩니다.
- **화면 구석까지 찍어야** 가장자리에서 큰 왜곡(k1, k2)이 제대로 추정되고, **가까이/멀리 섞어야** 스케일에 따른 오차를 걸러낼 수 있습니다. 다양한 각도·거리의 **15~25장**이 실무 표준입니다.
- 보드는 **평평한 판에 단단히 부착**해야 합니다 — 들뜨면 코너의 3D 좌표가 더 이상 "Z=0 평면"이 아니게 되어 치수 자체가 무너집니다. 한 칸의 실제 크기(SQ)도 자로 정확히 재야 합니다 — **인쇄 배율 오차로 SQ를 잘못 재면, 이후 구하는 모든 거리·포즈가 같은 비율로 통째로 틀어집니다**(계산은 멀쩡한데 숫자만 틀리는 가장 흔한 실수).
- 여기서 채운 촬영 구성은 다음 탭들의 입력이 됩니다: 장수·분산이 부족하면 [[vision-calib-rms]]의 RMS가 나빠지고, 기울임이 부족하면 [[vision-calib-sanity]]의 FOV 교차검증이 어긋나며, 결국 [[vision-calib-pnp-upgrade]]에서 거리 오차로 그 대가를 치릅니다.
- 현실에서는 **새 웹캠을 살 때, 혹은 로봇 팔에 카메라를 새로 장착할 때마다** 이 과정을 반복해야 합니다 — 렌즈를 조금이라도 다시 조립하거나 초점을 바꾸면 K와 왜곡 계수가 달라지기 때문입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionCalibSetup extends w.HTMLElement {
    private mode: ShotType = 'front';
    private shots: Record<ShotType, number[]> = {
      front: new Array(9).fill(0),
      tilt: new Array(9).fill(0),
      far: new Array(9).fill(0),
    };
    // 바꿔치기 데모 상태 — 초기값이 바로 "정면 트릭" (f×2, Z×2 → 같은 영상)
    private f2 = 600;
    private z2 = 10;
    private tilt2 = 0;

    private zoneTotal(i: number) { return this.shots.front[i] + this.shots.tilt[i] + this.shots.far[i]; }

    /** 보드 꼭대기 4모서리 투영 (tilt=수직축 회전 deg) */
    private projQuad(f: number, Z: number, tiltDeg: number): [number, number][] {
      const t = (tiltDeg * Math.PI) / 180;
      const cos = Math.cos(t), sin = Math.sin(t);
      return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([bx, by]) => {
        const lat = bx * cos;
        const dep = Z + bx * sin;
        return [DEMO_CX + (f * lat) / dep, DEMO_CY + (f * by) / dep];
      });
    }

    private refresh() {
      const totals = { front: 0, tilt: 0, far: 0 };
      let N = 0;
      for (let i = 0; i < 9; i++) {
        (['front', 'tilt', 'far'] as ShotType[]).forEach(t => { totals[t] += this.shots[t][i]; });
        N += this.zoneTotal(i);
      }
      const unknowns = 9 + 6 * N;
      const observations = CORNERS * 2 * N;

      this.shadowRoot?.querySelectorAll('.cs-mode-btn').forEach(el => {
        const t = (el as HTMLElement).dataset.type as ShotType;
        (el as HTMLElement).classList.toggle('active', t === this.mode);
        (el as HTMLElement).textContent = `${TYPE_ICON[t]} ${TYPE_LABEL[t]} (${totals[t]})`;
      });

      this.shadowRoot?.querySelectorAll('.cs-zone').forEach((el, i) => {
        const btn = el as HTMLElement;
        const total = this.zoneTotal(i);
        const breakdown = (['front', 'tilt', 'far'] as ShotType[])
          .filter(t => this.shots[t][i] > 0)
          .map(t => `${TYPE_ICON[t]}${this.shots[t][i]}`).join(' ');
        btn.innerHTML = `${ZONES[i]}<br>${total === 0 ? '0장' : breakdown}`;
        btn.style.background = total === 0 ? '#f1f5f9' : `rgba(3,105,161,${Math.min(0.15 + total * 0.12, 0.9)})`;
        btn.style.color = total >= 4 ? '#fff' : '#334155';
      });

      const q = (sel: string) => this.shadowRoot?.querySelector(sel) as HTMLElement;
      const setText = (sel: string, text: string) => { const el = q(sel); if (el) el.textContent = text; };
      setText('#cs-n', String(N));
      setText('#cs-unknowns', `9 + 6×${N} = ${unknowns}`);
      setText('#cs-obs', `108 × ${N} = ${observations}`);

      const cornerZones = [0, 2, 6, 8];
      const cornersCovered = cornerZones.every(i => this.zoneTotal(i) > 0);
      const checks = [
        { label: `충분한 장수(≥15)`, ok: N >= 15, detail: `현재 ${N}장` },
        { label: '네 모서리 구역 커버', ok: cornersCovered, detail: cornersCovered ? '충족' : '비어있는 모서리 있음' },
        { label: '기울인 샷(◇) ≥ 3', ok: totals.tilt >= 3, detail: `현재 ${totals.tilt}장` },
        { label: '원거리 샷(○) ≥ 2', ok: totals.far >= 2, detail: `현재 ${totals.far}장` },
      ];
      const listEl = q('#cs-checklist');
      if (listEl) {
        listEl.innerHTML = checks.map(c =>
          `<div class="cs-row ${c.ok ? 'ok' : 'bad'}"><span>${c.ok ? '✅' : '❌'} ${c.label}</span><span class="cs-detail">${c.detail}</span></div>`
        ).join('');
      }
      const allOk = checks.every(c => c.ok);
      const verdict = q('#cs-verdict');
      if (verdict) {
        verdict.textContent = allOk
          ? '✅ 장수·모서리·기울임·거리 다양성 모두 확보 — 안정적인 캘리브레이션이 기대됩니다.'
          : '⚠ 아직 조건 미충족 — 체크리스트의 빨간 항목을 채워보세요.';
        verdict.style.background = allOk ? '#dcfce7' : '#fee2e2';
        verdict.style.color = allOk ? '#166534' : '#991b1b';
        verdict.style.borderColor = allOk ? '#bbf7d0' : '#fecaca';
      }

      // ---- 바꿔치기 데모: 빨강=고정(정면 f=300/Z=5), 파랑=조절 ----
      const fixed = this.projQuad(DEMO_F1, DEMO_Z1, 0);
      const vari = this.projQuad(this.f2, this.z2, this.tilt2);
      const setPts = (sel: string, pts: [number, number][]) => {
        this.shadowRoot?.querySelector(sel)?.setAttribute('points', pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
      };
      setPts('#cs-fixed', fixed);
      setPts('#cs-var', vari);
      const diff = fixed.reduce((s, p, i) => s + Math.hypot(p[0] - vari[i][0], p[1] - vari[i][1]), 0) / 4;
      setText('#cs-f2-val', String(this.f2));
      setText('#cs-z2-val', `${this.z2.toFixed(1)}m`);
      setText('#cs-tilt2-val', `${this.tilt2}°`);
      const amb = q('#cs-amb');
      if (amb) {
        const same = diff < 0.5;
        amb.textContent = same
          ? `영상 차이 ${diff.toFixed(2)}px — 같은 사진! f와 Z를 구분할 수 없습니다.`
          : `영상 차이 ${diff.toFixed(1)}px — 다른 사진! 이 차이가 f·Z를 분리하는 단서입니다.`;
        amb.style.background = same ? '#fee2e2' : '#dcfce7';
        amb.style.color = same ? '#991b1b' : '#166534';
        amb.style.borderColor = same ? '#fecaca' : '#bbf7d0';
      }
    }

    private syncDemoSliders() {
      const set = (sel: string, v: number) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLInputElement;
        if (el) el.value = String(v);
      };
      set('#cs-f2', this.f2);
      set('#cs-z2', this.z2);
      set('#cs-tilt2', this.tilt2);
    }

    @addEventListener('.cs-mode-btn', 'click', { delegate: true })
    onModeClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('.cs-mode-btn') as HTMLElement;
      if (!btn) return;
      this.mode = btn.dataset.type as ShotType;
      this.refresh();
    }

    @addEventListener('.cs-zone', 'click', { delegate: true })
    onZoneClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('.cs-zone') as HTMLElement;
      if (!btn) return;
      const i = Number(btn.dataset.idx);
      if (this.zoneTotal(i) >= 5) return; // 구역당 최대 5장
      this.shots[this.mode][i]++;
      this.refresh();
    }

    @addEventListener('.cs-zone', 'contextmenu', { delegate: true })
    onZoneRightClick(e: Event) {
      e.preventDefault();
      const btn = (e.target as HTMLElement).closest('.cs-zone') as HTMLElement;
      if (!btn) return;
      const i = Number(btn.dataset.idx);
      if (this.shots[this.mode][i] > 0) this.shots[this.mode][i]--;
      else {
        const t = (['front', 'tilt', 'far'] as ShotType[]).find(t => this.shots[t][i] > 0);
        if (t) this.shots[t][i]--;
      }
      this.refresh();
    }

    @addEventListener('#cs-reset', 'click')
    onReset() {
      (['front', 'tilt', 'far'] as ShotType[]).forEach(t => { this.shots[t] = new Array(9).fill(0); });
      this.refresh();
    }

    @addEventListener('#cs-bad', 'click')
    onBadExample() {
      this.shots.front = [3, 2, 2, 2, 3, 2, 2, 2, 2];
      this.shots.tilt = new Array(9).fill(0);
      this.shots.far = new Array(9).fill(0);
      this.refresh();
    }

    @addEventListener('#cs-good', 'click')
    onGoodExample() {
      this.shots.front = [1, 1, 1, 1, 2, 1, 1, 1, 1];
      this.shots.tilt = [1, 0, 1, 1, 0, 1, 1, 0, 1];
      this.shots.far = [0, 1, 0, 1, 0, 1, 0, 1, 0];
      this.refresh();
    }

    @addEventListener('#cs-preset-trick', 'click')
    onPresetTrick() {
      this.f2 = 600; this.z2 = 10; this.tilt2 = 0;
      this.syncDemoSliders();
      this.refresh();
    }

    @addEventListener('#cs-preset-tilt', 'click')
    onPresetTilt() {
      this.tilt2 = 30;
      this.syncDemoSliders();
      this.refresh();
    }

    @addEventListener('#cs-f2', 'input')
    onF2(e: Event) { this.f2 = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#cs-z2', 'input')
    onZ2(e: Event) { this.z2 = Number((e.target as HTMLInputElement).value) || 1; this.refresh(); }
    @addEventListener('#cs-tilt2', 'input')
    onTilt2(e: Event) { this.tilt2 = Number((e.target as HTMLInputElement).value); this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .cs-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .cs-intro b { color:#0369a1; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:55px; text-align:right; color:#1e293b; }
          .cs-demo-svg { display:block; width:100%; max-width:340px; margin:10px auto 4px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .cs-demo-btns { display:flex; gap:6px; justify-content:center; margin:8px 0 4px; flex-wrap:wrap; }
          .cs-demo-btn { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#0369a1; font-size:12px; font-weight:700; cursor:pointer; }
          .cs-demo-btn:hover { border-color:#0369a1; }
          .cs-amb { text-align:center; font-size:12.5px; font-weight:700; border-radius:8px; padding:10px 12px; margin-top:10px; border:1px solid; }
          .cs-legend { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:12px; color:#475569; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; margin-top:8px; }
          .cs-legend span { display:inline-flex; align-items:center; gap:6px; }
          .swatch-line { width:18px; height:0; display:inline-block; flex-shrink:0; }
          .cs-mode-row { display:flex; gap:6px; justify-content:center; margin-top:10px; }
          .cs-mode-btn { padding:6px 14px; border-radius:16px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:700; cursor:pointer; }
          .cs-mode-btn:hover { border-color:#94a3b8; }
          .cs-mode-btn.active { background:linear-gradient(135deg,#0369a1,#7dd3fc); color:#fff; border-color:transparent; }
          .cs-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; max-width:300px; margin:14px auto 6px; }
          .cs-zone { aspect-ratio:1.2; border:1.5px solid #cbd5e1; border-radius:8px; cursor:pointer; font-size:10.5px; font-weight:700; display:flex; align-items:center; justify-content:center; text-align:center; transition:background .15s; line-height:1.5; }
          .cs-zone:hover { border-color:#0369a1; }
          .cs-hint { text-align:center; font-size:11px; color:#94a3b8; }
          .cs-reset-btn { display:block; margin:6px auto 0; padding:4px 12px; border-radius:14px; border:1.5px solid #e2e8f0; background:#fff; color:#64748b; font-size:11px; cursor:pointer; }
          .cs-reset-btn:hover { border-color:#ef4444; color:#ef4444; }
          .cs-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:14px; font-size:12px; }
          .cs-stat { background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 10px; }
          .cs-stat b { display:block; color:#0369a1; font-size:11px; margin-bottom:2px; }
          .cs-checklist { margin-top:12px; display:flex; flex-direction:column; gap:4px; }
          .cs-row { display:flex; justify-content:space-between; font-size:12px; padding:5px 10px; border-radius:6px; background:#f8fafc; }
          .cs-row.bad { background:#fef2f2; }
          .cs-detail { color:#94a3b8; }
          .cs-verdict { text-align:center; font-size:12.5px; font-weight:700; border-radius:8px; padding:10px 12px; margin-top:12px; border:1px solid; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="cs-intro">
          체커보드를 찍을 때마다 그 장의 <b>포즈(R,t)</b>는 새로 생기는 미지수지만, <b>K와 왜곡 계수는 모든 장이 공유</b>합니다. 사진이 1장이어도 구속 수식은 충분해 보이지만, <b>정면 사진만 많으면 f와 Z가 서로 구분되지 않습니다</b> — 아래에서 왜 그런지 먼저 보고, 9구역에 원하는 유형(정면/기울임/원거리)의 촬영을 배치해보세요.
        </div>

        <div class="cs-demo-btns">
          <button class="cs-demo-btn" id="cs-preset-trick">① 정면 트릭 (f×2, Z×2)</button>
          <button class="cs-demo-btn" id="cs-preset-tilt">② 기울임 30° 추가</button>
        </div>
        <div class="math-desc">빨강=고정(정면, f=300, Z=5m). 파랑을 조작해보세요. 정면에서는 f·Z 트릭으로 빨강과 완전히 겹쳐집니다. 기울임을 주면 같은 트릭이 통하지 않습니다.</div>

        <svg class="cs-demo-svg" viewBox="0 0 320 150">
          <polygon id="cs-var" points="" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2"/>
          <polygon id="cs-fixed" points="" fill="none" stroke="#ef4444" stroke-width="2.5"/>
        </svg>

        <div class="ctl"><label>f' (파랑 초점) <input id="cs-f2" type="range" min="100" max="600" step="10" value="${this.f2}"><b id="cs-f2-val">${this.f2}</b></label></div>
        <div class="ctl"><label>Z' (파랑 거리) <input id="cs-z2" type="range" min="2" max="10" step="0.5" value="${this.z2}"><b id="cs-z2-val">${this.z2.toFixed(1)}m</b></label></div>
        <div class="ctl"><label>기울임 (파랑) <input id="cs-tilt2" type="range" min="0" max="45" step="5" value="${this.tilt2}"><b id="cs-tilt2-val">${this.tilt2}°</b></label></div>
        <div class="cs-amb" id="cs-amb"></div>
        <div class="cs-legend">
          <span><i class="swatch-line" style="border-top:3px solid #ef4444"></i>고정 (정면 f=300, Z=5)</span>
          <span><i class="swatch-line" style="border-top:3px solid #3b82f6"></i>조절 중</span>
        </div>

        <div class="math-desc" style="margin-top:16px">아래 구역 그리드에 촬영 유형을 선택한 뒤 클릭해서 쌓아보세요(구역당 최대 5장, 우클릭=1장 취소)</div>

        <div class="cs-mode-row">
          ${(['front', 'tilt', 'far'] as ShotType[]).map(t => `<button class="cs-mode-btn" data-type="${t}">${TYPE_ICON[t]} ${TYPE_LABEL[t]}</button>`).join('')}
        </div>

        <div class="cs-grid">
          ${ZONES.map((z, i) => `<button class="cs-zone" data-idx="${i}">${z}<br>0장</button>`).join('')}
        </div>
        <div class="cs-hint">구역 클릭 = 선택한 유형의 촬영 1장 추가 · 우클릭 = 1장 취소</div>
        <div class="cs-demo-btns">
          <button class="cs-demo-btn" id="cs-bad">나쁜 예: 정면만 20장</button>
          <button class="cs-demo-btn" id="cs-good">모범 답안 채우기</button>
          <button class="cs-reset-btn" id="cs-reset" style="margin:0">초기화</button>
        </div>

        <div class="cs-stats">
          <div class="cs-stat"><b>총 사진 수 N</b><span id="cs-n">0</span></div>
          <div class="cs-stat"><b>구속(관측)</b><span id="cs-obs">0</span></div>
          <div class="cs-stat"><b>미지수</b><span id="cs-unknowns">9</span></div>
        </div>

        <div class="cs-checklist" id="cs-checklist"></div>
        <div class="cs-verdict" id="cs-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
