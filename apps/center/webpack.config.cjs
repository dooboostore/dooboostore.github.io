const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    publicPath: '/'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            experimentalWatchApi: true
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      '@center-src': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
      inject: 'body'
    }),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: '404.html',
      inject: 'body'
    }),
    new CopyPlugin({
      patterns: [
        { from: "../../assets", to: "assets" },
        { from: "../../datas", to: "datas" },
      ],
    }),
  ],
  devServer: {
    port: 3001,
    hot: true,
    historyApiFallback: true,
    static: {
      directory: path.join(__dirname, 'dist')
    },
    devMiddleware: {
      publicPath: '/'
    }
  },
  devtool: 'source-map'
};
