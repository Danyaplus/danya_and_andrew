import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { adminRequest, adminErrorText, adminServerOrigin } from '../lib/adminApi.js';
import '../styles/spectator.css';

const fmt = value => new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
const fullTime = value => value ? new Date(value).toLocaleString('ru-RU') : '—';
const elapsed = value => {
  const seconds = Math.max(0, Math.floor((Date.now() - Number(value)) / 1000));
  return `${Math.floor(seconds / 3600)} ч ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')} мин`;
};
const IMG = `${import.meta.env.BASE_URL}images/games/`;
const CHESS = { wp:'♙',wn:'♘',wb:'♗',wr:'♖',wq:'♕',wk:'♔',bp:'♟',bn:'♞',bb:'♝',br:'♜',bq:'♛',bk:'♚' };
const DOMINO_DOTS = { 0:[], 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] };

function Cover({ gameId, name }) {
  return <span className="kc-extra-cover"><img alt="" src={`${IMG}${encodeURIComponent(gameId || '')}.webp`}
    onError={e => { e.currentTarget.style.display = 'none'; }} /><span aria-hidden="true">♟</span><span className="kc-extra-cover__sr">{name || gameId}</span></span>;
}

function PublicBoard({ state }) {
  const gameId = state?.gameId;
  if (!gameId) return <div className="kc-empty">Ожидаем состояние матча…</div>;
  if (gameId === 'domino') return <div className="watch-domino-area">
    <p className="kc-subtle">На руках у игроков: {Object.values(state.handCounts || {}).join(' / ')} · Базар: {state.boneyardCount ?? '—'}</p>
    <div className="watch-domino-chain">{(state.chain || []).map((tile, i) =>
      <div className="watch-domino-tile" key={tile.id || i}>{[tile.left, tile.right].map((n, half) =>
        <span className="watch-domino-half" key={half}>{Array.from({ length: 9 }, (_, p) => <i key={p} className={DOMINO_DOTS[n]?.includes(p) ? 'is-visible' : ''}/>)}</span>)}</div>)}</div>
  </div>;
  if (!Array.isArray(state.board)) return <div className="kc-empty">Поле ещё не получено</div>;
  const size = gameId === 'tic-tac-toe' ? 3 : gameId === 'gomoku' ? (state.boardSize || 15) : 8;
  const cells = Array.isArray(state.board[0]) ? state.board.flat() : state.board;
  return <div className={`watch-board watch-board--${gameId} kc-extra-watchboard`} style={{ '--watch-columns': size }} role="img" aria-label={`Поле ${gameId}`}>
    {cells.map((piece, i) => <div className={`watch-cell ${(Math.floor(i / size) + i % size) % 2 ? 'is-dark' : 'is-light'}`} key={i}>
      {!piece ? null : gameId === 'chess' ? <span className={`watch-chess-piece ${piece.color === 'w' ? 'is-white' : 'is-black'}`}>{CHESS[`${piece.color}${piece.type}`] || ''}</span>
      : gameId === 'checkers' ? <span className={`watch-checker ${piece.color === 'w' ? 'is-white' : 'is-black'}`}>{piece.king ? '★' : ''}</span>
      : gameId === 'tic-tac-toe' ? <span className={`watch-mark watch-mark--${piece}`}>{String(piece).toUpperCase()}</span>
      : <span className={`watch-reversi-disc ${['white', 'w'].includes(piece) ? 'is-white' : 'is-black'}`} />}
    </div>)}
  </div>;
}

function AdminWatchModal({ token, room, onClose }) {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('Подключаемся к трансляции…');
  useEffect(() => {
    if (!room) return;
    let alive = true;
    const socket = io(`${adminServerOrigin}/admin-watch`, {
      autoConnect: false, transports: ['websocket', 'polling'],
      tryAllTransports: true, timeout: 15000, auth: { token },
    });
    socket.on('connect', () => socket.emit('admin-watch:join', { roomId: room.roomId }));
    socket.on('admin-watch:started', () => { if (alive) setStatus('В прямом эфире'); });
    socket.on('admin-watch:state', payload => { if (alive && payload?.roomId === room.roomId) setState(payload.state); });
    socket.on('admin-watch:ended', () => { if (alive) setStatus('Матч завершён'); });
    socket.on('admin-watch:error', payload => { if (alive) setStatus(payload.message || 'Просмотр недоступен'); });
    socket.on('connect_error', () => { if (alive) setStatus('Не удалось подключиться. Проверь доступ к серверу.'); });
    socket.connect();
    return () => { alive = false; socket.emit('admin-watch:leave'); socket.disconnect(); };
  }, [token, room]);
  if (!room) return null;
  return <div className="kc-extra-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="kc-extra-modal" role="dialog" aria-modal="true" aria-label="Просмотр матча">
      <div className="kc-extra-modalhead"><div><span className="kc-extra-live-dot" /> {status}<h2>{room.gameName}</h2>
        <p>{room.players?.map(p => p.name).join(' · ')} · Только наблюдение</p></div>
        <button type="button" className="kc-outlinebtn" onClick={onClose}>Закрыть ✕</button></div>
      <PublicBoard state={state}/>
      <p className="kc-subtle">Показываются только общедоступные данные матча. Скрытые карты, руки и личный чат недоступны.</p>
    </section>
  </div>;
}

