// Translation dictionaries + formatters for raw aviation codes.

const SKY = {
  CLR: 'clear',
  SKC: 'clear',
  NSC: 'clear',
  NCD: 'clear',
  FEW: 'few clouds',
  SCT: 'scattered clouds',
  BKN: 'broken clouds',
  OVC: 'overcast',
  OVX: 'sky obscured',
};

export function skyWord(cover) {
  return SKY[cover] || (cover ? String(cover).toLowerCase() : 'unknown');
}

// Common METAR/TAF present-weather tokens. Unknown tokens pass through raw.
const WX = {
  '-RA': 'light rain',
  RA: 'rain',
  '+RA': 'heavy rain',
  '-SHRA': 'light rain showers',
  SHRA: 'rain showers',
  '+SHRA': 'heavy rain showers',
  VCSH: 'showers nearby',
  TSRA: 'thunderstorms with rain',
  '+TSRA': 'heavy thunderstorms',
  TS: 'thunderstorm',
  VCTS: 'thunderstorms nearby',
  '-SN': 'light snow',
  SN: 'snow',
  '+SN': 'heavy snow',
  '-SHSN': 'light snow showers',
  RASN: 'rain and snow',
  '-DZ': 'light drizzle',
  DZ: 'drizzle',
  BR: 'mist',
  FG: 'fog',
  HZ: 'haze',
  FU: 'smoke',
  FZRA: 'freezing rain',
  FZFG: 'freezing fog',
  GR: 'hail',
  GS: 'small hail',
  UP: 'unknown precipitation',
};

export function wxWords(raw) {
  if (!raw) return null;
  return String(raw)
    .trim()
    .split(/\s+/)
    .map((t) => WX[t] || t)
    .join(', ');
}

// Format a unix-seconds or ISO timestamp in the location's local time zone.
export function fmtTime(value, timeZone, opts = {}) {
  if (value == null) return null;
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    ...opts,
  });
}

// Describe a cloud layer object {cover, base} in plain words.
export function cloudPhrase(layer) {
  if (!layer || !layer.cover) return null;
  const word = skyWord(layer.cover);
  if (layer.base == null) return word;
  return `${word} at ${layer.base.toLocaleString('en-US')} ft`;
}
