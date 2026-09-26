import { io } from 'socket.io-client';

const defaultServerUrl = import.meta.env.DEV
  ? 'http://localhost:3001'
  : window.location.origin;

const serverUrl = import.meta.env.VITE_SERVER_URL || defaultServerUrl;

export const socket = io(serverUrl, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
