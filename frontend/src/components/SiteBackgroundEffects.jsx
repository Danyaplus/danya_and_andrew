import { useEffect, useMemo, useState } from 'react';
import '../styles/live-backgrounds.css';

const IMAGE_ASPECT = 1672 / 941;
// Public files live under Vite's configured base path (e.g. /danya_and_andrew/).
const PUBLIC_BASE = import.meta.env.BASE_URL;
const LIVE_BACKGROUNDS = {
  'site-orbit': `${PUBLIC_BASE}live-backgrounds/space-orbit.webp`,
  'site-camp': `${PUBLIC_BASE}live-backgrounds/night-camp.webp`,
  'site-neocity': `${PUBLIC_BASE}live-backgrounds/neon-city.webp`,
};

const orbitStars = [
  { id: 1, x: 6.8, y: 12.5, size: 2.2, delay: '0.2s', duration: '3.8s' },
  { id: 2, x: 18.1, y: 20.1, size: 2.8, delay: '1.3s', duration: '5.3s' },
  { id: 3, x: 34.2, y: 15.7, size: 2.4, delay: '0.9s', duration: '4.5s' },
  { id: 4, x: 46.8, y: 31.9, size: 2.5, delay: '0.4s', duration: '5.1s' },
  { id: 5, x: 54.5, y: 22.2, size: 3.3, delay: '1.1s', duration: '4.2s' },
  { id: 6, x: 64.8, y: 30.4, size: 2.1, delay: '2.4s', duration: '5.8s' },
  { id: 7, x: 77.8, y: 14.9, size: 3.4, delay: '0.6s', duration: '4.1s' },
  { id: 8, x: 90.5, y: 7.8, size: 2.9, delay: '1.7s', duration: '5.2s' },
  { id: 9, x: 24.4, y: 64.1, size: 2.2, delay: '2.0s', duration: '5.1s' },
  { id: 10, x: 59.7, y: 67.9, size: 2.5, delay: '1.0s', duration: '4.7s' },
  { id: 11, x: 69.5, y: 78.2, size: 2.6, delay: '2.6s', duration: '5.9s' },
  { id: 12, x: 86.7, y: 53.4, size: 2.0, delay: '1.8s', duration: '5.0s' },
];
const orbitMeteors = [
  { id: 1, x: 60, y: 18, len: 11, delay: '1.5s', duration: '8.5s' },
  { id: 2, x: 71, y: 23, len: 9, delay: '4.4s', duration: '9.2s' },
  { id: 3, x: 28, y: 58, len: 10, delay: '7.1s', duration: '10.8s' },
];
const campStars = [
  { id: 1, x: 20, y: 18, size: 2.4, delay: '0.6s', duration: '4.0s' },
  { id: 2, x: 32, y: 16, size: 2.0, delay: '1.4s', duration: '5.0s' },
  { id: 3, x: 42, y: 24, size: 1.8, delay: '2.0s', duration: '4.6s' },
  { id: 4, x: 59, y: 11, size: 3.0, delay: '0.4s', duration: '4.4s' },
  { id: 5, x: 73, y: 22, size: 2.3, delay: '1.0s', duration: '5.3s' },
  { id: 6, x: 84, y: 14, size: 3.1, delay: '2.1s', duration: '4.9s' },
  { id: 7, x: 66, y: 33, size: 2.4, delay: '1.7s', duration: '4.8s' },
];
const campEmbers = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  x: 43.1 + ((index % 6) - 2.5) * 0.8,
  y: 73.4 + ((index % 3) * 0.4),
  delay: `${(index % 8) * 0.38}s`,
  duration: `${2.8 + (index % 5) * 0.28}s`,
  drift: `${-2 + (index % 5) * 0.8}%`,
}));
const cityWindows = [
  [61.2, 30.4], [63.1, 33.2], [64.4, 36.1], [66.0, 32.8], [67.8, 35.7], [69.6, 31.9],
  [72.1, 37.1], [74.7, 33.3], [76.5, 36.9], [78.8, 34.7], [80.4, 38.8], [83.3, 35.3],
  [55.1, 41.6], [57.2, 39.2], [59.1, 43.3], [62.5, 40.8], [70.2, 43.5], [73.9, 41.8],
  [76.6, 44.1], [81.7, 41.2], [87.5, 42.6], [89.8, 39.8],
].map(([x, y], index) => ({ id: index, x, y, delay: `${(index % 7) * 0.55}s`, duration: `${2.2 + (index % 4) * 0.45}s` }));

function useViewport() {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return viewport;
}

function computeStage(width, height) {
  if (!width || !height) return { width: 0, height: 0, left: 0, top: 0 };
  const viewportAspect = width / height;
  if (viewportAspect > IMAGE_ASPECT) {
    const stageWidth = width;
    const stageHeight = width / IMAGE_ASPECT;
    return { width: stageWidth, height: stageHeight, left: 0, top: (height - stageHeight) / 2 };
  }
  const stageHeight = height;
  const stageWidth = height * IMAGE_ASPECT;
  return { width: stageWidth, height: stageHeight, left: (width - stageWidth) / 2, top: 0 };
}

