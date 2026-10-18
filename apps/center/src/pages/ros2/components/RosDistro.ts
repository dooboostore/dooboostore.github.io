import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-distro';

type Distro = {
  id: string; name: string; year: number; eol: number; lts: boolean;
  ubuntu: string; win: string; rmw: string; status: 'ok' | 'warn' | 'new'; note: string;
};

// 기준일 2026-10, 출처: ros.org/blog/getting-started, docs.ros.org Releases, endoflife.date
const DISTROS: Distro[] = [
  { id: 'humble', name: 'Humble Hawksbill', year: 2022.4, eol: 2027.4, lts: true, ubuntu: '22.04 Jammy', win: 'Win 10', rmw: 'Fast DDS', status: 'warn', note: 'ROS 1 이주 경로로 권장됐던 LTS. 2027-05 종료 — 신규는 Jazzy/Lyrical로, 기존 함대는 이주 계획 필요.' },
  { id: 'jazzy', name: 'Jazzy Jalisco', year: 2024.4, eol: 2029.4, lts: true, ubuntu: '24.04 Noble', win: 'Win 10', rmw: 'Fast DDS', status: 'ok', note: '현역 LTS. 생태계(Nav2·MoveIt) 지원이 가장 두터움 — 제품·장기 프로젝트 정석.' },
  { id: 'kilted', name: 'Kilted Kaiju', year: 2025.4, eol: 2026.12, lts: false, ubuntu: '24.04 Noble', win: '-', rmw: 'Fast DDS', status: 'warn', note: '비-LTS 실험판. 2026-12 종료 임박 — 프로토타입·연구용, 제품 금지.' },
  { id: 'lyrical', name: 'Lyrical Luth', year: 2026.4, eol: 2031.4, lts: true, ubuntu: '26.04 Resolute', win: 'Win 11', rmw: 'Fast DDS', status: 'new', note: '최신 LTS(2026-05). Ubuntu 26.04 + Win 11, 2031까지 지원 — 신규 프로젝트 권장.' },
];

const SVG_W = 620, SVG_H = 250;
const X0 = 50, YEAR_PX = 52; // 2022 → x=50
const ROXH = 26;
const xx = (y: number) => X0 + (y - 2022) * YEAR_PX;
const TODAY = 2026.78;

