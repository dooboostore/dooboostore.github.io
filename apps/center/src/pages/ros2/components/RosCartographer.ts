import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-cartographer';

const MD = `
## Cartographer — SLAM 역사책
- Google의 실시간 2D·3D SLAM입니다. 서브맵+루프 클로저 방식의 교과서라 지금도 논문·강의에 인용됩니다.
- 다만 upstream이 사실상 **유지보수 중단**입니다 (공식 README 명시). ROS 포크도 제한 유지라 신규 프로젝트 출발점으로는 부적합합니다.
- 신규는 **slam_toolbox**로 가세요. 이 페이지 slam 탭이 그 방식입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosCartographer extends w.HTMLElement {
    @addEventListener('.rt-copy', 'click', { delegate: true })
    async onCopy(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rt-copy') as HTMLElement;
      if (!btn) return;
      try {
        await navigator.clipboard?.writeText(btn.dataset.copy ?? '');
        const old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch {}
    }

    @onConnectedAfter
    onReady() {}

    @onConnectedBodyShadow
    render() {
      const copyBtn = (cmd: string) => `<button class="rt-copy" data-copy="${cmd.replace(/"/g, '&quot;')}">복사</button>`;
      return `
        <style>
          :host { display:block; }
          .rt-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rt-intro b { color:#22314e; }
          .rt-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:10px 14px; margin-top:10px; }
          .rt-def b { color:#0c4a6e; display:inline-block; min-width:36px; }
          .rt-cmd { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:6px; }
          .rt-cmd code { flex:1; color:#7dd3fc; font-size:11.5px; font-family:monospace; overflow-x:auto; white-space:nowrap; }
          .rt-copy { flex-shrink:0; background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:5px; font-size:10.5px; padding:3px 8px; cursor:pointer; }
          .rt-link { font-size:11.5px; margin-top:6px; }
          .rt-link a { color:#0369a1; }
          .rt-set { margin-top:10px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
          .rt-set-title { font-size:12px; font-weight:800; color:#0c4a6e; background:#f0f9ff; padding:7px 12px; }
          .rt-row { display:flex; gap:8px; padding:7px 12px; border-top:1px solid #eef2f7; font-size:11.5px; line-height:1.6; }
          .rt-row code { flex-shrink:0; min-width:170px; color:#0c4a6e; font-family:monospace; font-weight:700; }
          .rt-row span { color:#475569; }
          .rt-warn { font-size:12px; color:#991b1b; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px; margin-top:8px; line-height:1.7; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rt-intro">
          Google의 실시간 2D·3D SLAM. ★8k의 유명인사지만 <b>신규 출발점으로는 부적합</b>합니다. 왜인지 아래에 있습니다.
        </div>

        <div class="rt-def">
          <div><b>정의</b> Google의 실시간 2D·3D SLAM (서브맵+루프 클로저). ★8k의 유명인사.</div>
          <div><b>언제</b> …신규는 안 씀. 아래 경고 참조.</div>
          <div><b>예시</b> 기존 레거시 로봇 유지보수할 때만.</div>
        </div>
        <div class="rt-warn">⚠ upstream 사실상 <b>유지보수 중단</b> (공식 README 명시, 신규 개발 없음). ROS 포크도 제한 유지. 신규 프로젝트는 <b>slam_toolbox</b>를 쓰세요 — 이 페이지 slam 탭이 그 방식입니다.</div>
        <div class="rt-cmd"><code>sudo apt install ros-jazzy-slam-toolbox</code>${copyBtn('sudo apt install ros-jazzy-slam-toolbox')}</div>
        <div class="rt-set"><div class="rt-set-title">⚙️ lua 설정 맛보기 (신규 비권장 — 유지보수용)</div><div class="rt-row"><code>submaps.num_range_data</code><span>서브맵 하나에 쌓는 스캔 수 (예: 35). 크면 안정, 무거움</span></div><div class="rt-row"><code>ceres_scan_matcher</code><span>스캔 정합 가중치 묶음. 어긋나면 translation_weight부터 의심</span></div><div class="rt-row"><code>motion_filter</code><span>이만큼 못 움직이면 스캔 버림 (max_distance_meters 등)</span></div><div class="rt-row"><code>use_trajectory_builder_2d</code><span>2D/3D 선택. 실내 바퀴로봇은 2D로 시작</span></div></div>
        <div class="rt-link">공식: <a href="https://github.com/cartographer-project/cartographer" target="_blank" rel="noopener">cartographer-project (GitHub)</a></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
