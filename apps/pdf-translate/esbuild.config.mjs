import * as esbuild from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';

// pdf-translate 번들 옵션 (build/dev/test 공통)
// 앱 진입점은 src/cli.ts — src/index.ts는 테스트에서 import해도 실행되지 않는 순수 모듈
// playwright는 번들하지 않고 설치된 패키지를 그대로 씀
export const buildOptions = {
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/index.cjs',
  logLevel: 'warning',
  external: ['playwright', 'playwright-core']
};

// 빌드 1회: node esbuild.config.mjs
// dev(watch+rerun): node esbuild.config.mjs --dev [pdf-path]
// test: node esbuild.config.mjs --test
const isDev = process.argv.includes('--dev');
const isTest = process.argv.includes('--test');

if (isTest) {
  await esbuild.build({ ...buildOptions, entryPoints: ['test/index.test.ts'], outfile: 'dist-test/index.test.cjs' });
  console.log('✅ test build done: dist-test/index.test.cjs');
  const result = spawnSync('node', ['--test', 'dist-test/index.test.cjs'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} else if (!isDev) {
  await esbuild.build(buildOptions);
  console.log('✅ build done: dist/index.cjs');
} else {
  const pdfArg = process.argv.filter((a) => a !== '--dev')[2];
  let child = null;

  const run = () => {
    try {
      child?.kill();
    } catch {
      // ignore
    }
    const args = ['dist/index.cjs'];
    if (pdfArg) args.push(pdfArg);
    child = spawn('node', args, { stdio: 'inherit' });
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
