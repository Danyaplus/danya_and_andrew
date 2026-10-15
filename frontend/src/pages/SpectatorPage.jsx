import { useEffect, useMemo, useState } from 'react';
import { socket } from '../lib/socket.js';
import { getGameById } from '../games/index.js';
import '../styles/spectator.css';

const CHESS_GLYPHS = {
  wp:'♙', wn:'♘', wb:'♗', wr:'♖', wq:'♕', wk:'♔',
  bp:'♟', bn:'♞', bb:'♝', br:'♜', bq:'♛', bk:'♚',
};

const DOTS = {
  0:[], 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8],
  5:[0,2,4,6,8], 6:[0,2,3,5,6,8],
};

function CellPiece({ gameId, piece }) {
  if (!piece) return null;
  if (gameId === 'chess') return <span className={`watch-chess-piece ${piece.color === 'w' ? 'is-white' : 'is-black'}`}>{CHESS_GLYPHS[`${piece.color}${piece.type}`] || ''}</span>;
  if (gameId === 'checkers') return <span className={`watch-checker ${piece.color === 'w' ? 'is-white' : 'is-black'}`}>{piece.king ? '★' : ''}</span>;
  if (gameId === 'reversi') return <span className={`watch-reversi-disc ${piece === 'white' ? 'is-white' : 'is-black'}`} />;
  if (gameId === 'tic-tac-toe') return <span className={`watch-mark watch-mark--${piece}`}>{String(piece).toUpperCase()}</span>;
  if (gameId === 'gomoku') return <span className={`watch-reversi-disc ${piece === 'white' || piece === 'w' ? 'is-white' : 'is-black'}`} />;
  return null;
}

function Board({ state, viewAs }) {
  const { gameId, board } = state;
  const size = gameId === 'tic-tac-toe' ? 3 : gameId === 'gomoku' ? (state.boardSize || 15) : 8;
  if (!Array.isArray(board)) return <p>Ожидаем обновления поля…</p>;
  const flat = Array.isArray(board[0]) ? board.flat() : board;
  const reversed = viewAs === 'b' && (gameId === 'chess' || gameId === 'checkers');
  const cells = reversed ? [...flat].reverse() : flat;
  return (
    <div className={`watch-board watch-board--${gameId}`} style={{ '--watch-columns':size }} role="img" aria-label="Поле матча в режиме наблюдения">
      {cells.map((piece,index) => {
        const row = Math.floor(index / size), col = index % size;
        return <div key={index} className={`watch-cell ${(row + col) % 2 ? 'is-dark' : 'is-light'}`}>
          <CellPiece gameId={gameId} piece={piece} />
        </div>;
      })}
    </div>
  );
}

function DominoHalf({ value }) {
  return <span className="watch-domino-half">{Array.from({ length:9 },(_,i)=><i key={i} className={DOTS[value]?.includes(i) ? 'is-visible' : ''}/>)}</span>;
}

function DominoBoard({ state }) {
  return <div className="watch-domino-area">
    <div className="watch-domino-info">Базар: {state.boneyardCount} · На руках: {Object.entries(state.handCounts || {}).map(([seat,count]) => `${state.players?.[seat]?.name || seat} — ${count}`).join(' · ')}</div>
    <div className="watch-domino-chain">
      {(state.chain || []).map((tile,i)=><div key={tile.id || i} className={`watch-domino-tile ${tile.left === tile.right ? 'is-double' : ''}`}><DominoHalf value={tile.left}/><b/><DominoHalf value={tile.right}/></div>)}
      {!state.chain?.length && <span>Первая костяшка ещё не поставлена</span>}
    </div>
  </div>;
}

export default function SpectatorPage({ friendId, onBack }) {
  const [match, setMatch] = useState(null);
  const [state, setState] = useState(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    let live = true;
    const join = () => {
      if (socket.connected) socket.emit('match:watch', { friendId });
      else socket.connect();
    };
    const onStarted = (payload) => {
      if (!live || payload.friendId !== friendId) return;
      setMatch(payload); setError(''); setConnecting(false);
    };
    const onState = (payload) => {
      if (!live) return;
      setState(payload.state);
    };
    const onWatchers = (payload) => {
      if (live) setCount(payload.count ?? 0);
    };
    const onError = (payload) => {
      if (!live) return;
      setError(payload?.message || 'Не удалось подключиться к матчу.'); setConnecting(false);
    };
    const onEnded = () => { if (live) {setError('Трансляция завершилась.');setConnecting(false);} };
    const onDisconnected = () => { if (live) setError('Соединение прервано. Ожидаем восстановления…'); };
    socket.on('connect', join);
    socket.on('watch:started', onStarted);
    socket.on('watch:state', onState);
    socket.on('match:watchers', onWatchers);
    socket.on('watch:error', onError);
    socket.on('watch:ended', onEnded);
    socket.on('disconnect', onDisconnected);
    socket.on('connect_error', onDisconnected);
    join();
    return () => {
      live = false;
      socket.emit('match:unwatch');
      socket.off('connect', join);
      socket.off('watch:started', onStarted);
      socket.off('watch:state', onState);
      socket.off('match:watchers', onWatchers);
      socket.off('watch:error', onError);
      socket.off('watch:ended', onEnded);
      socket.off('disconnect', onDisconnected);
      socket.off('connect_error', onDisconnected);
    };
  }, [friendId]);

  const game = getGameById(match?.gameId);
  const players = useMemo(() => Object.entries(state?.players || {}), [state?.players]);
  return <main className="watch-page">
    <header className="watch-top">
      <button className="secondary-button" type="button" onClick={onBack}>← К друзьям</button>
      <span className="watch-live">● {state?.status === 'finished' ? 'Матч завершён' : 'Наблюдение · LIVE'}</span>
      <span className="watch-count">👁 {count}</span>
    </header>
    <div className="watch-title"><span>CODUMI GAMES · РЕЖИМ ЗРИТЕЛЯ</span><h1>{game?.title || 'Матч друга'}</h1><p>Ты наблюдаешь за игрой. Ходы, кнопки игроков и скрытая информация недоступны.</p></div>
    {connecting && !error && <p className="watch-message">Подключаемся к матчу друга…</p>}
    {error && <div className="watch-message is-error">{error} <button type="button" onClick={onBack}>Вернуться</button></div>}
    {state && <>
      <div className="watch-players">{players.map(([id,player])=><div key={id} className={state.turn === id ? 'is-turn' : ''}><strong>{player.name}</strong><small>{state.turn === id && state.status === 'playing' ? 'Ходит сейчас' : 'Участник'}</small></div>)}</div>
      {state.gameId === 'domino' ? <DominoBoard state={state}/> : <Board state={state} viewAs={match?.viewAs}/>}
      {state.status === 'finished' && <div className="watch-finished">🏆 {state.result?.message || 'Партия завершена'}</div>}
    </>}
  </main>;
}
