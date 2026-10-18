import { addEventListener, elementDefine, onConnectedBodyShadow } from '@dooboostore/simple-web-component';
import { marked } from 'marked';

const tagName = 'center-math-rot-compare';

const MD = `
## 오일러·쿼터니언·Gram-Schmidt: 회전을 표현하는 세 가지 방법
맨 위 3중 링은 **오일러 각도가 왜 짐벌락에 걸리는지 기계식 짐벌 구조 그대로** 보여줍니다. 슬라이더(yaw·pitch·roll)는 하나뿐이지만, 아래 3개 그래프는 **서로 완전히 다른 계산식**으로 같은 자세를 만들어냅니다.

- **오일러 각도(yaw, pitch, roll)**: 축별 회전행렬을 곱해서(\`R = Rz·Rx·Ry\`) 자세를 만듭니다. 숫자 3개로 직관적이지만, pitch=±90°에서는 yaw축(안쪽 링)이 roll축(바깥쪽 링)과 같은 방향이 되어버려 **짐벌락(gimbal lock)**이 생깁니다 — 두 링이 겹치면 자유도 하나가 사라집니다.
- **쿼터니언(w, x, y, z)**: 행렬을 거치지 않고 \`v' = q·v·q⁻¹\`(사원수 샌드위치 곱)로 벡터를 직접 회전시킵니다. 숫자 4개, 짐벌락이 없고 두 자세 사이를 매끄럽게 보간(slerp)할 수 있습니다.
- **회전행렬 + Gram-Schmidt**: 회전행렬을 반복 계산하다 보면 열벡터들이 완벽한 직교·단위길이에서 조금씩 벗어납니다(드리프트). 이 그래프는 일부러 살짝 흐트러뜨린 행렬을 **Gram-Schmidt 재직교화**(첫 열 정규화 → 둘째 열에서 첫 열 성분 제거 후 정규화 → 셋째 열은 외적으로 복원)로 복구한 뒤 적용합니다 — 그래서 다른 둘과 아주 살짝 다릅니다. 재직교화는 "직교성만" 복구할 뿐, 흐트러지기 전 값을 완벽히 되돌리지는 못합니다.
- **비교**

| | 숫자 개수 | 짐벌락 | 드리프트 복구 |
|---|---|---|---|
| 오일러 | 3 | 있음 | (그때그때 새로 계산하므로 해당 없음) |
| 쿼터니언 | 4 | 없음 | q / \\|q\\| (간단, 나눗셈 한 번) |
| 회전행렬 | 9 | 없음 | Gram-Schmidt 재직교화 (더 복잡, 완벽 복원은 아님) |

- **어디에 쓰이나요?** — 로봇 팔·드론·게임 카메라의 자세는 대부분 내부적으로 쿼터니언, 사용자 입력(조종기·UI)은 오일러로 받습니다. IMU로 각속도를 적분해 자세를 추적할 때 생기는 드리프트를 Gram-Schmidt나 쿼터니언 정규화로 보정합니다.
`;

type Mat3 = number[][];
type Quat = [number, number, number, number];
type Vec3 = [number, number, number];

function matMul(A: Mat3, B: Mat3): Mat3 {
  const C: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j]; C[i][j] = s; }
  return C;
}
function matVec(A: Mat3, v: number[]): Vec3 {
  return [
    A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
    A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
    A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2],
  ];
}
function transpose(M: Mat3): Mat3 {
  return [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];
}
function det3(M: Mat3): number {
  return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
    - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
}
function frobOrthoError(R: Mat3): number {
  const RtR = matMul(transpose(R), R);
  let s = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += (RtR[i][j] - (i === j ? 1 : 0)) ** 2;
  return Math.sqrt(s);
}

