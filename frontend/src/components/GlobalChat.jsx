import { useEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import UserAvatar from './UserAvatar.jsx';
import '../styles/global-chat.css';
import '../styles/dm-media.css';
import DmMediaPreview from './DmMediaPreview.jsx';
import DmMediaComposer from './DmMediaComposer.jsx';
import { dmMediaLabel } from '../lib/dmLocale.js';
import { translateText } from '../lib/translations.js';

const REACTIONS = ['👍', '❤️', '😂', '😢', '😡'];
const GLOBAL_HIDDEN_KEY = 'kodumi-global-chat-hidden-v1';
function getGlobalHidden(userId) {
  if (!userId) return new Set();
  try {
    const obj = JSON.parse(localStorage.getItem(`${GLOBAL_HIDDEN_KEY}:${userId}`) || 'null');
    if (obj?.hour === Math.floor(Date.now() / 3_600_000) && Array.isArray(obj.ids)) return new Set(obj.ids);
  } catch { /* private browsing */ }
  return new Set();
}
function storeGlobalHidden(userId, ids) {
  if (!userId) return;
  try {
    localStorage.setItem(`${GLOBAL_HIDDEN_KEY}:${userId}`, JSON.stringify({
      hour: Math.floor(Date.now() / 3_600_000), ids: [...ids].slice(-200),
    }));
  } catch { /* disabled storage */ }
}
function withoutHiddenGlobalReply(message, hidden) {
  return message.replyToId && hidden.has(message.replyToId)
    ? { ...message, replyToId: null, replyTo: null }
    : message;
}


function formatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

function lastVisit(friend) {
  const language = ['uk', 'ru', 'en'].includes(document.documentElement.lang)
    ? document.documentElement.lang : 'uk';
  const labels = {
    uk: { online: 'у мережі', unknown: 'давно не був(ла) в мережі', just: 'щойно був(ла) в мережі', prefix: 'був(ла) в мережі', date: 'заходив(ла)' },
    ru: { online: 'в сети', unknown: 'давно не был(а) в сети', just: 'был(а) в сети только что', prefix: 'был(а) в сети', date: 'заходил(а)' },
    en: { online: 'online', unknown: 'last seen a while ago', just: 'last seen just now', prefix: 'last seen', date: 'last visited' },
  }[language];
  if (friend?.online) return labels.online;
  const last = Number(friend?.lastSeenAt);
  if (!last) return labels.unknown;
  const locale = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-US' }[language];
  const elapsed = Math.max(0, Date.now() - last);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (elapsed < 60_000) return labels.just;
  if (elapsed < 60 * 60_000) return `${labels.prefix} ${rtf.format(-Math.floor(elapsed / 60_000), 'minute')}`;
  if (elapsed < 24 * 60 * 60_000) return `${labels.prefix} ${rtf.format(-Math.floor(elapsed / 3_600_000), 'hour')}`;
  if (elapsed < 7 * 24 * 60 * 60_000) return `${labels.prefix} ${rtf.format(-Math.floor(elapsed / 86_400_000), 'day')}`;
  return `${labels.date} ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(last))}`;
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
  onDeleteForMe,
  onDeleteForAll,
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
            <strong translate={mine ? undefined : "no"}>{mine ? 'Ты' : (message.name || fallbackName || 'Игрок')}</strong>
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
              <span translate="no">{shortText(message.replyTo.text, 80)}</span>
            </span>
          )}

          <p translate="no">{message.media ? dmMediaLabel(message.media.kind) : message.text}</p>

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
        {message.media && <DmMediaPreview message={message} />}

        {selected && (
          <div className={`chat-message-actions ${mine ? 'is-mine' : ''}`}>
            <button type="button" className="chat-reply-action" onClick={() => onReply(message)}>↩ Ответить</button>
            <div className="chat-reaction-picker">
              {REACTIONS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => onReact(message.id, emoji)}>{emoji}</button>
              ))}
            </div>
            <div className="chat-message-delete-options">
              <button type="button" onClick={() => onDeleteForMe(message)}>🗑 Удалить у меня</button>
              {mine && <button type="button" className="is-danger" onClick={() => onDeleteForAll(message)}>🗑 Удалить у всех</button>}
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
  const hiddenGlobalRef = useRef(getGlobalHidden(currentUser?.id));
  useEffect(() => { hiddenGlobalRef.current = getGlobalHidden(currentUser?.id); }, [currentUser?.id]);

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
      const hidden = getGlobalHidden(currentUser?.id);
      hiddenGlobalRef.current = hidden;
      setGlobalMessages((Array.isArray(payload?.messages) ? payload.messages : [])
        .filter((m) => !hidden.has(m.id)).map((m) => withoutHiddenGlobalReply(m, hidden)));
    }

    function onGlobalMessage(message) {
      if (!message?.id || hiddenGlobalRef.current.has(message.id)) return;
      setGlobalMessages((current) => current.some((item) => item.id === message.id)
        ? current : [...current, withoutHiddenGlobalReply(message, hiddenGlobalRef.current)]);
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
          text: message.media ? dmMediaLabel(message.media.kind) : message.text,
        });
      }
    }

    function onGlobalDeleted(payload) {
      if (!payload?.messageId) return;
      setGlobalMessages((current) => current.filter((item) => item.id !== payload.messageId)
        .map((item) => item.replyToId === payload.messageId ? { ...item, replyTo: null, replyToId: null } : item));
      setGlobalReply((current) => current?.id === payload.messageId ? null : current);
      setSelectedMessageId((current) => current === payload.messageId ? null : current);
    }

    function onDirectDeleted(payload) {
      if (!payload?.messageId) return;
      setDirectMessages((current) => current.filter((item) => item.id !== payload.messageId)
        .map((item) => item.replyToId === payload.messageId ? { ...item, replyTo: null, replyToId: null } : item));
      setDirectReply((current) => current?.id === payload.messageId ? null : current);
      setSelectedMessageId((current) => current === payload.messageId ? null : current);
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
          ? { ...item, friend: { ...item.friend, online: Boolean(payload.online), lastSeenAt: payload.lastSeenAt || item.friend.lastSeenAt } }
          : item
      )));
      setSelectedFriend((current) => {
        if (current?.id !== payload.userId) return current;
        const next = { ...current, online: Boolean(payload.online), lastSeenAt: payload.lastSeenAt || current.lastSeenAt };
        selectedFriendRef.current = next;
        return next;
      });
    }

    function onFriendsChanged() {
      socket.emit('dm:summary:request');
    }

    function onDirectPurged() {
      socket.emit('dm:summary:request');
      if (selectedFriendRef.current?.id) {
        socket.emit('dm:history:request', { userId: selectedFriendRef.current.id });
      }
    }

    function onDmError() {
      setError('Не удалось выполнить действие в чате. Попробуй ещё раз.');
    }

    const onCleared = () => { setGlobalMessages([]); setGlobalUnread(0); };

    socket.on('chat:history', onHistory);
    socket.on('chat:message', onGlobalMessage);
    socket.on('chat:reaction', onGlobalReaction);
    socket.on('chat:deleted', onGlobalDeleted);
    socket.on('chat:cleared', onCleared);
    socket.on('dm:summary', onSummary);
    socket.on('dm:history', onDirectHistory);
    socket.on('dm:message', onDirectMessage);
    socket.on('dm:history:purged', onDirectPurged);
    socket.on('dm:reaction', onDirectReaction);
    socket.on('dm:deleted', onDirectDeleted);
    socket.on('presence:update', onPresence);
    socket.on('dm:presence', onPresence);
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
      socket.off('chat:deleted', onGlobalDeleted);
      socket.off('chat:cleared', onCleared);
      socket.off('dm:summary', onSummary);
      socket.off('dm:history', onDirectHistory);
      socket.off('dm:message', onDirectMessage);
      socket.off('dm:history:purged', onDirectPurged);
      socket.off('dm:reaction', onDirectReaction);
      socket.off('dm:deleted', onDirectDeleted);
      socket.off('presence:update', onPresence);
      socket.off('dm:presence', onPresence);
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

  function deleteMessageForMe(message, isDirect) {
    if (!message?.id) return;
    if (isDirect) {
      socket.emit('dm:delete', { messageId: message.id, scope: 'me' });
    } else {
      const next = new Set(hiddenGlobalRef.current);
      next.add(message.id);
      hiddenGlobalRef.current = next;
      storeGlobalHidden(currentUser?.id, next);
      setGlobalMessages((current) => current.filter((item) => item.id !== message.id)
        .map((item) => withoutHiddenGlobalReply(item, next)));
      setGlobalReply((current) => current?.id === message.id ? null : current);
    }
    setSelectedMessageId(null);
  }

  function deleteMessageForAll(message, isDirect) {
    if (!message?.id) return;
    const mine = isDirect ? message.fromUserId === currentUser?.id : message.userId === currentUser?.id;
    if (!mine) return;
    if (!window.confirm(translateText('Удалить это сообщение у всех участников?', document.documentElement.lang))) return;
    socket.emit(isDirect ? 'dm:delete' : 'chat:delete',
      isDirect ? { messageId: message.id, scope: 'all' } : { messageId: message.id });
    setSelectedMessageId(null);
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
              <div><span className="global-chat-kicker">Kodumi Games</span><h2>Чат</h2></div>
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
                      onDeleteForMe={(item) => deleteMessageForMe(item, false)}
                      onDeleteForAll={(item) => deleteMessageForAll(item, false)}
                      onJump={jumpToMessage}
                      registerRef={registerMessageRef}
                    />
                  ))}
                  <div ref={listEndRef} />
                </div>
                <form className="global-chat-compose" onSubmit={sendGlobal}>
                  {globalReply && (
                    <div className="chat-compose-reply">
                      <div><b>↩ {globalReply.name || 'Сообщение'}</b><span translate="no">{shortText(globalReply.text, 90)}</span></div>
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
                  <div><strong>{selectedFriend.displayName || selectedFriend.username}</strong><span>@{selectedFriend.username} · {lastVisit(selectedFriend)}</span></div>
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
                      onDeleteForMe={(item) => deleteMessageForMe(item, true)}
                      onDeleteForAll={(item) => deleteMessageForAll(item, true)}
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
                      <div><b>↩ {directReply.fromUserId === currentUser?.id ? 'Ты' : (selectedFriend.displayName || selectedFriend.username)}</b><span translate="no">{shortText(directReply.text, 90)}</span></div>
                      <button type="button" onClick={() => setDirectReply(null)}>×</button>
                    </div>
                  )}
                  <div className="chat-compose-line">
                    <DmMediaComposer key={selectedFriend.id} friendId={selectedFriend.id} onError={(message) => setError(message)} />
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
                        <span className="chat-friend-topline"><strong translate="no">{friend.displayName || friend.username}</strong>{last?.createdAt && <time>{formatTime(last.createdAt)}</time>}</span>
                        <span className="chat-friend-login">@{friend.username} · {lastVisit(friend)}</span>
                        <span className="chat-friend-preview" translate="no">{last ? `${last.fromUserId === currentUser?.id ? 'Вы: ' : ''}${last.mediaKind ? dmMediaLabel(last.mediaKind) : shortText(last.text)}` : 'Начните переписку'}</span>
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
          <span className="chat-toast__body"><strong translate="no">{toast.name}</strong><span translate="no">{toast.text}</span></span>
          <span className="chat-toast__open">Открыть</span>
        </button>
      )}
    </>
  );
}