function pointStyle(x, y, extra = {}) {
  return { left: `${x}%`, top: `${y}%`, ...extra };
}

export default function SiteBackgroundEffects({ backgroundId, animated }) {
  const imageSrc = LIVE_BACKGROUNDS[backgroundId];
  const viewport = useViewport();
  const stage = useMemo(() => computeStage(viewport.width, viewport.height), [viewport]);

  if (!imageSrc) return null;

  return (
    <div className={`codumi-live-bg codumi-live-bg--${backgroundId} ${animated ? 'is-animated' : 'is-static'}`} aria-hidden="true">
      <div
        className="codumi-live-bg__stage"
        style={{ left: `${stage.left}px`, top: `${stage.top}px`, width: `${stage.width}px`, height: `${stage.height}px`, '--codumi-earth-texture': `url(${PUBLIC_BASE}live-backgrounds/earth-texture.png)` }}
      >
        <img className="codumi-live-bg__image" src={imageSrc} alt="" />
        <div className="codumi-live-bg__wash" />
        <div className="codumi-live-bg__vignette" />

        {backgroundId === 'site-orbit' && (
          <>
            <div className="codumi-live-bg__earth-shell" style={pointStyle(74.2, 56.4, { width: '35.7%', height: '63.5%' })}>
              <div className="codumi-live-bg__earth-rotator" />
              <div className="codumi-live-bg__earth-shade" />
              <div className="codumi-live-bg__earth-atmosphere" />
            </div>
            <div className="codumi-live-bg__space-glow" />
            {orbitStars.map((star) => (
              <span
                key={star.id}
                className="codumi-live-bg__star"
                style={pointStyle(star.x, star.y, { width: `${star.size}px`, height: `${star.size}px`, animationDelay: star.delay, animationDuration: star.duration })}
              />
            ))}
            {orbitMeteors.map((meteor) => (
              <span
                key={meteor.id}
                className="codumi-live-bg__meteor"
                style={pointStyle(meteor.x, meteor.y, { width: `${meteor.len}%`, animationDelay: meteor.delay, animationDuration: meteor.duration })}
              />
            ))}
            <div className="codumi-live-bg__dust codumi-live-bg__dust--one" />
            <div className="codumi-live-bg__dust codumi-live-bg__dust--two" />
          </>
        )}

        {backgroundId === 'site-camp' && (
          <>
            <div className="codumi-live-bg__camp-light" />
            <div className="codumi-live-bg__camp-lake-mist codumi-live-bg__camp-lake-mist--one" />
            <div className="codumi-live-bg__camp-lake-mist codumi-live-bg__camp-lake-mist--two" />
            <div className="codumi-live-bg__camp-fire-core" />
            <div className="codumi-live-bg__camp-fire-flame codumi-live-bg__camp-fire-flame--one" />
            <div className="codumi-live-bg__camp-fire-flame codumi-live-bg__camp-fire-flame--two" />
            <div className="codumi-live-bg__camp-fire-flame codumi-live-bg__camp-fire-flame--three" />
            <div className="codumi-live-bg__camp-smoke" />
            {campEmbers.map((ember) => (
              <span
                key={ember.id}
                className="codumi-live-bg__ember"
                style={pointStyle(ember.x, ember.y, { animationDelay: ember.delay, animationDuration: ember.duration, '--ember-drift': ember.drift })}
              />
            ))}
            {campStars.map((star) => (
              <span
                key={star.id}
                className="codumi-live-bg__star codumi-live-bg__star--camp"
                style={pointStyle(star.x, star.y, { width: `${star.size}px`, height: `${star.size}px`, animationDelay: star.delay, animationDuration: star.duration })}
              />
            ))}
            <span className="codumi-live-bg__meteor codumi-live-bg__meteor--camp" style={pointStyle(58, 17, { width: '11%', animationDelay: '2.3s', animationDuration: '9.5s' })} />
          </>
        )}

        {backgroundId === 'site-neocity' && (
          <>
            <div className="codumi-live-bg__city-neon-pulse" />
            <div className="codumi-live-bg__water-shimmer" />
            <div className="codumi-live-bg__city-cloud city-cloud--one" />
            <div className="codumi-live-bg__city-cloud city-cloud--two" />
            <svg className="codumi-live-bg__traffic" viewBox="0 0 1672 941" preserveAspectRatio="none">
              <defs>
                <filter id="trafficGlow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path className="traffic-line traffic-line--pink" d="M 18 815 C 180 802, 385 784, 532 760 S 711 719, 818 656" />
              <path className="traffic-line traffic-line--blue" d="M 0 773 C 200 772, 421 753, 582 730 S 750 685, 835 628" />
              <path className="traffic-line traffic-line--violet" d="M 32 834 C 220 820, 409 804, 560 779 S 742 729, 850 664" />
            </svg>
            {cityWindows.map((windowItem) => (
              <span
                key={windowItem.id}
                className="codumi-live-bg__window"
                style={pointStyle(windowItem.x, windowItem.y, { animationDelay: windowItem.delay, animationDuration: windowItem.duration })}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
