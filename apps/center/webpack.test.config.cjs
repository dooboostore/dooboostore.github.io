// 테스트 번들 — 프로덕션과 동일한 ts-loader/decorator/모듈 해석으로 묶어 node --test로 실행.
// tsx 대신 webpack을 쓰는 이유: CJS/ESM interop·데코레이터 변환을 실빌드와 일치시키기 위함.
const path = require('path');

module.exports = {
  mode: 'development',
  target: 'node',
  entry: {
    'strategy.test': './test/strategy.test.ts',
  },
  output: {
    filename: '[name].cjs',
    path: path.resolve(__dirname, 'dist-test'),
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      '@center-src': path.resolve(__dirname, 'src'),
    },
  },
  devtool: false,
};
