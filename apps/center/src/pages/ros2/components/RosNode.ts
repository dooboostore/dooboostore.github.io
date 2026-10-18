import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-node';

type Lang = 'cpp' | 'py';

const CODE: Record<Lang, string> = {
  cpp: `#include "rclcpp/rclcpp.hpp"\n#include "std_msgs/msg/string.hpp"\n\nint main(int argc, char ** argv) {\n  rclcpp::init(argc, argv);\n  auto node = rclcpp::Node::make_shared("talker");\n  auto pub = node->create_publisher<std_msgs::msg::String>("chatter", 10);\n  rclcpp::Rate rate(2);  // 2Hz 타이머\n  int count = 0;\n  while (rclcpp::ok()) {\n    auto msg = std_msgs::msg::String();\n    msg.data = "hello " + std::to_string(count++);\n    pub->publish(msg);\n    rclcpp::spin_some(node);\n    rate.sleep();\n  }\n  rclcpp::shutdown();\n  return 0;\n}`,
  py: `import rclpy\nfrom rclpy.node import Node\nfrom std_msgs.msg import String\n\nclass Talker(Node):\n    def __init__(self):\n        super().__init__('talker')\n        self.pub = self.create_publisher(String, 'chatter', 10)\n        self.timer = self.create_timer(0.5, self.tick)  # 2Hz 타이머\n        self.count = 0\n\n    def tick(self):\n        msg = String()\n        msg.data = f'hello {self.count}'\n        self.pub.publish(msg)\n        self.count += 1\n\nrclpy.init()\nrclpy.spin(Talker())\nrclpy.shutdown()`,
};

const RUN: Record<Lang, string> = {
  cpp: 'ros2 run demo_nodes_cpp talker',
  py: 'ros2 run demo_nodes_py talker',
};

const MD = `
## 노드 — 실행 단위 한 개
- 노드는 **프로세스 하나(실행 단위)** 입니다. talker 노드, listener 노드처럼 각자 돌고, ROS 통신으로 엮입니다.
- 노드 안에는 **콜백**(타이머·구독·서비스·액션)이 들어갑니다. 위 코드는 "0.5초마다 chatter 토픽에 발행" 콜백 하나짜리 노드입니다.
- 아래 스택이 전부 rcl(공통 C 구현) → rmw → DDS로 내려갑니다. rclcpp/rclpy는 얇은 래퍼라 두 언어 노드가 서로 말이 통합니다.
- 확인: \`ros2 node list\`, \`ros2 node info /talker\`
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosNode extends w.HTMLElement {
    private codeLang: Lang = 'py';

    private refresh() {
      const pre = this.shadowRoot?.querySelector('#rn-code') as HTMLElement;
      if (pre) pre.textContent = CODE[this.codeLang];
      const run = this.shadowRoot?.querySelector('#rn-run') as HTMLElement;
      if (run) run.textContent = '$ ' + RUN[this.codeLang];
      const copy = this.shadowRoot?.querySelector('#rn-copy') as HTMLElement;
      if (copy) copy.dataset.copy = RUN[this.codeLang];
      this.shadowRoot?.querySelectorAll('.rn-lang').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.lang === this.codeLang));
    }

    @addEventListener('.rn-lang', 'click', { delegate: true })
    onLang(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rn-lang') as HTMLElement;
      if (!btn) return;
      this.codeLang = btn.dataset.lang as Lang;
      this.refresh();
    }

    @addEventListener('#rn-copy', 'click')
    async onCopy(e: Event) {
      const btn = e.target as HTMLElement;
      try {
        await navigator.clipboard?.writeText(btn.dataset.copy ?? '');
        const old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch {}
    }

    @onConnectedAfter
    onReady() {
      this.refresh();
      markdownParse(this.shadowRoot?.querySelector('#rn-md') as HTMLElement, MD);
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .rn-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rn-intro b { color:#22314e; }
          .rn-langs { display:flex; gap:6px; justify-content:center; margin:10px 0; }
          .rn-lang { padding:6px 16px; border-radius:16px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:12px; font-weight:700; cursor:pointer; }
          .rn-lang.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          pre.rn-code { background:#0f172a; color:#7dd3fc; font-size:11px; line-height:1.6; border-radius:8px; padding:12px; overflow-x:auto; font-family:monospace; }
          .rn-run { display:flex; gap:6px; align-items:center; background:#0f172a; border-radius:6px; padding:6px 8px; margin-top:6px; }
          .rn-run code { flex:1; color:#7dd3fc; font-size:11.5px; font-family:monospace; }
          .rn-run button { background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:5px; font-size:10.5px; padding:3px 8px; cursor:pointer; }
          .rn-stack { display:flex; flex-direction:column; align-items:center; gap:4px; margin:14px 0 4px; }
          .rn-layer { width:100%; max-width:340px; text-align:center; font-size:12px; font-weight:700; border-radius:8px; padding:7px; }
          .rn-arrow { color:#94a3b8; font-size:14px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rn-intro">
          가장 작은 talker 노드입니다. 언어를 바꿔보세요 — <b>rclcpp든 rclpy든 뼈대는 같고</b>(초기화→노드 생성→퍼블리셔+타이머→spin), 아래 통신 스택을 공유해서 서로 말이 통합니다.
        </div>

        <div class="rn-langs">
          <button class="rn-lang" data-lang="py">Python (rclpy)</button>
          <button class="rn-lang" data-lang="cpp">C++ (rclcpp)</button>
        </div>
        <pre class="rn-code" id="rn-code"></pre>
        <div class="rn-run"><code id="rn-run"></code><button id="rn-copy">복사</button></div>

        <div class="rn-stack">
          <div class="rn-layer" style="background:#dbeafe;color:#1e40af">rclcpp / rclpy (언어 래퍼)</div>
          <div class="rn-arrow">↓</div>
          <div class="rn-layer" style="background:#e0e7ff;color:#3730a3">rcl (공통 C 구현)</div>
          <div class="rn-arrow">↓</div>
          <div class="rn-layer" style="background:#fef3c7;color:#92400e">rmw (미들웨어 인터페이스)</div>
          <div class="rn-arrow">↓</div>
          <div class="rn-layer" style="background:#dcfce7;color:#166534">DDS (Fast DDS 기본)</div>
        </div>

        <div class="md" id="rn-md"></div>
      `;
    }
  }

  return tagName;
};
