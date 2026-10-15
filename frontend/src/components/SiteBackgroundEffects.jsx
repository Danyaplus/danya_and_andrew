import React from 'react';

const stars = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: `${(index * 37) % 100}%`,
  top: `${8 + (index * 23) % 70}%`,
  size: `${2 + (index % 3)}px`,
  delay: `${(index % 6) * 0.6}s`,
  duration: `${4.5 + (index % 5) * 0.7}s`,
}));
const sparks = Array.from({ length: 14 }, (_, index) => ({
  id: index,
  left: `${44 + (index % 5) * 2}%`,
  delay: `${(index % 7) * 0.55}s`,
  duration: `${2.8 + (index % 4) * 0.35}s`,
}));
const windows = Array.from({ length: 16 }, (_, index) => ({
  id: index,
  left: `${12 + (index % 8) * 9}%`,
  top: `${28 + Math.floor(index / 8) * 18}%`,
  delay: `${(index % 6) * 0.4}s`,
}));

export default function SiteBackgroundEffects({ backgroundId, animated }) {
  if (!animated) return null;
  if (!['site-orbit', 'site-camp', 'site-neocity'].includes(backgroundId)) return null;

  return (
    <div className={`codumi-site-effects codumi-site-effects--${backgroundId}`} aria-hidden="true">
      {backgroundId === 'site-orbit' && (
        <>
          <div className="codumi-site-effects__orb codumi-site-effects__orb--earth" />
          <div className="codumi-site-effects__orb codumi-site-effects__orb--moon" />
          <div className="codumi-site-effects__planet-ring" />
          {stars.map((star) => (
            <span
              key={star.id}
              className="codumi-site-effects__star"
              style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay, animationDuration: star.duration }}
            />
          ))}
          <span className="codumi-site-effects__meteor codumi-site-effects__meteor--one" />
          <span className="codumi-site-effects__meteor codumi-site-effects__meteor--two" />
          <span className="codumi-site-effects__debris codumi-site-effects__debris--one" />
          <span className="codumi-site-effects__debris codumi-site-effects__debris--two" />
        </>
      )}
      {backgroundId === 'site-camp' && (
        <>
          <div className="codumi-site-effects__moon" />
          <div className="codumi-site-effects__forest-hill codumi-site-effects__forest-hill--back" />
          <div className="codumi-site-effects__forest-hill codumi-site-effects__forest-hill--front" />
          <div className="codumi-site-effects__tent" />
          <div className="codumi-site-effects__campfire" />
          <div className="codumi-site-effects__ember-glow" />
          {stars.slice(0, 12).map((star) => (
            <span
              key={`camp-${star.id}`}
              className="codumi-site-effects__star codumi-site-effects__star--camp"
              style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay, animationDuration: star.duration }}
            />
          ))}
          <span className="codumi-site-effects__meteor codumi-site-effects__meteor--camp" />
          {sparks.map((spark) => (
            <span
              key={spark.id}
              className="codumi-site-effects__spark"
              style={{ left: spark.left, animationDelay: spark.delay, animationDuration: spark.duration }}
            />
          ))}
        </>
      )}
      {backgroundId === 'site-neocity' && (
        <>
          <div className="codumi-site-effects__city-glow" />
          <div className="codumi-site-effects__city-skyline" />
          {windows.map((windowDot) => (
            <span
              key={windowDot.id}
              className="codumi-site-effects__window"
              style={{ left: windowDot.left, top: windowDot.top, animationDelay: windowDot.delay }}
            />
          ))}
          <span className="codumi-site-effects__beam" />
          <span className="codumi-site-effects__car-light codumi-site-effects__car-light--one" />
          <span className="codumi-site-effects__car-light codumi-site-effects__car-light--two" />
          <span className="codumi-site-effects__float-orb codumi-site-effects__float-orb--one" />
          <span className="codumi-site-effects__float-orb codumi-site-effects__float-orb--two" />
        </>
      )}
    </div>
  );
}
