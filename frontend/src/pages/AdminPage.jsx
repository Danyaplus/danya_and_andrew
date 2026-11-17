import { useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'kodumi-admin-token';
const SITE_URL = new URL(import.meta.env.BASE_URL, window.location.origin).href;
const ADMIN_BASE = `${import.meta.env.VITE_API_BASE || 'https://d-and-a-backend.onrender.com'}/api/admin`;

const gameCatalog = [
  { id: 'shadow-realms', name: 'Shadow Realms', genre: 'Action RPG', playsToday: 328941, weeklyPlays: 2176890, peakOnline: 12487, avgSession: '28m', growth: '+23.7%', accent: 'violet' },
  { id: 'cyber-drift', name: 'Cyber Drift', genre: 'Racing', playsToday: 189420, weeklyPlays: 1372564, peakOnline: 8913, avgSession: '16m', growth: '+12.6%', accent: 'cyan' },
  { id: 'fantasy-arena', name: 'Fantasy Arena', genre: 'MOBA', playsToday: 143287, weeklyPlays: 1009331, peakOnline: 7662, avgSession: '27m', growth: '+9.8%', accent: 'pink' },
  { id: 'pixel-survivors', name: 'Pixel Survivors', genre: 'Survival', playsToday: 97563, weeklyPlays: 684302, peakOnline: 5481, avgSession: '18m', growth: '+6.1%', accent: 'green' },
  { id: 'battle-zone-x', name: 'Battle Zone X', genre: 'FPS', playsToday: 84109, weeklyPlays: 602441, peakOnline: 5004, avgSession: '22m', growth: '+4.9%', accent: 'orange' },
];

const avatars = ['NovaPlayer', 'GameKnight', 'PixelLuna', 'RexGaming', 'ShadowByte', 'CyberDrift', 'AstraMancer', 'VortexX', 'BattleZoneX', 'MysticRaven'];
const statuses = ['Online', 'Online', 'Online', 'In Game', 'Online', 'In Game', 'Offline', 'Offline', 'Offline', 'Offline'];
const sampleLastSeen = ['Just now', '1 min ago', '2 min ago', '3 min ago', '5 min ago', '6 min ago', '14 min ago', '17 min ago', '21 min ago', '24 min ago'];
const avatarHue = [280, 235, 315, 205, 260, 220, 192, 185, 12, 295];

function buildPlayers(count = 160) {
  const players = [];
  for (let i = 0; i < count; i += 1) {
    const baseName = avatars[i % avatars.length];
    const rank = i + 1;
    const name = i < avatars.length ? baseName : `${baseName}${Math.floor(i / avatars.length)}`;
    const level = 22 + ((i * 7) % 68);
    const matches = 1200 + ((i * 137) % 4100);
    const coins = 420000 + ((i * 101317) % 2200000);
    const xp = 180000 + ((i * 82117) % 2900000);
    const hours = 140 + ((i * 13) % 820);
    players.push({
      id: `PLR-${5483217 + i}`,
      rank,
      displayName: name,
      login: name.toLowerCase().replace(/[^a-z0-9]+/g, ''),
      status: statuses[i % statuses.length],
      lastSeen: sampleLastSeen[i % sampleLastSeen.length],
      matches,
      coins,
      xp,
      level,
      hoursPlayed: hours,
      topGames: [gameCatalog[i % 5], gameCatalog[(i + 1) % 5], gameCatalog[(i + 2) % 5]],
      allGames: [...gameCatalog, ...gameCatalog.slice(0, 3)].map((game, index) => ({ ...game, matches: Math.max(28, Math.floor(matches / (index + 2))) })),
      boughtItems: ['Night City Background', 'Arena Champion Title', 'Cyber Wings', 'Gold Border', 'Shadow Badge', 'Premium Profile Frame'].slice(0, 3 + (i % 4)),
      achievements: ['First Victory', 'Champion League', '100 Wins', 'Collector', 'Streak Master', 'Arena Hero'].slice(0, 3 + (i % 4)),
      avatarHue: avatarHue[i % avatarHue.length],
      favoriteGame: gameCatalog[i % 5],
      reports: i % 7 === 0 ? 3 : i % 5 === 0 ? 1 : 0,
      registeredAt: ['Mar 02, 2023', 'Jun 14, 2023', 'Oct 09, 2024', 'Jan 13, 2025'][i % 4],
      ipHistory: [
        { ip: `203.0.113.${(42 + i) % 250}`, region: 'US', device: 'Windows 11 · Chrome', lastSeen: 'Just now' },
        { ip: `198.51.100.${(77 + i) % 250}`, region: 'CA', device: 'Windows 11 · Edge', lastSeen: '2 days ago' },
      ],
    });
  }
  return players;
}

const allPlayers = buildPlayers();
const featuredPlayerId = allPlayers[0].id;

async function adminRequest(path, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${ADMIN_BASE}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error || 'ADMIN_REQUEST_FAILED');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function AdminIcon({ name, size = 20 }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };
  const icons = {
    gamepad: <path d="M7 18h10a4 4 0 0 0 4-4.5l-.4-2.5A5 5 0 0 0 15.7 7H8.3a5 5 0 0 0-4.9 4L3 13.5A4 4 0 0 0 7 18Z M8 12h3M9.5 10.5v3M15.5 10.5h.01M18 13h.01" />,
    user: <><path d="M12 13c3.3 0 6 2.1 6 4.7V20H6v-2.3C6 15.1 8.7 13 12 13Z" /><circle cx="12" cy="7.5" r="3.5" /></>,
    lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
    eye: <><path d="M2.5 12s3.5-5.5 9.5-5.5S21.5 12 21.5 12s-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></>,
    eyeOff: <><path d="m3 3 18 18" /><path d="M10.8 6.6A11.4 11.4 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a15 15 0 0 1-3 3.4" /><path d="M6.8 7.5C4 9.1 2.5 12 2.5 12s3.5 5.5 9.5 5.5a10 10 0 0 0 2.8-.4" /><path d="M10 10a2.8 2.8 0 0 0 4 4" /></>,
    signIn: <><path d="M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8" /><path d="M3 12h11" /><path d="m10 8 4 4-4 4" /></>,
    arrowLeft: <><path d="m11 5-7 7 7 7" /><path d="M4 12h16" /></>,
    dashboard: <><path d="M4 12.5 12 5l8 7.5" /><path d="M6.5 10.5V19h11v-8.5" /></>,
    trophy: <><path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a2 2 0 0 0 0 4h2" /><path d="M16 6h3a2 2 0 1 1 0 4h-2" /><path d="M12 11v4" /><path d="M9 19h6" /></>,
    players: <><path d="M6.5 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm11 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" /><path d="M1.5 19.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" /><path d="M12 19.5c.2-2.2 2.2-4 4.8-4 2.8 0 5.2 2 5.2 4.5" /></>,
    shield: <path d="M12 3 5 6v5c0 4.2 2.7 7.9 7 9.8 4.3-1.9 7-5.6 7-9.8V6l-7-3Z" />,
    chart: <><path d="M4 19V5" /><path d="M10 19V9" /><path d="M16 19V12" /><path d="M22 19V3" /></>,
    ban: <><circle cx="12" cy="12" r="9" /><path d="m7 7 10 10" /></>,
    gear: <path d="M12 3.8 14 4l1 2 2 .8 1.8-1 1.4 1.4-1 1.8.8 2 2 .9v2l-2 .9-.8 2 1 1.8-1.4 1.4-1.8-1-2 .8-1 2-2 .2-1-2-2-.8-1.8 1L3.8 18l1-1.8-.8-2-2-.9v-2l2-.9.8-2-1-1.8L5.2 4.8l1.8 1 2-.8 1-2Z M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />,
    coin: <><ellipse cx="12" cy="6" rx="6.5" ry="2.5" /><path d="M5.5 6v8c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6" /><path d="M5.5 10.2c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" /></>,
    wifi: <><path d="M2.5 8.5a15 15 0 0 1 19 0" /><path d="M5.5 11.8a10 10 0 0 1 13 0" /><path d="M8.8 15.1a5 5 0 0 1 6.4 0" /><circle cx="12" cy="18.2" r="1" fill="currentColor" stroke="none" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    bell: <><path d="M6.5 16.5h11l-1.2-2.1v-3.3A4.3 4.3 0 0 0 12 6.8a4.3 4.3 0 0 0-4.3 4.3v3.3L6.5 16.5Z" /><path d="M10 18.5a2 2 0 0 0 4 0" /></>,
    lightning: <path d="M13 2 5 13h5l-1 9 8-11h-5l1-9Z" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    star: <path d="m12 3.6 2.5 5.2 5.8.8-4.2 4.1 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.2-4.1 5.8-.8Z" />,
    crown: <path d="m4 17 1.5-8 4 4 2.5-5 2.5 5 4-4L20 17Z" />,
    trash: <><path d="M4.5 7.5h15" /><path d="M9 7.5v-2h6v2" /><path d="M7 7.5 8 19h8l1-11.5" /></>,
    external: <><path d="M14 5h5v5" /><path d="M10 14 19 5" /><path d="M19 13v5h-14V4h5" /></>,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    warning: <><path d="M12 4 21 20H3L12 4Z" /><path d="M12 10v4" /><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" /></>,
    flag: <><path d="M5 20V5" /><path d="M5 6h10l-1 3 1 3H5" /></>,
    calendar: <><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 9.5h16" /></>,
    home: <><path d="M4 12.5 12 5l8 7.5" /><path d="M7 10.8V19h10v-8.2" /></>,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronRight: <path d="m9 6 6 6-6 6" />,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    dots: <><circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
    download: <><path d="M12 4v10" /><path d="m8 10 4 4 4-4" /><path d="M5 19h14" /></>,
    copy: <><rect x="9" y="9" width="10" height="10" rx="2" /><rect x="5" y="5" width="10" height="10" rx="2" /></>,
    rocket: <path d="M13.5 4.5c2.2-.6 4.6-.5 6 1-1.2 1.4-1.7 3.8-1.1 6L12 18l-5-5 6.5-6.5Z M7 13l-2.5.5L4 16l2.5-.5M10 19l-.5 2.5L7 22l.5-2.5" />,
    level: <path d="M5 18 9 6l3 8 2-4 5 8" />,
    package: <><path d="m12 3 8 4.5v9L12 21 4 16.5v-9L12 3Z" /><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" /></>,
    logout: <><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M14 12H5" /><path d="m13 8 4 4-4 4" /></>,
  };
  return <svg {...shared}>{icons[name] || null}</svg>;
}

