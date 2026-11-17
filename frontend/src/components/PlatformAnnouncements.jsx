import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import '../styles/platform-notices.css';

function NoticeToast({ item, onDismiss }) {
  useEffect(() => {
    const remaining = Math.max(0, Number(item.endsAt) - Date.now());
    if (!remaining) { onDismiss(item.id); return; }
    const timer = window.setTimeout(() => onDismiss(item.id), remaining);
    return () => window.clearTimeout(timer);
  }, [item.id, item.endsAt, onDismiss]);
  return <div className="kodumi-public-notice" role="status">
    <span className="kodumi-public-notice__badge" aria-hidden="true">✦</span>
    <div className="kodumi-public-notice__message"><strong>Kodumi Games:</strong> <span>{item.text}</span></div>
    <button type="button" aria-label="Закрыть уведомление" onClick={() => onDismiss(item.id)}>×</button>
    <span className="kodumi-public-notice__progress" style={{ animationDuration: `${Math.max(0, item.endsAt - Date.now())}ms` }} aria-hidden="true" />
  </div>;
}

// Announcements are intentionally not translated: everyone sees the exact text
// entered by the admin. Each notice appears only once, for up to 10 seconds.
export default function PlatformAnnouncements({ announcements }) {
  const [visible, setVisible] = useState([]);
  const seen = useRef(new Set());
  const dismiss = useCallback(id => setVisible(old => old.filter(item => item.id !== id)), []);
  const add = useCallback(item => {
    const expiry = Number(item?.endsAt || 0);
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    if (!item?.id || !text || expiry <= Date.now() || seen.current.has(item.id)) return;
    seen.current.add(item.id);
    setVisible(old => [...old, { id: item.id, text, endsAt: expiry }].slice(-3));
  }, []);
  useEffect(() => {
    socket.on('platform:announcement', add);
    return () => socket.off('platform:announcement', add);
  }, [add]);
  useEffect(() => { (announcements || []).forEach(add); }, [announcements, add]);
  if (!visible.length) return null;
  return <div className="kodumi-public-notices" data-no-translate="true" translate="no" aria-live="polite" aria-label="Kodumi Games">
    {visible.map(item => <NoticeToast key={item.id} item={item} onDismiss={dismiss} />)}
  </div>;
}
