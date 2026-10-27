import { useEffect, useRef, useState } from 'react';
import { downloadDmMedia } from '../lib/dmMedia.js';
import { tDm } from '../lib/dmLocale.js';

export default function DmMediaPreview({ message }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const kind = message?.media?.kind;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '420px' });
    observer.observe(container);
    return () => observer.disconnect();
  }, [message?.id]);
  useEffect(() => {
    if (!message?.id || !kind || !visible) return undefined;
    const controller = new AbortController();
    let objectUrl = '';
    setUrl('');
    setError(false);
    downloadDmMedia(message.id, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message?.id, kind, visible]);
  if (!kind) return null;
  let content = null;
  if (error) content = <div className="dm-media-status">{tDm('Не удалось загрузить вложение')}</div>;
  else if (!url) content = <div className="dm-media-status">{visible ? 'Загрузка вложения…' : 'Вложение'}</div>;
  else if (kind === 'image') content = <a href={url} target="_blank" rel="noopener noreferrer" className="dm-media-image-link" title={tDm('Открыть фото')}><img className="dm-media-image" src={url} alt={tDm('Фото из переписки')} loading="lazy" /></a>;
  else if (kind === 'voice') content = <audio className="dm-media-voice" src={url} controls preload="metadata" aria-label={tDm('Голосовое сообщение')} />;
  else if (kind === 'circle') content = (
    <div className="dm-media-circle">
      <video ref={videoRef} src={url} playsInline preload="metadata" onEnded={() => setPlaying(false)} aria-label={tDm('Видеосообщение')} />
      <button type="button" aria-label={tDm(playing ? 'Пауза' : 'Воспроизвести кружочек')} className={`dm-circle-play ${playing ? 'is-playing' : ''}`}
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) { video.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
          else { video.pause(); setPlaying(false); }
        }}>{playing ? 'Ⅱ' : '▶'}</button>
    </div>
  );
  else content = <video className="dm-media-video" src={url} controls playsInline preload="metadata" aria-label={tDm('Видео из переписки')} />;
  return <div ref={containerRef} className="dm-media-container">{content}</div>;
}
