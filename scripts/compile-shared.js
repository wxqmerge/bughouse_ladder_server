#!/usr/bin/env node
/**
 * Compile shared/*.ts to shared/*.js for Node.js ESM runtime.
 * TypeScript doesn't allow in-place compilation, so we copy to temp, compile, then copy .js back.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const sharedSrc = path.join(projectRoot, 'shared');
const sharedTemp = path.join(projectRoot, 'shared', '.temp-compile');

// Clean temp dir
if (fs.existsSync(sharedTemp)) {
  fs.rmSync(sharedTemp, { recursive: true, force: true });
}
fs.mkdirSync(sharedTemp, { recursive: true });

// Copy shared source files to temp dir (preserving structure)
function copySrcFiles(dir) {
  for (const file of fs.readdirSync(dir)) {
    const src = path.join(dir, file);
    const rel = path.relative(sharedSrc, src);
    const dest = path.join(sharedTemp, rel);
    const stat = fs.statSync(src);
    
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copySrcFiles(src);
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
      fs.copyFileSync(src, dest);
    }
  }
}

copySrcFiles(sharedSrc);

// Compile from temp dir
const tsconfigContent = {
  compilerOptions: {
    target: 'ES2020',
    module: 'NodeNext',
    lib: ['ES2020'],
    outDir: sharedTemp,
    rootDir: sharedTemp,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    resolveJsonModule: true,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    moduleResolution: 'NodeNext',
  },
  include: ['**/*.ts'],
  exclude: ['node_modules', 'dist', '.temp-compile', '**/*.test.ts'],
};

const tempTsconfig = path.join(sharedTemp, 'tsconfig.json');
fs.writeFileSync(tempTsconfig, JSON.stringify(tsconfigContent, null, 2));

try {
  execSync(`tsc --project ${tempTsconfig}`, { cwd: sharedTemp, stdio: 'inherit' });

  // Copy .js files from temp to shared/ (preserving directory structure)
  function copyFiles(dir) {
    for (const file of fs.readdirSync(dir)) {
      const src = path.join(dir, file);
      const rel = path.relative(sharedTemp, src);
      const dest = path.join(sharedSrc, rel);
      const stat = fs.statSync(src);
      
      if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        copyFiles(src);
      } else if (file.endsWith('.js')) {
        fs.copyFileSync(src, dest);
        console.log(`  Copied: ${rel}`);
      }
    }
  }

  copyFiles(sharedTemp);
  console.log('Shared files compiled successfully.');
} finally {
  // Clean up temp dir
  if (fs.existsSync(sharedTemp)) {
    fs.rmSync(sharedTemp, { recursive: true, force: true });
  }
}
