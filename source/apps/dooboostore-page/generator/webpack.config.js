const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const NodemonPlugin = require('nodemon-webpack-plugin');

module.exports = {
  target: 'node',
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: 'source-map',
  entry: path.resolve(__dirname, 'index.ts'),
  output: {
    path: path.resolve(__dirname, '../dist-generator'),
    filename: 'index.js',
    clean: true
  },
  // devServer: {
  //   hot: false,
  //   client: false,
  //   compress: false,
  //   host: 'localhost',
  //   port: 3000,
  //   static: false,
  //   devMiddleware: {
  //     writeToDisk: true
  //   }
  // },
  plugins: [
    new NodemonPlugin({
      script: path.resolve(__dirname, '../dist-generator/index.js'),
      watch: path.resolve(__dirname, '../dist-generator'),
      nodeArgs: ['--inspect']
    })
  ],
  module: {
    rules: [
      {
        test: /\.worker\.ts$/, // Worker 파일専용 규칙
        use: [
          {
            loader: 'worker-loader',
            options: {
              filename: '[name].worker.js' // 출력 파일 이름
            }
          },
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, './tsconfig.json'),
              transpileOnly: true,
              compilerOptions: {
                sourceMap: true
              }
            }
          }
        ],
        exclude: /node_modules/
      },
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.json'),
            transpileOnly: true,
            compilerOptions: {
              sourceMap: true
            }
          }
        },
        exclude: /node_modules\/(?!@dooboostore)/
      },
      {
        test: /\.html$/,
        use: 'raw-loader'
      },
      {
        test: /\.css$/,
        use: 'raw-loader'
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js', '.html', '.css'],
    plugins: [new TsconfigPathsPlugin()],
    alias: {
      '@back-end': path.resolve(__dirname),
      '@src': path.resolve(__dirname, '../src'),
      '@front-end': path.resolve(__dirname,'../front-end'),
    },
    modules: [
      'node_modules',
      path.resolve(__dirname, '..'),
      path.resolve(__dirname, '../..'),
      path.resolve(__dirname, '../../../')
    ]
  },
  externals: {
    'canvas': 'commonjs canvas',
    'utf-8-validate': 'commonjs utf-8-validate',
    'bufferutil': 'commonjs bufferutil'
  },
  optimization: {
    minimize: false
  },
  node: {
    __dirname: true
  }
};
