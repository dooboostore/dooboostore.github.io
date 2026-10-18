const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './src/load-html.ts',
  output: {
    filename: 'load-html.cjs',
    path: path.resolve(__dirname, 'dist-ssr'),
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
  externalsPresets: { node: true },
  externalsType: 'commonjs',
  externals: [/^@dooboostore\//],
  devtool: 'source-map',
};
