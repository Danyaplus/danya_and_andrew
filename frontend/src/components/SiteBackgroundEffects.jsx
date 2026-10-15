import { useEffect, useMemo, useState } from 'react';
import '../styles/live-backgrounds.css';

// All effect coordinates belong to the ORIGINAL 1672 × 941 image.
// The stage scales with background-size: cover, so effects follow the picture.
const IMAGE_WIDTH = 1672;
const IMAGE_HEIGHT = 941;
const IMAGE_RATIO = IMAGE_WIDTH / IMAGE_HEIGHT;
const BASE = import.meta.env.BASE_URL;
const PICTURES = {
  'site-orbit': `${BASE}live-backgrounds/space-orbit.webp`,
  'site-camp': `${BASE}live-backgrounds/night-camp.webp`,
  'site-neocity': `${BASE}live-backgrounds/neon-city.webp`,
};

// Star points were hand-selected from the sky, avoiding planets, trees,
// the mountain horizon, buildings and clouds.
const STARS = {
  'site-orbit': [
    [84, 130, 2.1], [160, 264, 1.6], [276, 251, 1.4], [349, 205, 1.9],
    [450, 68, 1.7], [503, 107, 2.3], [580, 177, 1.6], [680, 217, 1.9],
    [732, 78, 1.4], [801, 127, 1.8], [878, 136, 2.0], [947, 94, 1.5],
    [1035, 74, 2.2], [1092, 198, 1.7], [1160, 88, 1.5], [1224, 149, 1.9],
    [1337, 49, 2.2], [1517, 53, 1.5], [1617, 296, 1.9], [914, 401, 1.9],
    [842, 359, 1.4], [729, 341, 1.6], [622, 474, 1.5], [470, 402, 1.8],
    [367, 528, 1.4], [544, 610, 2.0], [692, 595, 1.6], [815, 564, 1.5],
    [930, 587, 2.0], [1033, 388, 1.6], [899, 268, 1.8], [1109, 277, 1.7],
  ],
  'site-camp': [
    [307, 73, 1.4], [377, 91, 2.1], [462, 124, 1.7], [538, 53, 1.7],
    [635, 113, 1.5], [744, 181, 1.9], [833, 73, 1.4], [885, 151, 1.8],
    [997, 66, 2.0], [1096, 135, 1.7], [1183, 112, 1.8], [1278, 56, 1.5],
    [1122, 281, 1.8], [1007, 334, 1.5], [868, 279, 1.6], [758, 363, 1.4],
    [612, 259, 1.6], [566, 347, 1.8], [933, 399, 1.5], [1169, 399, 1.4],
  ],
  'site-neocity': [
    [697, 46, 1.7], [766, 105, 1.3], [823, 66, 1.6], [871, 144, 1.5],
    [942, 72, 1.6], [1005, 128, 1.8], [1069, 46, 1.5], [1169, 79, 2.0],
    [1230, 128, 1.5], [1321, 64, 1.5], [1060, 191, 1.3], [1274, 190, 1.5],
    [680, 209, 1.4], [755, 251, 1.3], [594, 83, 1.4], [521, 66, 1.3],
  ],
};

// Positions are starts of diagonal DOWN-RIGHT flights, safely above the horizon.
// Irregular periods and negative delays keep them from falling in unison.
const METEORS = {
  'site-orbit': [
    { x: 714, y: 125, duration: 16.7, delay: -10.2, travel: 126, length: 74 },
    { x: 1056, y: 130, duration: 21.6, delay: -3.5, travel: 156, length: 88 },
    { x: 423, y: 401, duration: 18.9, delay: -6.7, travel: 141, length: 71 },
    { x: 836, y: 283, duration: 24.3, delay: -16.1, travel: 169, length: 93 },
  ],
  'site-camp': [
    { x: 730, y: 101, duration: 18.7, delay: -9.1, travel: 145, length: 75 },
    { x: 1042, y: 162, duration: 23.1, delay: -4.0, travel: 142, length: 79 },
    { x: 632, y: 248, duration: 20.6, delay: -16.2, travel: 133, length: 66 },
  ],
  'site-neocity': [
    { x: 815, y: 119, duration: 22.3, delay: -13.2, travel: 125, length: 65 },
    { x: 1117, y: 57, duration: 19.7, delay: -4.7, travel: 133, length: 79 },
    { x: 648, y: 132, duration: 25.1, delay: -18.9, travel: 135, length: 66 },
  ],
};

function useWindowSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

function fitCover({ width, height }) {
  if (!width || !height) return { width: 0, height: 0, left: 0, top: 0 };
  if (width / height > IMAGE_RATIO) {
    const pictureHeight = width / IMAGE_RATIO;
    return { width, height: pictureHeight, left: 0, top: (height - pictureHeight) / 2 };
  }
  const pictureWidth = height * IMAGE_RATIO;
  return { width: pictureWidth, height, left: (width - pictureWidth) / 2, top: 0 };
}

function SkyEffects({ backgroundId }) {
  const stars = STARS[backgroundId] || [];
  const meteors = METEORS[backgroundId] || [];
  return (
    <g className="codumi-sky-animations">
      {stars.map(([x, y, size], index) => (
        <g key={`star-${index}`} transform={`translate(${x} ${y})`}>
          <g
            className="codumi-sky-star"
            style={{
              '--star-delay': `${-((index * 2.37) % 9).toFixed(2)}s`,
              '--star-duration': `${(3.8 + (index % 7) * 0.57).toFixed(2)}s`,
            }}
          >
            <path
              d={`M 0 ${-size * 3.2} L 0 ${size * 3.2} M ${-size * 3.2} 0 L ${size * 3.2} 0`}
              fill="none"
              stroke={index % 3 === 0 ? '#ffd3f9' : index % 3 === 1 ? '#bfc9ff' : '#c5e7ff'}
              strokeWidth={index % 5 === 0 ? 0.7 : 0.44}
              strokeLinecap="round"
            />
            <circle r={size * 0.67} fill={index % 3 === 0 ? '#fbd9ff' : '#d4deff'} />
          </g>
        </g>
      ))}
      {meteors.map(({ x, y, duration, delay, travel, length }, index) => (
        <g key={`meteor-${index}`} transform={`translate(${x} ${y})`}>
          <g
            className="codumi-sky-meteor"
            style={{
              '--meteor-travel-x': `${travel}px`,
              '--meteor-travel-y': `${(travel * 0.67).toFixed(1)}px`,
              '--meteor-duration': `${duration}s`,
              '--meteor-delay': `${delay}s`,
            }}
          >
            <line
              x1={-length}
              y1={-(length * 0.67)}
              x2="0"
              y2="0"
              stroke="url(#codumi-meteor-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle r="2.5" fill="#fff0ff" filter="url(#codumi-small-glow)" />
            <circle r="1.55" fill="#fff" />
          </g>
        </g>
      ))}
    </g>
  );
}

