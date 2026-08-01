// tsc only emits JavaScript, so runtime JSON assets (contract ABIs) must be
// copied into dist separately or loadArtifact() fails at runtime.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDirs = ['shared/blockchain/abis'];

for (const relDir of assetDirs) {
  const from = path.join(apiRoot, 'src', relDir);
  const to = path.join(apiRoot, 'dist', relDir);

  if (!existsSync(from)) {
    throw new Error(`Missing build asset directory: ${from}`);
  }

  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`copied ${readdirSync(to).length} asset(s) to dist/${relDir}`);
}
