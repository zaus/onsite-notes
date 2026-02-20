const path = require('path');

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  entry: {
    app: './src/renderer/app.js',
    autocomplete: './src/renderer/autocomplete.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: '[name].bundle.js'
  },
  resolve: {
    extensions: ['.js']
  },
  target: 'web'
};
