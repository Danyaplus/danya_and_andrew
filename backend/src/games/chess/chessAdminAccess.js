// Chess admin access is based on the authenticated account, never on a
// player-provided nickname, display name, request payload, or browser flag.
const ADMIN_USERNAME_KEY = 'danyatest1';

export function canUseChessAdmin(io, socketId) {
  const socket = io?.sockets?.sockets?.get(socketId);
  const user = socket?.data?.authUser;
  return Boolean(
    user?.id &&
    socket.data.userId === user.id &&
    typeof user.username === 'string' &&
    user.username.trim().toLocaleLowerCase('ru-RU') === ADMIN_USERNAME_KEY
  );
}
