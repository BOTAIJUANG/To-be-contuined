'use client';

// components/HeroCarousel.tsx  ──  首頁輪播（responsive）

import { useState, useEffect, useCallback } from 'react';
import s from './HeroCarousel.module.css';

interface CarouselSlide {
  src: string;
  alt: string;
  caption?: string;
}

interface HeroCarouselProps {
  slides: CarouselSlide[];
  autoplayMs?: number;
}

export default function HeroCarousel({ slides, autoplayMs = 4000 }: HeroCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [loaded,  setLoaded]  = useState(false);

  const move = useCallback((dir: number) => {
    setCurrent(prev => (prev + dir + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => move(1), autoplayMs);
    return () => clearInterval(timer);
  }, [move, autoplayMs, slides.length]);

  if (!slides.length) return null;

  return (
    <div className={s.wrap}>
      {/* Loading */}
      {!loaded && (
        <div className={s.loading}>
          <div className={s.loadingText}>正在為你載入一點甜</div>
          <div className={s.loadingDots}>
            <div className={s.loadingDot} />
            <div className={s.loadingDot} />
            <div className={s.loadingDot} />
          </div>
          <div className={s.loadingBar}>
            <div className={s.loadingBarInner} />
          </div>
        </div>
      )}

      {/* Slides */}
      <div className={s.slidesLayer} style={{ opacity: loaded ? 1 : 0 }}>
        <div className={s.slidesTrack} style={{ transform: `translateX(-${current * 100}%)` }}>
          {slides.map((slide, i) => (
            <div key={i} className={s.slide}>
              <img
                src={slide.src}
                alt={slide.alt}
                className={s.slideImg}
                onLoad={() => { if (i === 0) setLoaded(true); }}
                onError={() => { if (i === 0) setLoaded(true); }}
                ref={el => { if (el && i === 0 && el.complete) setLoaded(true); }}
              />
              <div className={s.slideGradient} />
              {slide.caption && <span className={s.slideCaption}>{slide.caption}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 箭頭 */}
      {slides.length > 1 && (
        <>
          <button className={`${s.arrow} ${s.arrowLeft}`} onClick={() => move(-1)}>‹</button>
          <button className={`${s.arrow} ${s.arrowRight}`} onClick={() => move(1)}>›</button>
        </>
      )}

      {/* 小圓點 */}
      {slides.length > 1 && (
        <div className={s.dots}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`${s.dot} ${i === current ? s.dotActive : s.dotInactive}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
