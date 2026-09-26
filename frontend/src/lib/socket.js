import { io } from 'socket.io-client';

const serverUrl = 'https://danya-and-andrew-backend.onrender.com';

export const socket = io(serverUrl, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
