'use strict';
const sharp = require('sharp');
const { fetchUrlBytes } = require('../attachments');
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const BG = '#0b0b0c';
const CARD_BG = '#1c1c1e';
const TEXT = '#ffffff';
const MUTED = '#a1a1a6';
const MUTED_DARK = '#6e6e73';
const TRACK = '#2c2c2e';
const RENDER_OPTS = { density: 144 };
function _render(svg) {
  return sharp(Buffer.from(svg), RENDER_OPTS).png().toBuffer();
}
function _esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
function _truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
async function _iconDataUri(iconUrl, size) {
  if (!iconUrl) return null;
  const bytes = await fetchUrlBytes(iconUrl);
  if (!bytes) return null;
  try {
    const resized = await sharp(bytes).resize(size, size, { fit: 'cover' }).png().toBuffer();
    return `data:image/png;base64,${resized.toString('base64')}`;
  } catch {
    return null;
  }
}
function _headerSvg({ title, subtitle, iconDataUri, width }) {
  const iconCx = width - 68;
  const iconCy = 60;
  const iconR = 32;
  const icon = iconDataUri
    ? `<clipPath id="iconClip"><circle cx="${iconCx}" cy="${iconCy}" r="${iconR}"/></clipPath>
       <image href="${iconDataUri}" xlink:href="${iconDataUri}" x="${iconCx - iconR}" y="${iconCy - iconR}" width="${iconR * 2}" height="${iconR * 2}" clip-path="url(#iconClip)"/>
       <circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" fill="none" stroke="${TRACK}" stroke-width="1"/>`
    : '';
  return `
    <text x="40" y="52" font-family="${FONT}" font-size="28" font-weight="600" letter-spacing="-0.3" fill="${TEXT}">${_esc(title)}</text>
    <text x="40" y="78" font-family="${FONT}" font-size="15" fill="${MUTED}">${_esc(subtitle)}</text>
    ${icon}
  `;
}
function _speakerIcon(x, y) {
  return `<g transform="translate(${x}, ${y}) scale(0.7)" fill="none" stroke="${TEXT}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 8v6h3.5L11 19V3L5.5 8H2z" fill="${TEXT}" stroke="none"/>
    <path d="M15 8.5a5 5 0 0 1 0 5"/>
    <path d="M17.3 5.8a9 9 0 0 1 0 10.4"/>
  </g>`;
}
function _statCard(x, y, w, h, value, label) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${CARD_BG}"/>
    <text x="${x + 18}" y="${y + 36}" font-family="${FONT}" font-size="26" font-weight="600" fill="${TEXT}">${_esc(value)}</text>
    <text x="${x + 18}" y="${y + 58}" font-family="${FONT}" font-size="13" fill="${MUTED}">${_esc(label)}</text>
  `;
}
async function renderServerPulse({ guildName, iconUrl, memberCount, onlineCount, messages24h, messagesTotal, hourlyBuckets, topUsers }) {
  const width = 900;
  const height = 460;
  const iconDataUri = await _iconDataUri(iconUrl, 128);
  const stats = [
    [memberCount.toLocaleString('en-US'), 'Members'],
    [onlineCount.toLocaleString('en-US'), 'Online now'],
    [messages24h.toLocaleString('en-US'), 'Messages (24h)'],
    [messagesTotal.toLocaleString('en-US'), 'Messages tracked'],
  ];
  const cardW = 190;
  const cardGap = 20;
  const cardsY = 108;
  const cards = stats.map(([value, label], i) => _statCard(40 + i * (cardW + cardGap), cardsY, cardW, 80, value, label)).join('');
  const chartX = 40;
  const chartY = 216;
  const chartW = 820;
  const chartH = 160;
  const baselineY = chartY + chartH;
  const n = hourlyBuckets.length;
  const gap = 4;
  const barW = (chartW - gap * (n - 1)) / n;
  const maxCount = Math.max(1, ...hourlyBuckets.map((b) => b.count));
  const bars = hourlyBuckets
    .map((b, i) => {
      const barH = Math.max(2, (b.count / maxCount) * (chartH - 10));
      const x = chartX + i * (barW + gap);
      const y = baselineY - barH;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="url(#barGrad)"/>`;
    })
    .join('');
  const labelIdx = [0, 6, 12, 18, n - 1];
  const hourLabels = labelIdx
    .map((i) => {
      const b = hourlyBuckets[i];
      if (!b) return '';
      const x = chartX + i * (barW + gap) + barW / 2;
      const hour = new Date(b.hourStart).getHours();
      const label = hour === 0 ? '12AM' : hour === 12 ? '12PM' : hour > 12 ? `${hour - 12}PM` : `${hour}AM`;
      return `<text x="${x.toFixed(1)}" y="${baselineY + 22}" font-family="${FONT}" font-size="11" fill="${MUTED_DARK}" text-anchor="middle">${label}</text>`;
    })
    .join('');
  const chartTitle = `Messages per hour, last 24h${messages24h > 0 ? ` (peak ${maxCount})` : ''}`;
  const topLine = topUsers.length > 0 ? `Most active: ${topUsers.map((u) => `${_esc(_truncate(u.name, 18))} (${u.count})`).join('   ·   ')}` : '';
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <linearGradient id="barGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="${MUTED_DARK}"/>
          <stop offset="100%" stop-color="${TEXT}"/>
        </linearGradient>
        <clipPath id="cardClip"><rect width="${width}" height="${height}" rx="20"/></clipPath>
      </defs>
      <g clip-path="url(#cardClip)">
        <rect width="${width}" height="${height}" fill="${BG}"/>
        ${_headerSvg({ title: 'Server Pulse', subtitle: guildName, iconDataUri, width })}
        ${cards}
        <text x="${chartX}" y="${chartY - 14}" font-family="${FONT}" font-size="14" font-weight="500" fill="${MUTED}">${_esc(chartTitle)}</text>
        <line x1="${chartX}" y1="${baselineY}" x2="${chartX + chartW}" y2="${baselineY}" stroke="${TRACK}" stroke-width="1"/>
        ${bars}
        ${hourLabels}
        ${topLine ? `<text x="${chartX}" y="${height - 24}" font-family="${FONT}" font-size="13" fill="${MUTED}">${topLine}</text>` : ''}
      </g>
    </svg>
  `;
  return _render(svg);
}
async function renderVoicePulse({ guildName, iconUrl, totalInVoice, channels }) {
  const width = 900;
  const shown = channels.slice(0, 8);
  const rowH = 74;
  const headerH = 130;
  const height = headerH + Math.max(1, shown.length) * rowH + 30;
  const iconDataUri = await _iconDataUri(iconUrl, 128);
  const maxMembers = Math.max(1, ...shown.map((c) => c.members.length));
  const trackX = 40;
  const trackW = 820;
  let rows;
  if (shown.length === 0) {
    rows = `<text x="${trackX}" y="${headerH + 40}" font-family="${FONT}" font-size="16" fill="${MUTED}">It's quiet in here. No one's in voice right now.</text>`;
  } else {
    rows = shown
      .map((c, i) => {
        const y = headerH + i * rowH;
        const barW = Math.max(6, (c.members.length / maxMembers) * trackW);
        const shownNames = c.members.slice(0, 5).join(', ');
        const extra = c.members.length > 5 ? ` +${c.members.length - 5} more` : '';
        const namesText = _esc(_truncate(shownNames + extra, 90));
        return `
          ${_speakerIcon(trackX, y + 4)}
          <text x="${trackX + 22}" y="${y + 16}" font-family="${FONT}" font-size="15" font-weight="600" fill="${TEXT}">${_esc(_truncate(c.name, 40))}</text>
          <text x="${trackX + trackW}" y="${y + 16}" font-family="${FONT}" font-size="13" fill="${MUTED}" text-anchor="end">${c.members.length}</text>
          <rect x="${trackX}" y="${y + 24}" width="${trackW}" height="14" rx="7" fill="${TRACK}"/>
          <rect x="${trackX}" y="${y + 24}" width="${barW.toFixed(1)}" height="14" rx="7" fill="url(#barGrad)"/>
          <text x="${trackX}" y="${y + 56}" font-family="${FONT}" font-size="12" fill="${MUTED_DARK}">${namesText}</text>
        `;
      })
      .join('');
  }
  const overflowCount = channels.length - shown.length;
  const overflow =
    overflowCount > 0
      ? `<text x="${trackX}" y="${height - 12}" font-family="${FONT}" font-size="12" fill="${MUTED_DARK}">+${overflowCount} more active channel${overflowCount === 1 ? '' : 's'}</text>`
      : '';
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${MUTED_DARK}"/>
          <stop offset="100%" stop-color="${TEXT}"/>
        </linearGradient>
        <clipPath id="cardClip"><rect width="${width}" height="${height}" rx="20"/></clipPath>
      </defs>
      <g clip-path="url(#cardClip)">
        <rect width="${width}" height="${height}" fill="${BG}"/>
        ${_headerSvg({ title: 'Voice Pulse', subtitle: `${guildName} · ${totalInVoice} in voice`, iconDataUri, width })}
        ${rows}
        ${overflow}
      </g>
    </svg>
  `;
  return _render(svg);
}
const DAY_MS = 24 * 60 * 60 * 1000;
const MAP_WEEKS = 53;
const MAP_LEVEL_COLORS = [CARD_BG, '#3a3a3d', '#636366', '#aeaeb2', TEXT];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_ROW_LABELS = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };
function _isoDay(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}
function _mapLevel(count, maxCount) {
  if (!count || !maxCount) return 0;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
async function renderScamMap({ guildName, iconUrl, days, totalCatches }) {
  const width = 900;
  const cell = 11;
  const gap = 3;
  const colWidth = cell + gap;
  const gridLeftX = 56;
  const gridTopY = 172;
  const iconDataUri = await _iconDataUri(iconUrl, 128);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const lastColSunday = todayTs - today.getUTCDay() * DAY_MS;
  const gridStart = lastColSunday - (MAP_WEEKS - 1) * 7 * DAY_MS;
  const cells = [];
  let maxCount = 0;
  let busiest = null;
  let currentStreak = 0;
  let streaking = true;
  for (let w = 0; w < MAP_WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const ts = gridStart + (w * 7 + d) * DAY_MS;
      if (ts > todayTs) continue;
      const key = _isoDay(ts);
      const count = days[key] ?? 0;
      if (count > maxCount) maxCount = count;
      if (!busiest || count > busiest.count) busiest = { key, count };
      cells.push({ w, d, ts, count });
    }
  }
  for (let ts = todayTs; ts >= gridStart && streaking; ts -= DAY_MS) {
    const count = days[_isoDay(ts)] ?? 0;
    if (count > 0) currentStreak += 1;
    else streaking = false;
  }
  const cellsSvg = cells
    .map((c) => {
      const x = gridLeftX + c.w * colWidth;
      const y = gridTopY + c.d * colWidth;
      const fill = MAP_LEVEL_COLORS[_mapLevel(c.count, maxCount)];
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${fill}"/>`;
    })
    .join('');
  let lastMonth = -1;
  const monthLabels = [];
  for (let w = 0; w < MAP_WEEKS; w++) {
    const month = new Date(gridStart + w * 7 * DAY_MS).getUTCMonth();
    if (month !== lastMonth) {
      lastMonth = month;
      monthLabels.push(
        `<text x="${gridLeftX + w * colWidth}" y="${gridTopY - 8}" font-family="${FONT}" font-size="11" fill="${MUTED_DARK}">${MONTH_NAMES[month]}</text>`
      );
    }
  }
  const dayLabels = Object.entries(DAY_ROW_LABELS)
    .map(
      ([d, label]) =>
        `<text x="${gridLeftX - 8}" y="${gridTopY + Number(d) * colWidth + cell}" font-family="${FONT}" font-size="10" fill="${MUTED_DARK}" text-anchor="end">${label}</text>`
    )
    .join('');
  const gridHeight = 7 * colWidth;
  const legendY = gridTopY + gridHeight + 26;
  const legendTotalWidth = MAP_LEVEL_COLORS.length * cell + (MAP_LEVEL_COLORS.length - 1) * gap;
  const legendRightX = width - 40;
  const legendStartX = legendRightX - legendTotalWidth;
  const legend = MAP_LEVEL_COLORS.map(
    (color, i) => `<rect x="${legendStartX + i * (cell + gap)}" y="${legendY - cell + 2}" width="${cell}" height="${cell}" rx="2" fill="${color}"/>`
  ).join('');
  const height = legendY + 20;
  const summary =
    maxCount === 0
      ? 'Clean record. No scams caught yet.'
      : `Busiest day: ${busiest.key} (${busiest.count} catch${busiest.count === 1 ? '' : 'es'})   ·   Current streak: ${currentStreak} day${currentStreak === 1 ? '' : 's'}`;
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <clipPath id="cardClip"><rect width="${width}" height="${height}" rx="20"/></clipPath>
      </defs>
      <g clip-path="url(#cardClip)">
        <rect width="${width}" height="${height}" fill="${BG}"/>
        ${_headerSvg({ title: 'Scam Map', subtitle: `${guildName} · ${totalCatches.toLocaleString('en-US')} scam${totalCatches === 1 ? '' : 's'} caught`, iconDataUri, width })}
        ${monthLabels.join('')}
        ${dayLabels}
        ${cellsSvg}
        <text x="40" y="${legendY - 1}" font-family="${FONT}" font-size="12" fill="${MUTED}">${_esc(summary)}</text>
        <text x="${legendStartX - 6}" y="${legendY - 1}" font-family="${FONT}" font-size="10" fill="${MUTED_DARK}" text-anchor="end">Less</text>
        ${legend}
        <text x="${legendRightX + 6}" y="${legendY - 1}" font-family="${FONT}" font-size="10" fill="${MUTED_DARK}">More</text>
      </g>
    </svg>
  `;
  return _render(svg);
}
module.exports = { renderServerPulse, renderVoicePulse, renderScamMap };
