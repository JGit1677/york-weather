// Live, in-browser fetch of the NWS point forecast. api.weather.gov is
// CORS-enabled (access-control-allow-origin: *) and these are simple GETs
// (no custom headers => no preflight), so this works straight from the page.
// Used to keep the forecast current the instant the dashboard opens,
// independent of the every-15-min GitHub Actions snapshot.

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  return res.json();
}

export async function fetchLiveNws({ lat, lon, station }) {
  const points = await getJson(`https://api.weather.gov/points/${lat},${lon}`);
  const p = points.properties;
  const zone = (p.forecastZone || '').split('/').pop();
  const [forecast, hourly, alerts, obs] = await Promise.all([
    getJson(p.forecast),
    getJson(p.forecastHourly),
    zone
      ? getJson(`https://api.weather.gov/alerts/active?zone=${zone}`).catch(() => ({ features: [] }))
      : Promise.resolve({ features: [] }),
    station
      ? getJson(`https://api.weather.gov/stations/${station}/observations/latest`).catch(() => null)
      : Promise.resolve(null),
  ]);
  return { points, forecast, hourly, alerts, obs };
}
