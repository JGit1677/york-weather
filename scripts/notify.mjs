// Phase 2 (ready but OFF): turn the compiled forecast into a text/push message.
// Reuses the exact same weather.json the dashboard shows, so alerts always
// match the dashboard. No channel configured => prints a dry-run preview.
//
//   node scripts/notify.mjs --mode=daily    # morning digest
//   node scripts/notify.mjs --mode=events   # only sends when status != calm
//
// Channels (set as env vars / GitHub Actions secrets):
//   ntfy:     NTFY_TOPIC   (and optional NTFY_SERVER, default https://ntfy.sh)
//   Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../public/data/weather.json');

function fmt(iso, tz) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildMessage(d, mode) {
  const g = d.garden || {};
  const lines = [];
  if (mode === 'events') {
    const notable = (g.flags || []).filter((f) => f.level !== 'info');
    if (!notable.length) return null; // nothing worth a ping
    lines.push(`York Beach garden — ${g.status.toUpperCase()}`);
    for (const f of notable) lines.push(`• ${f.title}: ${f.detail}`);
  } else {
    lines.push(`York Beach forecast — ${fmt(d.generatedAt, d.location.timeZone)}`);
    if (d.current) {
      lines.push(`Now: ${d.current.tempF}°F, ${d.current.skyPhrase}, wind ${d.current.windText}.`);
    }
    for (const p of (d.pointForecast?.periods || []).slice(0, 2)) {
      const rain = p.pop ? `, ${p.pop}% rain` : '';
      lines.push(`${p.name}: ${p.shortForecast}, ${p.isDaytime ? 'high' : 'low'} ${p.tempF}°F${rain}.`);
    }
    const flags = g.flags || [];
    if (flags.length) {
      lines.push('Garden:');
      for (const f of flags) lines.push(`• ${f.title}: ${f.detail}`);
    } else {
      lines.push('Garden: all clear for the next 2 days.');
    }
  }
  return lines.join('\n');
}

async function sendNtfy(topic, server, title, message) {
  const url = `${server.replace(/\/$/, '')}/${topic}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Title: title, Tags: 'seedling' },
    body: message,
  });
  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
}

async function sendTelegram(token, chatId, message) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  if (!res.ok) throw new Error(`telegram HTTP ${res.status}`);
}

async function main() {
  const modeArg = process.argv.find((a) => a.startsWith('--mode=')) || '--mode=daily';
  const mode = modeArg.split('=')[1];
  const data = JSON.parse(await readFile(FILE, 'utf8'));
  const message = buildMessage(data, mode);

  if (!message) {
    console.log('Nothing notable to send (events mode, status calm).');
    return;
  }

  const title =
    mode === 'events' ? `Garden alert: ${data.garden.status}` : 'York Beach forecast';
  const {
    NTFY_TOPIC,
    NTFY_SERVER = 'https://ntfy.sh',
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = process.env;

  let sent = false;
  if (NTFY_TOPIC) {
    await sendNtfy(NTFY_TOPIC, NTFY_SERVER, title, message);
    console.log(`Sent via ntfy -> ${NTFY_TOPIC}`);
    sent = true;
  }
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    await sendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, message);
    console.log('Sent via Telegram');
    sent = true;
  }
  if (!sent) {
    console.log('[dry run] No channel configured. Message preview:\n');
    console.log(message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
