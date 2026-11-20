import { useTranslation } from '../lib/i18n.jsx';

import { gameStatusMessage } from '../lib/platformState.js';

export default function GameCard({ game, compact = false, eager = false, priority = false, onOpen, availability = 'enabled' }) {
  const { t, language } = useTranslation();
  const restricted = availability !== 'enabled';
  const imageUrl = `${import.meta.env.BASE_URL}images/games/${game.id}.webp`;
  // Game cards are small; serve 600px thumbnails instead of downloading 960px covers.
  // The full-size art remains untouched for the game view and enlarged previews.
  const previewUrl = `${import.meta.env.BASE_URL}images/games/thumbs/${game.id}.webp`;

  return (
    <button
      type="button"
      className={`game-card ${compact ? 'game-card--compact' : ''} ${restricted ? 'game-card--unavailable' : ''}`}
      onClick={() => { if (!restricted) onOpen(game.id); }}
      disabled={restricted} aria-disabled={restricted}
      aria-label={restricted ? `${t(game.title)} — ${gameStatusMessage(availability, language)}` : t(game.title)}
    >
      <div className="game-card__art" aria-hidden="true">
        {restricted ? <div className="game-card__maintenance">{gameStatusMessage(availability, language)}</div> : null}
        <span className="game-card__fallback">{game.icon}</span>

        <img
          className="game-card__image"
          src={previewUrl}
          srcSet={`${previewUrl} 600w, ${imageUrl} 960w`}
          sizes={compact ? '160px' : '(max-width: 780px) calc(50vw - 22px), (max-width: 1100px) 30vw, (max-width: 1450px) 23vw, 20vw'}
          alt=""
          loading={compact || eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          draggable="false"
          onError={(event) => {
            const image = event.currentTarget;
            // A stale Pages deploy might temporarily serve markup before the
            // new thumbnail is available. Fall back to the original cover.
            if (image.dataset.fallbackAttempted !== '1') {
              image.dataset.fallbackAttempted = '1';
              image.removeAttribute('srcset');
              image.src = imageUrl;
            } else {
              image.hidden = true;
            }
          }}
        />
      </div>

      <div className="game-card__body">
        <div className="game-card__title-row">
          <h3>{t(game.title)}</h3>
          <span className="game-card__badge">{t(game.badge)}</span>
        </div>

        {!compact && <p>{t(game.description)}</p>}
      </div>
    </button>
  );
}
