import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import UserAvatar from './UserAvatar.jsx';
import '../styles/global-chat.css';

function formatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

export default function DirectChat({ friend, currentUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const listEndRef = useRef(null);

  useEffect(() => {
    if (!friend?.id) return undefined;
    setMessages([]);
    setDraft('');
    setError('');

    const onHistory = (payload) => {
      if (payload?.userId !== friend.id) return;
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    };

    const onMessage = (message) => {
      if (!message?.id) return;
      const relevant =
        (message.fromUserId === currentUser?.id && message.toUserId === friend.id) ||
        (message.fromUserId === friend.id && message.toUserId === currentUser?.id);
      if (!relevant) return;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    };

    const onError = () => setError('Не удалось открыть личный чат. Проверь, что вы всё ещё друзья.');

    socket.on('dm:history', onHistory);
    socket.on('dm:message', onMessage);
    socket.on('dm:error', onError);
    socket.emit('dm:history:request', { userId: friend.id });

    return () => {
      socket.off('dm:history', onHistory);
      socket.off('dm:message', onMessage);
      socket.off('dm:error', onError);
    };
  }, [friend?.id, currentUser?.id]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!friend) return null;

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !socket.connected) return;
    socket.emit('dm:send', { userId: friend.id, text });
    setDraft('');
  }

  return (
    <div className="global-chat-layer" role="presentation">
      <button type="button" className="global-chat-backdrop" aria-label="Закрыть чат" onClick={onClose} />
      <aside className="global-chat-panel" role="dialog" aria-modal="true" aria-label={`Чат с ${friend.username}`}>
        <div className="global-chat-head direct-chat-head">
          <div className="direct-chat-person">
            <span className="direct-chat-avatar"><UserAvatar user={friend} size={42} /></span>
            <div>
              <span className="global-chat-kicker">Личный чат</span>
              <h2>{friend.username}</h2>
            </div>
          </div>
          <button type="button" className="global-chat-close" onClick={onClose} aria-label="Закрыть чат">×</button>
        </div>

        <div className="global-chat-note">Этот чат видите только вы двое.</div>

        <div className="global-chat-messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="global-chat-empty">
              <span>👋</span>
              <strong>Начните разговор</strong>
              <p>Напиши сообщение {friend.username}.</p>
            </div>
          ) : messages.map((message) => {
            const mine = message.fromUserId === currentUser?.id;
            return (
              <div key={message.id} className={`chat-message-row ${mine ? 'is-mine' : ''}`}>
                <div className="chat-message-bubble">
                  <div className="chat-message-meta">
                    <strong>{mine ? 'Ты' : friend.username}</strong>
                    <time>{formatTime(message.createdAt)}</time>
                  </div>
                  <p>{message.text}</p>
                </div>
              </div>
            );
          })}
          <div ref={listEndRef} />
        </div>

        {error && <div className="direct-chat-error">{error}</div>}
        <form className="global-chat-compose" onSubmit={sendMessage}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 500))}
            maxLength={500}
            placeholder={socket.connected ? 'Сообщение…' : 'Нет соединения с сервером'}
            disabled={!socket.connected}
          />
          <button type="submit" disabled={!draft.trim() || !socket.connected} aria-label="Отправить сообщение">➤</button>
        </form>
      </aside>
    </div>
  );
}
