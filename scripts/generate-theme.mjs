// Turns a Material Theme Builder export (src/theme/material-theme.json) into
// CSS custom properties (src/theme/theme.css). Re-run after replacing the
// JSON with a new export:  node scripts/generate-theme.mjs
//
// Emits the "light" scheme on :root and the "dark" scheme under
// prefers-color-scheme, so the dashboard follows the phone's setting.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN = resolve(__dirname, '../src/theme/material-theme.json');
const OUT = resolve(__dirname, '../src/theme/theme.css');

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function vars(scheme, indent = '  ') {
  return Object.entries(scheme)
    .map(([k, v]) => `${indent}--md-sys-color-${kebab(k)}: ${v};`)
    .join('\n');
}

const theme = JSON.parse(await readFile(IN, 'utf8'));
const { light, dark } = theme.schemes;
if (!light || !dark) throw new Error('Export must contain "light" and "dark" schemes.');

const css = `/* AUTO-GENERATED from material-theme.json by scripts/generate-theme.mjs.
 * Do not edit by hand — replace the JSON export and re-run instead.
 * Seed: ${theme.seed} (${theme.description?.split('\n')[0] || 'Material Theme Builder'})
 */
:root {
  color-scheme: light dark;
${vars(light)}
}

@media (prefers-color-scheme: dark) {
  :root {
${vars(dark, '    ')}
  }
}
`;

await writeFile(OUT, css);
console.log(`Wrote ${OUT} (${Object.keys(light).length} light + ${Object.keys(dark).length} dark tokens, seed ${theme.seed})`);
