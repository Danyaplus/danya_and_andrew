import '../styles/market-art-text.css';

const FONT = { display: 'Georgia, serif', modern: 'Inter, system-ui, sans-serif', mono: 'ui-monospace, SFMono-Regular, monospace', elegant: 'Palatino Linotype, Book Antiqua, serif' };
export const DEFAULT_ART_STYLE = Object.freeze({ font: 'display', color: '#f2ccff', size: 38, bold: true, italic: false, underline: false, glow: true, wave: false });
export function normalizeArtStyle(value) {
  const x = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    font: Object.hasOwn(FONT, x.font) ? x.font : DEFAULT_ART_STYLE.font,
    color: typeof x.color === 'string' && /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : DEFAULT_ART_STYLE.color,
    size: Number.isInteger(Number(x.size)) ? Math.min(64, Math.max(18, Number(x.size))) : DEFAULT_ART_STYLE.size,
    bold: x.bold !== false, italic: x.italic === true, underline: x.underline === true,
    glow: x.glow !== false, wave: x.wave === true,
  };
}
export default function MarketArtText({ text, artStyle, className = '' }) {
  const s = normalizeArtStyle(artStyle);
  const glyphs = [...String(text || 'TEXT').slice(0, 32)];
  return <strong className={`kd-art-lettering ${s.wave ? 'is-wave' : ''} ${s.glow ? 'is-glow' : ''} ${className}`}
    style={{ color: s.color, fontSize: `clamp(15px, ${Math.round(s.size * .8)}px, ${s.size}px)`,
      fontFamily: FONT[s.font], fontWeight: s.bold ? 800 : 400, fontStyle: s.italic ? 'italic' : 'normal',
      textDecoration: s.underline ? 'underline' : 'none', '--kd-letter-glow': s.color }}>
    {s.wave ? glyphs.map((letter, index) => <span key={index} className="kd-art-lettering__glyph" style={{ animationDelay: `${index * .09}s` }}>{letter === ' ' ? '\u00a0' : letter}</span>) : glyphs.join('')}
  </strong>;
}
