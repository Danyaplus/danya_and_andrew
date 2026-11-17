import { useEffect, useState } from 'react';
import { serverUrl, socket } from './socket.js';

const EMPTY = { games: {}, announcements: [] };
export const availabilityLabel = {
  uk: { enabled: 'Доступна', matchmaking_off: 'Пошук суперника вимкнено', maintenance: 'Технічна перерва', disabled: 'Гра недоступна' },
  ru: { enabled: 'Доступна', matchmaking_off: 'Подбор соперника отключён', maintenance: 'Технический перерыв', disabled: 'Игра недоступна' },
  en: { enabled: 'Available', matchmaking_off: 'Matchmaking paused', maintenance: 'Under maintenance', disabled: 'Game unavailable' },
};
export function gameStatusMessage(status, language) {
  return (availabilityLabel[language] || availabilityLabel.uk)[status] || '';
}
export function usePlatformState() {
  const [state, setState] = useState(EMPTY);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`${serverUrl}/api/platform/state`, { cache:'no-store' });
        if (!response.ok) throw new Error('PLATFORM_UNAVAILABLE');
        const data = await response.json();
        if (alive && data?.ok && data.games && Array.isArray(data.announcements)) setState({games:data.games,announcements:data.announcements});
      } catch { /* Backend always enforces restrictions even if network fails. */ }
    };
    void load();
    const timer = window.setInterval(load, 30000);
    const focus = () => void load();
    socket.on('platform:changed', focus);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('focus', focus);
    return () => { alive=false; clearInterval(timer); socket.off('platform:changed',focus); document.removeEventListener('visibilitychange',focus);window.removeEventListener('focus',focus); };
  }, []);
  return state;
}
