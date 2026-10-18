import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { markdownParse } from '@center-src/utils/markdown';

const tagName = 'center-ros2-sim';

type Pattern = 'rlbasic' | 'reward' | 'isaacsim' | 'isaaclab' | 'domainrand' | 'isaacros' | 'deploy';

const F = '```';

const PATTERNS: Record<Pattern, { label: string; md: string }> = {
  rlbasic: { label: 'RL 기초', md: `<div class="rs-def">
<div><b>정의</b> 시행착오로 누적 보상을 최대화하는 정책(policy) 학습.</div>
<div><b>언제</b> 정답 라벨 없이 행동을 배워야 할 때 — 로봇 제어, 게임.</div>
<div><b>예시</b> Atari·바둑, 로봇 보행, Sim2Real 정책.</div>
</div>

**맞다, 보상학습이다.** 에이전트가 시행착오로 누적 보상(reward 합)을 최대화하는 정책(policy)을 배운다. 상태→행동→보상→다음 상태 루프를 수백만 번 돌리는 게 전부. 로봇 실기에서 돌리면 느리고 망가지니 시뮬에서 돌린다.\n${F}mermaid\nflowchart LR\n    A["에이전트<br/>policy"] -- "행동" --> E["환경 (시뮬)"]\n    E -- "상태" --> A\n    E -- "보상" --> A\n${F}` },
  reward: { label: '보상 설계', md: `<div class="rs-def">
<div><b>정의</b> 학습 목표를 숫자로 적은 것 — 에이전트는 이 합을 키운다.</div>
<div><b>언제</b> 항상. 보상이 곧 목표라 가장 먼저 정한다.</div>
<div><b>예시</b> sparse(성공 +1), dense(진척 보상), shaping, 학습된 보상(AMP).</div>
</div>

**보상이 곧 학습 목표.** sparse(성공 시 +1 뿐)는 배우기 어렵고, dense(매 스텝 진척 보상)는 빠르지만 잘못 주면 꼼수(reward hacking: 제자리에서 보상만 긁기)가 나온다. shaping으로 안내하되 최종 목표와 어긋나지 않게, 또는 선호·데모에서 보상 자체를 배운다(AMP·역강화학습류).\n${F}mermaid\nflowchart TD\n    S["sparse 보상<br/>성공만 +1"] --> HARD["학습 느림"]\n    D["dense 보상<br/>진척마다"] --> FAST["학습 빠름"]\n    D --> HACK["꼼수 위험"]\n    L["학습된 보상<br/>선호·데모에서"] --> ROB["강건함"]\n${F}` },
  isaacsim: { label: 'Isaac Sim', md: `<div class="rs-def">
<div><b>정의</b> NVIDIA Omniverse 기반 로봇 시뮬레이터(물리+렌더+합성데이터).</div>
<div><b>언제</b> 물리·센서 시뮬, 합성데이터, 디지털트윈이 필요할 때.</div>
<div><b>예시</b> USD 장면, Replicator 라벨, ROS 2 브리지.</div>
</div>

**NVIDIA Omniverse 기반 시뮬레이터.** USD 장면 → PhysX 물리 + RTX 렌더 → 합성 카메라·라이다 → ROS 2 토픽으로. Replicator로 바운딩박스·세그멘테이션 라벨까지 찍어내는 합성데이터(SDG) 생성기. Lab 없이 단독으로 디지털트윈·인식 데이터용으로 쓴다.
- **Sim 자체는 학습 안 함** — 세계(물리·센서)만 제공하고 정책 최적화는 Lab이 한다. "Sim=경기장, Lab=코치"로 외우세요.
- **물건 옮기기는 쪼개짐**: VLM이 "뭘 어디로" 정하고, "안 떨어지게"(그립 힘 유지·미끄럼 보정·보행 안정)는 저수준이라 RL로 학습시키거나 고전 힘제어로 푼다.\n${F}mermaid\nflowchart LR\n    USD["USD 장면<br/>CAD·URDF 변환"] --> SIM["Isaac Sim<br/>PhysX + RTX"]\n    SIM --> SYN["합성 센서<br/>RGB·Depth·Lidar"]\n    SYN --> ROS2["ROS 2 토픽 발행"]\n    SYN --> DATA["합성데이터<br/>bbox·seg 라벨"]\n${F}` },
  isaaclab: { label: 'Isaac Lab', md: `<div class="rs-def">
<div><b>정의</b> Isaac Sim 위에서 도는 RL 학습 프레임워크(구 Orbit).</div>
<div><b>언제</b> 정책을 학습시킬 때 — 수천 병렬 env + PPO.</div>
<div><b>예시</b> RSL-RL·rl_games·SKRL, .onnx→.engine export.</div>
</div>

**Sim 위의 RL 학습 프레임워크 (구 Orbit).** Sim 없이 Lab 단독은 안 됨.

**뭘 학습시키나 (저수준 스킬)**: 4족·휴머노이드 보행, 팔 뻗기·문 열기·파지, in-hand 조작, 드론 호버링.
**학습 안 시키는 것**: SLAM·A*·EKF·모터 PD (확정 그대로). 정책은 목표 관절각·속도만 낸다.
**상위도 학습 가능**: 계층형은 스킬 선택까지, VLA는 통째로. 구조는 **VLM(플랜) → RL(스킬) → PD(실행)**.

| 설정값 | 4족 보행 예시 |
|---|---|
| 관측 | 관절각·각속도·기체 속도·명령 속도 |
| 보상 | 속도 추종 + / 넘어짐 리셋 - / 토크 낭비 - |
| 종료 | 기체 뒤집힘 / 타임아웃 |
| 규모 | env 수천 개 병렬 |
| 알고리즘 | PPO (학습률·감쇠율·클리핑) |
${F}mermaid
flowchart TB
    R["리셋"] --> C["rollout 수집"]
    C --> A["어드밴티지 계산"]
    A --> P["PPO 업데이트"]
    P -->|"보상↑"| R
    P -->|"평탄=수렴"| OUT[".pt → .onnx → .engine → 실기"]
    style OUT fill:#dcfce7,stroke:#16a34a
${F}` },
  domainrand: { label: '도메인 랜덤화', md: `<div class="rs-def">
<div><b>정의</b> 시뮬 조건을 매번 뒤섞어 정책이 분포 전체에 강해지게 하기.</div>
<div><b>언제</b> 심투리얼 갭을 메울 때.</div>
<div><b>예시</b> 조명·질감·마찰·질량 랜덤화, states→노이즈→관측.</div>
</div>

**심투리얼 갭을 메우는 법.** 조명·질감·마찰·질량·지연을 매 에피소드마다 뒤섞으면, 정책이 "정답 하나"가 아니라 "분포 전체"에 강해진다. Lab 파이프라인의 states→노이즈→관측 단계가 바로 이것. 시각 갭이 크면 Cosmos 같은 생성형 월드모델로 장면을 현실 쪽으로 당기기도 한다.\n${F}mermaid\nflowchart LR\n    N["기본 시뮬"] --> R["랜덤화<br/>빛·질감·마찰·질량"]\n    R --> P["강건한 정책"]\n    P --> REAL["실기"]\n${F}` },
  isaacros: { label: 'Isaac ROS', md: `<div class="rs-def">
<div><b>정의</b> GPU 가속 ROS 2 패키지 모음(NITROS zero-copy).</div>
<div><b>언제</b> 실기에서 실시간 처리가 필요할 때 — 로봇 본체에서 돈다.</div>
<div><b>예시</b> VSLAM 오도메트리, Nvblox 3D 지도, 자세추정.</div>
</div>

**GPU 가속 ROS 2 패키지 모음.** NITROS로 CPU↔GPU 복사 없이 이미지 처리 → VSLAM(스테레오+IMU 오도메트리)·Nvblox(3D 복원)·자세추정 파운데이션 모델. 실기 쪽 가속 담당이라 Sim이 아니라 로봇 본체에서 돈다.\n${F}mermaid\nflowchart LR\n    CAM["스테레오 카메라"] --> NIT["NITROS<br/>GPU zero-copy"]\n    NIT --> VSLAM["VSLAM<br/>오도메트리"]\n    NIT --> NVB["Nvblox<br/>3D 지도"]\n    VSLAM --> NAV["Nav2"]\n${F}` },
  deploy: { label: '배포 루프', md: `<div class="rs-def">
<div><b>정의</b> 학습→배포→수집→갱신→재학습의 반복 운용.</div>
<div><b>언제</b> 현장에서 로봇을 굴릴 때.</div>
<div><b>예시</b> 디지털트윈 루프, rosbag 회귀 시험.</div>
</div>

**한 번에 끝이 아니라 루프.** Sim 학습 → 실기 검증 → 실패 장면을 Sim에 반영(에셋·랜덤화 범위 갱신) → 재학습 → 재배포. 디지털트윈이 있으면 이 루프가 빨라진다. ROS 2 토픽이 Sim·실기 공통 인터페이스라 같은 스택으로 검증한다.\n${F}mermaid\nflowchart LR\n    SIM["Sim 학습"] --> DEP["실기 배포"]\n    DEP --> FAIL["실패 수집"]\n    FAIL --> UPD["Sim 갱신"]\n    UPD --> SIM\n${F}` },
};