function OrbitEffects() {
  return (
    <g className="codumi-orbit-effects">
      {/* Follow the bright upper/left contour of the existing Earth in the photo.
          Nothing is drawn over the planet's surface. */}
      <path
        className="codumi-earth-halo"
        d="M 1017 786 C 983 706 984 602 1019 508 C 1066 379 1192 307 1323 294 C 1458 275 1594 344 1671 455"
        stroke="#71baff"
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
        filter="url(#codumi-wide-glow)"
      />
      <path
        className="codumi-earth-edge"
        d="M 1017 786 C 983 706 984 602 1019 508 C 1066 379 1192 307 1323 294 C 1458 275 1594 344 1671 455"
        stroke="url(#codumi-earth-rim)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

function CampEffects() {
  return (
    <g className="codumi-camp-effects">
      {/* Soft light only. The real campfire remains part of the original image. */}
      <ellipse className="codumi-camp-glow" cx="708" cy="703" rx="200" ry="125" fill="url(#codumi-fire-haze)" />
      {/* Actual moon center is around x=1415 y=196. */}
      <circle className="codumi-moon-glow" cx="1415" cy="198" r="135" fill="url(#codumi-moon-haze)" />
      {/* Thin mist directly over the lake, not across the mountains/trees. */}
      <g className="codumi-lake-mist">
        <ellipse cx="1131" cy="693" rx="298" ry="25" fill="url(#codumi-lake-haze)" />
        <ellipse cx="1147" cy="705" rx="239" ry="12" fill="url(#codumi-lake-haze)" opacity="0.65" />
      </g>
    </g>
  );
}

function CityEffects() {
  return (
    <g className="codumi-city-effects">
      {/* Original neon skyline stays untouched; the moon's existing edge receives
          only a gentle wash of light, not a second circle. */}
      <circle className="codumi-moon-glow codumi-city-moon" cx="1435" cy="154" r="125" fill="url(#codumi-moon-haze)" />
      {/* All traffic paths are in image pixel coordinates, on the FOREGROUND road.
          Unlike v7 the SVG always fills the actual 1672x941 image stage. */}
      <g className="codumi-city-traffic">
        <path className="codumi-traffic-track codumi-traffic-track--rose"
          d="M 3 805 C 171 794 309 776 451 750 C 608 739 711 705 838 654" />
        <path className="codumi-traffic-track codumi-traffic-track--blue"
          d="M -18 754 C 151 750 314 729 480 706 C 659 698 778 672 870 639" />
      </g>
    </g>
  );
}

function SkyOverlay({ backgroundId }) {
  return (
    <svg className="codumi-live-bg__art" viewBox="0 0 1672 941" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="codumi-meteor-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#a9a7ff" stopOpacity="0" />
          <stop offset="52%" stopColor="#d6b9ff" stopOpacity="0.48" />
          <stop offset="100%" stopColor="#fffaff" stopOpacity="0.98" />
        </linearGradient>
        <linearGradient id="codumi-earth-rim" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#80b7ff" stopOpacity="0" />
          <stop offset="24%" stopColor="#68aeff" stopOpacity="0.35" />
          <stop offset="58%" stopColor="#b2dfff" stopOpacity="0.59" />
          <stop offset="100%" stopColor="#7b9fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="codumi-moon-haze">
          <stop offset="0%" stopColor="#d9edff" stopOpacity="0" />
          <stop offset="36%" stopColor="#d1e7ff" stopOpacity="0" />
          <stop offset="48%" stopColor="#a9cbff" stopOpacity="0.14" />
          <stop offset="70%" stopColor="#9dc5ff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#9dc5ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="codumi-fire-haze">
          <stop offset="0%" stopColor="#ffbe65" stopOpacity="0.25" />
          <stop offset="32%" stopColor="#ffb24b" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#ffb24b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="codumi-lake-haze">
          <stop offset="0%" stopColor="#a8dfff" stopOpacity="0.17" />
          <stop offset="56%" stopColor="#badcff" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#c5ecff" stopOpacity="0" />
        </radialGradient>
        <filter id="codumi-wide-glow" x="-20%" y="-35%" width="150%" height="170%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="codumi-small-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="2.1" />
        </filter>
      </defs>
      {backgroundId === 'site-orbit' && <OrbitEffects />}
      {backgroundId === 'site-camp' && <CampEffects />}
      {backgroundId === 'site-neocity' && <CityEffects />}
      <SkyEffects backgroundId={backgroundId} />
    </svg>
  );
}

export default function SiteBackgroundEffects({ backgroundId, animated }) {
  const image = PICTURES[backgroundId];
  const windowSize = useWindowSize();
  const stage = useMemo(() => fitCover(windowSize), [windowSize.width, windowSize.height]);

  if (!image) return null;

  return (
    <div className="codumi-live-bg" aria-hidden="true">
      <div className="codumi-live-bg__stage" style={{
        width: `${stage.width}px`, height: `${stage.height}px`,
        left: `${stage.left}px`, top: `${stage.top}px`,
      }}>
        <img className="codumi-live-bg__image" src={image} alt="" draggable="false" />
        {animated && <SkyOverlay backgroundId={backgroundId} />}
      </div>
    </div>
  );
}
