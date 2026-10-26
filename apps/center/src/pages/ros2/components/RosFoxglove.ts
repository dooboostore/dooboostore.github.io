import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-foxglove';

const MD = `
## Foxglove — 원격 데이터 감시
- 로봇 데이터 플랫폼입니다. 수집·조회·디버그를 웹에서 하고, NVIDIA·Wayve·ANYbotics 같은 회사도 씁니다.
- 로그 포맷은 개방형 **MCAP**(.mcap). bag 대신 MCAP으로 녹화하면 Studio에서 바로 엽니다.
- Studio 레이아웃은 JSON으로 저장해 팀 공유·재현에 씁니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosFoxglove extends w.HTMLElement {
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
          .rt-note { font-size:11.5px; color:#64748b; text-align:center; margin-top:4px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rt-intro">
          로봇 데이터 플랫폼입니다. <b>원격 모니터링·bag 다시 보기·플릿 데이터 검색</b>에 씁니다.
        </div>

        <div class="rt-def">
          <div><b>정의</b> 로봇 데이터 플랫폼 (수집·조회·디버그). RViz의 웹·원격 상위호환 느낌.</div>
          <div><b>언제</b> 원격 모니터링, bag 다시 보기, 플릿 데이터 검색할 때.</div>
          <div><b>예시</b> 주행 로그 3D 재생, 토픽별 차트, NVIDIA·Wayve·ANYbotics도 사용.</div>
        </div>
        <div class="rt-cmd"><code>sudo apt install ros-jazzy-foxglove-bridge</code>${copyBtn('sudo apt install ros-jazzy-foxglove-bridge')}</div>
        <div class="rt-note">로그 포맷은 개방형 <b>MCAP</b> (.mcap) — bag 대용으로 씀. Studio는 foxglove.dev에서 다운로드.</div>
        <div class="rt-set"><div class="rt-set-title">⚙️ 자주 쓰는 설정값 (bridge · MCAP)</div><div class="rt-row"><code>port := 8765</code><span>Studio가 붙는 웹소켓 포트. 방화벽 확인</span></div><div class="rt-row"><code>send_buffer_limit</code><span>전송 버퍼 상한. 이미지 토픽 많으면 키움</span></div><div class="rt-row"><code>ros2 bag record --storage mcap</code><span>bag 대신 MCAP으로 녹화 (Foxglove 바로 열기)</span></div><div class="rt-row"><code>Studio 레이아웃 JSON</code><span>패널 배치를 파일로 저장 → 팀 공유·재현</span></div></div>
        <div class="rt-link">공식: <a href="https://foxglove.dev/" target="_blank" rel="noopener">foxglove.dev</a> · 문서 <a href="https://docs.foxglove.dev/docs" target="_blank" rel="noopener">docs</a></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
