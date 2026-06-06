// Pure geometry + unit helpers. No I/O, so they are trivial to unit-test.

// Great-circle distance in miles (haversine).
export function distanceMi(aLat, aLon, bLat, bLon) {
  const R = 3958.7613; // mean Earth radius, miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const cToF = (c) => (c == null ? null : (c * 9) / 5 + 32);
export const ktToMph = (kt) => (kt == null ? null : kt * 1.150779);

// Relative humidity (%) from temperature & dew point in degrees C (Magnus).
export function relHumidity(tempC, dewpC) {
  if (tempC == null || dewpC == null) return null;
  const a = 17.625;
  const b = 243.04;
  const num = Math.exp((a * dewpC) / (b + dewpC));
  const den = Math.exp((a * tempC) / (b + tempC));
  return Math.round(100 * (num / den));
}

export const round = (n, d = 0) =>
  n == null || Number.isNaN(n) ? null : Number(Number(n).toFixed(d));

// Pull the largest integer out of an NWS wind string like "5 to 10 mph".
export function parseMaxMph(s) {
  if (s == null) return null;
  const m = String(s).match(/\d+/g);
  return m ? Math.max(...m.map(Number)) : null;
}
