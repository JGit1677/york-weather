import { useCallback, useEffect, useState } from 'react';
import { relTime, relTimeUnix, clock, dayHour, shortDate } from './format.js';
import { applyLiveNws } from '../scripts/lib/compile.mjs';
import { fetchLiveNws } from './nws.js';
import './ui.css';

// Relative URL (base: './') so it works at any GitHub Pages sub-path.
const DATA_URL = `${import.meta.env.BASE_URL}data/weather.json`;

const STATUS = {
  calm: { label: 'All clear', cls: 'calm' },
  watch: { label: 'Heads up', cls: 'watch' },
  alert: { label: 'Action needed', cls: 'alert' },
};

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshOk, setRefreshOk] = useState(false);
  const [live, setLive] = useState(false);

  // Load the committed snapshot — fast, always available, and the only source
  // of METAR/TAF (those have no CORS so can't be fetched in the browser).
  const loadSnapshot = useCallback(async () => {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  // Show the snapshot immediately, then overlay a live in-browser NWS forecast
  // when possible. If the live fetch fails, the snapshot simply stays in place.
  const refresh = useCallback(async () => {
    let snap;
    try {
      snap = await loadSnapshot();
      setData(snap);
      setError(null);
    } catch (e) {
      setError(e.message);
      return false;
    }
    try {
      const nws = await fetchLiveNws({
        lat: snap.location.lat,
        lon: snap.location.lon,
        station: snap.current?.station,
      });
      setData(applyLiveNws(snap, nws, { now: new Date() }));
      setLive(true);
    } catch {
      setLive(false);
    }
    return true;
  }, [loadSnapshot]);

  // Manual refresh: the snapshot loads almost instantly, so without a floor the
  // user would see no movement. Spin for at least ~650ms, then flash a check
  // mark for a moment so it's obvious the refresh actually ran.
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshOk(false);
    const started = Date.now();
    const ok = await refresh();
    const remaining = 650 - (Date.now() - started);
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    setRefreshing(false);
    if (ok) {
      setRefreshOk(true);
      setTimeout(() => setRefreshOk(false), 1500);
    }
  }, [refresh, refreshing]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
    // Keep it fresh while the page sits open, without needing a manual tap.
    const id = setInterval(() => refresh(), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!data && loading) return <div className="splash">Loading York Beach weather…</div>;
  if (!data && error)
    return (
      <div className="splash">
        <p>Could not load weather data ({error}).</p>
        <button onClick={refresh}>Retry</button>
      </div>
    );
  return (
    <Dashboard
      data={data}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      refreshOk={refreshOk}
      live={live}
    />
  );
}

function Dashboard({ data, onRefresh, refreshing, refreshOk, live }) {
  const tz = data.location?.timeZone || 'America/New_York';
  const anyFail = (data.health?.sources || []).some((s) => !s.ok);
  return (
    <div className="wrap">
      <Header data={data} onRefresh={onRefresh} refreshing={refreshing} refreshOk={refreshOk} />
      {anyFail && <FeedNotice sources={data.health.sources} />}
      <Current data={data} tz={tz} />
      <GardenWatch garden={data.garden} alerts={data.alerts} />
      <Hourly hourly={data.pointForecast?.hourly} tz={tz} />
      <Forecast periods={data.pointForecast?.periods} tz={tz} live={live} />
      <Aviation aviation={data.aviation} />
      <Nearby nearby={data.nearby} />
      <Footer data={data} tz={tz} onRefresh={onRefresh} refreshing={refreshing} refreshOk={refreshOk} />
    </div>
  );
}

