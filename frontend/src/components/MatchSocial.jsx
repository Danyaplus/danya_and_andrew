import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import { useTranslation } from '../lib/i18n.jsx';
import '../styles/match-social.css';

const QUICK_EMOJIS = ['👍', '👏', '😂', '🔥', '😮', '❤️'];
const QUICK_PHRASES = ['Хорошая игра!', 'Удачи!', 'Отличный ход!', 'Спасибо за матч!'];

function timeLabel(value) {
  try { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// This component stays mounted while the user is on the game page, including
// before a match starts. That prevents losing a fast postgame event.
export default function MatchSocial({ gameId, currentRoomId, phase, technicalResult }) {
  const { t } = useTranslation();
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [reaction, setReaction] = useState(null);
  const reactionTimeout = useRef(null);
  const [rematchReady, setRematchReady] = useState(false);
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchOffer, setRematchOffer] = useState(null);
  const [rematchError, setRematchError] = useState('');
  const roomRef = useRef(null);
  const openRef = useRef(false);
  const lastMessageRef = useRef(null);

  useEffect(() => { openRef.current = chatOpen; if (chatOpen) setUnread(0); }, [chatOpen]);
  useEffect(() => { lastMessageRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, chatOpen]);
  useEffect(() => {
    if (currentRoomId && !roomRef.current && phase !== 'idle') {
      roomRef.current = currentRoomId;
      setRoomId(currentRoomId);
    }
  }, [currentRoomId, phase]);

  useEffect(() => {
    roomRef.current = null;
    setRoomId(null);
    setMessages([]);
    setChatOpen(false);
    setUnread(0);
    setReaction(null);
    setRematchReady(false);
    setRematchPending(false);
    setRematchOffer(null);
    setRematchError('');
    const onStarted = (event) => {
      if (event?.gameId !== gameId) return;
      roomRef.current = event.roomId;
      setRoomId(event.roomId);
      setMessages([]);
      setUnread(0);
      setRematchReady(false);
      setRematchPending(false);
      setRematchOffer(null);
      setRematchError('');
      setChatOpen(false);
    };
    const onResumed = (event) => {
      if (event?.gameId !== gameId) return;
      roomRef.current = event.roomId;
      setRoomId(event.roomId);
    };
    const onHistory = (event) => {
      if (event?.roomId === roomRef.current) setMessages(Array.isArray(event.messages) ? event.messages.slice(-50) : []);
    };
    const onMessage = (event) => {
      if (event?.roomId !== roomRef.current || !event.id) return;
      setMessages((previous) => previous.some((item) => item.id === event.id)
        ? previous : [...previous, event].slice(-50));
      if (!openRef.current) setUnread((number) => Math.min(number + 1, 99));
      if (QUICK_EMOJIS.includes(event.text)) {
        window.clearTimeout(reactionTimeout.current);
        setReaction(event.text);
        reactionTimeout.current = window.setTimeout(() => setReaction(null), 2400);
      }
    };
    const onReady = (event) => {
      if (event?.gameId !== gameId || event.roomId !== roomRef.current) return;
      setRematchReady(true);
    };
    const onOffer = (event) => {
      if (event?.gameId !== gameId || event.roomId !== roomRef.current) return;
      setRematchReady(true);
      setRematchOffer(event.name || t('Соперник'));
      setRematchError('');
    };
    const onWaiting = (event) => {
      if (event?.roomId === roomRef.current) setRematchPending(true);
    };
    const onAccepted = (event) => {
      if (event?.roomId !== roomRef.current) return;
      setRematchReady(false);
      setRematchOffer(null);
      setRematchPending(false);
      setRematchError('');
    };
    const onDeclined = (event) => {
      if (event?.roomId !== roomRef.current) return;
      setRematchPending(false);
      setRematchOffer(null);
      setRematchError('Соперник отказался от реванша.');
    };
    const onUnavailable = (event) => {
      if (event?.roomId !== roomRef.current) return;
      setRematchReady(false);
      setRematchPending(false);
      setRematchOffer(null);
      setRematchError('Реванш недоступен: соперник вышел.');
    };
    socket.on('match:started', onStarted);
    socket.on('match:resumed', onResumed);
    socket.on('match:chat:history', onHistory);
    socket.on('match:chat:message', onMessage);
    socket.on('match:rematch:ready', onReady);
    socket.on('match:rematch:offer', onOffer);
    socket.on('match:rematch:waiting', onWaiting);
    socket.on('match:rematch:accepted', onAccepted);
    socket.on('match:rematch:declined', onDeclined);
    socket.on('match:rematch:unavailable', onUnavailable);
    return () => {
      window.clearTimeout(reactionTimeout.current);
      socket.off('match:started', onStarted);
      socket.off('match:resumed', onResumed);
      socket.off('match:chat:history', onHistory);
      socket.off('match:chat:message', onMessage);
      socket.off('match:rematch:ready', onReady);
      socket.off('match:rematch:offer', onOffer);
      socket.off('match:rematch:waiting', onWaiting);
      socket.off('match:rematch:accepted', onAccepted);
      socket.off('match:rematch:declined', onDeclined);
      socket.off('match:rematch:unavailable', onUnavailable);
    };
  }, [gameId]);

  const active = Boolean(roomId) && !technicalResult && (phase === 'playing' || phase === 'finished');
  const finished = active && phase === 'finished';
  const canSend = active && socket.connected && Boolean(draft.trim());

  const sendText = (text) => {
    if (!active || !socket.connected || !text.trim()) return;
    socket.emit('match:chat:send', { roomId, text: text.trim().slice(0, 240) });
    setDraft('');
  };
  const requestRematch = () => {
    if (!roomId || !socket.connected) return;
    setRematchPending(true);
    setRematchOffer(null);
    setRematchError('');
    socket.emit('match:rematch:request', { roomId });
  };
  const declineRematch = () => {
    if (!roomId) return;
    socket.emit('match:rematch:decline', { roomId });
    setRematchOffer(null);
    setRematchPending(false);
  };

  if (!active) return null;
  return (
    <div className="match-social" data-match-social="true">
      {reaction && <span className="match-social__reaction" aria-hidden="true">{reaction}</span>}
      <button type="button" className={`match-social__toggle ${chatOpen ? 'is-open' : ''}`} onClick={() => setChatOpen((value) => !value)} aria-label={chatOpen ? t('Закрыть чат матча') : t('Открыть чат матча')} aria-expanded={chatOpen}>
        <span aria-hidden="true">💬</span><span>{t('Чат')}</span>{!chatOpen && unread > 0 && <b>{unread}</b>}
      </button>
      {finished && rematchReady && (
        <div className="match-social__rematch">
          {rematchOffer && <span className="match-social__offer">{t('Соперник предлагает реванш!')}</span>}
          {rematchPending && !rematchOffer
            ? <span className="match-social__waiting">⏳ {t('Ждём согласия соперника…')}</span>
            : <button type="button" className="match-social__rematch-btn" onClick={requestRematch}>↻ {rematchOffer ? t('Принять реванш') : t('Реванш')}</button>}
          {rematchOffer && <button type="button" className="match-social__decline" onClick={declineRematch}>{t('Отказаться')}</button>}
        </div>
      )}
      {finished && rematchError && <span className="match-social__notice">{t(rematchError)}</span>}
      {chatOpen && (
        <section className="match-social__panel" aria-label={t('Чат матча')}>
          <div className="match-social__heading"><strong>💬 {t('Чат матча')}</strong><button type="button" onClick={() => setChatOpen(false)} aria-label={t('Закрыть чат матча')}>×</button></div>
          <div className="match-social__messages" aria-live="polite">
            {!messages.length && <p className="match-social__empty">{t('Поздоровайся с соперником!')}</p>}
            {messages.map((item) => <div key={item.id} className="match-social__message">
              <div><strong translate="no">{item.name}</strong><time>{timeLabel(item.createdAt)}</time></div>
              <p translate="no" data-no-translate="true">{item.text}</p>
            </div>)}
            <div ref={lastMessageRef} />
          </div>
          <div className="match-social__quick" aria-label={t('Быстрые реакции')}>
            {QUICK_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => sendText(emoji)}>{emoji}</button>)}
          </div>
          <div className="match-social__phrases">
            {QUICK_PHRASES.map((phrase) => <button type="button" key={phrase} onClick={() => sendText(t(phrase))}>{t(phrase)}</button>)}
          </div>
          <form className="match-social__compose" onSubmit={(event) => { event.preventDefault(); sendText(draft); }}>
            <input type="text" value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 240))} placeholder={t('Сообщение сопернику…')} maxLength={240} aria-label={t('Сообщение сопернику…')} />
            <button type="submit" disabled={!canSend} aria-label={t('Отправить')}>➤</button>
          </form>
          <small className="match-social__hint">{t('Чат доступен только участникам текущего матча.')}</small>
        </section>
      )}
    </div>
  );
}
