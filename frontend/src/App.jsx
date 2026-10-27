import { useEffect, useMemo, useState } from 'react';
import { LanguageProvider, languageFromPath, saveLanguage, setLocalizedPath } from './lib/i18n.jsx';
import { DomTranslator } from './components/DomTranslator.jsx';
import { setLocalizedMetadata } from './lib/seo.js';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import GlobalChat from './components/GlobalChat.jsx';
import AccountModal from './components/AccountModal.jsx';
import SiteBackgroundEffects from './components/SiteBackgroundEffects.jsx';
import HomePage from './pages/HomePage.jsx';
import ArenaPage from './pages/ArenaPage.jsx';
import DuelModal from './components/DuelModal.jsx';
import GamePage from './pages/GamePage.jsx';
import SpectatorPage from './pages/SpectatorPage.jsx';
import { getGameById } from './games/index.js';
import { activePartyKey, matchModeKey } from './lib/useMultiplayerGame.js';
import { apiRequest, authTokenKey, setSocketAuthToken, socket } from './lib/socket.js';
import { CARD_STYLE_KEY, THEME_KEY, effectiveAppearance, readAppearanceMode, readCardStyle } from './lib/appearance.js';

function readRoute() {
  const hash = window.location.hash || '#/';
  const match = hash.match(/^#\/game\/([^/]+)$/);
  if (match) return { type: 'game', gameId: match[1] };
  const watch = hash.match(/^#\/watch\/([a-zA-Z0-9_-]+)$/);
  if (watch) return { type: 'watch', friendId: watch[1] };
  if (hash === '#/ranking') return { type: 'ranking' };
  if (hash === '#/quests') return { type: 'quests' };
  return { type: 'home' };
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [language, setLanguage] = useState(languageFromPath);
  const [search, setSearch] = useState('');
  const [connected, setConnected] = useState(socket.connected);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [directChatFriend, setDirectChatFriend] = useState(null);
  const [accountMode, setAccountMode] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(authTokenKey) || '');
  const [user, setUser] = useState(null);
  const [shop, setShop] = useState(null);
  const [party, setParty] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(localStorage.getItem(authTokenKey)));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountSection, setAccountSection] = useState('overview');
  const [duelFriend, setDuelFriend] = useState(null);
  const [duelInbox, setDuelInbox] = useState(false);
  const [duelInviteId, setDuelInviteId] = useState(null);
  const [density, setDensity] = useState(() => localStorage.getItem('codumi-density') === 'comfortable' ? 'comfortable' : 'compact');
  const [appearanceMode, setAppearanceMode] = useState(readAppearanceMode);
  const [cardStyle, setCardStyle] = useState(readCardStyle);
  const [themeClock, setThemeClock] = useState(() => new Date());
  const activeTheme = effectiveAppearance(appearanceMode, themeClock);
  const siteBackground = shop?.equipped?.siteId || 'site-default';
  const siteAnimationEnabled = shop?.equipped?.siteAnimationEnabled !== false;

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute());
    const handleConnect = () => {
      setConnected(true);
      const savedToken = localStorage.getItem(authTokenKey);
      if (savedToken) setSocketAuthToken(savedToken);
    };
    const handleDisconnect = () => setConnected(false);

    window.addEventListener('hashchange', handleHashChange);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const savedToken = localStorage.getItem(authTokenKey);
    if (!savedToken) {
      setAuthLoading(false);
      return undefined;
    }

    (async () => {
      try {
        const payload = await apiRequest('/api/auth/me', { token: savedToken });
        if (cancelled) return;
        setToken(savedToken);
        setUser(payload.user);
        setLanguage(payload.user.language || 'uk');
        localStorage.setItem('danya-andrew-player-name', payload.user.displayName || payload.user.username);
        setSocketAuthToken(savedToken);

        // Party status is optional: a temporary party/database failure must not log a player out.
        try {
          const partyPayload = await apiRequest('/api/party/current', { token: savedToken });
          if (!cancelled) applyParty(partyPayload.party || null);
        } catch (error) {
          console.warn('[codumi] Party status temporarily unavailable:', error?.message);
        }
      } catch (error) {
        if (cancelled) return;
        // Only a confirmed expired/invalid session may remove a saved login.
        // A Render sleep, CORS/network failure or timeout is not a logout.
        if (error?.status === 401) {
          localStorage.removeItem(authTokenKey);
          localStorage.removeItem(activePartyKey);
          localStorage.setItem(matchModeKey, 'public');
          setToken('');
          setUser(null);
          setShop(null);
          setParty(null);
          setSocketAuthToken(null);
        } else {
          console.warn('[codumi] Profile will be restored when backend is available:', error?.message);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onProfileUpdated(payload) {
      if (!payload?.user) return;
      setUser((current) => current?.id === payload.user.id ? payload.user : current);
      if (payload.user.language) setLanguage(payload.user.language);
    }

    function onAuthUser(payload) {
      if (!payload?.user) return;
      setUser((current) => current?.id === payload.user.id ? payload.user : current);
      if (payload.user.language) setLanguage(payload.user.language);
    }

    function onPartyUpdate(payload) {
      applyParty(payload?.party || null);
    }

    function onPartyCleared() {
      applyParty(null);
    }

    socket.on('profile:updated', onProfileUpdated);
    socket.on('auth:user', onAuthUser);
    socket.on('party:update', onPartyUpdate);
    socket.on('party:cleared', onPartyCleared);
    return () => {
      socket.off('profile:updated', onProfileUpdated);
      socket.off('auth:user', onAuthUser);
      socket.off('party:update', onPartyUpdate);
      socket.off('party:cleared', onPartyCleared);
    };
  }, []);

  useEffect(() => {
    const onReady = (event) => {
      if (!event?.gameId || !event?.partyId) return;
      const auto = { gameId:event.gameId, partyId:event.partyId, at:Date.now() };
      localStorage.setItem('codumi-duel-join', JSON.stringify(auto));
      localStorage.setItem(activePartyKey,event.partyId);
      localStorage.setItem(matchModeKey,'party');
      setDuelInbox(false);
      setDuelInviteId(null);
      setDuelFriend(null);
      setAccountMode(null);
      setSidebarOpen(false);
      navigate(`/game/${event.gameId}`);
      window.setTimeout(() => window.dispatchEvent(new Event('codumi-duel-ready')), 80);
    };
    socket.on('duel:ready',onReady);
    return () => socket.off('duel:ready',onReady);
  }, []);

  // Load the account-bound balance and equipped cosmetics after login.
  useEffect(() => {
    if (!token || !user?.id) { setShop(null); return undefined; }
    let active = true;
    const refresh = () => apiRequest('/api/shop/me', {token}).then(result => {
      if (!active) return;
      setShop(result);
      setUser(current => current?.id === user.id
        ? { ...current, avatarFrame: result.equipped.frameId, cosmetics: result.equipped }
        : current);
      // In a logged-in account, the owned catalogue skin is used on this device too.
      if (result.equipped.cardStyleId) setCardStyle(result.equipped.cardStyleId);
    }).catch(error => console.warn('[codumi] Shop not loaded:', error?.message));
    refresh();
    const onWallet = () => refresh();
    socket.on('wallet:updated', onWallet);
    return () => { active = false; socket.off('wallet:updated', onWallet); };
  }, [token, user?.id]);

  function applyShop(next) {
    if (!next?.equipped) return;
    setShop(current => ({...current,...next}));
    setUser(current => current ? { ...current, avatarFrame:next.equipped.frameId, cosmetics:next.equipped } : current);
    if (next.equipped.cardStyleId) setCardStyle(next.equipped.cardStyleId);
  }

  function changeCardStyle(nextStyle) {
    setCardStyle(nextStyle);
    if (user && token) {
      apiRequest('/api/shop/action',{token,method:'POST',body:{action:'equip',itemId:nextStyle}})
        .then(applyShop).catch(err => console.warn('[codumi] Card skin:',err?.message));
    }
  }

  const activeGame = useMemo(() => {
    return route.type === 'game' ? getGameById(route.gameId) : null;
  }, [route]);

  function applyParty(nextParty) {
    setParty(nextParty || null);
    if (nextParty?.id) {
      localStorage.setItem(activePartyKey, nextParty.id);
      localStorage.setItem(matchModeKey, 'party');
    } else {
      localStorage.removeItem(activePartyKey);
      localStorage.setItem(matchModeKey, 'public');
    }
  }

  function navigate(path) {
    window.location.hash = path;
  }

  function openGame(gameId) {
    setSearch('');
    navigate(`/game/${gameId}`);
  }

  function goHome() {
    setSearch('');
    navigate('/');
  }

  function closeChat(command) {
    if (command === 'open' && user) {
      setChatOpen(true);
      return;
    }
    setChatOpen(false);
  }

  function authenticated(payload) {
    if (!payload?.token || !payload?.user) return;
    localStorage.setItem(authTokenKey, payload.token);
    localStorage.setItem('danya-andrew-player-name', payload.user.displayName || payload.user.username);
    setToken(payload.token);
    setUser(payload.user);
    setLanguage(payload.user.language || 'uk');
    setAuthLoading(false);
    setSocketAuthToken(payload.token);

    apiRequest('/api/party/current', { token: payload.token })
      .then((result) => applyParty(result.party || null))
      .catch(() => applyParty(null));
  }

  function userUpdated(nextUser) {
    if (!nextUser) return;
    setUser(previous => ({...previous, ...nextUser}));
    if (nextUser.language) setLanguage(nextUser.language);
    localStorage.setItem('danya-andrew-player-name', nextUser.displayName || nextUser.username);
  }

  async function changeLanguage(nextLanguage) {
    if (!['uk', 'ru', 'en'].includes(nextLanguage) || nextLanguage === language) return;
    setLanguage(nextLanguage);
    saveLanguage(nextLanguage);
    if (token && user) {
      try {
        const response = await apiRequest('/api/profile/language', {
          method: 'PATCH', token, body: { language: nextLanguage },
        });
        setUser((previous) => previous ? { ...previous, language: response.user.language } : previous);
      } catch (error) {
        // Keep the chosen language locally even if the database is temporarily unavailable.
        console.warn('[kodumi] Could not sync language preference:', error?.message);
        window.dispatchEvent(new CustomEvent('kodumi:language-sync-error'));
      }
    }
  }

  useEffect(() => {
    saveLanguage(language);
    setLocalizedPath(language);
    setLocalizedMetadata(language, route);
  }, [language, route]);

  function openDirectChat(friend) {
    if (!friend) return;
    setDirectChatFriend(friend);
    setChatOpen(true);
    setAccountMode(null);
  }

  function logout() {
    localStorage.removeItem(authTokenKey);
    localStorage.removeItem('danya-andrew-player-name');
    localStorage.removeItem(activePartyKey);
    localStorage.setItem(matchModeKey, 'public');
    setToken('');
    setUser(null);
    setLanguage('uk');
    setShop(null);
    setParty(null);
    setDirectChatFriend(null);
    setDuelInbox(false);
    setDuelFriend(null);
    setChatOpen(false);
    setChatUnread(0);
    setSocketAuthToken(null);
  }


  useEffect(() => {
    localStorage.setItem('codumi-density', density);
  }, [density]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, appearanceMode);
    document.documentElement.dataset.codumiTheme = activeTheme;
    document.documentElement.style.colorScheme = activeTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', activeTheme === 'light' ? '#f8fbff' : '#0d111c');
  }, [appearanceMode, activeTheme]);

  useEffect(() => {
    document.documentElement.dataset.codumiSiteBackground = siteBackground;
  }, [siteBackground]);

  useEffect(() => {
    document.documentElement.dataset.codumiSiteAnimation = siteAnimationEnabled ? 'on' : 'off';
  }, [siteAnimationEnabled]);

  useEffect(() => {
    localStorage.setItem(CARD_STYLE_KEY, cardStyle);
    document.documentElement.dataset.codumiCardStyle = cardStyle;
  }, [cardStyle]);

  useEffect(() => {
    // Check the wall clock and refresh after returning from sleep/background.
    const updateClock = () => setThemeClock(new Date());
    const onVisibility = () => { if (!document.hidden) updateClock(); };
    const timer = window.setInterval(updateClock, 30_000);
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', updateClock);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    function onEscape(event) { if (event.key === 'Escape') setSidebarOpen(false); }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  function openProfileSection(section = 'overview') {
    setAccountSection(section);
    setAccountMode(user ? 'profile' : 'login');
  }

  function watchFriend(friend) {
    if (!user || !friend?.id) return;
    setSearch('');
    setAccountMode(null);
    setSidebarOpen(false);
    navigate(`/watch/${friend.id}`);
  }

  function openDuel(friend = null) {
    if (!user) { setAccountMode('login');return; }
    setDuelFriend(friend);setDuelInbox(true);setDuelInviteId(null);setAccountMode(null);
  }

  function toggleSidebar() {
    if (!sidebarOpen) {
      setSearch('');
      setChatOpen(false);
      setAccountMode(null);
    }
    setSidebarOpen(!sidebarOpen);
  }

  function showCatalog() {
    goHome();
    window.setTimeout(() => document.getElementById('games-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  return (
    <LanguageProvider language={language} setLanguage={changeLanguage}>
    <DomTranslator language={language} />
    <div className={`app-shell codumi-density--${density} codumi-card-style--${cardStyle}`} >
      <SiteBackgroundEffects backgroundId={siteBackground} animated={siteAnimationEnabled} />
      <Header
        search={search}
        setSearch={setSearch}
        effectiveTheme={activeTheme}
        appearanceMode={appearanceMode}
        onToggleTheme={() => setAppearanceMode(activeTheme === 'dark' ? 'light' : 'dark')}
        onHome={goHome}
        onOpenGame={openGame}
        connected={connected}
        onOpenChat={() => {
          if (!user) return;
          setDirectChatFriend(null);
          setChatOpen(true);
        }}
        chatUnread={chatUnread}
        user={user}
        token={token}
        onProfileSection={openProfileSection}
        onDuelInvite={(id) => { setDuelFriend(null); setDuelInviteId(id); setDuelInbox(true); }}
        authLoading={authLoading}
        onLogin={() => setAccountMode('login')}
        onRegister={() => setAccountMode('register')}
        onProfile={() => openProfileSection('overview')}
        onToggleSidebar={toggleSidebar}
        sidebarOpen={sidebarOpen}
        language={language}
        onLanguageChange={changeLanguage}
      />

      <div className={`codumi-main-layout ${sidebarOpen ? 'has-sidebar' : ''}`}>
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          user={user}
          onHome={goHome}
          onCatalog={showCatalog}
          onProfileSection={openProfileSection}
          onChat={() => { setDirectChatFriend(null); setChatOpen(true); }}
          onRanking={() => navigate('/ranking')}
          onQuests={() => navigate('/quests')}
          onDuels={() => openDuel()}
          onShop={() => openProfileSection('shop')}
          shop={shop}
          siteBackground={siteBackground}
          onLogin={() => setAccountMode('login')}
          density={density}
          setDensity={setDensity}
          appearanceMode={appearanceMode}
          setAppearanceMode={setAppearanceMode}
          cardStyle={cardStyle}
          setCardStyle={changeCardStyle}
          currentPage={route.type}
          language={language}
          onLanguageChange={changeLanguage}
        />
        <div className="codumi-main-content">
          {route.type === 'home' ? (
            <HomePage search={search} onOpenGame={openGame} />
          ) : route.type === 'ranking' || route.type === 'quests' ? (
            <ArenaPage type={route.type} user={user} token={token} onInvite={openDuel} onLogin={() => setAccountMode('login')} />
          ) : route.type === 'watch' ? (
            <SpectatorPage key={route.friendId} friendId={route.friendId} onBack={() => { goHome(); openProfileSection('friends'); }} />
          ) : (
            <GamePage game={activeGame} onBack={goHome} party={party} currentUser={user} />
          )}
        </div>
      </div>

      <GlobalChat
        open={chatOpen && Boolean(user)}
        onClose={closeChat}
        onUnreadChange={setChatUnread}
        currentUser={user}
        initialFriend={directChatFriend}
        onInitialFriendConsumed={() => setDirectChatFriend(null)}
      />

      <AccountModal
        mode={accountMode}
        initialSection={accountSection}
        token={token}
        user={user}
        connected={connected}
        party={party}
        onClose={() => setAccountMode(null)}
        onAuthenticated={authenticated}
        onUserUpdated={userUpdated}
        onOpenDirectChat={openDirectChat}
        onInviteFriend={openDuel}
        onWatchFriend={watchFriend}
        onPartyChanged={applyParty}
        onLogout={logout}
        shop={shop}
        onShopChange={applyShop}
        language={language}
        onLanguageChange={changeLanguage}
      />
      {duelInbox && user && <DuelModal token={token} friend={duelFriend} inviteId={duelInviteId} onClose={() => {setDuelInbox(false);setDuelInviteId(null);setDuelFriend(null);}} />}
    </div>
    </LanguageProvider>
  );
}
