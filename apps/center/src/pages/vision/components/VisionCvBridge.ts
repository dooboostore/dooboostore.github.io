import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-cv-bridge';

const MD = `
## cv_bridge — 번역기 한 줄
- 새 개념은 사실 \`cv_bridge\` 하나뿐입니다: **Image 메시지 ↔ NumPy 배열**을 오가는 번역기(\`imgmsg_to_cv2\` / \`cv2_to_imgmsg\`).
- 설계 포인트: **19강 모듈을 수정 없이 import**(비전 로직 ↔ ROS 배관 분리), **header 계승**("지금"이 아니라 "그 프레임이 찍힌 순간"), **센서용 QoS**(best-effort).
- 순수 비전부(ColorDetector)는 ROS 없는 노트북에서도 \`pytest\`로 검증 가능합니다 — ROS 의존부(노드)와 분리되어 있기 때문입니다.
- 택배 송장에 찍힌 **발송일자**(촬영 시각)와 내가 **택배를 받은 시각**(발행 시각)이 다른 것과 같습니다 — header.stamp는 항상 "발송일자"를 들고 가야, 받는 쪽이 "얼마나 걸렸는지"를 알 수 있습니다.
- 22강의 **품질 게이트**(재투영 오차가 크면 발행하지 않는 로직)는 바로 이 header의 타임스탬프가 올바르게 계승된 위에서 동작합니다 — 시각이 틀어지면 게이트의 지연 판단도 같이 틀어집니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionCvBridge extends w.HTMLElement {
    private delay = 80; // 처리 지연 [ms]
    private naive = false; // false=header 계승(올바름), true=현재시각 사용(틀림)

    private refresh() {
      const captureT = 1000; // 프레임이 찍힌 시각 [ms], 기준점
      const publishT = captureT + this.delay; // 처리가 끝나 실제로 발행되는 시각
      const headerStamp = this.naive ? publishT : captureT; // naive면 "지금"을 찍어버림
      const perceivedLag = publishT - headerStamp; // 소비자가 header로 계산하는 지연

      const setText = (sel: string, text: string) => {
        const el = this.shadowRoot?.querySelector(sel) as HTMLElement;
        if (el) el.textContent = text;
      };
      setText('#cb-delay-val', `${this.delay}ms`);
      setText('#cb-capture', `촬영 시각(T0) = ${captureT}ms`);
      setText('#cb-publish', `실제 발행 시각 = ${publishT}ms (처리에 ${this.delay}ms 걸림)`);
      setText('#cb-header', `header.stamp = ${headerStamp}ms`);
      setText('#cb-lag', `소비자가 계산한 지연 = 발행시각 − header.stamp = ${perceivedLag}ms`);

      const verdict = this.shadowRoot?.querySelector('#cb-verdict') as HTMLElement;
      if (verdict) {
        if (!this.naive) {
          verdict.textContent = `✅ header 계승 — 실제 처리 지연(${this.delay}ms)이 그대로 드러남`;
          verdict.style.background = '#dcfce7'; verdict.style.color = '#166534'; verdict.style.borderColor = '#bbf7d0';
        } else {
          verdict.textContent = `❌ "지금" 사용 — 지연이 ${perceivedLag}ms로 숨겨짐(제어기가 지연을 모른 채 반응)`;
          verdict.style.background = '#fee2e2'; verdict.style.color = '#991b1b'; verdict.style.borderColor = '#fecaca';
        }
      }
    }

    @addEventListener('#cb-delay', 'input')
    onDelay(e: Event) { this.delay = Number((e.target as HTMLInputElement).value); this.refresh(); }
    @addEventListener('#cb-naive', 'change')
    onNaive(e: Event) { this.naive = (e.target as HTMLInputElement).checked; this.refresh(); }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .cb-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .cb-intro b { color:#0369a1; }
          .cb-boxes { display:flex; align-items:stretch; gap:10px; margin:14px 0; flex-wrap:wrap; justify-content:center; }
          .cb-box { border-radius:10px; padding:10px 12px; font-size:11px; flex:1; min-width:140px; }
          .cb-node { background:#dbeafe; border:1.5px solid #93c5fd; }
          .cb-node-title { font-weight:800; color:#1e40af; margin-bottom:6px; }
          .cb-pure { background:#dcfce7; border:1.5px solid #86efac; }
          .cb-pure-title { font-weight:800; color:#166534; margin-bottom:6px; }
          .cb-line { color:#475569; margin-bottom:2px; }
          .cb-arrow-mid { display:flex; align-items:center; font-size:20px; color:#94a3b8; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:10px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:45px; text-align:right; color:#1e293b; }
          .cb-sim { margin-top:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; font-size:12px; display:flex; flex-direction:column; gap:4px; }
          .cb-verdict { text-align:center; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 12px; margin-top:10px; border:1px solid; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="cb-intro">
          <b>cv_bridge</b>는 ROS 메시지와 NumPy 배열 사이를 오가는 번역기일 뿐입니다. 진짜 설계 포인트는 <b>header의 타임스탬프를 원본에서 그대로 계승</b>하는 것 — "지금"을 찍으면 처리 지연이 통계에서 사라져버립니다. 아래에서 처리 지연을 늘려보고, "현재시각 사용"(틀린 방식)을 켜보면서 그 차이를 확인해보세요.
        </div>

        <div class="cb-boxes">
          <div class="cb-box cb-node">
            <div class="cb-node-title">ColorDetectorNode (배관)</div>
            <div class="cb-line">구독 /image_raw</div>
            <div class="cb-line">cv_bridge → ndarray</div>
            <div class="cb-line">cv_bridge → msg</div>
            <div class="cb-line">발행 /detection</div>
          </div>
          <div class="cb-arrow-mid">⇄</div>
          <div class="cb-box cb-pure">
            <div class="cb-pure-title">ColorDetector (순수 비전, 19강)</div>
            <div class="cb-line">make_mask → detect → EMA</div>
            <div class="cb-line">ROS 없이 pytest로 검증 가능</div>
          </div>
        </div>

        <div class="math-desc">header(스탬프·frame_id)는 원본에서 계승 — "그 프레임이 찍힌 순간"이 결과의 시각</div>

        <div class="ctl"><label>처리 지연 <input id="cb-delay" type="range" min="0" max="200" step="5" value="${this.delay}"><b id="cb-delay-val">${this.delay}ms</b></label></div>
        <div class="ctl"><label><input id="cb-naive" type="checkbox"> "지금" 사용(틀린 방식) 시뮬레이션</label></div>

        <div class="cb-sim">
          <span id="cb-capture"></span>
          <span id="cb-publish"></span>
          <span id="cb-header"></span>
          <span id="cb-lag"></span>
        </div>
        <div class="cb-verdict" id="cb-verdict"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
