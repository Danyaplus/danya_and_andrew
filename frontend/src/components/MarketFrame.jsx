import '../styles/market-frame.css';

// Admins may customize these safe settings; arbitrary CSS is never executed.
export const DEFAULT_FRAME_STYLE = Object.freeze({ color: '#ffd15e', thickness: 5, glow: 14, pattern: 'solid' });
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const patterns = new Set(['solid', 'double', 'dashed']);

export function normalizeFrameStyle(style) {
  const input = style?.frame && typeof style.frame === 'object' ? style.frame : {};
  const thickness = Number(input.thickness);
  const glow = Number(input.glow);
  return {
    color: typeof input.color === 'string' && HEX_COLOR.test(input.color) ? input.color : DEFAULT_FRAME_STYLE.color,
    thickness: Number.isFinite(thickness) ? Math.max(2, Math.min(12, Math.round(thickness))) : DEFAULT_FRAME_STYLE.thickness,
    glow: Number.isFinite(glow) ? Math.max(0, Math.min(32, Math.round(glow))) : DEFAULT_FRAME_STYLE.glow,
    pattern: patterns.has(input.pattern) ? input.pattern : DEFAULT_FRAME_STYLE.pattern,
  };
}

// The image is an actual wearable overlay; otherwise render a configurable CSS ring.
// The item must come from the server's owned/equipped inventory, not local storage.
export default function MarketFrame({ product }) {
  if (!product || product.kind !== 'frame') return null;
  if ((product.art_mode || product.artMode) === 'image' && product.imageUrl) {
    return <img className="codumi-market-frame" src={product.imageUrl} alt="" aria-hidden="true" />;
  }
  const frame = normalizeFrameStyle(product.art_style || product.artStyle);
  return <span className={`codumi-market-frame-ring codumi-market-frame-ring--${frame.pattern}`} aria-hidden="true" style={{
    '--km-frame-color': frame.color,
    '--km-frame-thickness': `${frame.thickness}px`,
    '--km-frame-glow': `${frame.glow}px`,
  }}/>
}
