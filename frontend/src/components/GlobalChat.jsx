import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import '../styles/global-chat.css';

function formatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

export default function GlobalChat({ open, onClose, onUnreadChange, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState(null);
  const openRef = useRef(open);
  const listEndRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      onUnreadChange?.(0);
      socket.emit('chat:history:request');
      window.setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  }, [open, onUnreadChange]);

  useEffect(() => {
    function onHistory(payload) {
      const next = Array.isArray(payload?.messages) ? payload.messages : [];
      setMessages(next);
    }

    function onMessage(message) {
      if (!message?.id) return;
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        return [...current, message];
      });

      const fromMe = currentUser?.id ? message.userId === currentUser.id : message.senderId === socket.id;
      if (!fromMe && !openRef.current) {
        onUnreadChange?.((count) => count + 1);
        setToast(message);
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 5200);
      }
    }

    function onCleared() {
      setMessages([]);
      onUnreadChange?.(0);
      setToast(null);
    }

    socket.on('chat:history', onHistory);
    socket.on('chat:message', onMessage);
    socket.on('chat:cleared', onCleared);

    if (socket.connected) socket.emit('chat:history:request');

    return () => {
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onMessage);
      socket.off('chat:cleared', onCleared);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [onUnreadChange, currentUser?.id]);

  useEffect(() => {
    if (!open) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !socket.connected) return;

    socket.emit('chat:send', { text });
    setDraft('');
  }

  function openFromToast() {
    setToast(null);
    onUnreadChange?.(0);
    onClose?.('open');
  }

  return (
    <>
      {open && (
        <div className="global-chat-layer" role="presentation">
          <button
            type="button"
            className="global-chat-backdrop"
            aria-label="Закрыть чат"
            onClick={() => onClose?.()}
          />

          <aside className="global-chat-panel" role="dialog" aria-modal="true" aria-label="Глобальный чат">
            <div className="global-chat-head">
              <div>
                <span className="global-chat-kicker">Danya & Andrew</span>
                <h2>Глобальный чат</h2>
              </div>
              <button type="button" className="global-chat-close" onClick={() => onClose?.()} aria-label="Закрыть чат">×</button>
            </div>

            <div className="global-chat-note">
              Сообщения видят все, кто сейчас находится на сайте. Когда все выйдут, история очистится.
            </div>

            <div className="global-chat-messages" aria-live="polite">
              {messages.length === 0 ? (
                <div className="global-chat-empty">
                  <span>💬</span>
                  <strong>Пока тихо</strong>
                  <p>Напиши первое сообщение.</p>
                </div>
              ) : (
                messages.map((message) => {
                  const mine = currentUser?.id ? message.userId === currentUser.id : message.senderId === socket.id;
                  return (
                    <div key={message.id} className={`chat-message-row ${mine ? 'is-mine' : ''}`}>
                      <div className="chat-message-bubble">
                        <div className="chat-message-meta">
                          <strong>{mine ? 'Ты' : message.name}</strong>
                          <time>{formatTime(message.createdAt)}</time>
                        </div>
                        <p>{message.text}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={listEndRef} />
            </div>

            <form className="global-chat-compose" onSubmit={sendMessage}>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 500))}
                maxLength={500}
                placeholder={socket.connected ? 'Сообщение…' : 'Нет соединения с сервером'}
                aria-label="Сообщение"
                disabled={!socket.connected}
              />
              <button type="submit" disabled={!draft.trim() || !socket.connected} aria-label="Отправить сообщение">
                ➤
              </button>
            </form>
          </aside>
        </div>
      )}

      {toast && !open && (
        <button type="button" className="chat-toast" onClick={openFromToast}>
          <span className="chat-toast__icon">💬</span>
          <span className="chat-toast__body">
            <strong>{toast.name}</strong>
            <span>{toast.text}</span>
          </span>
          <span className="chat-toast__open">Открыть</span>
        </button>
      )}
    </>
  );
}
