import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.');
const buildDirectory = path.join(root, 'build');
await fs.rm(buildDirectory, { recursive: true, force: true });
await fs.mkdir(buildDirectory, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
};

await build({
  ...common,
  entryPoints: ['src/main/index.js'],
  outfile: 'build/main/index.js',
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['electron'],
});

for (const [entry, outfile] of [
  ['src/preload/chrome-preload.cjs', 'build/preload/chrome-preload.cjs'],
  ['src/preload/quick-chat-preload.cjs', 'build/preload/quick-chat-preload.cjs'],
  ['src/preload/activity-preload.cjs', 'build/preload/activity-preload.cjs'],
  ['src/preload/find-preload.cjs', 'build/preload/find-preload.cjs'],
]) {
  await build({ ...common, entryPoints: [entry], outfile, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'] });
}

for (const [entry, outfile] of [
  ['src/renderer/renderer.js', 'build/renderer/renderer.js'],
  ['src/quick-chat/renderer.js', 'build/renderer/quick-chat.js'],
  ['src/activity/renderer.js', 'build/renderer/activity.js'],
  ['src/find/renderer.js', 'build/renderer/find.js'],
]) {
  await build({ ...common, entryPoints: [entry], outfile, platform: 'browser', format: 'iife', target: 'chrome140' });
}

console.log('ChatDesk bundles created in build/.');
