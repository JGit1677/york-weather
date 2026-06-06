// Small client-side display helpers. Most formatting is done server-side in
// the compiler; these just turn timestamps into friendly local strings.

export function relTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function relTimeUnix(sec) {
  return sec == null ? '' : relTime(new Date(sec * 1000).toISOString());
}

export function clock(iso, tz, withMinutes = false) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    ...(withMinutes ? { minute: '2-digit' } : {}),
  });
}

export function dayHour(iso, tz) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { timeZone: tz, hour: 'numeric' });
}

// Compact numeric date like "6/7" in the location's local time zone.
export function shortDate(iso, tz) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: tz,
    month: 'numeric',
    day: 'numeric',
  });
}
