import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ADMIN_ROUTE } from './lib/adminRoute.js';
import './styles/global.css';
import './styles/language.css';
import './styles/appearance.css';
import './styles/cosmetics.css';
import './styles/theme-polish.css';
import './styles/game-adaptive.css';
import './styles/mobile-header.css';
import './styles/responsive-polish.css';

const base = new URL(import.meta.env.BASE_URL, window.location.origin).pathname;
const adminPath = `${base}${ADMIN_ROUTE}`.replace(/\/$/u, '');
const isAdmin = window.location.pathname.replace(/\/$/u, '') === adminPath;
const MainPage = lazy(() => isAdmin ? import('./pages/AdminPage.jsx') : import('./App.jsx'));

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={null}><MainPage /></Suspense>
  </React.StrictMode>,
);
