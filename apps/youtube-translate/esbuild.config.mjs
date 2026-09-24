import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';

// youtube-translate 번들 옵션
// playwright 계열은 external — 설치된 패키지 + 브라우저 바이너리를 그대로 씀
export const buildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/index.cjs',
  logLevel: 'warning',
  external: [
    'playwright',
    'playwright-core',
    'fsevents',
    'bufferutil',
    'utf-8-validate',
    'electron',
    'chromium-bidi'
  ]
};

// 빌드 1회: node esbuild.config.mjs
// dev(watch+rerun): node esbuild.config.mjs --dev
const isDev = process.argv.includes('--dev');

if (!isDev) {
  await esbuild.build(buildOptions);
  console.log('✅ build done: dist/index.cjs');
} else {
  let child = null;

  const run = () => {
    try {
      child?.kill();
    } catch {
      // ignore
    }
    child = spawn('node', ['dist/index.cjs'], { stdio: 'inherit' });
  };

  const rerunPlugin = {
    name: 'rerun-on-rebuild',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length > 0) {
          console.error('❌ rebuild failed');
          return;
        }
        console.log('🔁 rebuilt — rerun');
        run();
      });
    }
  };

  const ctx = await esbuild.context({ ...buildOptions, plugins: [rerunPlugin] });
  await ctx.watch();
  await ctx.rebuild(); // 초기 빌드 — onEnd에서 run() 1회 실행됨
  console.log('👀 watching src/ ...');
}
