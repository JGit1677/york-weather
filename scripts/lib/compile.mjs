// Pure compiler: raw feeds in -> one unified, garden-aware forecast object out.
// No network here, so check.mjs can feed it fixtures (including synthetic
// cold / windy / stormy days) and assert the garden logic fires correctly.

import { LOCATION as DEFAULT_LOCATION, THRESHOLDS as DEFAULT_TH } from '../../config.mjs';
import { distanceMi, cToF, ktToMph, relHumidity, round, parseMaxMph } from './geo.mjs';
import { skyWord, wxWords, fmtTime, cloudPhrase } from './decode.mjs';

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

function compass16(deg) {
  if (deg == null) return null;
  if (deg === 'VRB') return 'variable';
  return COMPASS[Math.round((Number(deg) % 360) / 22.5) % 16];
}

function windText(dirDeg, mph, gustMph) {
  if (mph == null || mph === 0) return 'calm';
  const c = compass16(dirDeg);
  let t = `${c ? c + ' ' : ''}${mph} mph`;
  if (gustMph) t += ` (gusts ${gustMph})`;
  return t;
}

const HOURS = (n) => n * 3600 * 1000;

// ---- current conditions (nearest METAR) ----------------------------------

function rankMetars(metars, location) {
  return (metars || [])
    .filter((m) => m && Number.isFinite(m.lat) && Number.isFinite(m.lon))
    .map((m) => ({
      ...m,
      distanceMi: round(distanceMi(location.lat, location.lon, m.lat, m.lon), 1),
    }))
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

function buildCurrent(m) {
  if (!m) return null;
  const tempF = round(cToF(m.temp));
  const windMph = round(ktToMph(m.wspd));
  const gustMph = round(ktToMph(m.wgst));
  const sky = skyWord(m.cover);
  const wx = wxWords(m.wxString);
  const skyPhrase = wx ? `${sky}, ${wx}` : sky;
  return {
    station: m.icaoId,
    name: m.name,
    distanceMi: m.distanceMi,
    obsTime: m.obsTime,
    tempF,
    tempC: round(m.temp, 1),
    dewpF: round(cToF(m.dewp)),
    humidity: relHumidity(m.temp, m.dewp),
    windDir: compass16(m.wdir),
    windMph,
    gustMph,
    windText: windText(m.wdir, windMph, gustMph),
    visibility: m.visib != null ? `${m.visib} mi` : null,
    sky,
    skyPhrase,
    wx,
    clouds: (m.clouds || []).map(cloudPhrase).filter(Boolean),
    flightCategory: m.fltCat,
    elevationM: m.elev,
    rawOb: m.rawOb,
  };
}

function buildNearby(ranked) {
  return ranked.slice(0, 4).map((m) => ({
    station: m.icaoId,
    name: m.name,
    distanceMi: m.distanceMi,
    tempF: round(cToF(m.temp)),
    windMph: round(ktToMph(m.wspd)),
    sky: skyWord(m.cover),
    flightCategory: m.fltCat,
    obsTime: m.obsTime,
    rawOb: m.rawOb,
  }));
}

// ---- NWS point forecast (the actual yard) --------------------------------

function buildPointForecast(forecast, hourly, now) {
  const out = { periods: [], hourly: [] };
  const fp = forecast?.properties?.periods;
  if (Array.isArray(fp)) {
    out.periods = fp.map((p) => ({
      name: p.name,
      isDaytime: p.isDaytime,
      tempF: p.temperature,
      unit: p.temperatureUnit,
      pop: p.probabilityOfPrecipitation?.value ?? 0,
      windSpeed: p.windSpeed,
      windMph: parseMaxMph(p.windSpeed),
      windDir: p.windDirection,
      shortForecast: p.shortForecast,
      detailedForecast: p.detailedForecast,
      startTime: p.startTime,
      endTime: p.endTime,
    }));
  }
  const hp = hourly?.properties?.periods;
  if (Array.isArray(hp)) {
    const cutoff = now.getTime() + HOURS(72);
    out.hourly = hp
      .filter((p) => {
        const t = new Date(p.startTime).getTime();
        return t >= now.getTime() - HOURS(1) && t <= cutoff;
      })
      .slice(0, 72)
      .map((p) => ({
        time: p.startTime,
        tempF: p.temperature,
        pop: p.probabilityOfPrecipitation?.value ?? 0,
        windMph: parseMaxMph(p.windSpeed),
        shortForecast: p.shortForecast,
        isDaytime: p.isDaytime,
      }));
  }
  return out;
}

// ---- TAF (aviation outlook) ----------------------------------------------

function buildTafPeriod(f, tz) {
  const change =
    f.fcstChange === 'FM'
      ? 'From'
      : f.fcstChange === 'BECMG'
      ? 'Becoming'
      : f.fcstChange === 'TEMPO'
      ? 'Temporarily'
      : f.probability
      ? `Prob ${f.probability}%`
      : 'Initial';
  const windDir = compass16(f.wdir);
  const gust = f.wgst ? ` gusting ${f.wgst} kt` : '';
  const windPart =
    f.wspd != null ? `wind ${windDir || ''} ${f.wspd} kt${gust}`.trim() : null;
  const visPart = f.visib != null ? `vis ${f.visib} mi` : null;
  const wx = wxWords(f.wxString);
  const clouds = (f.clouds || []).map(cloudPhrase).filter(Boolean);
  const parts = [windPart, visPart, wx, clouds.join(', ')].filter(Boolean);
  const startLabel = fmtTime(f.timeFrom, tz, { weekday: 'short' });
  return {
    from: f.timeFrom,
    to: f.timeTo,
    change,
    summary: `${change} ${startLabel}: ${parts.join(', ')}`,
    windKt: f.wspd,
    gustKt: f.wgst,
    vis: f.visib != null ? `${f.visib} mi` : null,
    wx,
    clouds,
  };
}

function buildAviation(tafs, location, tz) {
  const list = (tafs || [])
    .filter((t) => t && Array.isArray(t.fcsts))
    .map((t) => ({
      station: t.icaoId,
      name: t.name,
      distanceMi:
        Number.isFinite(t.lat) && Number.isFinite(t.lon)
          ? round(distanceMi(location.lat, location.lon, t.lat, t.lon), 1)
          : null,
      issueTime: t.issueTime,
      validFrom: t.validTimeFrom,
      validTo: t.validTimeTo,
      raw: t.rawTAF,
      periods: t.fcsts.map((f) => buildTafPeriod(f, tz)),
    }))
    .sort((a, b) => (a.distanceMi ?? 1e9) - (b.distanceMi ?? 1e9));
  return { primary: list[0]?.station ?? null, tafs: list };
}

// ---- NWS official alerts -------------------------------------------------

function buildAlerts(alerts) {
  const feats = alerts?.features;
  if (!Array.isArray(feats)) return [];
  return feats.map((f) => {
    const p = f.properties || {};
    return {
      event: p.event,
      severity: p.severity,
      headline: p.headline,
      onset: p.onset,
      ends: p.ends || p.expires,
      area: p.areaDesc,
      description: p.description,
      instruction: p.instruction,
    };
  });
}

// ---- garden event detection ----------------------------------------------

function extreme(hourly, key, kind) {
  let best = null;
  for (const h of hourly) {
    const v = h[key];
    if (v == null) continue;
    if (!best || (kind === 'min' ? v < best.value : v > best.value)) {
      best = { value: v, time: h.time };
    }
  }
  return best;
}

function buildGarden(current, pointForecast, alerts, now, th, tz) {
  const flags = [];
  const horizon = (pointForecast?.hourly || []).filter(
    (h) => new Date(h.time).getTime() <= now.getTime() + HOURS(48)
  );
  const when = (iso) => fmtTime(iso, tz, { weekday: 'short' });

  // Official NWS alerts always lead.
  for (const a of alerts || []) {
    flags.push({
      type: 'alert',
      level: 'warning',
      title: a.event || 'Weather alert',
      detail: a.headline || a.area || 'Active NWS alert in effect.',
    });
  }

  const low = extreme(horizon, 'tempF', 'min');
  const high = extreme(horizon, 'tempF', 'max');
  const windPeak = extreme(horizon, 'windMph', 'max');
  const popHorizon = horizon.map((h) => h.pop ?? 0);
  const maxPop48 = popHorizon.length ? Math.max(...popHorizon) : 0;
  const allHourly = pointForecast?.hourly || [];
  const maxPop72 = allHourly.length ? Math.max(...allHourly.map((h) => h.pop ?? 0)) : 0;
  const thunder = [...horizon, ...(pointForecast?.periods || []).slice(0, 4)].some((p) =>
    /thunder/i.test(p.shortForecast || '')
  );
  const gust = current?.gustMph ?? null;
  const peakWind = Math.max(windPeak?.value ?? 0, gust ?? 0);

  if (low) {
    if (low.value <= th.hardFreezeF) {
      flags.push({ type: 'freeze', level: 'warning', title: 'Hard freeze', detail: `Low near ${low.value}°F ${when(low.time)}. Protect or bring in tender plants.` });
    } else if (low.value <= th.freezeF) {
      flags.push({ type: 'freeze', level: 'warning', title: 'Freeze', detail: `Low near ${low.value}°F ${when(low.time)}. Cover tender plants overnight.` });
    } else if (low.value <= th.frostF) {
      flags.push({ type: 'frost', level: 'watch', title: 'Frost possible', detail: `Low near ${low.value}°F ${when(low.time)}. Ocean airflow may spare you, but cover tender annuals to be safe.` });
    }
  }
  if (high) {
    if (high.value >= th.veryHotF) {
      flags.push({ type: 'heat', level: 'warning', title: 'Heat', detail: `High near ${high.value}°F ${when(high.time)}. Water deeply, especially new May 2026 plantings.` });
    } else if (high.value >= th.hotF) {
      flags.push({ type: 'heat', level: 'watch', title: 'Hot', detail: `High near ${high.value}°F ${when(high.time)}. Check soil moisture; water if dry.` });
    }
  }
  if (peakWind >= th.windGustMph) {
    flags.push({ type: 'wind', level: 'warning', title: 'High wind', detail: `Wind/gusts to ${round(peakWind)} mph. Stake tall phlox and baptisia; expect rapid drying.` });
  } else if (peakWind >= th.windSustainedMph) {
    flags.push({ type: 'wind', level: 'watch', title: 'Windy', detail: `Wind up to ${round(peakWind)} mph. Tall stems may need support; soil dries faster.` });
  }
  // Precip severity keys off the actual chance, not just the word "thunder".
  if (maxPop48 >= th.heavyRainPct) {
    flags.push({ type: 'rain', level: 'watch', title: thunder ? 'Storms / heavy rain' : 'Heavy rain likely', detail: `Up to ${maxPop48}% chance in the next 2 days. Skip watering; check the rock bed for pooling.` });
  } else if (thunder && maxPop48 >= th.rainLikelyPct) {
    flags.push({ type: 'rain', level: 'watch', title: 'Storms possible', detail: `Thunderstorms in the forecast, up to ${maxPop48}% chance. Secure light items and skip watering.` });
  } else if (maxPop48 >= th.rainLikelyPct) {
    flags.push({ type: 'rain', level: 'info', title: 'Rain likely', detail: `Up to ${maxPop48}% chance in the next 2 days. You can probably skip hand-watering.` });
  } else if (thunder) {
    flags.push({ type: 'rain', level: 'info', title: 'Slight storm chance', detail: `A slight chance of showers or thunderstorms (${maxPop48}%). Probably no action needed.` });
  } else if (maxPop72 < th.dryStretchMaxPct) {
    flags.push({ type: 'dry', level: 'info', title: 'Dry stretch', detail: `No meaningful rain expected for ~3 days. Plan to water about 1 inch per week.` });
  }

  const hasWarn = flags.some((f) => f.level === 'warning');
  const hasWatch = flags.some((f) => f.level === 'watch');
  const status = hasWarn ? 'alert' : hasWatch ? 'watch' : 'calm';

  return { status, flags, lowF: low?.value ?? null, highF: high?.value ?? null, maxRainPct48: maxPop48 };
}

// ---- top-line plain-English summary --------------------------------------

function buildSummary(current, pointForecast, garden, location) {
  const s = [];
  const p0 = pointForecast?.periods?.[0];
  if (current) {
    s.push(`Right now in ${location.label.split(',')[0]}: ${current.tempF}°F, ${current.skyPhrase}, wind ${current.windText} (${current.station}, ${current.distanceMi} mi).`);
  } else if (p0) {
    s.push(`${location.label.split(',')[0]}: ${p0.shortForecast.toLowerCase()}.`);
  }
  if (p0) {
    s.push(`${p0.name}: ${p0.shortForecast.toLowerCase()}, ${p0.isDaytime ? 'high' : 'low'} near ${p0.tempF}°F.`);
  }
  const notable = garden.flags.filter((f) => f.level !== 'info').map((f) => f.title.toLowerCase());
  if (notable.length) {
    s.push(`Garden watch: ${notable.join(', ')}.`);
  } else {
    s.push('No frost, wind, heat, or heavy-rain concerns in the next 2 days.');
  }
  return s.join(' ');
}

// ---- assemble ------------------------------------------------------------

export function compile({
  metars = [],
  tafs = [],
  nws = {},
  now = new Date(),
  location = DEFAULT_LOCATION,
  thresholds = DEFAULT_TH,
} = {}) {
  const ranked = rankMetars(metars, location);
  const current = buildCurrent(ranked[0]);
  const nearby = buildNearby(ranked);
  const pointForecast = buildPointForecast(nws.forecast, nws.hourly, now);
  const aviation = buildAviation(tafs, location, location.timeZone);
  const alerts = buildAlerts(nws.alerts);
  const garden = buildGarden(current, pointForecast, alerts, now, thresholds, location.timeZone);
  const summary = buildSummary(current, pointForecast, garden, location);

  const astro = nws.points?.properties?.astronomicalData;
  const sun = astro ? { sunrise: astro.sunrise, sunset: astro.sunset } : null;

  return {
    schema: 1,
    generatedAt: now.toISOString(),
    location: { label: location.label, lat: location.lat, lon: location.lon, timeZone: location.timeZone },
    summary,
    sun,
    current,
    nearby,
    pointForecast,
    aviation,
    alerts,
    garden,
  };
}

// Build a refreshed `current` from a live NWS station observation
// (api.weather.gov/stations/{id}/observations/latest is CORS-enabled), falling
// back to the snapshot value field-by-field when the observation omits one
// (textDescription / rawMessage are sometimes blank). Keeps the snapshot's
// value if it is actually newer than the observation.
function liveCurrentFromObs(obs, prev) {
  const p = obs && obs.properties;
  if (!p) return prev;
  const obsUnix = p.timestamp ? Math.round(new Date(p.timestamp).getTime() / 1000) : null;
  if (obsUnix && prev?.obsTime && obsUnix < prev.obsTime) return prev; // snapshot is newer
  const tempC = p.temperature?.value;
  const dewpC = p.dewpoint?.value;
  const kmh = p.windSpeed?.value;
  const gustKmh = p.windGust?.value;
  const dir = p.windDirection?.value;
  const visM = p.visibility?.value;
  const rh = p.relativeHumidity?.value;
  const desc = (p.textDescription || '').trim();
  const raw = (p.rawMessage || '').trim();
  const windMph = kmh == null ? prev?.windMph : round(kmh * 0.621371);
  const gustMph = gustKmh == null ? null : round(gustKmh * 0.621371);
  return {
    ...prev,
    obsTime: obsUnix ?? prev?.obsTime,
    tempF: tempC == null ? prev?.tempF : round(cToF(tempC)),
    tempC: tempC == null ? prev?.tempC : round(tempC, 1),
    dewpF: dewpC == null ? prev?.dewpF : round(cToF(dewpC)),
    humidity: rh != null ? Math.round(rh) : relHumidity(tempC, dewpC) ?? prev?.humidity,
    windDir: dir == null ? prev?.windDir : compass16(dir),
    windMph,
    gustMph,
    windText: kmh == null ? prev?.windText : windText(dir, windMph, gustMph),
    visibility: visM == null ? prev?.visibility : `${round(visM / 1609.34)} mi`,
    sky: desc || prev?.sky,
    skyPhrase: desc || prev?.skyPhrase,
    rawOb: raw || prev?.rawOb,
  };
}

// Browser helper: given the committed snapshot plus a freshly fetched NWS
// payload (forecast + hourly + alerts + nearest-station observation), recompute
// the NWS-derived parts and merge them onto the snapshot. The TAF (aviation
// outlook) has no CORS source, so it stays from the snapshot. Reuses the exact
// same builders as compile(), so live and snapshot agree.
export function applyLiveNws(snapshot, nws, opts = {}) {
  const location = opts.location || snapshot.location || DEFAULT_LOCATION;
  const thresholds = opts.thresholds || DEFAULT_TH;
  const now = opts.now || new Date();
  const tz = location.timeZone || 'America/New_York';
  const current = nws.obs ? liveCurrentFromObs(nws.obs, snapshot.current) : snapshot.current;
  const pointForecast = buildPointForecast(nws.forecast, nws.hourly, now);
  const alerts = buildAlerts(nws.alerts);
  const garden = buildGarden(current, pointForecast, alerts, now, thresholds, tz);
  const summary = buildSummary(current, pointForecast, garden, location);
  const astro = nws.points?.properties?.astronomicalData;
  const sun = astro ? { sunrise: astro.sunrise, sunset: astro.sunset } : snapshot.sun;
  return {
    ...snapshot,
    current,
    pointForecast,
    alerts,
    garden,
    summary,
    sun,
    liveUpdatedAt: now.toISOString(),
  };
}