function BrandMark() {
  return (
    <div className="kg-admin-brandmark">
      <div className="kg-admin-brandmark__icon"><AdminIcon name="gamepad" size={26} /></div>
      <div><span>Kodumi</span> <b>Games</b></div>
    </div>
  );
}

function Avatar({ name, hue = 260, small = false }) {
  const initials = name.split(/\s+/u).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  return <div className={`kg-admin-avatar ${small ? 'kg-admin-avatar--small' : ''}`} style={{ '--avatar-hue': hue }} aria-hidden="true">{initials}</div>;
}

function MetricCard({ icon, label, value, delta, tone = 'violet' }) {
  return (
    <article className={`kg-admin-metric kg-admin-metric--${tone}`}>
      <div className="kg-admin-metric__icon"><AdminIcon name={icon} size={26} /></div>
      <div className="kg-admin-metric__content">
        <div className="kg-admin-metric__label">{label}</div>
        <div className="kg-admin-metric__value">{value}</div>
        {delta ? <div className="kg-admin-metric__delta">↗ {delta}</div> : null}
      </div>
    </article>
  );
}

function SectionCard({ title, icon, actions, className = '', children }) {
  return (
    <section className={`kg-admin-card ${className}`.trim()}>
      <div className="kg-admin-card__header">
        <div className="kg-admin-card__title"><AdminIcon name={icon} size={20} /> <span>{title}</span></div>
        {actions ? <div className="kg-admin-card__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function DashboardTab({ onOpenPlayer, onSwitchTab }) {
  const onlinePlayers = allPlayers.filter(player => player.status !== 'Offline').slice(0, 5);
  return (
    <div className="kg-admin-grid kg-admin-grid--dashboard">
      <div className="kg-admin-grid__full kg-admin-stats-grid">
        <MetricCard icon="players" label="Total Users" value={formatNumber(1248932)} delta="+8.4% vs last 7 days" />
        <MetricCard icon="wifi" label="Online Now" value={formatNumber(12487)} delta="+14.9% vs last 7 days" tone="cyan" />
        <MetricCard icon="gamepad" label="Total Matches" value={formatNumber(3562901)} delta="+6.2% vs last 7 days" />
        <MetricCard icon="coin" label="Platform Coins" value={formatNumber(8750000)} delta="+11.8% vs last 7 days" tone="amber" />
      </div>
      <SectionCard title="Most Popular Game" icon="star" className="kg-admin-featured-card">
        <div className="kg-admin-game-hero kg-admin-game-hero--violet">
          <div>
            <div className="kg-admin-chip-row">
              <span className="kg-admin-chip">Action</span>
              <span className="kg-admin-chip">RPG</span>
              <span className="kg-admin-chip">Multiplayer</span>
            </div>
            <h3>Shadow Realms</h3>
            <p>The most played title today across the entire Kodumi platform.</p>
          </div>
          <div className="kg-admin-game-hero__stats">
            <div><strong>{formatNumber(328941)}</strong><span>plays today</span></div>
            <div><strong>+23.7%</strong><span>growth</span></div>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Active Players (Last 7 Days)" icon="chart" actions={<button className="kg-admin-pill">Last 7 Days</button>}>
        <div className="kg-admin-chart">
          <div className="kg-admin-chart__line" />
          <div className="kg-admin-chart__labels"><span>Jan 10</span><span>Jan 11</span><span>Jan 12</span><span>Jan 13</span><span>Jan 14</span><span>Jan 15</span><span>Jan 16</span></div>
        </div>
      </SectionCard>
      <SectionCard title="Top Games" icon="trophy" actions={<button className="kg-admin-linkbutton" onClick={() => onSwitchTab('games')}>View All <AdminIcon name="chevronRight" size={16} /></button>}>
        <div className="kg-admin-list">
          {gameCatalog.map((game, index) => (
            <div className="kg-admin-list__row" key={game.id}>
              <div className={`kg-admin-thumb kg-admin-thumb--${game.accent}`}>{index + 1}</div>
              <div className="kg-admin-list__primary"><strong>{game.name}</strong><span>{formatNumber(game.playsToday)} plays</span></div>
              <div className="kg-admin-positive">{game.growth}</div>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Recently Active Players" icon="players" actions={<button className="kg-admin-linkbutton" onClick={() => onSwitchTab('players')}>Open Players <AdminIcon name="chevronRight" size={16} /></button>}>
        <div className="kg-admin-list">
          {onlinePlayers.map(player => (
            <button className="kg-admin-list__row kg-admin-list__row--button" type="button" key={player.id} onClick={() => onOpenPlayer(player.id)}>
              <Avatar name={player.displayName} hue={player.avatarHue} small />
              <div className="kg-admin-list__primary"><strong>{player.displayName}</strong><span>{player.lastSeen}</span></div>
              <span className={`kg-admin-status kg-admin-status--${player.status.toLowerCase().replace(/\s+/g, '-')}`}>{player.status}</span>
            </button>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Moderation Alerts" icon="warning">
        <div className="kg-admin-list">
          {[
            ['New Report: Inappropriate Chat', 'Player: ToxicWolf92 · 2 min ago'],
            ['New Report: Cheating / Exploiting', 'Player: SpeedHackX · 7 min ago'],
            ['Multiple Reports: Harassment', 'Player: RageMaster · 12 min ago'],
          ].map(([title, meta]) => (
            <div className="kg-admin-list__row" key={title}>
              <div className="kg-admin-alert-badge"><AdminIcon name="flag" size={18} /></div>
              <div className="kg-admin-list__primary"><strong>{title}</strong><span>{meta}</span></div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function GamesTab() {
  return (
    <div className="kg-admin-grid kg-admin-grid--games">
      <div className="kg-admin-grid__full kg-admin-stats-grid">
        <MetricCard icon="gamepad" label="Total Games" value={formatNumber(1827)} delta="+6.8% vs last 7 days" />
        <MetricCard icon="lightning" label="Games Played Today" value={formatNumber(4982310)} delta="+12.9% vs yesterday" tone="cyan" />
        <MetricCard icon="star" label="Most Popular Game" value="Shadow Realms" delta="328,941 plays today" />
        <MetricCard icon="clock" label="Avg. Session Time" value="24m 37s" delta="+8.4% vs last 7 days" tone="amber" />
      </div>
      <SectionCard title="Top Games Ranking" icon="trophy" className="kg-admin-grid__full" actions={<div className="kg-admin-filters"><button className="kg-admin-pill">Plays Today</button><button className="kg-admin-pill">All Genres</button><button className="kg-admin-pill">Last 7 Days</button></div>}>
        <div className="kg-admin-table-wrap">
          <table className="kg-admin-table">
            <thead>
              <tr><th>#</th><th>Game</th><th>Genre</th><th>Plays Today</th><th>Weekly Plays</th><th>Peak Online</th><th>Avg. Session</th><th>Growth</th></tr>
            </thead>
            <tbody>
              {gameCatalog.map((game, index) => (
                <tr key={game.id}>
                  <td>{index + 1}</td>
                  <td><div className="kg-admin-table-game"><div className={`kg-admin-thumb kg-admin-thumb--${game.accent}`} /><div><strong>{game.name}</strong><span>{game.id}</span></div></div></td>
                  <td>{game.genre}</td>
                  <td>{formatNumber(game.playsToday)}</td>
                  <td>{formatNumber(game.weeklyPlays)}</td>
                  <td>{formatNumber(game.peakOnline)}</td>
                  <td>{game.avgSession}</td>
                  <td className="kg-admin-positive">{game.growth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <SectionCard title="Current #1 Game" icon="crown">
        <div className="kg-admin-game-hero kg-admin-game-hero--blue">
          <div>
            <h3>Shadow Realms</h3>
            <p>Best daily retention, highest online peak and strongest weekly growth.</p>
          </div>
          <div className="kg-admin-mini-stats">
            <div><strong>68.4%</strong><span>retention</span></div>
            <div><strong>12,487</strong><span>peak online</span></div>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Game Popularity Trends" icon="chart" actions={<button className="kg-admin-pill">Last 7 Days</button>}>
        <div className="kg-admin-chart kg-admin-chart--multi">
          <div className="kg-admin-chart__line kg-admin-chart__line--alt" />
          <div className="kg-admin-chart__legend"><span className="violet">Shadow Realms</span><span className="cyan">Cyber Drift</span><span className="pink">Fantasy Arena</span><span className="green">Pixel Survivors</span></div>
        </div>
      </SectionCard>
      <SectionCard title="Fastest Rising Games" icon="rocket">
        <div className="kg-admin-list">
          {gameCatalog.slice(0, 3).map(game => (
            <div className="kg-admin-list__row" key={game.id}>
              <div className={`kg-admin-thumb kg-admin-thumb--${game.accent}`} />
              <div className="kg-admin-list__primary"><strong>{game.name}</strong><span>{game.genre}</span></div>
              <div className="kg-admin-positive">{game.growth}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function PlayersTab({ players, visibleCount, search, onSearch, onLoadMore, onShowAll, onOpenPlayer }) {
  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) =>
      player.displayName.toLowerCase().includes(query)
      || player.login.toLowerCase().includes(query)
      || player.id.toLowerCase().includes(query)
    );
  }, [players, search]);

  const visiblePlayers = filteredPlayers.slice(0, visibleCount);

  return (
    <div className="kg-admin-grid kg-admin-grid--players">
      <div className="kg-admin-grid__full kg-admin-stats-grid">
        <MetricCard icon="players" label="Total Registered Players" value={formatNumber(2418907)} delta="+6.8% vs last 7 days" />
        <MetricCard icon="wifi" label="Online Now" value={formatNumber(12487)} delta="+14.9% vs last 7 days" tone="cyan" />
        <MetricCard icon="user" label="New This Week" value={formatNumber(48293)} delta="+9.7% vs previous week" />
        <MetricCard icon="shield" label="Banned Accounts" value={formatNumber(8421)} delta="+2.3% vs last 7 days" tone="amber" />
      </div>
      <div className="kg-admin-grid__full kg-admin-filterbar">
        <label className="kg-admin-searchbar"><AdminIcon name="search" size={18} /><input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search by nickname, login or player ID" /></label>
        <div className="kg-admin-filters"><button className="kg-admin-pill">All Statuses</button><button className="kg-admin-pill">All Games</button><button className="kg-admin-pill">All Time</button></div>
      </div>
      <SectionCard title="Players" icon="players" className="kg-admin-grid__span-2" actions={<div className="kg-admin-muted">Showing 1–{Math.min(visiblePlayers.length, filteredPlayers.length)} of {formatNumber(filteredPlayers.length)} players</div>}>
        <div className="kg-admin-table-wrap">
          <table className="kg-admin-table kg-admin-table--players">
            <thead>
              <tr><th>#</th><th>Avatar</th><th>Display Name</th><th>Login</th><th>Status</th><th>Last Seen</th><th>Coins</th><th>Level / XP</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visiblePlayers.map(player => (
                <tr key={player.id}>
                  <td>{player.rank}</td>
                  <td><Avatar name={player.displayName} hue={player.avatarHue} small /></td>
                  <td><div className="kg-admin-cellstack"><strong>{player.displayName}</strong><span>{player.id}</span></div></td>
                  <td>{player.login}</td>
                  <td><span className={`kg-admin-status kg-admin-status--${player.status.toLowerCase().replace(/\s+/g, '-')}`}>{player.status}</span></td>
                  <td>{player.lastSeen}</td>
                  <td>{formatNumber(player.coins)}</td>
                  <td><div className="kg-admin-cellstack"><strong>Lv. {player.level}</strong><span>{formatNumber(player.xp)} XP</span></div></td>
                  <td>
                    <div className="kg-admin-row-actions">
                      <button className="kg-admin-mini-btn" onClick={() => onOpenPlayer(player.id)}>View</button>
                      <button className="kg-admin-mini-btn kg-admin-mini-btn--warn">Ban</button>
                      <button className="kg-admin-mini-btn kg-admin-mini-btn--danger">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="kg-admin-table-footer">
          <div className="kg-admin-muted">Rows per page: 100</div>
          <div className="kg-admin-table-footer__actions">
            {visibleCount < filteredPlayers.length ? <button className="kg-admin-primary" onClick={onLoadMore}><AdminIcon name="download" size={18} /> Load 100 More</button> : null}
            <button className="kg-admin-secondary" onClick={onShowAll}><AdminIcon name="external" size={18} /> Open Full List</button>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Latest Account Actions" icon="shield">
        <div className="kg-admin-list">
          {[
            ['Account Banned', 'Player: ToxicWolf192 · Reason: Cheating / Exploiting'],
            ['Warning Issued', 'Player: SpeedHackX · Reason: Inappropriate Behavior'],
            ['Account Unbanned', 'Player: OldRogue · Appeal approved'],
            ['Account Deleted', 'Player: SpamBot_4471 · Spam / Bot Activity'],
          ].map(([title, text], idx) => (
            <div className="kg-admin-list__row" key={title}>
              <div className={`kg-admin-alert-badge ${idx > 1 ? 'kg-admin-alert-badge--green' : ''}`}><AdminIcon name={idx === 3 ? 'trash' : idx === 1 ? 'warning' : 'ban'} size={18} /></div>
              <div className="kg-admin-list__primary"><strong>{title}</strong><span>{text}</span></div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function PlayerProfileTab({ player, expandedGames, onToggleGames }) {
  if (!player) return null;
  return (
    <div className="kg-admin-grid kg-admin-grid--profile">
      <SectionCard title="Player Overview" icon="user" className="kg-admin-grid__full">
        <div className="kg-admin-profile-header">
          <div className="kg-admin-profile-header__identity">
            <Avatar name={player.displayName} hue={player.avatarHue} />
            <div>
              <h2>{player.displayName}</h2>
              <div className="kg-admin-muted">@{player.login} · {player.id}</div>
              <div className="kg-admin-chip-row kg-admin-chip-row--left"><span className={`kg-admin-status kg-admin-status--${player.status.toLowerCase().replace(/\s+/g, '-')}`}>{player.status}</span><span className="kg-admin-chip">Last seen: {player.lastSeen}</span><span className="kg-admin-chip">Registered: {player.registeredAt}</span></div>
            </div>
          </div>
          <div className="kg-admin-profile-header__summary">
            <div><strong>{formatNumber(player.coins)}</strong><span>coins</span></div>
            <div><strong>Lv. {player.level}</strong><span>{formatNumber(player.xp)} XP</span></div>
            <div><strong>{player.hoursPlayed}h</strong><span>played total</span></div>
          </div>
        </div>
      </SectionCard>
      <div className="kg-admin-grid__span-2 kg-admin-stats-grid kg-admin-stats-grid--profile">
        <MetricCard icon="gamepad" label="Matches Played" value={formatNumber(player.matches)} />
        <MetricCard icon="coin" label="Coins" value={formatNumber(player.coins)} tone="amber" />
        <MetricCard icon="level" label="Level" value={`Lv. ${player.level}`} delta={`${formatNumber(player.xp)} XP`} tone="cyan" />
        <MetricCard icon="clock" label="Hours Played" value={`${player.hoursPlayed}h`} />
      </div>
      <SectionCard title="Top 3 Favorite Games" icon="star" className="kg-admin-grid__span-2" actions={<button className="kg-admin-linkbutton" onClick={onToggleGames}>{expandedGames ? 'Hide full list' : 'Show full list'} <AdminIcon name={expandedGames ? 'chevronDown' : 'chevronRight'} size={16} /></button>}>
        <div className="kg-admin-list kg-admin-list--cards">
          {player.topGames.map((game) => (
            <div className="kg-admin-gamecard" key={game.id}>
              <div className={`kg-admin-thumb kg-admin-thumb--${game.accent}`} />
              <div className="kg-admin-list__primary"><strong>{game.name}</strong><span>{game.genre}</span></div>
              <div className="kg-admin-muted">Favorite</div>
            </div>
          ))}
        </div>
        {expandedGames ? (
          <div className="kg-admin-expand-list">
            {player.allGames.map((game, index) => (
              <div className="kg-admin-expand-list__row" key={`${game.id}-${index}`}>
                <div className={`kg-admin-thumb kg-admin-thumb--${game.accent}`} />
                <strong>{game.name}</strong>
                <span>{game.genre}</span>
                <span>{game.matches} matches</span>
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>
      <SectionCard title="Inventory / Purchased Items" icon="package">
        <div className="kg-admin-tag-cloud">
          {player.boughtItems.map(item => <span key={item} className="kg-admin-shopitem">{item}</span>)}
        </div>
      </SectionCard>
      <SectionCard title="Achievements & Rewards" icon="trophy">
        <div className="kg-admin-tag-cloud">
          {player.achievements.map(item => <span key={item} className="kg-admin-badge">{item}</span>)}
        </div>
      </SectionCard>
      <SectionCard title="Moderation Actions" icon="shield" className="kg-admin-grid__span-2">
        <div className="kg-admin-moderation">
          <div className="kg-admin-moderation__buttons">
            <button className="kg-admin-primary">Temporary Ban</button>
            <button className="kg-admin-secondary">Permanent Ban</button>
            <button className="kg-admin-secondary">Unban</button>
            <button className="kg-admin-secondary kg-admin-secondary--warn">IP Ban</button>
            <button className="kg-admin-secondary kg-admin-secondary--danger">Delete Account</button>
          </div>
          <div className="kg-admin-moderation__form">
            <label><span>Ban from</span><input type="text" value="2026-11-17 11:30" readOnly /></label>
            <label><span>Ban to</span><input type="text" value="2026-11-24 11:30" readOnly /></label>
            <label className="kg-admin-moderation__reason"><span>Reason</span><textarea readOnly value="Inappropriate behavior / moderation review example" /></label>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Known Public IP Addresses" icon="wifi">
        <div className="kg-admin-ip-list">
          {player.ipHistory.map((row) => (
            <div className="kg-admin-ip-row" key={row.ip}>
              <div>
                <strong>{row.ip}</strong>
                <span>{row.region} · {row.device}</span>
              </div>
              <div className="kg-admin-ip-row__end"><span>{row.lastSeen}</span><button className="kg-admin-mini-btn kg-admin-mini-btn--warn">IP Ban</button></div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function PlaceholderTab({ title, text }) {
  return <div className="kg-admin-placeholder"><h2>{title}</h2><p>{text}</p></div>;
}

function adminErrorMessage(error) {
  if (error?.message === 'INVALID_CREDENTIALS') return 'Invalid username or password.';
  if (error?.message === 'ADMIN_NOT_CONFIGURED') return 'Administrator access is not configured on the backend.';
  return 'Unable to complete the request. Please try again.';
}

export default function AdminPage() {
  const [status, setStatus] = useState('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPlayerId, setSelectedPlayerId] = useState(featuredPlayerId);
  const [visiblePlayersCount, setVisiblePlayersCount] = useState(100);
  const [playerSearch, setPlayerSearch] = useState('');
  const [gamesExpanded, setGamesExpanded] = useState(false);
  const selectedPlayer = allPlayers.find(player => player.id === selectedPlayerId) || allPlayers[0];

  useEffect(() => {
    document.title = 'Kodumi Games — Admin Panel';
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) { setStatus('login'); return; }
    let active = true;
    adminRequest('session', { token })
      .then(() => { if (active) setStatus('ready'); })
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);
        if (active) setStatus('login');
      });
    return () => { active = false; };
  }, []);

  async function signIn(event) {
    event.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const result = await adminRequest('login', { method: 'POST', body: { username: username.trim(), password } });
      sessionStorage.setItem(TOKEN_KEY, result.token);
      setPassword('');
      setPasswordVisible(false);
      setStatus('ready');
    } catch (cause) {
      setError(adminErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setStatus('login');
    setPassword('');
    setError('');
    if (token) {
      try { await adminRequest('logout', { method: 'POST', token, body: {} }); } catch {}
    }
  }

  function openPlayer(playerId) {
    setSelectedPlayerId(playerId);
    setActiveTab('player-profile');
  }

  const navItems = [
    ['dashboard', 'Dashboard', 'dashboard'],
    ['games', 'Popular Games', 'gamepad'],
    ['players', 'Players', 'players'],
    ['player-profile', 'Player Profile', 'user'],
    ['moderation', 'Moderation', 'shield'],
    ['analytics', 'Analytics', 'chart'],
    ['settings', 'Settings', 'gear'],
  ];

  const content = {
    dashboard: <DashboardTab onOpenPlayer={openPlayer} onSwitchTab={setActiveTab} />,
    games: <GamesTab />,
    players: <PlayersTab players={allPlayers} visibleCount={visiblePlayersCount} search={playerSearch} onSearch={setPlayerSearch} onLoadMore={() => setVisiblePlayersCount(value => Math.min(value + 100, allPlayers.length))} onShowAll={() => setVisiblePlayersCount(allPlayers.length)} onOpenPlayer={openPlayer} />,
    'player-profile': <PlayerProfileTab player={selectedPlayer} expandedGames={gamesExpanded} onToggleGames={() => setGamesExpanded(value => !value)} />,
    moderation: <PlaceholderTab title="Moderation" text="This section can later include report queues, chat complaints, and mass moderation actions. The important actions already exist in the player profile card." />,
    analytics: <PlaceholderTab title="Analytics" text="This section can later include retention, revenue, match duration, and conversion dashboards. The current design keeps the structure ready for future backend data." />,
    settings: <PlaceholderTab title="Settings" text="This section can later contain admin roles, access control, alert preferences, and audit logs." />,
  };

  if (status !== 'ready') {
    return (
      <main className="kg-admin kg-admin--login">
        <div className="kg-admin-login-bg" aria-hidden="true" />
        <section className="kg-admin-login-card">
          <BrandMark />
          <div className="kg-admin-login-card__crest"><AdminIcon name="shield" size={40} /></div>
          <h1>Admin <span>Panel</span></h1>
          <p>Secure access for administrators</p>
          {status === 'checking' ? <div className="kg-admin-login-card__checking">Checking access…</div> : (
            <form className="kg-admin-login-form" onSubmit={signIn}>
              <label>
                <span>Username</span>
                <div className="kg-admin-login-input"><AdminIcon name="user" size={18} /><input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter username" autoComplete="username" required /></div>
              </label>
              <label>
                <span>Password</span>
                <div className="kg-admin-login-input"><AdminIcon name="lock" size={18} /><input type={passwordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" autoComplete="current-password" required /><button type="button" onClick={() => setPasswordVisible(value => !value)} aria-label={passwordVisible ? 'Hide password' : 'Show password'}><AdminIcon name={passwordVisible ? 'eyeOff' : 'eye'} size={18} /></button></div>
              </label>
              {error ? <div className="kg-admin-error">{error}</div> : null}
              <button className="kg-admin-primary kg-admin-primary--wide" type="submit" disabled={busy}><AdminIcon name="signIn" size={20} /> {busy ? 'Signing in…' : 'Sign In'}</button>
            </form>
          )}
          <a className="kg-admin-backlink" href={SITE_URL}><AdminIcon name="arrowLeft" size={18} /> Back to site</a>
        </section>
      </main>
    );
  }

  return (
    <main className="kg-admin">
      <aside className="kg-admin-sidebar">
        <div className="kg-admin-sidebar__top"><BrandMark /></div>
        <nav className="kg-admin-sidebar__nav">
          {navItems.map(([key, label, icon]) => (
            <button key={key} type="button" className={`kg-admin-sidebar__item ${activeTab === key ? 'is-active' : ''}`} onClick={() => setActiveTab(key)}>
              <AdminIcon name={icon} size={19} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="kg-admin-sidebar__art"><div className="kg-admin-sidebar__moon" /><div className="kg-admin-sidebar__silhouette" /></div>
      </aside>
      <section className="kg-admin-main">
        <header className="kg-admin-topbar">
          <div>
            <h1>{activeTab === 'player-profile' ? 'Player Profile' : navItems.find(([key]) => key === activeTab)?.[1] || 'Admin Dashboard'}</h1>
            <p>{activeTab === 'dashboard' ? 'Overview of the platform, activity and recent events.' : activeTab === 'games' ? 'Popularity, rankings and game activity.' : activeTab === 'players' ? 'Search and manage player accounts.' : activeTab === 'player-profile' ? 'Detailed player information, purchases, achievements and moderation.' : 'Administrative section.'}</p>
          </div>
          <div className="kg-admin-topbar__right">
            <label className="kg-admin-topsearch"><AdminIcon name="search" size={18} /><input placeholder="Search games, players, reports..." /><span>Ctrl + K</span></label>
            <div className="kg-admin-topbar__status"><span className="online-dot" /> Platform Online</div>
            <div className="kg-admin-adminbox"><Avatar name="Admin" hue={265} small /><div><strong>Admin</strong><span>Administrator</span></div></div>
            <button className="kg-admin-iconbutton" type="button" onClick={signOut} aria-label="Sign out"><AdminIcon name="logout" size={18} /></button>
          </div>
        </header>
        {content[activeTab]}
      </section>
    </main>
  );
}
