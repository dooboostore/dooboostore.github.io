import { addEventListener, elementDefine, onConnectedAfter, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-ros2-cli';

type Cmd = { group: string; cmd: string; desc: string; concept: string; sample: string; tip?: string };

const CMDS: Cmd[] = [
  { group: '토픽', cmd: 'ros2 topic list', desc: '살아있는 토픽 목록', concept: '지금 DDS 도메인에서 발행 중인 토픽 이름 전부. 노드가 떠 있어야 보인다 — 빈 목록이면 노드가 안 켜진 것.', sample: '/chatter\n/cmd_vel\n/parameter_events\n/rosout', tip: '아무것도 안 나오면 talker부터 켜기' },
  { group: '토픽', cmd: 'ros2 topic echo /chatter', desc: '메시지 실시간 출력', concept: '구독자를 즉석에서 하나 붙이는 것. 발행 주기·필드값이 눈에 보여 센서·상태 디버깅의 첫 손.', sample: 'data: hello 42\n---\ndata: hello 43', tip: 'Ctrl+C로 종료. -n 1 옵션으로 한 개만 받기' },
  { group: '토픽', cmd: 'ros2 topic hz /scan', desc: '발행 주파수 측정', concept: '헤더 타임스탬프가 아니라 실제 도착 간격으로 재는 실측 Hz. 설정 30Hz인데 12Hz면 처리·대역폭 병목.', sample: 'average rate: 29.97\nmin: 0.030s max: 0.037s', tip: 'vision QoS 탭의 지연 그래프와 같은 원리' },
  { group: '토픽', cmd: 'ros2 topic info /chatter', desc: '타입·퍼블리셔/구독자 수', concept: '토픽의 메시지 타입과 연결된 노드 수. 타입이 안 맞으면 연결이 안 되는 이유 확인용.', sample: 'Type: std_msgs/msg/String\nPublisher count: 1\nSubscription count: 2' },
  { group: '토픽', cmd: 'ros2 topic pub /cmd_vel geometry_msgs/msg/Twist "{linear: {x: 0.5}}"', desc: '한 번 발행(따옴표 주의)', concept: 'CLI가 임시 발행자가 되는 것. 로봇을 살짝 움직여보는 가장 빠른 방법. -r 10을 붙이면 10Hz 반복.', sample: 'publisher: beginning loop\npublishing #1...', tip: 'YAML 인자는 작은따옴표·큰따옴표 감싸기' },
  { group: '서비스', cmd: 'ros2 service list', desc: '서비스 목록', concept: '요청-응답 서버들의 명단. 토픽과 달리 서버가 없으면 호출이 실패한다.', sample: '/spawn\n/teleop_turtle\n/clear' },
  { group: '서비스', cmd: 'ros2 service call /spawn turtlesim/srv/Spawn "{x: 5.0, y: 5.0}"', desc: '거북이 소환', concept: '단발 요청의 정석 예시. 응답에 새 거북이 이름이 돌아온다.', sample: 'requester: making request...\nresponse:\n  name: turtle2', tip: 'turtlesim 켜고 연습' },
  { group: '액션', cmd: 'ros2 action list', desc: '액션 목록', concept: '장시간 작업 서버 명단. goal·feedback·result 3채널이 한 세트.', sample: '/navigate_to_pose\n/fibonacci' },
  { group: '액션', cmd: 'ros2 action send_goal /navigate_to_pose nav2_msgs/action/NavigateToPose ...', desc: '목표 전송+피드백 표시', concept: '목표를 보내고 중간보고(feedback)를 실시간으로 보며, 끝나면 result. Ctrl+C는 취소 요청이다.', sample: 'Goal accepted\nFeedback: distance_remaining: 1.2\nResult: success', tip: 'Nav2 실습의 핵심 명령' },
  { group: '파라미터', cmd: 'ros2 param list', desc: '노드별 파라미터 목록', concept: '각 노드가 declare한 손잡이 명단. 없는 이름에 set을 날리면 에러.', sample: '/motor:\n  max_speed\n  stop_dist\n/talker:\n  use_sim_time' },
  { group: '파라미터', cmd: 'ros2 param get /motor max_speed', desc: '값 조회', concept: '현재값 읽기. 타입(double/string/...)도 함께 나온다.', sample: 'Double value is: 2.0' },
  { group: '파라미터', cmd: 'ros2 param set /motor max_speed 3.0', desc: '실행 중 변경', concept: '재시작 없이 값 변경 — 파라미터 탭의 슬라이더가 바로 이것. 콜백(동적 리컴파일)이 있으면 즉시 반영.', sample: 'Set parameter successful' },
  { group: '파라미터', cmd: 'ros2 param dump /motor', desc: 'yaml 저장', concept: '현재값을 yaml로 뽑아 launch에서 로드. 튜닝값 보존용.', sample: '/motor:\n  ros__parameters:\n    max_speed: 3.0' },
  { group: '노드', cmd: 'ros2 node list', desc: '노드 목록', concept: 'discovery로 찾은 실행 단위 전부. 디버깅 1번 타자.', sample: '/talker\n/listener\n/transform_listener' },
  { group: '노드', cmd: 'ros2 node info /talker', desc: '퍼블리셔·구독자·서비스 상세', concept: '그 노드가 물고 있는 토픽·서비스·액션을 한눈에. "연결이 안 돼요"의 원인 1순위 확인처.', sample: 'Publishers:\n  /chatter: std_msgs/msg/String\nSubscribers: ...' },
  { group: '패키지', cmd: 'ros2 pkg list', desc: '설치된 패키지', concept: 'ament 패키지 명단. executables·prefix로 실행파일·경로까지 추적 가능.', sample: 'demo_nodes_cpp\ndemo_nodes_py\nturtlesim' },
  { group: '인터페이스', cmd: 'ros2 interface show std_msgs/msg/String', desc: '메시지 정의 확인', concept: '토픽·서비스·액션의 필드 구조. 타입이 안 맞을 때 원본 대조용.', sample: 'string data' },
  { group: '인터페이스', cmd: 'ros2 interface list', desc: '사용 가능한 타입 전부', concept: 'msg/srv/action 타입 색인. 새 센서 붙일 때 타입 고르기용.', sample: 'std_msgs/msg/String\nsensor_msgs/msg/Image\n...' },
  { group: 'bag', cmd: 'ros2 bag record -a', desc: '전 토픽 녹화', concept: 'DDS 트래픽을 SQLite(.db3)에 그대로 저장. --topics로 골라 담기.', sample: '[INFO] Recording to run6s_0.db3', tip: 'bag 탭의 가상 녹화본과 같은 원리' },
  { group: 'bag', cmd: 'ros2 bag play run6s', desc: '재생', concept: '저장된 타임스탬프대로 재발행. -r 0.5 절반속도, -l 루프.', sample: '[INFO] Playing from run6s_0.db3' },
  { group: 'bag', cmd: 'ros2 bag info run6s', desc: '메타 확인', concept: '토픽·메시지 수·지속시간·시작시각. 재생 전 내용물 확인용.', sample: 'Topics: /scan (100 msgs), /image_raw (180 msgs)\nDuration: 6.0s' },
  { group: '실행', cmd: 'ros2 run demo_nodes_cpp talker', desc: '노드 한 개 실행', concept: '패키지 속 실행파일 하나를 직접 켜기. --ros-args로 리맵·파라미터·로그레벨 전달.', sample: '[INFO] [talker]: Publishing hello' },
  { group: '실행', cmd: 'ros2 launch demo_bringup talker_listener.launch.py', desc: 'launch 실행', concept: '설계도대로 여러 노드를 한 번에. --show-args로 인자 확인.', sample: '[INFO] [launch]: All log files...' },
  { group: '진단', cmd: 'ros2 doctor', desc: '환경 자가진단', concept: 'ROS 버전·네트워크·RMW·도메인 ID 점검. "왜 안 보여요"의 0번 타자.', sample: 'All 3 checks passed' },
  { group: '진단', cmd: 'ros2 wtf', desc: 'doctor의 별칭', concept: 'ros2 doctor와 동일. 이름 그대로 "도대체 왜" 할 때 치는 명령.', sample: 'All checks passed' },
  { group: '데몬', cmd: 'ros2 daemon status', desc: 'CLI 캐시 데몬 상태', concept: 'ros2 topic list 같은 CLI가 매번 discovery를 돌리면 느리니, 백그라운드 데몬이 명단을 캐시한다. 목록이 이상하면 여기부터 확인.', sample: 'Daemon status: running (pid 1234)' },
  { group: '데몬', cmd: 'ros2 daemon stop', desc: '데몬 중지 (캐시 초기화)', concept: '노드를 껐는데도 목록에 남아있는 유령 항목은 stale 캐시가 범인. stop으로 캐시를 날리면 다음 명령이 새로 discovery한다.', sample: 'Stopped daemon', tip: 'topic list가 안 맞으면 daemon stop 한 번' },
  { group: '데몬', cmd: 'ros2 daemon start', desc: '데몬 시작', concept: 'stop 후 다음 CLI 실행 때 자동 시작되지만, 미리 켜두면 첫 명령이 빠르다.', sample: 'Started daemon (pid 5678)' },
];

const GROUPS = ['전체', ...Array.from(new Set(CMDS.map(c => c.group)))];

const MD = `
## CLI — 손에 익히면 눈이 됩니다
- 명령을 눌러보세요. **개념(왜 존재하나) + 실제 출력 예시 + 팁**이 아래 패널에 나옵니다.
- 디버깅 순서 외우기: \`node list\` → \`topic list\` → \`topic echo\` → \`topic hz\` → \`node info\`. 이 5개면 80% 해결.
- 모르는 명령은 \`ros2 <명령> -h\`가 전부 알려줍니다. turtlesim(\`ros2 run turtlesim turtlesim_node\`)이 최고의 연습장입니다.
`;

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RosCli extends w.HTMLElement {
    private query = '';
    private group = '전체';
    private selected = 0;

    private filtered(): Cmd[] {
      const q = this.query.trim().toLowerCase();
      return CMDS.filter(c =>
        (this.group === '전체' || c.group === this.group) &&
        (!q || (c.group + ' ' + c.cmd + ' ' + c.desc + ' ' + c.concept).toLowerCase().includes(q)));
    }

    private refresh() {
      const list = this.filtered();
      if (this.selected >= list.length) this.selected = 0;
      const box = this.shadowRoot?.querySelector('#rl-rows') as HTMLElement;
      if (box) {
        let lastGroup = '';
        box.innerHTML = list.map((c, i) => {
          const head = c.group !== lastGroup ? `<div class="rl-group">${c.group}</div>` : '';
          lastGroup = c.group;
          return head +
            `<div class="rl-row${i === this.selected ? ' sel' : ''}" data-idx="${i}"><div class="rl-cmd"><code>${c.cmd}</code></div>` +
            `<div class="rl-desc">${c.desc}</div></div>`;
        }).join('') || '<div class="rl-empty">검색 결과 없음</div>';
      }
      const gbox = this.shadowRoot?.querySelector('#rl-groups') as HTMLElement;
      if (gbox) {
        gbox.innerHTML = GROUPS.map(g => `<button class="rl-g${g === this.group ? ' active' : ''}" data-g="${g}">${g}</button>`).join('');
      }
      const cur = list[this.selected];
      const d = this.shadowRoot?.querySelector('#rl-detail') as HTMLElement;
      if (d) {
        d.innerHTML = cur
          ? `<div class="rl-d-cmd">${cur.cmd}<button class="rl-copy" data-copy="${cur.cmd.replace(/"/g, '&quot;')}">복사</button></div>` +
            `<div class="rl-d-desc">${cur.desc}</div>` +
            `<div class="rl-d-concept">${cur.concept}</div>` +
            `<pre class="rl-d-sample">${cur.sample}</pre>` +
            (cur.tip ? `<div class="rl-d-tip">💡 ${cur.tip}</div>` : '')
          : '';
      }
      const count = this.shadowRoot?.querySelector('#rl-count') as HTMLElement;
      if (count) count.textContent = `${list.length} / ${CMDS.length}개`;
    }

    @addEventListener('#rl-q', 'input')
    onQ(e: Event) {
      this.query = (e.target as HTMLInputElement).value;
      this.selected = 0;
      this.refresh();
    }

    @addEventListener('.rl-g', 'click', { delegate: true })
    onG(e: Event) {
      const btn = (e.target as HTMLElement).closest('.rl-g') as HTMLElement;
      if (!btn) return;
      this.group = btn.dataset.g ?? '전체';
      this.selected = 0;
      this.refresh();
    }

    @addEventListener('.rl-row', 'click', { delegate: true })
    onRow(e: Event) {
      const row = (e.target as HTMLElement).closest('.rl-row') as HTMLElement;
      if (!row || row.dataset.idx === undefined) return;
      this.selected = Number(row.dataset.idx);
      this.refresh();
      this.shadowRoot?.querySelector('#rl-detail')?.scrollIntoView({ block: 'nearest' });
    }

    @addEventListener('.rl-copy', 'click', { delegate: true })
    async onCopy(e: Event) {
      e.stopPropagation();
      const btn = (e.target as HTMLElement).closest('.rl-copy') as HTMLElement;
      if (!btn) return;
      try {
        await navigator.clipboard?.writeText(btn.dataset.copy ?? '');
        const old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = old; }, 1200);
      } catch {}
    }

    @onConnectedAfter
    onReady() { this.refresh(); }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          :host { display:block; }
          .rl-intro { font-size:13px; line-height:1.7; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
          .rl-intro b { color:#22314e; }
          .rl-search { width:100%; padding:9px 12px; border-radius:8px; border:1.5px solid #e2e8f0; font-size:13px; margin:8px 0 4px; }
          .rl-search:focus { outline:none; border-color:#22314e; }
          .rl-top { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:6px; }
          .rl-groups { display:flex; gap:5px; flex-wrap:wrap; }
          .rl-g { padding:4px 11px; border-radius:14px; border:1.5px solid #e2e8f0; background:#f8fafc; color:#64748b; font-size:11.5px; font-weight:700; cursor:pointer; }
          .rl-g.active { background:#22314e; color:#fff; border-color:#22314e; }
          .rl-count { font-size:11px; color:#94a3b8; flex-shrink:0; }
          .rl-group { font-size:12px; font-weight:800; color:#22314e; margin:12px 0 4px; }
          .rl-row { background:#0f172a; border-radius:8px; padding:8px 10px; margin-top:6px; cursor:pointer; border:2px solid transparent; }
          .rl-row.sel { border-color:#7dd3fc; }
          .rl-cmd code { color:#7dd3fc; font-size:11.5px; font-family:monospace; word-break:break-all; }
          .rl-desc { color:#94a3b8; font-size:11.5px; margin-top:4px; }
          .rl-empty { text-align:center; color:#94a3b8; font-size:12px; margin-top:16px; }
          .rl-detail { margin-top:14px; border:1.5px solid #bae6fd; border-radius:10px; padding:12px; background:#f0f9ff; }
          .rl-d-cmd { font-size:12px; font-weight:800; color:#0c4a6e; font-family:monospace; display:flex; justify-content:space-between; gap:8px; align-items:center; word-break:break-all; }
          .rl-copy { flex-shrink:0; background:#22314e; color:#fff; border:none; border-radius:5px; font-size:10.5px; padding:4px 10px; cursor:pointer; }
          .rl-d-desc { font-size:12.5px; font-weight:700; color:#334155; margin-top:6px; }
          .rl-d-concept { font-size:12.5px; color:#475569; line-height:1.7; margin-top:6px; }
          .rl-d-sample { background:#0f172a; color:#a5f3c0; font-size:11px; border-radius:6px; padding:8px 10px; margin-top:8px; overflow-x:auto; font-family:monospace; line-height:1.6; }
          .rl-d-tip { font-size:12px; color:#92400e; margin-top:6px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>

        <div class="rl-intro">
          자주 쓰는 <b>28개 명령</b>을 고르면 개념·출력예시가 나옵니다. 그룹 필터 + 검색 + 클릭 3단 조작.
        </div>

        <input class="rl-search" id="rl-q" type="text" placeholder="검색: 예) 재생, 목록, 지연, spawn">
        <div class="rl-top"><div class="rl-groups" id="rl-groups"></div><span class="rl-count" id="rl-count"></span></div>
        <div id="rl-rows"></div>
        <div class="rl-detail" id="rl-detail"></div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
