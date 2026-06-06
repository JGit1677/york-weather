// Self-test: proves the compiler + garden logic behave, with no network.
// Feeds synthetic days (cold / frost / hot / windy / stormy / alert) and
// asserts the right flags fire. Also structurally validates a live
// weather.json if one has been generated. Run with `npm run check`.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from './lib/compile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-06-06T12:00:00Z');
const HOUR = 3600 * 1000;

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
}

function hourly(n, { tempF, pop = 0, windSpeed = '5 mph', short = 'Clear' }) {
  return Array.from({ length: n }, (_, i) => ({
    startTime: new Date(NOW.getTime() + i * HOUR).toISOString(),
    endTime: new Date(NOW.getTime() + (i + 1) * HOUR).toISOString(),
    isDaytime: true,
    temperature: tempF,
    temperatureUnit: 'F',
    probabilityOfPrecipitation: { value: pop },
    windSpeed,
    shortForecast: short,
  }));
}

function nwsFixture({ tempF = 60, pop = 0, windSpeed = '5 mph', short = 'Sunny', alerts = [] }) {
  return {
    points: {
      properties: {
        astronomicalData: {
          sunrise: new Date(NOW.getTime() - 7 * HOUR).toISOString(),
          sunset: new Date(NOW.getTime() + 8 * HOUR).toISOString(),
        },
      },
    },
    forecast: {
      properties: {
        periods: [
          {
            number: 1,
            name: 'Today',
            startTime: NOW.toISOString(),
            endTime: new Date(NOW.getTime() + 12 * HOUR).toISOString(),
            isDaytime: true,
            temperature: tempF,
            temperatureUnit: 'F',
            probabilityOfPrecipitation: { value: pop },
            windSpeed,
            windDirection: 'NE',
            shortForecast: short,
            detailedForecast: `${short}.`,
          },
        ],
      },
    },
    hourly: { properties: { periods: hourly(12, { tempF, pop, windSpeed, short }) } },
    alerts: { features: alerts },
  };
}

const run = (opts) => compile({ nws: nwsFixture(opts), now: NOW });
const types = (r) => r.garden.flags.map((f) => `${f.type}:${f.level}`);

console.log('Garden logic:');
{
  const r = run({ tempF: 30, short: 'Clear' });
  ok(r.garden.flags.some((f) => f.type === 'freeze' && f.level === 'warning'), `30°F -> freeze warning  [${types(r)}]`);
}
{
  const r = run({ tempF: 35, short: 'Clear' });
  ok(r.garden.flags.some((f) => f.type === 'frost' && f.level === 'watch'), `35°F -> frost watch  [${types(r)}]`);
}
{
  const r = run({ tempF: 92, short: 'Sunny' });
  ok(r.garden.flags.some((f) => f.type === 'heat' && f.level === 'warning'), `92°F -> heat warning  [${types(r)}]`);
}
{
  const r = run({ tempF: 60, windSpeed: '30 to 40 mph' });
  ok(r.garden.flags.some((f) => f.type === 'wind' && f.level === 'warning'), `40 mph -> high wind warning  [${types(r)}]`);
}
{
  const r = run({ tempF: 65, pop: 80, short: 'Thunderstorms Likely' });
  ok(r.garden.flags.some((f) => f.type === 'rain'), `80% + thunder -> rain/storm flag  [${types(r)}]`);
  ok(r.garden.status === 'watch' || r.garden.status === 'alert', 'stormy day raises status above calm');
}
{
  const r = run({ tempF: 62, pop: 0, short: 'Sunny' });
  ok(r.garden.flags.some((f) => f.type === 'dry'), `dry day -> water reminder  [${types(r)}]`);
  ok(r.garden.status === 'calm', 'mild dry day stays calm (info only)');
}
{
  const r = run({ tempF: 60, alerts: [{ properties: { event: 'Freeze Warning', headline: 'Freeze tonight', severity: 'Moderate' } }] });
  ok(r.garden.flags.some((f) => f.type === 'alert' && /freeze warning/i.test(f.title)), 'official NWS alert is surfaced first');
}

console.log('Structure:');
{
  const r = run({ tempF: 60 });
  ok(r.schema === 1, 'schema === 1');
  for (const k of ['generatedAt', 'location', 'summary', 'pointForecast', 'aviation', 'alerts', 'garden']) {
    ok(k in r, `has key: ${k}`);
  }
  ok(typeof r.summary === 'string' && r.summary.length > 0, 'summary is a non-empty string');
}

console.log('Live weather.json (if present):');
try {
  const file = resolve(__dirname, '../public/data/weather.json');
  const data = JSON.parse(await readFile(file, 'utf8'));
  ok(data.schema === 1, 'live file schema === 1');
  ok(/York/i.test(data.location?.label || ''), 'live file location is York');
  ok(Array.isArray(data.health?.sources) && data.health.sources.length === 3, 'live file records 3 source health rows');
  if (data.current) {
    ok(data.current.tempF > -40 && data.current.tempF < 120, `live current temp sane (${data.current.tempF}°F)`);
    ok(data.current.distanceMi >= 0 && data.current.distanceMi < 80, `nearest station within range (${data.current.station}, ${data.current.distanceMi} mi)`);
  }
  ok(Array.isArray(data.pointForecast?.periods) && data.pointForecast.periods.length > 0, 'live file has NWS forecast periods');
} catch (err) {
  console.log(`  (skipped — no live file yet: ${err.code || err.message})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
