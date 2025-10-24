const path = require('path');
const NodemonPlugin = require('nodemon-webpack-plugin');

module.exports = {
  entry: './youtube/index.ts',
  target: 'node',
  mode: 'development',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.json')
          }
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, '../dist-youtube'),
  },
  externals: {
    // Playwright 관련 모듈들을 external로 처리
    'playwright': 'commonjs playwright',
    'playwright-core': 'commonjs playwright-core',
    // 기타 Node.js 네이티브 모듈들
    'fsevents': 'commonjs fsevents',
    'bufferutil': 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    'electron': 'commonjs electron',
    'chromium-bidi': 'commonjs chromium-bidi'
  },
  node: {
    // Node.js 글로벌 변수들을 사용할 수 있도록 설정
    __dirname: false,
    __filename: false,
  },
  plugins: [
    new NodemonPlugin({
      script: './dist-youtube/index.js',
      watch: path.resolve('./dist-youtube'),
      ignore: ['*.js.map'],
      verbose: true,
      ext: 'js,njk,json'
    })
  ]
};