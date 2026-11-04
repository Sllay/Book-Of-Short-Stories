/**
 * CI regression guard for offline PDF imports.
 *
 * Vite bundles pdfjs-dist's worker as an .mjs asset; Workbox's default
 * precache glob only matches .js/.css/.html. Without this guard, importing
 * a local PDF works online but fails after switching off Wi-Fi.
 *
 * Run after vite build. No browser or network access is required.
 */
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const dist = resolve('dist');
const files = [];

async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await visit(full);
    else files.push(full);
  }
}

await visit(dist);
const workers = files.filter(file => /pdf\.worker[^/\\]*\.mjs$/i.test(basename(file)));
if (workers.length === 0) {
  throw new Error('Offline PDF check: Vite did not emit the bundled pdf.worker .mjs.');
}

const serviceWorker = await readFile(join(dist, 'sw.js'), 'utf8');
for (const worker of workers) {
  const fileName = basename(worker);
  if (!serviceWorker.includes(fileName)) {
    throw new Error('Offline PDF check: ' + fileName + ' is NOT precached by sw.js.');
  }
}

if (!serviceWorker.includes('index.html')) {
  throw new Error('Offline PDF check: offline app shell index.html is missing from sw.js.');
}

console.log('Offline PDF precache verified: ' + workers.map(file => basename(file)).join(', '));
