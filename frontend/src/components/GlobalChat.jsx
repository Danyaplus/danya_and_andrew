import { useEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import UserAvatar from './UserAvatar.jsx';
import '../styles/global-chat.css';

const REACTIONS = ['👍', '❤️', '😂', '😢', '😡'];

function formatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

function shortText(value, max = 64) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function MessageBubble({
  message,
  mine,
  currentUser,
  fallbackName,
  selected,
  onSelect,
  onReply,
  onReact,
  onJump,
  registerRef,
}) {
  const reactions = message?.reactions && typeof message.reactions === 'object' ? message.reactions : {};

  return (
    <div
      ref={(node) => registerRef(message.id, node)}
      className={`chat-message-row ${mine ? 'is-mine' : ''} ${selected ? 'is-selected' : ''}`}
    >
      <div className="chat-message-wrap">
        <button type="button" className="chat-message-bubble" onClick={() => onSelect(message.id)}>
          <div className="chat-message-meta">
            <strong>{mine ? 'Ты' : (message.name || fallbackName || 'Игрок')}</strong>
            <time>{formatTime(message.createdAt)}</time>
          </div>

          {message.replyTo && (
            <span
              className="chat-reply-quote"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onJump(message.replyTo.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onJump(message.replyTo.id);
                }
              }}
            >
              <b>↩ {message.replyTo.name || 'Сообщение'}</b>
              <span>{shortText(message.replyTo.text, 80)}</span>
            </span>
          )}

          <p>{message.text}</p>

          {Object.entries(reactions).some(([, ids]) => Array.isArray(ids) && ids.length > 0) && (
            <span className="chat-message-reactions">
              {Object.entries(reactions).map(([emoji, ids]) => {
                if (!Array.isArray(ids) || ids.length === 0) return null;
                return (
                  <span
                    key={emoji}
                    className={`chat-reaction-chip ${currentUser?.id && ids.includes(currentUser.id) ? 'is-mine' : ''}`}
                  >
                    {emoji} {ids.length}
                  </span>
                );
              })}
            </span>
          )}
        </button>

        {selected && (
          <div className={`chat-message-actions ${mine ? 'is-mine' : ''}`}>
            <button type="button" className="chat-reply-action" onClick={() => onReply(message)}>↩ Ответить</button>
            <div className="chat-reaction-picker">
              {REACTIONS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => onReact(message.id, emoji)}>{emoji}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GlobalChat({
  open,
  onClose,
  onUnreadChange,
  currentUser,
  initialFriend = null,
  onInitialFriendConsumed,
}) {
  const [tab, setTab] = useState('global');
  const [globalMessages, setGlobalMessages] = useState([]);
  const [globalDraft, setGlobalDraft] = useState('');
  const [globalReply, setGlobalReply] = useState(null);
  const [globalUnread, setGlobalUnread] = useState(0);

  const [summaries, setSummaries] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [directMessages, setDirectMessages] = useState([]);
  const [directDraft, setDirectDraft] = useState('');
  const [directReply, setDirectReply] = useState(null);

  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const openRef = useRef(open);
  const tabRef = useRef(tab);
  const selectedFriendRef = useRef(selectedFriend);
  const summariesRef = useRef(summaries);
  const listEndRef = useRef(null);
  const toastTimerRef = useRef(null);
  const messageRefs = useRef(new Map());

  const dmUnread = useMemo(
    () => summaries.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0),
    [summaries],
  );

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { selectedFriendRef.current = selectedFriend; }, [selectedFriend]);
  useEffect(() => { summariesRef.current = summaries; }, [summaries]);

  useEffect(() => {
    tabRef.current = tab;
    setSelectedMessageId(null);
    if (open && tab === 'global') setGlobalUnread(0);
  }, [tab, open]);

  useEffect(() => {
    onUnreadChange?.(globalUnread + dmUnread);
  }, [globalUnread, dmUnread, onUnreadChange]);

  useEffect(() => {
    if (!open) return;
    socket.emit('chat:history:request');
    socket.emit('dm:summary:request');
    if (tabRef.current === 'global') setGlobalUnread(0);
  }, [open]);

  useEffect(() => {
    if (!open || !initialFriend?.id) return;
    setTab('friends');
    setSelectedFriend(initialFriend);
    selectedFriendRef.current = initialFriend;
    setDirectMessages([]);
    setDirectReply(null);
    setError('');
    socket.emit('dm:history:request', { userId: initialFriend.id });
    onInitialFriendConsumed?.();
  }, [open, initialFriend?.id, onInitialFriendConsumed]);

  useEffect(() => {
    function showToast(nextToast) {
      setToast(nextToast);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setToast(null), 5200);
    }

    function onHistory(payload) {
      setGlobalMessages(Array.isArray(payload?.messages) ? payload.messages : []);
    }

    function onGlobalMessage(message) {
      if (!message?.id) return;
      setGlobalMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      const mine = message.userId === currentUser?.id;
      const viewingGlobal = openRef.current && tabRef.current === 'global';
      if (!mine && !viewingGlobal) {
        setGlobalUnread((count) => count + 1);
        showToast({ kind: 'global', name: message.name, text: message.text });
      }
    }

    function onGlobalReaction(payload) {
      if (!payload?.messageId) return;
      setGlobalMessages((current) => current.map((message) => (
        message.id === payload.messageId ? { ...message, reactions: payload.reactions || {} } : message
      )));
    }

    function onSummary(payload) {
      const chats = Array.isArray(payload?.chats) ? payload.chats : [];
      summariesRef.current = chats;
      setSummaries(chats);

      const currentId = selectedFriendRef.current?.id;
      if (!currentId) return;
      const updated = chats.find((item) => item.friend?.id === currentId)?.friend;
      if (updated) {
        selectedFriendRef.current = updated;
        setSelectedFriend(updated);
      }
    }

    function onDirectHistory(payload) {
      if (payload?.userId !== selectedFriendRef.current?.id) return;
      setDirectMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      setError('');
    }

    function onDirectMessage(message) {
      if (!message?.id || !currentUser?.id) return;
      const otherId = message.fromUserId === currentUser.id ? message.toUserId : message.fromUserId;
      const activeFriend = selectedFriendRef.current;
      const viewingThread = openRef.current && tabRef.current === 'friends' && activeFriend?.id === otherId;

      if (activeFriend?.id === otherId) {
        setDirectMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      }

      if (message.fromUserId !== currentUser.id && viewingThread) {
        socket.emit('dm:read', { userId: otherId });
      } else if (message.fromUserId !== currentUser.id && !viewingThread) {
        const summary = summariesRef.current.find((item) => item.friend?.id === otherId);
        showToast({
          kind: 'dm',
          friend: summary?.friend || {
            id: otherId,
            username: message.name || 'friend',
            displayName: message.name || 'Друг',
            avatar: message.avatar || null,
          },
          name: message.name || 'Друг',
          text: message.text,
        });
      }
    }

    function onDirectReaction(payload) {
      if (!payload?.messageId) return;
      setDirectMessages((current) => current.map((message) => (
        message.id === payload.messageId ? { ...message, reactions: payload.reactions || {} } : message
      )));
    }

    function onPresence(payload) {
      if (!payload?.userId) return;
      setSummaries((current) => current.map((item) => (
        item.friend?.id === payload.userId
          ? { ...item, friend: { ...item.friend, online: Boolean(payload.online) } }
          : item
      )));
      setSelectedFriend((current) => {
        if (current?.id !== payload.userId) return current;
        const next = { ...current, online: Boolean(payload.online) };
        selectedFriendRef.current = next;
        return next;
      });
    }

    function onFriendsChanged() {
      socket.emit('dm:summary:request');
    }

    function onDmError() {
      setError('Не удалось выполнить действие в чате. Попробуй ещё раз.');
    }

    const onCleared = () => { setGlobalMessages([]); setGlobalUnread(0); };

    socket.on('chat:history', onHistory);
    socket.on('chat:message', onGlobalMessage);
    socket.on('chat:reaction', onGlobalReaction);
    socket.on('chat:cleared', onCleared);
    socket.on('dm:summary', onSummary);
    socket.on('dm:history', onDirectHistory);
    socket.on('dm:message', onDirectMessage);
    socket.on('dm:reaction', onDirectReaction);
    socket.on('presence:update', onPresence);
    socket.on('friends:changed', onFriendsChanged);
    socket.on('dm:error', onDmError);

    if (socket.connected) {
      socket.emit('chat:history:request');
      socket.emit('dm:summary:request');
    }

    return () => {
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onGlobalMessage);
      socket.off('chat:reaction', onGlobalReaction);
      socket.off('chat:cleared', onCleared);
      socket.off('dm:summary', onSummary);
      socket.off('dm:history', onDirectHistory);
      socket.off('dm:message', onDirectMessage);
      socket.off('dm:reaction', onDirectReaction);
      socket.off('presence:update', onPresence);
      socket.off('friends:changed', onFriendsChanged);
      socket.off('dm:error', onDmError);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!open) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [globalMessages, directMessages, open, selectedFriend?.id, tab]);

  function registerMessageRef(id, node) {
    if (!id) return;
    if (node) messageRefs.current.set(id, node);
    else messageRefs.current.delete(id);
  }

  function jumpToMessage(id) {
    const node = messageRefs.current.get(id);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('is-jump-highlight');
    window.setTimeout(() => node.classList.remove('is-jump-highlight'), 1000);
  }

  function chooseTab(nextTab) {
    setTab(nextTab);
    setSelectedMessageId(null);
    if (nextTab === 'global') {
      setSelectedFriend(null);
      selectedFriendRef.current = null;
      setGlobalUnread(0);
    } else {
      socket.emit('dm:summary:request');
    }
  }

  function openFriend(friend) {
    if (!friend?.id) return;
    setTab('friends');
    setSelectedFriend(friend);
    selectedFriendRef.current = friend;
    setDirectMessages([]);
    setDirectDraft('');
    setDirectReply(null);
    setSelectedMessageId(null);
    setError('');
    socket.emit('dm:history:request', { userId: friend.id });
  }

  function backToFriends() {
    setSelectedFriend(null);
    selectedFriendRef.current = null;
    setDirectMessages([]);
    setDirectReply(null);
    setSelectedMessageId(null);
    setError('');
    socket.emit('dm:summary:request');
  }

  function sendGlobal(event) {
    event.preventDefault();
    const text = globalDraft.trim();
    if (!text || !socket.connected) return;
    socket.emit('chat:send', { text, replyToId: globalReply?.id || null });
    setGlobalDraft('');
    setGlobalReply(null);
  }

  function sendDirect(event) {
    event.preventDefault();
    const text = directDraft.trim();
    if (!text || !socket.connected || !selectedFriend?.id) return;
    socket.emit('dm:send', { userId: selectedFriend.id, text, replyToId: directReply?.id || null });
    setDirectDraft('');
    setDirectReply(null);
  }

  function openFromToast() {
    const next = toast;
    setToast(null);
    onClose?.('open');
    if (next?.kind === 'dm' && next.friend) {
      window.setTimeout(() => openFriend(next.friend), 0);
    } else {
      setTab('global');
      setGlobalUnread(0);
    }
  }

  return (
    <>
      {open && (
        <div className="global-chat-layer" role="presentation">
          <button type="button" className="global-chat-backdrop" aria-label="Закрыть чат" onClick={() => onClose?.()} />
          <aside className="global-chat-panel" role="dialog" aria-modal="true" aria-label="Чат">
            <div className="global-chat-head">
              <div><span className="global-chat-kicker">Danya & Andrew</span><h2>Чат</h2></div>
              <button type="button" className="global-chat-close" onClick={() => onClose?.()} aria-label="Закрыть чат">×</button>
            </div>

            <div className="chat-tabs">
              <button type="button" className={tab === 'global' ? 'is-active' : ''} onClick={() => chooseTab('global')}>
                Глобальный {globalUnread > 0 && <span>{globalUnread > 99 ? '99+' : globalUnread}</span>}
              </button>
              <button type="button" className={tab === 'friends' ? 'is-active' : ''} onClick={() => chooseTab('friends')}>
                Друзья {dmUnread > 0 && <span>{dmUnread > 99 ? '99+' : dmUnread}</span>}
              </button>
            </div>

            {tab === 'global' ? (
              <>
                <div className="global-chat-note">Общий чат для всех игроков, которые сейчас находятся на сайте.</div>
                <div className="global-chat-messages">
                  {globalMessages.length === 0 ? (
                    <div className="global-chat-empty"><span>💬</span><strong>Пока тихо</strong><p>Напиши первое сообщение.</p></div>
                  ) : globalMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      mine={message.userId === currentUser?.id}
                      currentUser={currentUser}
                      selected={selectedMessageId === message.id}
                      onSelect={(id) => setSelectedMessageId((current) => current === id ? null : id)}
                      onReply={(item) => { setGlobalReply(item); setSelectedMessageId(null); }}
                      onReact={(id, emoji) => { socket.emit('chat:react', { messageId: id, emoji }); setSelectedMessageId(null); }}
                      onJump={jumpToMessage}
                      registerRef={registerMessageRef}
                    />
                  ))}
                  <div ref={listEndRef} />
                </div>
                <form className="global-chat-compose" onSubmit={sendGlobal}>
                  {globalReply && (
                    <div className="chat-compose-reply">
                      <div><b>↩ {globalReply.name || 'Сообщение'}</b><span>{shortText(globalReply.text, 90)}</span></div>
                      <button type="button" onClick={() => setGlobalReply(null)}>×</button>
                    </div>
                  )}
                  <div className="chat-compose-line">
                    <input value={globalDraft} onChange={(event) => setGlobalDraft(event.target.value.slice(0, 500))} maxLength={500} placeholder="Сообщение…" disabled={!socket.connected} />
                    <button type="submit" disabled={!globalDraft.trim() || !socket.connected}>➤</button>
                  </div>
                </form>
              </>
            ) : selectedFriend ? (
              <>
                <div className="direct-thread-head">
                  <button type="button" className="direct-thread-back" onClick={backToFriends}>‹</button>
                  <UserAvatar user={selectedFriend} size={42} />
                  <div><strong>{selectedFriend.displayName || selectedFriend.username}</strong><span>@{selectedFriend.username} · {selectedFriend.online ? 'в сети' : 'не в сети'}</span></div>
                </div>
                <div className="global-chat-messages">
                  {directMessages.length === 0 ? (
                    <div className="global-chat-empty"><span>👋</span><strong>Начните разговор</strong><p>Напиши сообщение другу.</p></div>
                  ) : directMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      mine={message.fromUserId === currentUser?.id}
                      currentUser={currentUser}
                      fallbackName={selectedFriend.displayName || selectedFriend.username}
                      selected={selectedMessageId === message.id}
                      onSelect={(id) => setSelectedMessageId((current) => current === id ? null : id)}
                      onReply={(item) => { setDirectReply(item); setSelectedMessageId(null); }}
                      onReact={(id, emoji) => { socket.emit('dm:react', { messageId: id, emoji }); setSelectedMessageId(null); }}
                      onJump={jumpToMessage}
                      registerRef={registerMessageRef}
                    />
                  ))}
                  <div ref={listEndRef} />
                </div>
                {error && <div className="direct-chat-error">{error}</div>}
                <form className="global-chat-compose" onSubmit={sendDirect}>
                  {directReply && (
                    <div className="chat-compose-reply">
                      <div><b>↩ {directReply.fromUserId === currentUser?.id ? 'Ты' : (selectedFriend.displayName || selectedFriend.username)}</b><span>{shortText(directReply.text, 90)}</span></div>
                      <button type="button" onClick={() => setDirectReply(null)}>×</button>
                    </div>
                  )}
                  <div className="chat-compose-line">
                    <input value={directDraft} onChange={(event) => setDirectDraft(event.target.value.slice(0, 500))} maxLength={500} placeholder="Сообщение…" disabled={!socket.connected} />
                    <button type="submit" disabled={!directDraft.trim() || !socket.connected}>➤</button>
                  </div>
                </form>
              </>
            ) : (
              <div className="chat-friends-list">
                {summaries.length === 0 ? (
                  <div className="global-chat-empty"><span>👥</span><strong>Друзей пока нет</strong><p>Добавь друга через профиль.</p></div>
                ) : summaries.map((item) => {
                  const friend = item.friend;
                  const last = item.lastMessage;
                  return (
                    <button key={friend.id} type="button" className="chat-friend-row" onClick={() => openFriend(friend)}>
                      <span className="chat-friend-avatar"><UserAvatar user={friend} size={48} /><i className={friend.online ? 'is-online' : ''} /></span>
                      <span className="chat-friend-main">
                        <span className="chat-friend-topline"><strong>{friend.displayName || friend.username}</strong>{last?.createdAt && <time>{formatTime(last.createdAt)}</time>}</span>
                        <span className="chat-friend-login">@{friend.username}</span>
                        <span className="chat-friend-preview">{last ? `${last.fromUserId === currentUser?.id ? 'Вы: ' : ''}${shortText(last.text)}` : 'Начните переписку'}</span>
                      </span>
                      {item.unreadCount > 0 && <span className="chat-friend-unread">{item.unreadCount > 99 ? '99+' : item.unreadCount}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      )}

      {toast && !open && (
        <button type="button" className="chat-toast" onClick={openFromToast}>
          <span className="chat-toast__icon">💬</span>
          <span className="chat-toast__body"><strong>{toast.name}</strong><span>{toast.text}</span></span>
          <span className="chat-toast__open">Открыть</span>
        </button>
      )}
    </>
  );
}
