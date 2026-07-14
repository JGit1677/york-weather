// Network layer. Runs in Node (GitHub Actions / local), so the missing CORS
// headers on aviationweather.gov are irrelevant here.

import {
  LOCATION,
  METAR_STATIONS,
  TAF_STATIONS,
  NWS_ZONE,
  CONTACT,
  COASTAL_STATION,
} from '../../config.mjs';

const NWS_HEADERS = { 'User-Agent': CONTACT, Accept: 'application/geo+json' };

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchMetars() {
  const ids = METAR_STATIONS.join(',');
  return getJson(
    `https://aviationweather.gov/api/data/metar?ids=${ids}&format=json&taf=false`
  );
}

export async function fetchTafs() {
  const ids = TAF_STATIONS.join(',');
  return getJson(`https://aviationweather.gov/api/data/taf?ids=${ids}&format=json`);
}

// NDBC realtime2 text feed for the coastal NERRS station (no JSON API, no
// CORS — server-side only). Returns the raw text; parsing lives in compile.
export async function fetchCoastal() {
  const res = await fetch(
    `https://www.ndbc.noaa.gov/data/realtime2/${COASTAL_STATION.id}.txt`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} for NDBC ${COASTAL_STATION.id}`);
  return res.text();
}

export async function fetchNws() {
  const points = await getJson(
    `https://api.weather.gov/points/${LOCATION.lat},${LOCATION.lon}`,
    NWS_HEADERS
  );
  const props = points.properties;
  const [forecast, hourly] = await Promise.all([
    getJson(props.forecast, NWS_HEADERS),
    getJson(props.forecastHourly, NWS_HEADERS),
  ]);
  // Alerts are nice-to-have; never let an empty/again-down feed fail the run.
  const alerts = await getJson(
    `https://api.weather.gov/alerts/active?zone=${NWS_ZONE}`,
    NWS_HEADERS
  ).catch(() => ({ features: [] }));
  return { points, forecast, hourly, alerts };
}