export function AdminLiveMatches({ token }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [watch, setWatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [limit, setLimit] = useState(100);
  useEffect(() => {
    const timer = setInterval(() => { setReload(v => v + 1); }, 15_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    adminRequest(`live-matches?offset=0&limit=${Math.min(100, limit)}`, { token })
      .then(async data => {
        let all = [...(data.matches || [])];
        const wanted = Math.min(data.total || 0, limit);
        while (all.length < wanted && active) {
          const next = await adminRequest(`live-matches?offset=${all.length}&limit=${Math.min(100, wanted - all.length)}`, { token });
          if (!(next.matches || []).length) break;
          all = [...all, ...next.matches];
        }
        if (active) { setItems(all); setTotal(data.total || 0); setError(null); }
      }).catch(err => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, reload, limit]);
  return <>
    <div className="kc-extra-toolbar"><div><h2><span className="kc-extra-live-dot" /> Активные матчи</h2><p>Список автоматически обновляется каждые 15 секунд · {fmt(total)} сейчас</p></div>
      <button className="kc-outlinebtn" type="button" onClick={() => setReload(v => v + 1)}>↻ Обновить</button></div>
    {error && <div className="kc-error">{adminErrorText(error)} <button onClick={() => setReload(v => v + 1)}>Повторить</button></div>}
    {loading && !items.length && <div className="kc-loading">Загрузка матчей…</div>}
    <div className="kc-extra-match-grid">
      {items.map(room => <article className="kc-extra-match-card" key={room.roomId}>
        <div className="kc-extra-match-cover"><Cover gameId={room.gameId} name={room.gameName} /><span className="kc-extra-live-label">● LIVE</span></div>
        <div className="kc-extra-match-body"><h3>{room.gameName}</h3>
          <div className="kc-extra-versus">{room.players?.map((player, i) => <span key={i}>{player.name || 'Гость'}</span>).reduce((arr, name, i) => i ? [...arr, <b key={`vs${i}`}>VS</b>, name] : [name], [])}</div>
          <div className="kc-extra-match-meta"><span>⏱ {elapsed(room.startedAt)}</span><span>👁 {fmt(room.spectators)}</span></div>
          <button type="button" className="kc-extra-watch-btn" disabled={!room.watchable} onClick={() => setWatch(room)}>{room.watchable ? 'Смотреть матч' : 'Просмотр поля пока недоступен'}</button>
        </div>
      </article>)}
    </div>
    {!items.length && !loading && !error && <div className="kc-empty">Сейчас активных матчей нет.</div>}
    <div className="kc-extra-footer"><span>Показано {items.length} из {total} матчей. Режим зрителя доступен в 6 играх.</span>
      {items.length < total && <button className="kc-gradientbtn" disabled={loading} onClick={() => setLimit(n => n + 100)}>Показать ещё 100</button>}</div>
    <AdminWatchModal token={token} room={watch} onClose={() => setWatch(null)} />
  </>;
}

const ledgerLabels = {
  admin: 'Ручное изменение администратором', match: 'Награда за матч',
  shop: 'Покупка в магазине', quest: 'Награда за задание',
  refund: 'Возврат ставки', system: 'Изменение баланса системой',
};

export function AdminCoinHistory({ token, playerId, onClose }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!playerId) return;
    let active = true;
    setLoading(true);
    adminRequest(`players/${encodeURIComponent(playerId)}/coin-history?offset=0&limit=100`, { token })
      .then(data => { if (active) { setRows(data.entries || []); setTotal(data.total || 0); setError(null); } })
      .catch(err => { if (active) setError(err); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [playerId, token, reload]);
  const fetchMore = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await adminRequest(`players/${encodeURIComponent(playerId)}/coin-history?offset=${rows.length}&limit=100`, { token });
      setRows(prev => [...prev, ...(data.entries || [])]); setTotal(data.total || 0); setError(null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  };
  return <section className="kc-extra-history">
    <div className="kc-extra-toolbar"><div><h2>История монет</h2><p>Начисления, списания и баланс после операции</p></div>
      <div><button className="kc-outlinebtn" onClick={() => setReload(n => n + 1)}>↻ Обновить</button> <button className="kc-outlinebtn" onClick={onClose}>Скрыть ↑</button></div></div>
    <p className="kc-subtle">История начинается с установки SQL-миграции. Для старых операций точные причины неизвестны. «Системное изменение» может означать игру, покупку или другую операцию — без предположений.</p>
    {error && <div className="kc-error">{adminErrorText(error)}</div>}
    <div className="kc-tablebox"><table className="kc-extra-table"><thead><tr><th>Дата</th><th>Операция</th><th>Изменение</th><th>Баланс после</th><th>Причина</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
      <td>{fullTime(row.created_at)}</td><td>{ledgerLabels[row.source] || ledgerLabels.system}</td>
      <td className={Number(row.delta) > 0 ? 'kc-extra-plus' : 'kc-extra-minus'}>{Number(row.delta) > 0 ? '+' : ''}{fmt(row.delta)}</td>
      <td>{fmt(row.balance_after)}</td><td>{row.reason || 'Не указана'}</td>
    </tr>)}</tbody></table></div>
    {!rows.length && !loading && !error && <div className="kc-empty">Операций пока не записано.</div>}
    {loading && <div className="kc-loading">Загрузка истории…</div>}
    <div className="kc-extra-footer"><span>Показано {rows.length} из {total}</span>{rows.length < total && <button className="kc-gradientbtn" onClick={fetchMore} disabled={loading}>Ещё 100 операций</button>}</div>
  </section>;
}

export function AdminSuspicious({ token, onOpenPlayer }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    adminRequest('suspicious-players', { token })
      .then(result => { if (active) { setData(result); setError(null); } })
      .catch(err => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, refresh]);
  const alerts = useMemo(() => data?.alerts || [], [data]);
  return <>
    <div className="kc-extra-toolbar"><div><h2>Подозрительная активность</h2><p>Автоматические сигналы для проверки. Бан только вручную.</p></div>
      <button className="kc-outlinebtn" onClick={() => setRefresh(n => n+1)}>↻ Обновить</button></div>
    <div className="kc-extra-info">Проверено {fmt(data?.analyzedMatches)} подтверждённых матчей за 7 дней. Условие: от 6 матчей одной пары в одной игре и ≥80% побед одного игрока или ≥4 матчей короче минуты. Это не доказательство нарушения.{data?.sampleLimited ? ' Анализ ограничен последними 4000 записями.' : ''}</div>
    {loading && <div className="kc-loading">Анализ матчей…</div>}
    {error && <div className="kc-error">{adminErrorText(error)}</div>}
    <div className="kc-extra-flag-list">
      {alerts.map((item, i) => <article className="kc-extra-flag" key={`${item.gameId}-${item.userIds.join('-')}`}>
        <div className="kc-extra-flag__head"><span className="kc-extra-flag__number">#{i+1}</span><Cover gameId={item.gameId}/><div><h3>{item.gameName}</h3><p>Последний матч: {fullTime(item.lastAt)}</p></div><span className="kc-extra-flag__warning">На проверку</span></div>
        <div className="kc-extra-pair">{item.players.map((player, index) => <button type="button" onClick={() => onOpenPlayer(player.id)} key={player.id}>
          <strong>{player.displayName}</strong><span>@{player.username || player.id}</span>{item.winnerId === player.id ? <small>Побеждал чаще</small> : null}
        </button>)}</div>
        <div className="kc-extra-flag__stats"><span>{fmt(item.matches)} матчей</span><span>Побед лидера: {item.winShare}%</span><span>Коротких: {item.quickMatches}</span></div>
        <div className="kc-extra-flag__reasons">{item.flags.map(flag => <span key={flag}>{flag}</span>)}</div>
      </article>)}
    </div>
    {!alerts.length && !loading && !error && <div className="kc-empty">Подозрительных повторяющихся пар пока не найдено.</div>}
  </>;
}
