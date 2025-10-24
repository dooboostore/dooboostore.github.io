const path = require('path');
const NodemonPlugin = require('nodemon-webpack-plugin');

module.exports = {
  entry: './papago/index.ts',
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
    path: path.resolve(__dirname, '../dist-papago'),
  },
  plugins: [
    new NodemonPlugin({
      script: './dist-papago/index.js',
      watch: path.resolve('./dist-papago'),
      ignore: ['*.js.map'],
      verbose: true,
      ext: 'js,njk,json'
    })
  ]
};