function Header({ data, onRefresh, refreshing, refreshOk }) {
  const stamp = refreshing
    ? 'refreshing…'
    : refreshOk
    ? 'updated just now ✓'
    : `updated ${relTime(data.generatedAt)}`;
  return (
    <header className="hdr">
      <div>
        <h1>York Beach Weather</h1>
        <div className="sub">
          {data.location?.label} · {stamp}
        </div>
      </div>
      <button
        className={`refresh${refreshing ? ' spinning' : ''}${refreshOk ? ' done' : ''}`}
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh"
      >
        <span className="refreshIcon">{refreshOk ? '✓' : '↻'}</span>
      </button>
    </header>
  );
}

function FeedNotice({ sources }) {
  const down = sources
    .filter((s) => !s.ok)
    .map((s) => s.name.toUpperCase())
    .join(', ');
  return (
    <div className="notice">
      Some feeds were unavailable at the last update: {down}. Showing best available data.
    </div>
  );
}

function Current({ data, tz }) {
  const c = data.current;
  // Headline temp: NWS model for the exact yard grid cell when available —
  // coastal York Beach often runs ~10°F cooler than inland airports on
  // sea-breeze days. The station reading stays visible as the observation.
  const yard = data.yardNowF;
  const heroTemp = yard ?? c?.tempF;
  return (
    <section className="card hero">
      {c ? (
        <>
          <div className="heroTop">
            <div className="temp">
              {heroTemp}
              <span className="deg">°F</span>
            </div>
            <div className="heroMeta">
              <div className="cond">{cap(c.skyPhrase)}</div>
              {yard != null && (
                <div className="metaRow">NWS estimate for York Beach itself</div>
              )}
              <div className="metaRow">Wind {c.windText}</div>
              <div className="metaRow">
                Humidity {c.humidity}% · Dew {c.dewpF}°F
              </div>
              <div className="metaRow">
                Visibility {c.visibility} ·{' '}
                <span className={`chip cat-${(c.flightCategory || '').toLowerCase()}`}>
                  {c.flightCategory}
                </span>
              </div>
            </div>
          </div>
          <div className="source">
            Nearest report: {c.name} ({c.station}) · {c.distanceMi} mi
            {yard != null && <> · reads {c.tempF}°F</>} · observed {relTimeUnix(c.obsTime)}
          </div>
        </>
      ) : (
        <div className="cond">Live airport observation unavailable right now.</div>
      )}
      <p className="summary">{data.summary}</p>
      {data.sun && (
        <div className="sun">
          ☀ {clock(data.sun.sunrise, tz, true)} · 🌙 {clock(data.sun.sunset, tz, true)}
        </div>
      )}
      {c?.rawOb && (
        <details className="raw">
          <summary>Raw METAR</summary>
          <pre>{c.rawOb}</pre>
        </details>
      )}
    </section>
  );
}

