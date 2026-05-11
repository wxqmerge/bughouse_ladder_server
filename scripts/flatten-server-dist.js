#!/usr/bin/env node
/**
 * Flatten server dist output from dist/server/src/ to dist/
 * This must run AFTER tsc compiles the server code.
 * TypeScript with NodeNext infers rootDir from absolute paths,
 * producing dist/server/src/ instead of dist/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const serverDist = path.join(projectRoot, 'server', 'dist');
const serverSrcDist = path.join(serverDist, 'server', 'src');

if (!fs.existsSync(serverSrcDist)) {
  console.log('  No dist/server/src/ found, skipping flatten.');
  process.exit(0);
}

function copyDir(src, dest) {
  for (const entry of fs.readdirSync(src)) {
    if (entry === '.temp-compile') continue;
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Remove old dist contents first (but keep serverSrcDist intact for copying)
const oldDistContents = fs.existsSync(serverDist) ? fs.readdirSync(serverDist) : [];
for (const entry of oldDistContents) {
  if (entry !== 'server') {
    fs.rmSync(path.join(serverDist, entry), { recursive: true, force: true });
  }
}
// Copy everything from dist/server/src/ directly into dist/
copyDir(serverSrcDist, serverDist);
// Clean up the old nested directory structure
fs.rmSync(path.join(serverDist, 'server'), { recursive: true, force: true });
console.log('  Flattened server dist output to dist/');
