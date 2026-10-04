export default function UserAvatar({ user, size = 44, className = '' }) {
  const style = { width: size, height: size };

  if (user?.avatar) {
    return (
      <span className={`user-avatar ${className}`} style={style} aria-hidden="true">
        <img src={user.avatar} alt="" draggable="false" />
      </span>
    );
  }

  return (
    <span className={`user-avatar user-avatar--default ${className}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="18" r="8" />
        <path d="M10.5 41c1.1-8 6-12 13.5-12s12.4 4 13.5 12" />
      </svg>
    </span>
  );
}
