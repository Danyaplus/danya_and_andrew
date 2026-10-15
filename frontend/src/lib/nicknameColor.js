// Keep any player-selected nickname color legible even on a dark profile banner.
export function needsLightBackdrop(hex) {
  const raw = String(hex || '#FFFFFF').replace('#', '');
  const r = parseInt(raw.slice(0,2), 16);
  const g = parseInt(raw.slice(2,4), 16);
  const b = parseInt(raw.slice(4,6), 16);
  return (0.2126*r + 0.7152*g + 0.0722*b) < 140;
}
