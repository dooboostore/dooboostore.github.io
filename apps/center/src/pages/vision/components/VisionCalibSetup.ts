import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-calib-setup';

const CORNERS = 54; // 9x6 체커보드 내부 코너
const ZONES = ['좌상', '중상', '우상', '좌중', '중앙', '우중', '좌하', '중하', '우하'];
type ShotType = 'front' | 'tilt' | 'far';
const TYPE_LABEL: Record<ShotType, string> = { front: '정면', tilt: '기울임', far: '원거리' };
const TYPE_ICON: Record<ShotType, string> = { front: '□', tilt: '◇', far: '○' };

const MD = `
## 왜 체커보드를 여러 장 찍는가
- 미지수: **K 4개**(fx, fy, cx, cy) + **왜곡 5개**(k1,k2,p1,p2,k3) + **장마다 포즈 6개**(R,t) → 사진 N장이면 \`9 + 6N\`개. 관측은 장당 코너 54개 × 2 = **108개 구속**/장.
- 산수로는 1장도 구속이 충분해 보이지만, **정면 사진만으로는 보드의 모든 점이 같은 깊이 변화로 움직인 것처럼 보여** f(초점거리)와 Z(거리)가 서로 바꿔치기해도 같은 이미지를 만듭니다(18강 단안 거리 모호성의 친척).
- **보드를 기울이면** 코너마다 카메라까지의 거리가 달라져 원근(사다리꼴 찌그러짐)이 생기고, 이 찌그러짐이 f와 Z를 분리하는 추가 단서가 됩니다.
- **화면 구석까지 찍어야** 가장자리에서 큰 왜곡(k1, k2)이 제대로 추정되고, **가까이/멀리 섞어야** 스케일에 따른 오차를 걸러낼 수 있습니다. 다양한 각도·거리의 **15~25장**이 실무 표준입니다.
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

    private zoneTotal(i: number) { return this.shots.front[i] + this.shots.tilt[i] + this.shots.far[i]; }

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
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.type === this.mode);
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

    @addEventListener('#cs-reset', 'click')
    onReset() {
      (['front', 'tilt', 'far'] as ShotType[]).forEach(t => { this.shots[t] = new Array(9).fill(0); });
      this.refresh();
    }

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
          .cs-why { display:flex; gap:14px; justify-content:center; align-items:flex-end; margin:14px 0; flex-wrap:wrap; }
          .cs-why-panel { text-align:center; }
          .cs-why-label { font-size:11px; font-weight:700; color:#475569; margin-top:6px; max-width:140px; }
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

        <div class="cs-why">
          <div class="cs-why-panel">
            <svg width="100" height="80" viewBox="0 0 100 80"><rect x="25" y="15" width="50" height="50" fill="none" stroke="#ef4444" stroke-width="2.5"/></svg>
            <div class="cs-why-label">정면: 모든 코너가 같은 깊이처럼 보여 f·Z가 서로 바꿔치기돼도 같은 사각형</div>
          </div>
          <div class="cs-why-panel">
            <svg width="100" height="80" viewBox="0 0 100 80"><polygon points="20,20 80,12 85,65 15,70" fill="none" stroke="#16a34a" stroke-width="2.5"/></svg>
            <div class="cs-why-label">기울임: 코너마다 깊이가 달라 사다리꼴로 찌그러짐 → f와 Z를 분리할 단서</div>
          </div>
        </div>

        <div class="math-desc">아래 구역 그리드에 촬영 유형을 선택한 뒤 클릭해서 쌓아보세요(구역당 최대 5장)</div>

        <div class="cs-mode-row">
          ${(['front', 'tilt', 'far'] as ShotType[]).map(t => `<button class="cs-mode-btn" data-type="${t}">${TYPE_ICON[t]} ${TYPE_LABEL[t]}</button>`).join('')}
        </div>

        <div class="cs-grid">
          ${ZONES.map((z, i) => `<button class="cs-zone" data-idx="${i}">${z}<br>0장</button>`).join('')}
        </div>
        <div class="cs-hint">구역 클릭 = 선택한 유형의 촬영 1장 추가</div>
        <button class="cs-reset-btn" id="cs-reset">초기화</button>

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
