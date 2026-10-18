// 사전의 정의(def)를 재귀로 펼쳐 "실제로 오가는 데이터 모양"을 만든다.
// - echoYaml: ros2 topic echo가 찍는 블록 YAML
// - json: rosbridge·roslibjs 등에서 받는 JSON
// - flowYaml: ros2 topic pub / service call / action send_goal 인자용 한 줄 YAML
import { MSG_DOCS } from './RosMsgsData';

type Node =
  | { t: 'p'; type: string; v: string }               // 원시값 (출력용 문자열로 보관)
  | { t: 'o'; fields: [string, Node][]; unknown?: string }
  | { t: 'a'; items: Node[]; prim: boolean };

const INT = /^(u?int(8|16|32|64)|byte|char)$/;
const FLOAT = /^float(32|64)$/;

const MSG_DEF = new Map(MSG_DOCS.filter(d => d.kind === 'msg').map(d => [d.id, d.def]));

/** 정의의 n번째 구역(--- 로 나뉜)에서 필드만 [타입, 이름, 기본값] 으로 */
const fieldsOf = (def: string, section = 0): [string, string, string | undefined][] =>
  (def.split(/^---$/m)[section] ?? '').split('\n')
    .map(l => l.split('#')[0].trim())
    .filter(l => l && !/^\S+\s+\w+\s*=/.test(l))           // 상수(NAME=VALUE) 제외
    .map(l => l.split(/\s+/))
    .filter(t => t.length >= 2)
    .map(([type, name, ...rest]) => [type, name, rest.length ? rest.join(' ') : undefined]);

const prim = (type: string, dflt?: string): Node => {
  if (type === 'bool') return { t: 'p', type, v: dflt === 'true' ? 'true' : 'false' };
  if (type === 'string' || type === 'wstring') return { t: 'p', type, v: dflt ?? "''" };
  if (FLOAT.test(type)) {
    const n = dflt !== undefined ? Number(dflt) : 0;
    return { t: 'p', type, v: Number.isInteger(n) ? n.toFixed(1) : String(n) };
  }
  return { t: 'p', type, v: dflt ?? '0' };
};

const isPrim = (type: string) => type === 'bool' || type === 'string' || type === 'wstring' || FLOAT.test(type) || INT.test(type);

const build = (type: string, dflt: string | undefined, depth: number): Node => {
  // T[] (가변) · T[N] (고정) · T[<=N] (상한) — 고정 길이만 원소를 채우고 나머지는 빈 배열
  const arr = type.match(/^(.*)\[([^\]]*)\]$/);
  if (arr) {
    const elem = arr[1].replace(/<=\d+/, '');
    const fixed = /^\d+$/.test(arr[2]) ? Number(arr[2]) : 0;
    const one = build(elem, undefined, depth);
    return { t: 'a', prim: isPrim(elem), items: Array.from({ length: fixed }, () => one) };
  }
  const base = type.replace(/<=\d+/, '');
  if (isPrim(base)) return prim(base, dflt);
  const def = MSG_DEF.get(base.replace('/msg/', '/'));
  if (!def || depth > 8) return { t: 'o', fields: [], unknown: base };
  return { t: 'o', fields: fieldsOf(def).map(([ft, fn, fd]) => [fn, build(ft, fd, depth + 1)]) };
};

/** def의 section번째 구역을 펼친 노드 (msg: 0, srv: 0 요청·1 응답, action: 0 goal·1 result·2 feedback) */
export const shapeOf = (def: string, section = 0): Node =>
  ({ t: 'o', fields: fieldsOf(def, section).map(([ft, fn, fd]) => [fn, build(ft, fd, 0)]) });

export const sectionCount = (def: string) => def.split(/^---$/m).length;

const LONG = 4; // 긴 고정 배열은 echo YAML에서 줄여서 보여 줌

/** ros2 topic echo 스타일 블록 YAML */
export const echoYaml = (n: Node): string => {
  const lines: string[] = [];
  const emit = (node: Node, indent: string) => {
    if (node.t !== 'o') return;
    if (!node.fields.length) { lines.push(`${indent}{}`); return; }
    for (const [k, v] of node.fields) {
      if (v.t === 'p') lines.push(`${indent}${k}: ${v.v}`);
      else if (v.t === 'o') {
        if (!v.fields.length) lines.push(`${indent}${k}: {}${v.unknown ? `   # ${v.unknown} (이 사전에 없는 타입)` : ''}`);
        else { lines.push(`${indent}${k}:`); emit(v, indent + '  '); }
      } else if (!v.items.length) lines.push(`${indent}${k}: []`);
      else if (v.prim) {
        lines.push(`${indent}${k}:`);
        const show = v.items.length > LONG ? v.items.slice(0, 2) : v.items;
        show.forEach(it => lines.push(`${indent}- ${(it as { v: string }).v}`));
        if (v.items.length > LONG) lines.push(`${indent}- ...   # 총 ${v.items.length}개`);
      } else {
        lines.push(`${indent}${k}:`);
        v.items.forEach(it => {
          const sub: string[] = [];
          const save = lines.length;
          emit(it, indent + '  ');
          sub.push(...lines.splice(save));
          if (sub.length) sub[0] = `${indent}- ${sub[0].trimStart()}`;
          lines.push(...sub);
        });
      }
    }
  };
  emit(n, '');
  return lines.join('\n') + '\n---';
};

const jsonPrim = (p: { type: string; v: string }) =>
  p.v === "''" ? '""' : p.type === 'string' || p.type === 'wstring' ? JSON.stringify(p.v.replace(/^['"]|['"]$/g, '')) : p.v;

/** JSON — 원시값 배열은 한 줄로 */
export const json = (n: Node, indent = ''): string => {
  if (n.t === 'p') return jsonPrim(n);
  if (n.t === 'a') {
    if (!n.items.length) return '[]';
    if (n.prim) return `[${n.items.map(i => json(i)).join(', ')}]`;
    return `[\n${n.items.map(i => indent + '  ' + json(i, indent + '  ')).join(',\n')}\n${indent}]`;
  }
  if (!n.fields.length) return '{}';
  return `{\n${n.fields.map(([k, v]) => `${indent}  "${k}": ${json(v, indent + '  ')}`).join(',\n')}\n${indent}}`;
};

/** 한 줄 YAML (CLI 인자용) */
export const flowYaml = (n: Node): string => {
  if (n.t === 'p') return n.v;
  if (n.t === 'a') return `[${n.items.map(flowYaml).join(', ')}]`;
  return `{${n.fields.map(([k, v]) => `${k}: ${flowYaml(v)}`).join(', ')}}`;
};