function GardenWatch({ garden, alerts }) {
  const st = STATUS[garden?.status] || STATUS.calm;
  const flags = garden?.flags || [];
  return (
    <section className="card">
      <div className={`banner ${st.cls}`}>
        <span className="bannerLabel">Garden watch</span>
        <span className="bannerStatus">{st.label}</span>
      </div>
      {flags.length === 0 ? (
        <p className="muted">No frost, wind, heat, or heavy-rain concerns in the next 2 days.</p>
      ) : (
        <ul className="flags">
          {flags.map((f, i) => (
            <li key={i} className={`flag ${f.level}`}>
              <span className={`lvl ${f.level}`}>{f.level}</span>
              <div>
                <strong>{f.title}</strong>
                <div className="flagDetail">{f.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {alerts?.length > 0 && (
        <div className="official">
          {alerts.map((a, i) => (
            <details key={i} className="raw">
              <summary>
                ⚠ {a.event}
                {a.severity ? ` (NWS, ${a.severity})` : ' (NWS)'}
              </summary>
              <div className="flagDetail">{a.headline}</div>
              {a.description && <pre className="alertDesc">{a.description}</pre>}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function Hourly({ hourly, tz }) {
  if (!hourly?.length) return null;
  const next = hourly.slice(0, 24);
  return (
    <section className="card">
      <h2>Next 24 hours</h2>
      <div className="hourly">
        {next.map((h, i) => (
          <div className="hr" key={i}>
            <div className="hrTime">{dayHour(h.time, tz)}</div>
            <div className="hrTemp">{h.tempF}°</div>
            <div className="hrBarWrap">
              <div className="hrBar" style={{ height: `${Math.max(2, h.pop)}%` }} />
            </div>
            <div className="hrPop">{h.pop}%</div>
          </div>
        ))}
      </div>
      <div className="muted small">Bar height = chance of precipitation.</div>
    </section>
  );
}

function Forecast({ periods, tz, live }) {
  if (!periods?.length) return null;
  return (
    <section className="card">
      <h2>
        Forecast · your location (NWS)
        {live && <span className="liveBadge">live</span>}
      </h2>
      <div className="periods">
        {periods.map((p, i) => (
          <details key={i} className="period">
            <summary>
              <span className="pName">
                {p.name}
                {p.isDaytime && <span className="pDate">{shortDate(p.startTime, tz)}</span>}
              </span>
              <span className="pShort">{p.shortForecast}</span>
              <span className="pTemp">
                {p.isDaytime ? 'High' : 'Low'} {p.tempF}°
              </span>
              {p.pop > 0 && <span className="pPop">{p.pop}%</span>}
            </summary>
            <p className="detail">{p.detailedForecast}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Aviation({ aviation }) {
  if (!aviation?.tafs?.length)
    return (
      <section className="card">
        <h2>Aviation outlook (TAF)</h2>
        <p className="muted">TAF feed unavailable at the last update.</p>
      </section>
    );
  return (
    <section className="card">
      <h2>Aviation outlook (TAF)</h2>
      {aviation.tafs.map((t, i) => (
        <div className="taf" key={i}>
          <div className="tafHead">
            {t.name} ({t.station}) · {t.distanceMi} mi
            {aviation.primary === t.station ? ' · nearest' : ''}
          </div>
          <ul className="tafPeriods">
            {t.periods.map((p, j) => (
              <li key={j}>{p.summary}</li>
            ))}
          </ul>
          <details className="raw">
            <summary>Raw TAF</summary>
            <pre>{t.raw}</pre>
          </details>
        </div>
      ))}
    </section>
  );
}

function Nearby({ nearby }) {
  if (!nearby?.length) return null;
  return (
    <section className="card">
      <h2>Nearby stations</h2>
      <table className="nearby">
        <thead>
          <tr>
            <th>Station</th>
            <th>Dist</th>
            <th>Temp</th>
            <th>Wind</th>
            <th>Sky</th>
          </tr>
        </thead>
        <tbody>
          {nearby.map((n, i) => (
            <tr key={i}>
              <td>{n.station}</td>
              <td>{n.distanceMi} mi</td>
              <td>{n.tempF}°F</td>
              <td>{n.windMph} mph</td>
              <td>{n.sky}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Footer({ data, tz, onRefresh, refreshing, refreshOk }) {
  return (
    <footer className="ftr">
      <div className="health">
        {(data.health?.sources || []).map((s, i) => (
          <span key={i} className={`dot ${s.ok ? 'ok' : 'bad'}`} title={s.error || ''}>
            {s.name.toUpperCase()}
          </span>
        ))}
      </div>
      <div className="muted small">
        Sources: NWS api.weather.gov + NOAA Aviation Weather Center. Auto-updates about every 30
        minutes.
      </div>
      <div className="muted small">
        Snapshot {relTime(data.generatedAt)} · {clock(data.generatedAt, tz, true)}
      </div>
      <button
        className={`refreshWide${refreshing ? ' spinning' : ''}${refreshOk ? ' done' : ''}`}
        onClick={onRefresh}
        disabled={refreshing}
      >
        {refreshing ? 'Refreshing…' : refreshOk ? 'Updated ✓' : 'Refresh now'}
      </button>
    </footer>
  );
}
