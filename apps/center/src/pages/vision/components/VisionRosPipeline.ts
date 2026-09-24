import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-vision-ros-pipeline';

type TopicId = 'image_raw' | 'camera_info' | 'detection' | 'image_annotated';

const TOPIC_INFO: Record<TopicId, { title: string; fields: string[] }> = {
  image_raw: {
    title: 'sensor_msgs/msg/Image',
    fields: ['header.stamp — 촬영 시각(지연 계산 기준)', 'header.frame_id — "camera_link"(TF 연결 열쇠)', 'height=480, width=640', 'encoding="bgr8"', 'step=1920 B/행', 'data: 921,600 바이트'],
  },
  camera_info: {
    title: 'sensor_msgs/msg/CameraInfo',
    fields: ['20강에서 만든 K(fx,fy,cx,cy)', '왜곡 계수(k1,k2,p1,p2,k3)', '드라이버가 yaml 파일을 읽어 발행', '소비자는 파일이 아니라 토픽에서 K를 받음'],
  },
  detection: {
    title: 'geometry_msgs/msg/PointStamped',
    fields: ['header — 원본 /image_raw의 stamp를 계승!', 'point.x, point.y — 검출 중심 픽셀(19강 결과)'],
  },
  image_annotated: {
    title: 'sensor_msgs/msg/Image (디버그용)',
    fields: ['원본 프레임 + 중심·박스 오버레이', 'rqt_image_view가 구독해 눈으로 확인'],
  },
};

const MD = `
## ROS2 이미지 파이프라인의 표준 구조
- \`usb_cam\` 드라이버가 **/image_raw**(Image)와 **/camera_info**(CameraInfo)를 발행하고, \`color_detector\` 노드가 구독·처리 후 **/detection**(중심 좌표)과 **/image_annotated**(디버그 오버레이)를 발행합니다.
- \`rqt_image_view\`와 \`rosbag\`은 같은 토픽을 **구독만** 하면 됩니다 — **발행자는 구독자를 모른다**(느슨한 결합)는 원칙이 이미지에서도 그대로입니다.
- 아래 박스를 클릭하면 그 토픽의 메시지 구조를 확인할 수 있습니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class VisionRosPipeline extends w.HTMLElement {
    private selected: TopicId = 'image_raw';

    private refresh() {
      this.shadowRoot?.querySelectorAll('.rp-box').forEach(el => {
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.topic === this.selected);
      });
      const info = TOPIC_INFO[this.selected];
      const panel = this.shadowRoot?.querySelector('#rp-panel') as HTMLElement;
      if (panel) {
        panel.innerHTML = `<div class="rp-panel-title">${info.title}</div>` +
          info.fields.map(f => `<div class="rp-field">• ${f}</div>`).join('');
      }
    }

    @addEventListener('.rp-box', 'click', { delegate: true })
    onBoxClick(e: Event) {
      const box = (e.target as HTMLElement).closest('.rp-box') as HTMLElement;
      if (!box) return;
      this.selected = box.dataset.topic as TopicId;
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
          .rp-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rp-intro b { color:#0369a1; }
          .rp-graph { display:flex; flex-direction:column; align-items:center; gap:10px; margin:14px 0; }
          .rp-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:center; }
          .rp-node { padding:8px 14px; border-radius:8px; font-size:11.5px; font-weight:700; color:#fff; background:#64748b; }
          .rp-box { padding:8px 12px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; border:2px solid transparent; background:#e2e8f0; color:#334155; transition:all .15s; }
          .rp-box:hover { border-color:#94a3b8; }
          .rp-box.active { border-color:#0369a1; background:#bae6fd; color:#0c4a6e; }
          .rp-arrow { color:#94a3b8; font-size:16px; }
          .rp-sub { padding:6px 12px; border-radius:8px; font-size:10.5px; font-weight:600; background:#f3e8ff; color:#6d28d9; }
          .rp-panel { margin-top:14px; background:#0f172a; color:#e2e8f0; border-radius:10px; padding:12px 14px; font-size:12px; line-height:1.8; min-height:120px; }
          .rp-panel-title { font-weight:800; color:#38bdf8; margin-bottom:6px; }
          .rp-field { color:#cbd5e1; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rp-intro">
          19강의 검출기는 OpenCV 창에 그림만 그리는 <b>혼자 노는 프로그램</b>이었습니다. 로봇 시스템에서는 카메라 드라이버·검출기·제어기·기록기가 <b>서로 다른 노드</b>이고, 이미지는 그 사이를 토픽으로 흘러야 합니다. 아래 토픽 박스를 눌러 각 메시지가 실제로 무엇을 담고 있는지 확인해보세요.
        </div>

        <div class="rp-graph">
          <div class="rp-row"><div class="rp-node">usb_cam 드라이버</div></div>
          <div class="rp-arrow">↓</div>
          <div class="rp-row">
            <div class="rp-box" data-topic="image_raw">/image_raw</div>
            <div class="rp-box" data-topic="camera_info">/camera_info</div>
          </div>
          <div class="rp-arrow">↓</div>
          <div class="rp-row"><div class="rp-node">color_detector (19강 모듈+배관)</div></div>
          <div class="rp-arrow">↓</div>
          <div class="rp-row">
            <div class="rp-box" data-topic="detection">/detection</div>
            <div class="rp-box" data-topic="image_annotated">/image_annotated</div>
          </div>
          <div class="rp-row"><div class="rp-sub">rqt_image_view</div><div class="rp-sub">rosbag record</div></div>
        </div>

        <div class="rp-panel" id="rp-panel"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
