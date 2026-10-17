import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './reversi-noose.css';

const SOUND_AT_MS = 8000;
const soundtrack = `${import.meta.env.BASE_URL}audio/reversi-finale.m4a`;
const firstImage = `${import.meta.env.BASE_URL}images/games/reversi/noose-rope.webp`;
const secondImage = `${import.meta.env.BASE_URL}images/games/reversi/noose-stick.webp`;

// The room server publishes one event to BOTH players, including the elapsed time.
// Every part of the scene is revealed from that shared timeline, not from CSS delays.
export default function ReversiNooseScene({ event, onAudioDuration }) {
  const [elapsed, setElapsed] = useState(event?.elapsedMs || 0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [soundMissing, setSoundMissing] = useState(false);
  const audioRef = useRef(null);
  const durationReporter = useRef(onAudioDuration);
  durationReporter.current = onAudioDuration;

  useEffect(() => {
    if (!event?.id) return undefined;
    const startedLocal = Date.now() - Math.max(0, event.elapsedMs || 0);
    const update = () => setElapsed(Math.max(0, Date.now() - startedLocal));
    update();
    const timer = window.setInterval(update, 70);
    return () => window.clearInterval(timer);
  }, [event?.id]);

  useEffect(() => {
    if (!event?.id || event.type !== 'noose') return undefined;
    setSoundMissing(false);
    setSoundBlocked(false);

    const audio = new Audio(soundtrack);
    audio.preload = 'auto';
    audio.volume = 0.8;
    audioRef.current = audio;
    const elapsedAtMount = Math.max(0, event.elapsedMs || 0);

    const onMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        durationReporter.current?.(Math.ceil(audio.duration * 1000));
        // Reopened matches stay aligned with the room's audio timeline.
        const passedSoundSec = (elapsedAtMount - SOUND_AT_MS) / 1000;
        if (passedSoundSec > 0) audio.currentTime = Math.min(audio.duration - 0.1, passedSoundSec);
      }
    };
    const onError = () => { setSoundMissing(true); setSoundBlocked(false); };
    const onPlaying = () => setSoundBlocked(false);
    audio.addEventListener('loadedmetadata', onMetadata);
    audio.addEventListener('error', onError);
    audio.addEventListener('playing', onPlaying);
    audio.load();

    const tryPlay = () => {
      if (audio.error) return;
      audio.play().catch(() => {
        if (!audio.error) setSoundBlocked(true);
      });
    };
    const playTimer = window.setTimeout(tryPlay, Math.max(0, SOUND_AT_MS - elapsedAtMount));
    return () => {
      window.clearTimeout(playTimer);
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMetadata);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('playing', onPlaying);
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [event?.id]);

  if (!event || event.type !== 'noose') return null;
  const audioPhase = elapsed >= SOUND_AT_MS;
  const stageClass = (enabled) => enabled ? ' is-revealed' : '';

  return createPortal(
    <div className="rv-noose" role="dialog" aria-modal="true" aria-label="Секретная комбинация Реверси">
      <div className="rv-noose__ambient" aria-hidden="true" />
      <div className="rv-noose__header"><span>Реверси</span><b>СЕКРЕТНАЯ КОМБИНАЦИЯ</b><span>KODUMI</span></div>
      <div className={`rv-noose__equation ${audioPhase ? 'rv-noose__equation--gone' : ''}`}>
        <div className={`rv-noose__card rv-noose__card--one${stageClass(elapsed >= 0)}`}>
          <img src={firstImage} alt="Верёвочная петля" />
          <small>ПЕТЛЯ</small>
        </div>
        <div className={`rv-noose__sign rv-noose__sign--plus${stageClass(elapsed >= 2000)}`} aria-label="плюс">+</div>
        <div className={`rv-noose__card rv-noose__card--two${stageClass(elapsed >= 4000)}`}>
          <img src={secondImage} alt="Деревянная палка" />
          <small>ПАЛКА</small>
        </div>
        <div className={`rv-noose__sum${stageClass(elapsed >= 6000)}`}><strong>=</strong><span>ХОРОШАЯ<br/>ПЫТКА</span></div>
      </div>
      <div className={`rv-noose__audio-scene ${audioPhase ? 'is-visible' : ''}`}>
        <div className="rv-noose__rings" aria-hidden="true"><i/><i/><i/></div>
        <span className="rv-noose__audio-eyebrow">КОМБИНАЦИЯ АКТИВИРОВАНА</span>
        <h2>ХОРОШАЯ ПЫТКА</h2>
        <div className="rv-noose__bars" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.07}s` }} />)}</div>
        {soundBlocked && !soundMissing && (
          <button type="button" className="rv-noose__sound-button"
            onClick={() => audioRef.current?.play().then(() => setSoundBlocked(false)).catch(() => {})}>
            🔊 Включить звук
          </button>
        )}
        {soundMissing && <span className="rv-noose__audio-hint">Музыка появится после добавления reversi-finale.m4a</span>}
      </div>
      <div className="rv-noose__footer"><span>⚫</span><span>Эта сцена показывается обоим игрокам</span><span>⚪</span></div>
    </div>,
    document.fullscreenElement || document.body,
  );
}

export function ReversiNooseResult({ won, onPlayAgain, onBack }) {
  return createPortal(
    <div className={`rv-noose-end ${won ? 'rv-noose-end--win' : 'rv-noose-end--loss'}`} role="dialog" aria-modal="true" aria-label={won ? 'Победа' : 'Поражение'}>
      <div className="rv-noose-end__halo" aria-hidden="true" />
      <div className="rv-noose-end__content">
        <span className="rv-noose-end__eyebrow">РЕВЕРСИ · СЕКРЕТНЫЙ ФИНАЛ</span>
        <div className="rv-noose-end__symbol" aria-hidden="true">{won ? '🏆' : '⚫⚪'}</div>
        <h2>{won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ!'}</h2>
        <p>{won
          ? 'Фишки соперника не выдержали хорошую пытку. Ты победил!'
          : 'Ваши все шашки пытали, и они не выдержали пытку, потому что пытка очень хорошая.'}</p>
        <div className="rv-noose-end__actions">
          <button type="button" onClick={onPlayAgain}>↻ Ещё раз играть</button>
          <button type="button" onClick={onBack}>← Вернуться в меню</button>
        </div>
      </div>
    </div>,
    document.fullscreenElement || document.body,
  );
}
