/* Build step: compile the JSX source (app.jsx) to plain browser JS (app.js).
 *
 * The app is loaded by index.html as a normal <script>, so the JSX must be
 * transpiled ahead of time rather than in the browser. Run with: npm run build
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { transformAsync } from '@babel/core';

const src = readFileSync('app.jsx', 'utf8');

const { code } = await transformAsync(src, {
  // Classic runtime emits React.createElement, which works with the React
  // UMD global loaded from the CDN (the automatic runtime would emit ESM
  // imports of react/jsx-runtime that the UMD build does not provide).
  presets: [['@babel/preset-react', { runtime: 'classic' }]],
  configFile: false,
  babelrc: false,
});

const header =
  '/* GENERATED FILE — do not edit directly.\n' +
  ' * Source of truth is app.jsx; rebuild with: npm run build\n' +
  ' * JSX is compiled ahead of time to plain JS so the browser runs it\n' +
  ' * directly, with no Babel transpile step at load time.\n */\n';

writeFileSync('app.js', header + code);
console.log('Built app.js from app.jsx (' + code.length + ' chars)');
