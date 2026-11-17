import { useTranslation } from '../lib/i18n.jsx';

import { gameStatusMessage } from '../lib/platformState.js';

export default function GameCard({ game, compact = false, eager = false, priority = false, onOpen, availability = 'enabled' }) {
  const { t, language } = useTranslation();
  const restricted = availability !== 'enabled';
  const imageUrl = `${import.meta.env.BASE_URL}images/games/${game.id}.webp`;

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
          src={imageUrl}
          alt=""
          loading={compact || eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          draggable="false"
          onError={(event) => {
            // If a game has no image, keep the emoji fallback visible.
            event.currentTarget.hidden = true;
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