const MD = `
## 배포판 고르는 법 — ros.org 공식 권장 그대로
- ROS는 **배포판(distribution)** 단위로 나옵니다. 매년 5월 23일(World Turtle Day) 릴리스, **짝수 해는 5년 LTS**입니다.
- 처음이면 **Tier 1 OS**(REP-2000: 배포판별 지정 Ubuntu/Windows)에 설치하세요. 짝이 안 맞으면 설치부터 막힙니다.
- 제품·장기 운용 → LTS(Jazzy/Lyrical). 최신 기능 실험 → 비-LTS(Kilted). ROS 1 이주 → Humble 경유 후 Jazzy 이상.
- Gazebo를 같이 쓰면 ROS-Gazebo 권장 조합을 확인하세요(버전 짝이 맞아야 브리지 없이 편함).
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosDistro extends w.HTMLElement {
    private selected = 'lyrical';

    private refresh() {
      const d = DISTROS.find(v => v.id === this.selected)!;
      this.shadowRoot?.querySelectorAll('.rd-bar').forEach(el => {
        const on = (el as SVGElement).getAttribute('data-id') === this.selected;
        (el as SVGElement).setAttribute('stroke', on ? '#0f172a' : 'none');
        (el as SVGElement).setAttribute('stroke-width', on ? '2.5' : '0');
      });
      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#rd-name', `${d.name}${d.lts ? ' (LTS)' : ''}`);
      setText('#rd-period', `${d.year.toFixed(1).replace('.4', '-05')} 출시 → ${String(d.eol).replace('.4', '-05').replace('.12', '-12')} 지원 종료`);
      setText('#rd-os', `Tier 1: Ubuntu ${d.ubuntu} · ${d.win}`);
      setText('#rd-note', d.note);
    }

    @addEventListener('.rd-bar', 'click', { delegate: true })
    onBar(e: Event) {
      const g = (e.target as HTMLElement).closest('.rd-bar') as HTMLElement;
      if (!g) return;
      this.selected = g.dataset.id!;
      this.refresh();
    }

    @addEventListener('.rd-rec', 'click', { delegate: true })
    onRec(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rd-rec') as HTMLElement;
      if (!btn) return;
      this.selected = btn.dataset.id!;
      this.refresh();
      const v = this.shadowRoot?.querySelector('#rd-verdict') as HTMLElement;
      if (v) v.textContent = btn.dataset.why ?? '';
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const rows = DISTROS.map((d, i) => {
        const y = 34 + i * 40;
        const color = d.status === 'new' ? '#16a34a' : d.status === 'warn' ? '#f59e0b' : '#3b82c4';
        return `<text x="4" y="${y + 17}" font-size="10" font-weight="700" fill="#334155">${d.name.split(' ')[0]}</text>` +
          `<rect class="rd-bar" data-id="${d.id}" x="${xx(d.year).toFixed(0)}" y="${y}" width="${(xx(d.eol) - xx(d.year)).toFixed(0)}" height="${ROXH}" rx="6" fill="${color}" style="cursor:pointer"/>` +
          `<text x="${(xx(d.year) + 6).toFixed(0)}" y="${y + 17}" font-size="9" font-weight="700" fill="#fff" style="pointer-events:none">${d.lts ? 'LTS · ' : ''}~${String(d.eol).replace('.4', '.05')}</text>`;
      }).join('');
      const years = [2022, 2024, 2026, 2028, 2030].map(y =>
        `<text x="${xx(y)}" y="${SVG_H - 8}" font-size="9" fill="#94a3b8" text-anchor="middle">${y}</text>`).join('');
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .rd-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rd-intro b { color:#22314e; }
          svg { display:block; width:100%; max-width:${SVG_W}px; margin:12px auto; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; }
          .rd-detail { font-size:13px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:10px 14px; margin-top:8px; line-height:1.8; }
          .rd-detail b { color:#22314e; font-size:14px; }
          .rd-recs { display:flex; gap:6px; justify-content:center; margin-top:12px; flex-wrap:wrap; }
          .rd-rec { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rd-rec:hover { border-color:#22314e; }
          .rd-verdict { text-align:center; font-size:12px; font-weight:700; color:#166534; margin-top:8px; min-height:18px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rd-intro">
          ROS는 <b>배포판</b> 단위로 나옵니다. 막대를 눌러 지원 기간·Tier 1 OS를 확인하고, 아래 목적 버튼으로 추천을 받아보세요. (기준 2026-10, 출처: ros.org getting-started · docs.ros.org Releases)
        </div>

        <svg viewBox="0 0 ${SVG_W} ${SVG_H}">
          ${[2022, 2024, 2026, 2028, 2030].map(y => `<line x1="${xx(y)}" y1="20" x2="${xx(y)}" y2="${SVG_H - 22}" stroke="#e2e8f0" stroke-width="1"/>`).join('')}
          ${rows}
          <line x1="${xx(TODAY)}" y1="16" x2="${xx(TODAY)}" y2="${SVG_H - 22}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,3"/>
          <text x="${xx(TODAY) + 4}" y="28" font-size="9" font-weight="700" fill="#ef4444">오늘</text>
          ${years}
        </svg>

        <div class="rd-detail">
          <b id="rd-name"></b><br>
          <span id="rd-period"></span><br>
          <span id="rd-os"></span><br>
          <span id="rd-note"></span>
        </div>

        <div class="rd-recs">
          <button class="rd-rec" data-id="jazzy" data-why="→ Jazzy: 생태계 지원이 가장 두터운 현역 LTS">제품·장기 운용이에요</button>
          <button class="rd-rec" data-id="lyrical" data-why="→ Lyrical: 최신 LTS, 2031까지 지원">새로 시작해요</button>
          <button class="rd-rec" data-id="kilted" data-why="→ Kilted: 2026-12 종료. 실험 후 Lyrical로 이주 전제">최신 기능 실험이요</button>
          <button class="rd-rec" data-id="humble" data-why="→ Humble 경유 후 Jazzy 이상으로 이주 계획">ROS 1에서 옮겨와요</button>
        </div>
        <div class="rd-verdict" id="rd-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