const MD = `
## Sim2Real — 시뮬에서 배워 실기에서 돌리기
- **RL=보상학습**이 맞습니다. 시행착오로 누적 보상을 최대화하는 정책 학습 — 실기에서 하면 느리고 망가지니 Sim에서 합니다.
- 도구 분담: **Isaac Sim**(세계) → **Isaac Lab**(학습) → **도메인 랜덤화**(갭 메우기) → **Isaac ROS**(실기 가속) → **배포 루프**.
- 보상이 전부입니다. 보상을 잘못 주면 로봇이 꼼수를 배웁니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosSim extends w.HTMLElement {
    private pattern: Pattern = 'rlbasic';

    /** AiPage 탭에서 <center-ros2-sim pattern="isaaclab"> 처럼 고정 호출되면 단일 개념만 표시 */
    private get fixedPattern(): Pattern | null {
      const p = (this.getAttribute?.('pattern') ?? '') as string;
      return (Object.keys(PATTERNS) as Pattern[]).includes(p as Pattern) ? (p as Pattern) : null;
    }

    private refresh() {
      const fixed = this.fixedPattern;
      if (fixed) this.pattern = fixed;
      this.shadowRoot?.querySelectorAll('.rs-pat').forEach(el =>
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.pat === this.pattern));
      const el = this.shadowRoot?.querySelector('#rs-pat') as HTMLElement;
      if (el) markdownParse(el, PATTERNS[this.pattern].md);
    }

    @addEventListener('.rs-pat', 'click', { delegate: true })
    onPat(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rs-pat') as HTMLElement;
      if (!btn) return;
      this.pattern = btn.dataset.pat as Pattern;
      this.refresh();
    }

    @onConnectedAfter
    onReady() {
      this.refresh();
      markdownParse(this.shadowRoot?.querySelector('#rs-md') as HTMLElement, MD);
    }

    @onConnectedBodyShadow
    render() {
      const fixed = this.fixedPattern;
      const nav = fixed ? '' : `
        <div class="rs-intro">
          <b>RL=보상학습</b>이 맞습니다. 시뮬에서 수백만 번 시행착오 → 실기 배포. 개념별로 눌러보세요.
        </div>

        <div class="rs-pats">
          ${(Object.keys(PATTERNS) as Pattern[]).map(k => `<button class="rs-pat" data-pat="${k}">${PATTERNS[k].label}</button>`).join('')}
        </div>`;
      return `
        <style>
          :host { display:block; }
          .rs-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rs-intro b { color:#22314e; }
          .rs-pats { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; margin-top:10px; }
          .rs-pat { padding:6px 12px; border-radius:16px; border:1.5px solid #bae6fd; background:#f0f9ff; color:#22314e; font-size:12px; font-weight:700; cursor:pointer; }
          .rs-pat.active { background:linear-gradient(135deg,#22314e,#7dd3fc); color:#fff; border-color:transparent; }
          .rs-patdetail { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-top:8px; font-size:12.5px; color:#334155; line-height:1.7; }
          .rs-def { font-size:12.5px; line-height:1.8; color:#1e293b; background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:10px 14px; margin-bottom:10px; }
          .rs-def b { color:#14532d; display:inline-block; min-width:36px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md table { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; }
          .md th, .md td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; }
          .md th { background:#f0fdf4; color:#14532d; }
          .rs-patdetail table { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; }
          .rs-patdetail th, .rs-patdetail td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; }
          .rs-patdetail th { background:#f0fdf4; color:#14532d; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        ${nav}
        <div class="rs-patdetail" id="rs-pat"></div>

        <div class="md" id="rs-md"></div>
      `;
    }
  }

  return tagName;
};
