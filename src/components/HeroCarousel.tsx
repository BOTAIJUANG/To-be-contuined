"use client";

import { useState, useEffect, useCallback } from "react";

// ── 型別 ──────────────────────────────────────────
interface CarouselSlide {
  src: string;
  alt: string;
  caption?: string;
}

interface HeroCarouselProps {
  slides: CarouselSlide[];
  autoplayMs?: number;
}

// ── 元件 ──────────────────────────────────────────
export default function HeroCarousel({
  slides,
  autoplayMs = 4000,
}: HeroCarouselProps) {
  const [current, setCurrent] = useState(0);

  const move = useCallback(
    (dir: number) => {
      setCurrent((prev) => (prev + dir + slides.length) % slides.length);
    },
    [slides.length],
  );

  // 自動播放
  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => move(1), autoplayMs);
    return () => clearInterval(timer);
  }, [move, autoplayMs, slides.length]);

  if (!slides.length) return null;

  return (
    <div
      style={{
        position: "relative",
        width: "85%",
        height: "480px",
        marginLeft: "auto",
        overflow: "hidden",
        boxShadow:
          "16px 24px 64px rgba(0,0,0,0.09), 4px 6px 20px rgba(0,0,0,0.05)",
      }}
      className="carousel-wrap"
    >
      <style>{`
        .carousel-wrap:hover .carousel-arrow { opacity: 1 !important; }
      `}</style>

      {/* ── Slides ── */}
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          transform: `translateX(-${current * 100}%)`,
          transition: "transform 0.9s cubic-bezier(0.6,0,0.2,1)",
          willChange: "transform",
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            style={{
              minWidth: "100%",
              width: "100%",
              height: "100%",
              position: "relative",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {/* 圖片 */}
            <img
              src={slide.src}
              alt={slide.alt}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                filter: "saturate(0.92)",
              }}
            />
            {/* 底部漸層遮罩 */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "120px",
                background:
                  "linear-gradient(to top, rgba(30,28,26,0.45), transparent)",
                pointerEvents: "none",
              }}
            />
            {/* 商品名標籤 */}
            {slide.caption && (
              <span
                style={{
                  position: "absolute",
                  bottom: "20px",
                  left: "20px",
                  zIndex: 2,
                  color: "#fff",
                  fontFamily: '"Noto Serif TC", serif',
                  fontWeight: 200,
                  fontSize: "14px",
                  letterSpacing: "0.25em",
                }}
              >
                {slide.caption}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── 左右箭頭 ── */}
      {slides.length > 1 && (
        <>
          <button
            className="carousel-arrow"
            onClick={() => move(-1)}
            style={{
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              left: "12px",
              background: "rgba(247,244,239,0.85)",
              border: "none",
              width: "36px",
              height: "36px",
              fontSize: "20px",
              color: "#1E1C1A",
              cursor: "pointer",
              zIndex: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.3s, background 0.2s",
              lineHeight: 1,
            }}
          >
            ‹
          </button>
          <button
            className="carousel-arrow"
            onClick={() => move(1)}
            style={{
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              right: "12px",
              background: "rgba(247,244,239,0.85)",
              border: "none",
              width: "36px",
              height: "36px",
              fontSize: "20px",
              color: "#1E1C1A",
              cursor: "pointer",
              zIndex: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.3s, background 0.2s",
              lineHeight: 1,
            }}
          >
            ›
          </button>
        </>
      )}

      {/* ── 小圓點 ── */}
      {slides.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: "14px",
            right: "16px",
            display: "flex",
            gap: "6px",
            zIndex: 3,
          }}
        >
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              style={{
                width: i === current ? "18px" : "6px",
                height: "6px",
                borderRadius: i === current ? "3px" : "50%",
                background: i === current ? "#fff" : "rgba(255,255,255,0.45)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.3s",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
