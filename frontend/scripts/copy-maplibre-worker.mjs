import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const diretorioDist = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist');
const diretorioDestino = path.join(process.cwd(), 'public', 'maplibre');

mkdirSync(diretorioDestino, { recursive: true });

for (const arquivo of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(diretorioDist, arquivo), path.join(diretorioDestino, arquivo));
}
