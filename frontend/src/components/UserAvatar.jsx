export default function UserAvatar({ user, size = 44, className = '' }) {
  const style = { width: size, height: size };
  const frame = user?.avatarFrame || user?.cosmetics?.frameId || 'none';
  return <span className={`user-avatar user-avatar-frame user-avatar-frame--${frame} ${className} ${user?.avatar?'':'user-avatar--default'}`} style={style} aria-hidden="true">
    {user?.avatar ? <img src={user.avatar} alt="" draggable="false" /> : <svg viewBox="0 0 48 48"><circle cx="24" cy="18" r="8" /><path d="M10.5 41c1.1-8 6-12 13.5-12s12.4 4 13.5 12" /></svg>}
  </span>;
}
