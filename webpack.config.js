const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const mode = argv.mode || 'development';
  const isDevelopment = mode === 'development';

  return {
      mode: mode,
      devtool: isDevelopment ? 'source-map' : false,
      entry: {
        app: './src/renderer/app.js',
        autocomplete: './src/renderer/autocomplete.js'
      },
      output: {
        path: path.resolve(__dirname, 'dist/renderer'),
        filename: '[name].bundle.js'
      },
      plugins: [
        new CopyPlugin({
          patterns: [
            { from: 'src/renderer/index.html', to: 'index.html' },
            { from: 'src/renderer/style.css', to: 'style.css' },
            { from: 'src/renderer/llmSearch.css', to: 'llmSearch.css' }
          ]
        })
      ],
      module: {
        rules: [
          {
            test: /\.ts$/,
            use: {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.renderer.json'
              }
            },
            exclude: /node_modules/
          }
        ]
      },
      resolve: {
        alias: {
          // 'vue$': 'vue/dist/vue.esm.js',
          '@': path.resolve(__dirname, 'src')
        },
        extensions: ['.ts', '.js']
      },
      
      target: 'web'
    };
};
