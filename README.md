# Danya & Andrew

Онлайн-платформа с играми на двоих. Общий интерфейс платформы не зависит от конкретной игры: шапка, поиск, каталог, маршрутизация, Socket.IO-клиент и matchmaking являются общими, а сами игры подключаются отдельными модулями.

## Структура проекта

```text
danya-andrew/
├─ frontend/
│  ├─ .env.example
│  ├─ index.html
│  └─ src/
│     ├─ components/
│     │  ├─ Header.jsx          # шапка Danya & Andrew + поиск
│     │  └─ GameCard.jsx        # универсальная карточка игры
│     ├─ pages/
│     │  ├─ HomePage.jsx        # каталог игр
│     │  └─ GamePage.jsx        # универсальная страница запуска игры
│     ├─ lib/
│     │  ├─ socket.js           # единое Socket.IO-соединение
│     │  └─ useMultiplayerGame.js # общий клиентский контракт игры
│     ├─ games/
│     │  ├─ index.js            # автоматически находит игры
│     │  └─ chess/              # первая игра
│     │     ├─ index.js
│     │     ├─ ChessGame.jsx
│     │     └─ chess.css
│     ├─ styles/global.css
│     ├─ App.jsx
│     └─ main.jsx
│
├─ backend/
│  ├─ .env.example
│  └─ src/
│     ├─ core/
│     │  └─ matchmaker.js       # общая очередь и комнаты
│     ├─ games/
│     │  ├─ index.js            # автоматически находит серверные игры
│     │  └─ chess/
│     │     ├─ index.js
│     │     └─ createChessRoom.js
│     └─ server.js
│
└─ package.json
```

Главный принцип: если удалить обе папки `games/chess`, ядро платформы остаётся рабочим — просто каталог будет пустым. Общие компоненты не содержат шахматной логики.

## Запуск

Нужен Node.js 20+.

```bash
npm install
npm run dev
```

После запуска:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`
- health-check: `http://localhost:3001/api/health`

Для локальной проверки matchmaking открой сайт в двух браузерах или в обычном и приватном окне. В обоих открой шахматы и нажми «Найти соперника».

## Production

```bash
npm install
npm run build
npm start
```

После сборки backend умеет отдавать `frontend/dist`, поэтому production можно запускать одним Node-процессом.

## Что реализовано

- название платформы **Danya & Andrew**;
- адаптивная шапка;
- поиск игр по названию;
- выпадающие результаты поиска;
- каталог карточек игр;
- отдельная папка `frontend/src/games` для игровых модулей;
- автоматическое обнаружение frontend-игр через Vite `import.meta.glob`;
- отдельная папка `backend/src/games` для серверной логики игр;
- автоматическое обнаружение backend-игр;
- единый Socket.IO-клиент;
- универсальный React-hook `useMultiplayerGame(gameId)`;
- общая очередь matchmaking;
- автоматическое создание комнаты для двух игроков;
- корректный выход из очереди при уходе со страницы;
- корректное завершение матча, если игрок покинул игру;
- первая игра — полноценные шахматы;
- случайное распределение белых и чёрных;
- таймер 10+0 каждому игроку;
- серверная проверка всех ходов через `chess.js`;
- рокировка;
- взятие на проходе;
- превращение пешки с выбором фигуры;
- шах, мат и пат;
- троекратное повторение;
- правило 50 ходов, если оно поддерживается используемой версией `chess.js`;
- ничья при недостаточном материале;
- сдача;
- поражение по времени;
- завершение партии при отключении соперника;
- кнопка поиска нового соперника после завершения партии.

## Как добавить следующую игру

### 1. Frontend

Создай папку:

```text
frontend/src/games/checkers/
```

Минимально нужны:

```text
index.js
CheckersGame.jsx
checkers.css
```

`index.js`:

```js
import CheckersGame from './CheckersGame.jsx';

export default {
  id: 'checkers',
  order: 2,
  title: 'Шашки',
  description: 'Классические шашки на двоих.',
  icon: '🔴',
  badge: '2 игрока',
  component: CheckersGame,
};
```

Ничего вручную добавлять в общий каталог не нужно — `frontend/src/games/index.js` сам увидит новую папку.

В компоненте игры используй общий hook:

```js
const {
  waiting,
  state,
  error,
  findMatch,
  cancelSearch,
  sendAction,
} = useMultiplayerGame('checkers');
```

Таким образом новая игра автоматически получает общую очередь, комнату и Socket.IO-канал.

### 2. Backend

Создай:

```text
backend/src/games/checkers/index.js
backend/src/games/checkers/createCheckersRoom.js
```

`index.js`:

```js
import { createCheckersRoom } from './createCheckersRoom.js';

export default {
  id: 'checkers',
  title: 'Шашки',
  createRoom: createCheckersRoom,
};
```

Игровая комната должна вернуть общий контракт:

```js
{
  playerSocketIds,
  emitState(),
  handleAction(socketId, action),
  handleDisconnect(socketId),
  destroy(),
}
```

После этого backend сам обнаружит игру. `matchmaker.js` менять не нужно.

## Socket.IO-события ядра

Frontend → backend:

```text
queue:join
queue:leave
game:action
match:leave
```

Backend → frontend:

```text
queue:waiting
queue:left
match:started
game:state
game:error
```

Сами игры передают свои команды внутри `game:action`, например шахматы отправляют:

```js
{
  type: 'move',
  payload: {
    from: 'e2',
    to: 'e4',
    promotion: 'q',
  },
}
```

## Переменные окружения

### Frontend

В development по умолчанию используется `http://localhost:3001`. Если backend находится на другом адресе:

```text
VITE_SERVER_URL=https://api.example.com
```

### Backend

```text
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

## Основные команды

```bash
npm run dev      # frontend + backend одновременно
npm run build    # production-сборка frontend
npm start        # запуск backend / production-сервера
```
