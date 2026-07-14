// Single source of truth for WHERE we forecast and WHICH stations we read.
// Adding or swapping a station is a one-line change here.

export const LOCATION = {
  label: 'York Beach, ME 03909',
  lat: 43.1745,
  lon: -70.6092,
  timeZone: 'America/New_York',
};

// Candidate observation airports. The compiler ranks these by true
// great-circle distance from LOCATION and uses the nearest as "current".
export const METAR_STATIONS = ['KPSM', 'KSFM', 'KDAW', 'KPWM', 'KBVY'];

// Nearest airports that issue a full TAF (terminal aerodrome forecast).
// KPSM (Portsmouth/Pease) is the closest; KPWM (Portland) is the backup.
export const TAF_STATIONS = ['KPSM', 'KPWM'];

// NWS public forecast zone for the York coast — drives official
// watches/warnings/advisories (freeze, wind, heat, etc.).
export const NWS_ZONE = 'MEZ023';

// Nearest true COASTAL observation: Wells Reserve at Laudholm (NERRS), via
// NDBC. ~11.6 mi up the coast, half a mile from the ocean — same sea-breeze
// microclimate as York Beach, unlike the inland airports. Reports every 15 min.
export const COASTAL_STATION = {
  id: 'WEXM1',
  name: 'Wells Reserve (Laudholm Farm)',
  lat: 43.337,
  lon: -70.549,
};

// Sent as User-Agent to api.weather.gov. NWS asks for a descriptive UA
// with contact info; replace the email with your own if you like.
export const CONTACT = 'york-weather-dashboard (github pages; contact: you@example.com)';

// Garden-relevant thresholds, tuned to Zone 6b coastal Maine.
// All temperatures in degrees F, wind in mph, precip as percent chance.
export const THRESHOLDS = {
  hardFreezeF: 28,
  freezeF: 32,
  frostF: 36,
  hotF: 88,
  veryHotF: 90,
  windSustainedMph: 20,
  windGustMph: 30,
  rainLikelyPct: 50,
  heavyRainPct: 70,
  dryStretchMaxPct: 30,
};