function rotX(deg: number): Mat3 { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
function rotY(deg: number): Mat3 { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
function rotZ(deg: number): Mat3 { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }

function rotMat(yawDeg: number, pitchDeg: number, rollDeg: number): Mat3 {
  return matMul(rotZ(rollDeg), matMul(rotX(pitchDeg), rotY(yawDeg)));
}

function crossV(a: number[], b: number[]): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalizeV(v: number[]): Vec3 { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; }
function dotV(a: number[], b: number[]): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/**
 * 실제 기계식 짐벌의 3개 회전축(월드 좌표계).
 * R = Rz(roll)·Rx(pitch)·Ry(yaw) 를 "롤을 바깥쪽 링(고정축), 피치를 가운데 링, 요를 안쪽 링"으로 풀어보면:
 *  - roll(바깥) 축은 항상 고정: (0,0,1)
 *  - pitch(가운데) 축은 roll이 회전시킨 만큼만 따라 움직임: Rz(roll)·(1,0,0)
 *  - yaw(안쪽) 축은 roll·pitch가 회전시킨 만큼 따라 움직임: Rz(roll)·Rx(pitch)·(0,1,0)
 * pitch=±90°에서 yaw축이 정확히 roll축과 같아진다(=짐벌락). 각 증분 회전을 수치미분해 검증된 식이다.
 */
function gimbalAxes(pitch: number, roll: number) {
  const rollAxis: Vec3 = [0, 0, 1];
  const pitchAxis = matVec(rotZ(roll), [1, 0, 0]);
  const yawAxis = matVec(matMul(rotZ(roll), rotX(pitch)), [0, 1, 0]);
  return { rollAxis, pitchAxis, yawAxis };
}

/** axis에 수직인 평면 위에 반지름 radius인 원(링)의 점들을 만든다. */
function ringPoints(axis: number[], radius: number, n = 40): Vec3[] {
  const ax = normalizeV(axis);
  const helper: Vec3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalizeV(crossV(ax, helper));
  const v = crossV(ax, u);
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push([radius * (c * u[0] + s * v[0]), radius * (c * u[1] + s * v[1]), radius * (c * u[2] + s * v[2])]);
  }
  return pts;
}

function ringPtsStr(axis: number[], radius: number) { return ringPoints(axis, radius).map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`).join(' '); }

/**
 * 링 위에서 "지금 이 각도만큼 돌았다"를 가리키는 바늘(시계바늘) 끝점.
 * ringPoints()와 정확히 같은 u,v 기준으로 각도만큼 돈 지점이라, 슬라이더를 움직이면 이 바늘이 링 위를 실제로 스윕한다.
 */
function ringPointer(axis: number[], radius: number, angleDeg: number): Vec3 {
  const ax = normalizeV(axis);
  const helper: Vec3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalizeV(crossV(ax, helper));
  const v = crossV(ax, u);
  const t = (angleDeg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return [radius * (c * u[0] + s * v[0]), radius * (c * u[1] + s * v[1]), radius * (c * u[2] + s * v[2])];
}

function axisQuat(axis: number[], angleDeg: number): Quat {
  const a = (angleDeg * Math.PI) / 180;
  const s = Math.sin(a / 2);
  return [Math.cos(a / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}
function qMul(a: number[], b: number[]): Quat {
  const [aw, ax, ay, az] = a, [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}
function qConj(q: number[]): Quat { return [q[0], -q[1], -q[2], -q[3]]; }

// 회전 순서(R = Rz·Rx·Ry)와 정확히 같은 순서로 축별 쿼터니언을 합성한다
function eulerToQuat(yawDeg: number, pitchDeg: number, rollDeg: number): Quat {
  const qy = axisQuat([0, 1, 0], yawDeg);
  const qx = axisQuat([1, 0, 0], pitchDeg);
  const qz = axisQuat([0, 0, 1], rollDeg);
  return qMul(qz, qMul(qx, qy));
}

/** 쿼터니언 손풀이: 행렬을 거치지 않고 v' = q·v·q⁻¹ 샌드위치 곱으로 벡터를 직접 돌린다. */
function rotateByQuat(q: number[], v: number[]): Vec3 {
  const p = [0, v[0], v[1], v[2]];
  const r = qMul(qMul(q, p), qConj(q));
  return [r[1], r[2], r[3]];
}

/** Gram-Schmidt 재직교화 손풀이: 열 0 정규화 → 열 1에서 열 0 성분 제거 후 정규화 → 열 2는 외적으로 복원. */
function gramSchmidt3(M: Mat3): Mat3 {
  const c0 = [M[0][0], M[1][0], M[2][0]];
  const c1 = [M[0][1], M[1][1], M[2][1]];
  const n0 = Math.hypot(...c0) || 1;
  const e0 = c0.map(v => v / n0);
  const d = e0[0] * c1[0] + e0[1] * c1[1] + e0[2] * c1[2];
  const c1o = [c1[0] - d * e0[0], c1[1] - d * e0[1], c1[2] - d * e0[2]];
  const n1 = Math.hypot(...c1o) || 1;
  const e1 = c1o.map(v => v / n1);
  const e2 = [e0[1] * e1[2] - e0[2] * e1[1], e0[2] * e1[0] - e0[0] * e1[2], e0[0] * e1[1] - e0[1] * e1[0]];
  return [[e0[0], e1[0], e2[0]], [e0[1], e1[1], e2[1]], [e0[2], e1[2], e2[2]]];
}

// 실제 드리프트를 흉내 낸 고정 노이즈(무작위가 아니라 매번 같은 값 — 슬라이더는 yaw/pitch/roll 하나뿐이라야 하므로)
const DRIFT_NOISE: Mat3 = [
  [0.03, -0.02, 0.01],
  [-0.015, 0.025, -0.02],
  [0.02, 0.01, 0.015],
];

const GIMBAL_DELTA = 15; // 짐벌락 증거용 고정 흔들림 각(도)
const AXES: { dir: Vec3; color: string; name: string }[] = [
  { dir: [1.4, 0, 0], color: '#f59e0b', name: 'x' },
  { dir: [0, 1.4, 0], color: '#8b5cf6', name: 'y' },
  { dir: [0, 0, 1.4], color: '#ec4899', name: 'z' },
];

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class MathRotationCompare extends w.HTMLElement {
    private yaw = 30;
    private pitch = 60;
    private roll = 20;

    private refresh() {
      const { yaw, pitch, roll } = this;
      const R = rotMat(yaw, pitch, roll);
      const q = eulerToQuat(yaw, pitch, roll);
      const Rn = R.map((row, i) => row.map((v, j) => v + DRIFT_NOISE[i][j]));
      const errBefore = frobOrthoError(Rn);
      const Rgs = gramSchmidt3(Rn);

      const shifted = rotMat(yaw + GIMBAL_DELTA, pitch, roll - GIMBAL_DELTA);
      const evidence = Math.hypot(...[0, 1, 2].flatMap(i => [0, 1, 2].map(j => R[i][j] - shifted[i][j])));
      const { rollAxis, pitchAxis, yawAxis } = gimbalAxes(pitch, roll);
      const risk = Math.abs(dotV(normalizeV(yawAxis), rollAxis)) * 100;
      const riskColor = risk > 80 ? '#ef4444' : risk > 40 ? '#f59e0b' : '#10b981';

      (['yaw', 'pitch', 'roll'] as const).forEach(k => {
        const el = this.shadowRoot?.querySelector(`#rc-${k}-val`) as HTMLElement;
        if (el) el.textContent = `${this[k].toFixed(0)}°`;
      });

      const gimbalNote = this.shadowRoot?.querySelector('#rc-gimbal-note') as HTMLElement;
      if (gimbalNote) {
        gimbalNote.style.color = riskColor;
        gimbalNote.innerHTML = `<div>축 정렬도 |yaw축·roll축| = ${(risk / 100).toFixed(2)} (1.00이면 두 링이 완전히 겹침 = 짐벌락)</div>` +
          (risk > 90 ? `<div style="font-weight:800">⚠ 짐벌락! 안쪽(요) 링과 바깥쪽(롤) 링이 같은 축이 되어, yaw·roll 슬라이더가 서로 같은 동작을 합니다.</div>` : '');
      }
      const ringYaw = this.shadowRoot?.querySelector('#rc-ring-yaw') as HTMLElement;
      if (ringYaw) { ringYaw.setAttribute('points', ringPtsStr(yawAxis, 1.0)); ringYaw.setAttribute('color', riskColor); }
      const axisYaw = this.shadowRoot?.querySelector('#rc-axis-yaw') as HTMLElement;
      if (axisYaw) { const t = normalizeV(yawAxis).map(v => v * 1.5); axisYaw.setAttribute('x2', t[0].toFixed(3)); axisYaw.setAttribute('y2', t[1].toFixed(3)); axisYaw.setAttribute('z2', t[2].toFixed(3)); axisYaw.setAttribute('color', riskColor); }
      const ringPitch = this.shadowRoot?.querySelector('#rc-ring-pitch') as HTMLElement;
      if (ringPitch) ringPitch.setAttribute('points', ringPtsStr(pitchAxis, 1.5));
      const axisPitch = this.shadowRoot?.querySelector('#rc-axis-pitch') as HTMLElement;
      if (axisPitch) { const t = normalizeV(pitchAxis).map(v => v * 2.0); axisPitch.setAttribute('x2', t[0].toFixed(3)); axisPitch.setAttribute('y2', t[1].toFixed(3)); axisPitch.setAttribute('z2', t[2].toFixed(3)); }

      // 링 위를 실제로 스윕하는 바늘 — roll/pitch/yaw 슬라이더를 움직이면 각자 자기 바늘이 링 위에서 움직인다
      const setNeedle = (id: string, axis: Vec3, radius: number, angleDeg: number, label: string) => {
        const el = this.shadowRoot?.querySelector(id) as HTMLElement;
        if (!el) return;
        const p = ringPointer(axis, radius, angleDeg);
        el.setAttribute('x2', p[0].toFixed(3)); el.setAttribute('y2', p[1].toFixed(3)); el.setAttribute('z2', p[2].toFixed(3));
        el.setAttribute('label', label);
      };
      setNeedle('#rc-needle-roll', rollAxis, 2.0, roll, `roll ${roll.toFixed(0)}°`);
      setNeedle('#rc-needle-pitch', pitchAxis, 1.5, pitch, `pitch ${pitch.toFixed(0)}°`);
      setNeedle('#rc-needle-yaw', yawAxis, 1.0, yaw, `yaw ${yaw.toFixed(0)}°`);
      const needleYaw = this.shadowRoot?.querySelector('#rc-needle-yaw') as HTMLElement;
      if (needleYaw) needleYaw.setAttribute('color', riskColor);

      const summary = this.shadowRoot?.querySelector('#rc-summary') as HTMLElement;
      if (summary) { summary.style.color = riskColor; summary.textContent = `짐벌락 위험도 ${risk.toFixed(0)}% — 오일러(${yaw.toFixed(0)}°,${pitch.toFixed(0)}°,${roll.toFixed(0)}°) = 쿼터니언(${q[0].toFixed(2)},${q[1].toFixed(2)},${q[2].toFixed(2)},${q[3].toFixed(2)})`; }

      const euNote = this.shadowRoot?.querySelector('#rc-euler-note') as HTMLElement;
      if (euNote) euNote.innerHTML = `<div>R = Rz·Rx·Ry 행렬 곱으로 계산</div><div style="color:${riskColor}">yaw+${GIMBAL_DELTA}°,roll-${GIMBAL_DELTA}°로 바꾸면 → 행렬 차이 = ${evidence.toFixed(6)} ${evidence < 1e-4 ? '(0에 가까움 → 짐벌락!)' : ''}</div>`;

      const quNote = this.shadowRoot?.querySelector('#rc-quat-note') as HTMLElement;
      if (quNote) quNote.innerHTML = `<div>q = qz⊗qx⊗qy 사원수 곱, v' = q·v·q⁻¹ 로 직접 회전 (행렬 안 거침)</div><div>q = (${q[0].toFixed(3)}, ${q[1].toFixed(3)}, ${q[2].toFixed(3)}, ${q[3].toFixed(3)})</div>`;

      const gsNote = this.shadowRoot?.querySelector('#rc-gs-note') as HTMLElement;
      if (gsNote) gsNote.innerHTML = `<div>R에 고정 노이즈를 섞은 뒤(재직교화 오차 ${errBefore.toFixed(3)}) Gram-Schmidt로 복구</div><div>복구 후 det(R)=${det3(Rgs).toFixed(6)}, 재직교화 오차 ${frobOrthoError(Rgs).toExponential(2)}</div>`;

      const setPanel = (prefix: string, rotate: (dir: Vec3) => Vec3) => {
        AXES.forEach((ax, i) => {
          const tip = rotate(ax.dir);
          const el = this.shadowRoot?.querySelector(`#${prefix}-${ax.name}`) as HTMLElement;
          if (!el) return;
          el.setAttribute('x2', tip[0].toFixed(3)); el.setAttribute('y2', tip[1].toFixed(3)); el.setAttribute('z2', tip[2].toFixed(3));
        });
      };
      setPanel('rc-eu', dir => matVec(R, dir));
      setPanel('rc-qu', dir => rotateByQuat(q, dir));
      setPanel('rc-gs', dir => matVec(Rgs, dir));
    }

    @addEventListener('#rc-yaw', 'input')
    onYaw(e: Event) { this.yaw = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#rc-pitch', 'input')
    onPitch(e: Event) { this.pitch = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }
    @addEventListener('#rc-roll', 'input')
    onRoll(e: Event) { this.roll = Number((e.target as HTMLInputElement).value) || 0; this.refresh(); }

    @onConnectedBodyShadow
    render() {
      const { yaw, pitch, roll } = this;
      const R = rotMat(yaw, pitch, roll);
      const q = eulerToQuat(yaw, pitch, roll);
      const Rn = R.map((row, i) => row.map((v, j) => v + DRIFT_NOISE[i][j]));
      const errBefore = frobOrthoError(Rn);
      const Rgs = gramSchmidt3(Rn);

      const shifted = rotMat(yaw + GIMBAL_DELTA, pitch, roll - GIMBAL_DELTA);
      const evidence = Math.hypot(...[0, 1, 2].flatMap(i => [0, 1, 2].map(j => R[i][j] - shifted[i][j])));
      const { rollAxis, pitchAxis, yawAxis } = gimbalAxes(pitch, roll);
      const risk = Math.abs(dotV(normalizeV(yawAxis), rollAxis)) * 100;
      const riskColor = risk > 80 ? '#ef4444' : risk > 40 ? '#f59e0b' : '#10b981';
      const yawAxisUnit = normalizeV(yawAxis).map(v => v * 1.5);
      const pitchAxisUnit = normalizeV(pitchAxis).map(v => v * 2.0);
      const rollAxisUnit = rollAxis.map(v => v * 2.5);
      const rollNeedle = ringPointer(rollAxis, 2.0, roll);
      const pitchNeedle = ringPointer(pitchAxis, 1.5, pitch);
      const yawNeedle = ringPointer(yawAxis, 1.0, yaw);

      const panel = (id: string, title: string, formula: string, rotate: (dir: Vec3) => Vec3, noteId: string, noteHtml: string) => {
        const tags = AXES.map(ax => {
          const tip = rotate(ax.dir);
          return `<vector3d id="${id}-${ax.name}" x1="0" y1="0" z1="0" x2="${tip[0].toFixed(3)}" y2="${tip[1].toFixed(3)}" z2="${tip[2].toFixed(3)}" color="${ax.color}" label="${ax.name}"></vector3d>`;
        }).join('\n            ');
        return `
        <div class="rc-panel">
          <div class="rc-panel-title">${title}</div>
          <div class="rc-panel-formula">${formula}</div>
          <cartesian-chart-3d range="2.2" hide-controls style="height:230px">
            ${tags}
          </cartesian-chart-3d>
          <div class="math-notes" id="${noteId}">${noteHtml}</div>
        </div>`;
      };

      return `
        <style>
          :host { display:block; }
          .math-formula { font-size:15px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          .math-desc { font-size:12px; color:#64748b; margin-bottom:8px; }
          .math-notes { font-size:11.5px; font-weight:700; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; margin-top:6px; line-height:1.6; }
          .ctl { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#475569; margin-top:8px; }
          .ctl label { display:flex; align-items:center; gap:8px; flex:1; }
          .ctl input[type="range"] { flex:1; }
          .ctl b { min-width:44px; text-align:right; color:#1e293b; }
          .rc-summary { font-size:13px; font-weight:800; margin:10px 0; }
          .rc-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:10px; }
          @media (max-width:760px) { .rc-grid { grid-template-columns:1fr; } }
          .rc-panel { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:10px; }
          .rc-panel-title { font-size:13px; font-weight:800; color:#1e293b; margin-bottom:2px; }
          .rc-panel-formula { font-size:11px; color:#64748b; margin-bottom:6px; }
          .rc-legend { font-size:10.5px; color:#94a3b8; margin-top:4px; }
          .rc-gimbal { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin-top:8px; }
          .md { font-size:13px; color:#334155; line-height:1.7; margin-top:16px; border-top:1px solid #f1f5f9; padding-top:10px; }
          .md h2 { font-size:14px; font-weight:800; color:#1e293b; margin:0 0 6px; }
          .md p { margin:0 0 6px; }
          .md ul { margin:0 0 6px; padding-left:18px; }
          .md table { border-collapse:collapse; font-size:12px; margin:6px 0; }
          .md th, .md td { border:1px solid #e2e8f0; padding:4px 8px; text-align:center; }
          .md th { background:#f8fafc; }
          .md code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12px; }
        </style>
        <div class="math-formula">짐벌락, 실제로 보기 — 기계식 짐벌 3중 링</div>
        <div class="math-desc">회색 링(바깥, roll축=항상 고정)·파랑 링(가운데, pitch축)·위험도에 따라 색이 바뀌는 안쪽 링(yaw축)이 실제 짐벌 구조입니다. 각 링 위의 굵은 바늘이 그 슬라이더가 지금 돈 각도만큼 링 위를 실제로 스윕합니다 — yaw를 움직이면 안쪽(빨강 계열) 바늘이, roll을 움직이면 바깥(회색) 바늘이 움직입니다. pitch를 ±90°에 가깝게 올리면 두 링이 겹쳐서, yaw 바늘과 roll 바늘이 같은 평면에서 도는 게 보입니다(=짐벌락).</div>
        <div class="rc-gimbal">
          <cartesian-chart-3d range="2.8" style="height:300px">
            <polygon3d points="${ringPtsStr(rollAxis, 2.0)}" color="#94a3b8" label="roll(바깥)"></polygon3d>
            <polygon3d id="rc-ring-pitch" points="${ringPtsStr(pitchAxis, 1.5)}" color="#0ea5e9" label="pitch(가운데)"></polygon3d>
            <polygon3d id="rc-ring-yaw" points="${ringPtsStr(yawAxis, 1.0)}" color="${riskColor}" label="yaw(안쪽)"></polygon3d>
            <vector3d x1="0" y1="0" z1="0" x2="${rollAxisUnit[0].toFixed(3)}" y2="${rollAxisUnit[1].toFixed(3)}" z2="${rollAxisUnit[2].toFixed(3)}" color="#94a3b8"></vector3d>
            <vector3d id="rc-axis-pitch" x1="0" y1="0" z1="0" x2="${pitchAxisUnit[0].toFixed(3)}" y2="${pitchAxisUnit[1].toFixed(3)}" z2="${pitchAxisUnit[2].toFixed(3)}" color="#0ea5e9"></vector3d>
            <vector3d id="rc-axis-yaw" x1="0" y1="0" z1="0" x2="${yawAxisUnit[0].toFixed(3)}" y2="${yawAxisUnit[1].toFixed(3)}" z2="${yawAxisUnit[2].toFixed(3)}" color="${riskColor}"></vector3d>
            <vector3d id="rc-needle-roll" x1="0" y1="0" z1="0" x2="${rollNeedle[0].toFixed(3)}" y2="${rollNeedle[1].toFixed(3)}" z2="${rollNeedle[2].toFixed(3)}" color="#94a3b8" width="3.5" label="roll ${roll.toFixed(0)}°"></vector3d>
            <vector3d id="rc-needle-pitch" x1="0" y1="0" z1="0" x2="${pitchNeedle[0].toFixed(3)}" y2="${pitchNeedle[1].toFixed(3)}" z2="${pitchNeedle[2].toFixed(3)}" color="#0ea5e9" width="3.5" label="pitch ${pitch.toFixed(0)}°"></vector3d>
            <vector3d id="rc-needle-yaw" x1="0" y1="0" z1="0" x2="${yawNeedle[0].toFixed(3)}" y2="${yawNeedle[1].toFixed(3)}" z2="${yawNeedle[2].toFixed(3)}" color="${riskColor}" width="3.5" label="yaw ${yaw.toFixed(0)}°"></vector3d>
          </cartesian-chart-3d>
          <div class="math-notes" id="rc-gimbal-note" style="color:${riskColor}">
            <div>축 정렬도 |yaw축·roll축| = ${(risk / 100).toFixed(2)} (1.00이면 두 링이 완전히 겹침 = 짐벌락)</div>
            ${risk > 90 ? `<div style="font-weight:800">⚠ 짐벌락! 안쪽(요) 링과 바깥쪽(롤) 링이 같은 축이 되어, yaw·roll 슬라이더가 서로 같은 동작을 합니다.</div>` : ''}
          </div>
        </div>

        <div class="ctl"><label>yaw <input id="rc-yaw" type="range" min="0" max="360" step="1" value="${yaw}"><b id="rc-yaw-val">${yaw.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>pitch <input id="rc-pitch" type="range" min="-90" max="90" step="1" value="${pitch}"><b id="rc-pitch-val">${pitch.toFixed(0)}°</b></label></div>
        <div class="ctl"><label>roll <input id="rc-roll" type="range" min="0" max="360" step="1" value="${roll}"><b id="rc-roll-val">${roll.toFixed(0)}°</b></label></div>

        <div class="math-formula" style="margin-top:16px">하나의 컨트롤러(yaw·pitch·roll) → 서로 다른 계산식 3개 → 같은 자세</div>
        <div class="math-desc">몸체 축(주황=x, 보라=y, 분홍=z)이 세 그래프에서 거의 똑같이 움직이는지 비교하세요. 드래그로 각 그래프를 따로 돌려볼 수 있습니다.</div>
        <div class="rc-summary" id="rc-summary" style="color:${riskColor}">짐벌락 위험도 ${risk.toFixed(0)}% — 오일러(${yaw.toFixed(0)}°,${pitch.toFixed(0)}°,${roll.toFixed(0)}°) = 쿼터니언(${q[0].toFixed(2)},${q[1].toFixed(2)},${q[2].toFixed(2)},${q[3].toFixed(2)})</div>

        <div class="rc-grid">
          ${panel('rc-eu', '① 오일러 (행렬 곱)', 'R = Rz(roll)·Rx(pitch)·Ry(yaw)', dir => matVec(R, dir), 'rc-euler-note',
            `<div>R = Rz·Rx·Ry 행렬 곱으로 계산</div><div style="color:${riskColor}">yaw+${GIMBAL_DELTA}°,roll-${GIMBAL_DELTA}°로 바꾸면 → 행렬 차이 = ${evidence.toFixed(6)} ${evidence < 1e-4 ? '(0에 가까움 → 짐벌락!)' : ''}</div>`)}
          ${panel('rc-qu', '② 쿼터니언 (사원수 곱)', "v' = q·v·q⁻¹", dir => rotateByQuat(q, dir), 'rc-quat-note',
            `<div>q = qz⊗qx⊗qy 사원수 곱, v' = q·v·q⁻¹ 로 직접 회전 (행렬 안 거침)</div><div>q = (${q[0].toFixed(3)}, ${q[1].toFixed(3)}, ${q[2].toFixed(3)}, ${q[3].toFixed(3)})</div>`)}
          ${panel('rc-gs', '③ 행렬 + Gram-Schmidt', '노이즈 낀 R → 재직교화', dir => matVec(Rgs, dir), 'rc-gs-note',
            `<div>R에 고정 노이즈를 섞은 뒤(재직교화 오차 ${errBefore.toFixed(3)}) Gram-Schmidt로 복구</div><div>복구 후 det(R)=${det3(Rgs).toFixed(6)}, 재직교화 오차 ${frobOrthoError(Rgs).toExponential(2)}</div>`)}
        </div>
        <div class="rc-legend">몸체 축: <b style="color:#f59e0b">■</b> x <b style="color:#8b5cf6">■</b> y <b style="color:#ec4899">■</b> z (그래프의 빨강·초록·파랑은 월드 좌표계)</div>

        <div class="md">${marked.parse(MD) as string}</div>
      `;
    }
  }

  return tagName;
};
