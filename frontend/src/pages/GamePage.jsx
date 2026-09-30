import { useEffect, useRef, useState } from 'react';

export default function GamePage({ game, onBack }) {
  const pageRef = useRef(null);
  const [focusMode, setFocusMode] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const [secretValue, setSecretValue] = useState('');
  const [chessAdmin, setChessAdmin] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && focusMode) {
        setFocusMode(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [focusMode]);

  useEffect(() => {
    document.body.classList.toggle('game-focus-mode', focusMode);
    return () => document.body.classList.remove('game-focus-mode');
  }, [focusMode]);

  useEffect(() => {
    setSecretOpen(false);
    setSecretValue('');
    setChessAdmin(false);
  }, [game?.id]);

  if (!game) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <h2>Игра не найдена</h2>
          <button className="primary-button" onClick={onBack}>На главную</button>
        </div>
      </main>
    );
  }

  const GameComponent = game.component;
  const imageUrl = `${import.meta.env.BASE_URL}images/games/${game.id}.webp`;
  const isChess = game.id === 'chess';

  function handleSecretChange(event) {
    const value = event.target.value;
    setSecretValue(value);

    if (value === 'admin') {
      setChessAdmin(true);
      setSecretOpen(false);
      setSecretValue('');
    }
  }

  async function enterFocusMode() {
    setFocusMode(true);
    const node = pageRef.current;

    try {
      if (node?.requestFullscreen && !document.fullscreenElement) {
        await node.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // iPhone/Safari may reject element fullscreen. CSS focus mode still works.
    }

    try {
      if (screen.orientation?.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch {
      // The layout still adapts when the user rotates the phone manually.
    }
  }

  async function exitFocusMode() {
    setFocusMode(false);

    try {
      if (screen.orientation?.unlock) screen.orientation.unlock();
    } catch {
      // no-op
    }

    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // no-op
    }
  }

  return (
    <main
      ref={pageRef}
      className={`page-shell game-page ${focusMode ? 'is-game-focus' : ''}`}
      data-game-id={game.id}
    >
      <div className="game-page__backdrop" aria-hidden="true">
        <img
          src={imageUrl}
          alt=""
          draggable="false"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
        <div className="game-page__backdrop-shade" />
      </div>

      <div className="game-page__chrome">
        <button type="button" className="back-button game-page__back" onClick={onBack}>
          <span className="game-page__back-arrow">←</span>
          <span>Все игры</span>
        </button>

        <div className="game-page__chrome-right">
          <div className={`game-page__identity-wrap ${secretOpen ? 'is-secret-open' : ''}`}>
            <button
              type="button"
              className={`game-page__identity ${isChess ? 'game-page__identity--secret' : ''} ${chessAdmin ? 'is-admin' : ''}`}
              onClick={() => {
                if (!isChess) return;
                setSecretOpen((value) => !value);
                setSecretValue('');
              }}
              aria-expanded={isChess ? secretOpen : undefined}
              title={isChess ? 'Шахматы' : undefined}
            >
              <div className="game-page__identity-image">
                <span className="game-page__identity-fallback">{game.icon}</span>
                <img
                  src={imageUrl}
                  alt=""
                  draggable="false"
                  onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </div>

              <div className="game-page__identity-copy">
                <span>{chessAdmin && isChess ? 'SECRET MODE' : 'Сейчас играем'}</span>
                <strong>{game.title}</strong>
              </div>
            </button>

            {isChess && secretOpen && (
              <div className="chess-secret-login">
                <input
                  autoFocus
                  type="text"
                  value={secretValue}
                  onChange={handleSecretChange}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="код..."
                  aria-label="Секретный код"
                />
              </div>
            )}
          </div>

          <button
            type="button"
            className="game-page__fullscreen"
            onClick={focusMode ? exitFocusMode : enterFocusMode}
            aria-label={focusMode ? 'Выйти из полноэкранного режима' : 'Открыть игру на весь экран'}
          >
            <span aria-hidden="true">{focusMode ? '↙' : '⛶'}</span>
            <b>{focusMode ? 'Свернуть' : 'На весь экран'}</b>
          </button>
        </div>
      </div>

      <div className="game-page__content">
        <GameComponent onBack={onBack} adminMode={isChess && chessAdmin} />
      </div>
    </main>
  );
}
