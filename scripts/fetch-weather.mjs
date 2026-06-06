// Orchestrator: fetch every source independently, compile, write weather.json.
// Run by `npm run data`, by `npm run build`, and by the GitHub Action.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMetars, fetchTafs, fetchNws } from './lib/sources.mjs';
import { compile } from './lib/compile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/data/weather.json');

// Wrap a fetch so one failing source can never crash the whole run.
async function settled(label, fn) {
  const fetchedAt = new Date().toISOString();
  try {
    return { label, ok: true, fetchedAt, value: await fn() };
  } catch (err) {
    console.error(`! ${label} failed: ${err.message}`);
    return { label, ok: false, fetchedAt, error: err.message, value: null };
  }
}

async function main() {
  const [metars, tafs, nws] = await Promise.all([
    settled('metar', fetchMetars),
    settled('taf', fetchTafs),
    settled('nws', fetchNws),
  ]);

  const compiled = compile({
    metars: metars.value || [],
    tafs: tafs.value || [],
    nws: nws.value || {},
    now: new Date(),
  });

  compiled.health = {
    sources: [metars, tafs, nws].map((s) => ({
      name: s.label,
      ok: s.ok,
      fetchedAt: s.fetchedAt,
      error: s.error || null,
    })),
  };

  // Only hard-fail if there is nothing usable to show at all. A failed build
  // leaves the previous successful Pages deploy live.
  if (!metars.ok && !nws.ok) {
    throw new Error('No usable data: both METAR and NWS feeds failed.');
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(compiled, null, 2));

  console.log(`Wrote ${OUT}`);
  console.log(`Sources: ${compiled.health.sources.map((s) => `${s.name}:${s.ok ? 'ok' : 'FAIL'}`).join('  ')}`);
  console.log(`Summary: ${compiled.summary}`);
  console.log(`Garden: ${compiled.garden.status} — ${compiled.garden.flags.length} flag(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
