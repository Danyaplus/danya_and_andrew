import { useEffect, useState } from 'react';
import '../styles/platform-notices.css';

export default function PlatformAnnouncements({ announcements, language }) {
  const [dismissed, setDismissed] = useState(() => new Set());
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const visible = (announcements || []).filter(a => a.startsAt <= clock && a.endsAt > clock && !dismissed.has(a.id));
  if (!visible.length) return null;
  return <div className="kodumi-public-notices" aria-label="Kodumi Games announcements">
    {visible.slice(0,3).map(item => <div className="kodumi-public-notice" key={item.id} role="status">
      <span className="kodumi-public-notice__badge" aria-hidden="true">✦</span>
      <div><strong>Kodumi Games</strong><p>{item.translations?.[language] || item.translations?.uk || ''}</p></div>
      <button type="button" aria-label="Close announcement" onClick={() => setDismissed(prev => new Set([...prev, item.id]))}>×</button>
    </div>)}
  </div>;
}
