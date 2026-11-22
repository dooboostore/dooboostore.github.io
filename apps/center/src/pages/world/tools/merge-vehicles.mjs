// 탈것(entity.json + body/parts) → 단일 SVG 로 합친다.
//
// 왜: 바퀴·그림자를 parts 로 쪼개 두면 탈것 하나에 파일 4개(entity.json/body/wheel/shadow)가 생긴다.
//     탈것은 조합할 일이 거의 없고(사람처럼 앞/뒤/옆 view 도 없다) 파일만 늘어난다.
//     body.svg 안에 바퀴(회전 SMIL 유지)·그림자를 그대로 박아 `<이름>.svg` 하나로 만든다.
//     (사람·동물처럼 view/parts 조합이 필요한 것은 그대로 둔다 — entity.json 방식은 유지)
//
// 사용: node apps/center/src/pages/world/tools/merge-vehicles.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'datas/world/entities';
const INDEX = 'datas/world/entities.json';
const dry = process.argv.includes('--dry');

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const readSvg = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i);
  if (!m) throw new Error('svg 아님: ' + file);
  const attrs = m[1];
  const vb = (attrs.match(/viewBox="([^"]+)"/)?.[1] ?? '').split(/[\s,]+/).map(Number);
  const foot = attrs.match(/data-foot="([^"]+)"/)?.[1]?.split(/\s+/).map(Number);
  return { text, inner: m[2], viewBox: vb, foot };
};

// parts/wheel.svg 처럼 viewBox 중심이 원점인 부품을 at 에 놓는 transform
const place = (at, vb, foot, scale) => {
  const fx = vb[0] + (foot?.[0] ?? 0.5) * vb[2];
  const fy = vb[1] + (foot?.[1] ?? 0.5) * vb[3];
  return `translate(${at[0]} ${at[1]}) translate(${-(fx * scale).toFixed(3)} ${-(fy * scale).toFixed(3)}) scale(${scale})`;
};

const prefixIds = (text, prefix) =>
  text.replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`).replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`);

const files = walk(ROOT).filter((f) => f.endsWith('entity.json'));
const targets = files
  .map((f) => path.dirname(f))
  .map((dir) => dir.replace(ROOT + '/', ''))
  .filter((id) => id.split('/').includes('vehicle'));

const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const renamed = new Map();

for (const id of targets) {
  const dir = path.join(ROOT, id);
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'entity.json'), 'utf8'));
  if (json.views || !json.svg) {
    console.warn('건너뜀 (views 있음):', id);
    continue;
  }
  const body = readSvg(path.join(dir, json.svg));
  const parts = json.parts ?? [];
  const out = [];
  const under = [];
  const over = [];

  for (const [i, p] of parts.entries()) {
    const part = readSvg(path.join(ROOT, p.use));
    const s = p.scale ?? 1;
    let inner = prefixIds(part.inner, `p${i}-`);
    // 회전하는 부품(바퀴): at(발 위치)을 축으로 계속 돈다 (원래 parts 의 anim:spin 과 같은 0.9초)
    if (p.anim === 'spin') {
      const fx = part.viewBox[0] + (part.foot?.[0] ?? 0.5) * part.viewBox[2];
      const fy = part.viewBox[1] + (part.foot?.[1] ?? 0.5) * part.viewBox[3];
      inner =
        `<g transform="translate(${p.at[0]} ${p.at[1]})"><g>` +
        `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.9s" repeatCount="indefinite"/>` +
        `<g transform="translate(${-(fx * s).toFixed(3)} ${-(fy * s).toFixed(3)}) scale(${s})">${inner}</g>` +
        `</g></g>`;
    } else {
      inner = `<g transform="${place(p.at, part.viewBox, part.foot, s)}">${inner}</g>`;
    }
    (p.under ? under : over).push(inner);
  }

  const foot = json.foot ?? [0.5, 1];
  const footAttr = foot[0] === 0.5 && foot[1] === 1 ? '' : ` data-foot="${foot[0]} ${foot[1]}"`;
  const name = path.basename(id);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${body.viewBox.join(' ')}"${footAttr}>\n` +
    `  <!-- ${name} — 바퀴·그림자를 body 안에 합친 단일 SVG (tools/merge-vehicles.mjs) -->\n` +
    [...under, body.inner.trim(), ...over].map((s) => '  ' + s.trim()).join('\n') +
    `\n</svg>\n`;

  const outFile = path.join(ROOT, id + '.svg');
  if (!dry) {
    fs.writeFileSync(outFile, svg);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  renamed.set(id, id + '.svg');
  console.log('합침:', id, '→', path.basename(outFile), `(${parts.length} parts)`);
}

if (!dry) {
  // 색인 갱신
  for (const e of index.entities) if (renamed.has(e.id)) e.id = renamed.get(e.id);
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n');

  // 참조 갱신 (sector.json · world.json · worlds.json …)
  const jsons = walk('datas/world').filter((f) => f.endsWith('.json'));
  let refs = 0;
  for (const f of jsons) {
    let t = fs.readFileSync(f, 'utf8');
    const before = t;
    for (const [oldId, newId] of renamed) t = t.replaceAll(`"use": "${oldId}"`, `"use": "${newId}"`);
    if (t !== before) {
      fs.writeFileSync(f, t);
      refs++;
    }
  }
  console.log(`참조 갱신한 파일 ${refs}개 · 이름 바꾼 탈것 ${renamed.size}개`);
}
