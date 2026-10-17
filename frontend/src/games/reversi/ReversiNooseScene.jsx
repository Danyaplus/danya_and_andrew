import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './reversi-noose.css';

const AUDIO_START_MS = 8000;
const soundUrl = `${import.meta.env.BASE_URL}audio/reversi-finale.m4a`;
const cardOneUrl = `${import.meta.env.BASE_URL}images/games/reversi/noose-rope.webp`;
const cardTwoUrl = `${import.meta.env.BASE_URL}images/games/reversi/noose-stick.webp`;

// Full-screen cutscene for BOTH players. The server decides the winner.
export default function ReversiNooseScene({ event, onAudioDuration }) {
  const [elapsed, setElapsed] = useState(event?.elapsedMs || 0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [soundMissing, setSoundMissing] = useState(false);
  const audioRef = useRef(null);
  const durationReporter = useRef(onAudioDuration);
  durationReporter.current = onAudioDuration;

  useEffect(() => {
    const startedLocal = Date.now() - Math.max(0, event?.elapsedMs || 0);
    const update = () => setElapsed(Math.max(0, Math.min(180000, Date.now() - startedLocal)));
    update();
    const timer = window.setInterval(update, 80);
    return () => window.clearInterval(timer);
  }, [event?.id]);

  useEffect(() => {
    if (!event?.id) return undefined;
    const audio = new Audio(soundUrl);
    audio.volume = 0.72;
    audio.preload = 'metadata';
    audioRef.current = audio;
    const onMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        durationReporter.current?.(Math.ceil(audio.duration * 1000));
      }
    };
    const onError = () => { setSoundMissing(true); setSoundBlocked(false); };
    audio.addEventListener('loadedmetadata', onMetadata);
    audio.addEventListener('error', onError);
    audio.load();
    const play = () => {
      if (audio.error) return;
      // Browser autoplay policies can require a manual tap to start sound.
      audio.play().catch(() => { if (!audio.error) setSoundBlocked(true); });
    };
    const remaining = AUDIO_START_MS - Math.max(0, event.elapsedMs || 0);
    const timer = window.setTimeout(play, Math.max(0, remaining));
    return () => {
      window.clearTimeout(timer);
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMetadata);
      audio.removeEventListener('error', onError);
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [event?.id]);

  if (!event || event.type !== 'noose') return null;
  const soundPhase = elapsed >= AUDIO_START_MS;
  return createPortal(
    <div className="rv-noose" role="dialog" aria-modal="true" aria-label="Секретная комбинация">
      <div className="rv-noose__ambient" aria-hidden="true" />
      <div className="rv-noose__header"><span>Реверси</span><b>СЕКРЕТНАЯ КОМБИНАЦИЯ</b><span>КОДУМИ</span></div>
      <div className={`rv-noose__equation ${soundPhase ? 'rv-noose__equation--gone' : ''}`}>
        <div className="rv-noose__card rv-noose__card--one">
          <img src={cardOneUrl} alt="Верёвочная петля" />
          <small>ПЕТЛЯ</small>
        </div>
        <div className="rv-noose__sign rv-noose__sign--plus" aria-label="плюс">+</div>
        <div className="rv-noose__card rv-noose__card--two">
          <img src={cardTwoUrl} alt="Деревянная палка" />
          <small>ПАЛКА</small>
        </div>
        <div className="rv-noose__sum"><strong>=</strong><span>ХОРОШАЯ<br/>ПЫТКА</span></div>
      </div>
      <div className={`rv-noose__audio-scene ${soundPhase ? 'is-visible' : ''}`}>
        <div className="rv-noose__rings" aria-hidden="true"><i/><i/><i/></div>
        <span className="rv-noose__audio-eyebrow">КОМБИНАЦИЯ АКТИВИРОВАНА</span>
        <h2>ХОРОШАЯ ПЫТКА</h2>
        <div className="rv-noose__bars" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.07}s` }} />)}</div>
        {soundBlocked && !soundMissing && <button type="button" className="rv-noose__sound-button" onClick={() => { audioRef.current?.play().then(() => setSoundBlocked(false)).catch(() => {}); }}>🔊 Включить звук</button>}
      </div>
      <div className="rv-noose__footer"><span>⚫</span><span>Финал начнётся автоматически</span><span>⚪</span></div>
    </div>,
    document.body,
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
    document.body,
  );
}
