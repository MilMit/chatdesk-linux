import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['scripts', 'src/main', 'src/preload', 'src/renderer', 'src/quick-chat', 'src/activity', 'src/find', 'src/shared', 'tests'];
const files = [];
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.cjs')) files.push(fullPath);
    }
  };
  visit(root);
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
