import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { Matchmaker } from './core/matchmaker.js';
import { gameRegistry } from './games/index.js';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'danya-andrew-server',
    games: [...gameRegistry.keys()],
  });
});

app.get('/api/games', (_req, res) => {
  res.json([...gameRegistry.values()].map(({ id, title }) => ({ id, title })));
});

if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const matchmaker = new Matchmaker(io);
const chatMessages = [];
let clearChatTimer = null;

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, 28);
  return trimmed || 'Игрок';
}

function safeMessage(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 500);
}

function sendChatHistory(socket) {
  socket.emit('chat:history', { messages: chatMessages });
}

function cancelScheduledChatClear() {
  if (!clearChatTimer) return;
  clearTimeout(clearChatTimer);
  clearChatTimer = null;
}

function scheduleChatClearIfEmpty() {
  cancelScheduledChatClear();

  // Небольшая пауза защищает историю от случайного краткого reconnect на телефоне.
  clearChatTimer = setTimeout(() => {
    if (io.sockets.sockets.size !== 0) return;
    chatMessages.length = 0;
    clearChatTimer = null;
    console.log('[chat] История очищена: на сайте никого нет.');
  }, 2000);
  clearChatTimer.unref?.();
}

io.on('connection', (socket) => {
  cancelScheduledChatClear();
  socket.data.currentRoom = null;

  sendChatHistory(socket);

  socket.on('chat:history:request', () => {
    sendChatHistory(socket);
  });

  socket.on('chat:send', (payload = {}) => {
    const text = safeMessage(payload.text);
    if (!text) return;

    const message = {
      id: randomUUID(),
      senderId: socket.id,
      name: safeName(payload.name),
      text,
      createdAt: Date.now(),
    };

    chatMessages.push(message);
    io.emit('chat:message', message);
  });

  socket.on('queue:join', (payload) => {
    matchmaker.joinQueue(socket, payload || {});
  });

  socket.on('queue:leave', (payload) => {
    if (!payload?.gameId) return;
    matchmaker.leaveQueue(socket, payload.gameId);
  });

  socket.on('game:action', (payload) => {
    if (!payload?.roomId || !payload?.action) return;
    matchmaker.handleAction(socket, payload);
  });

  socket.on('match:leave', () => {
    matchmaker.leaveMatch(socket);
  });

  socket.on('disconnect', () => {
    matchmaker.handleDisconnect(socket);
    scheduleChatClearIfEmpty();
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Danya & Andrew server: http://localhost:${PORT}`);
  console.log(`Games: ${[...gameRegistry.keys()].join(', ') || 'none'}`);
});
