"use client";

// app/about/page.tsx  ──  品牌故事（串接 store_settings）

import { useSettings } from "@/lib/useSettings";
import Footer from "@/components/Footer";

export default function AboutPage() {
  const { settings } = useSettings();

  return (
    <>
      <div
        style={{
          width: "min(calc(100% - 60px), 1100px)",
          margin: "auto",
          padding: "72px 0",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "80px",
            alignItems: "center",
          }}
        >
          {/* 左側圖片 */}
          <div
            style={{
              aspectRatio: "1/1",
              maxWidth: "420px",
              width: "100%",
              background: "#EDE9E2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {settings.about_image_url ? (
              <img
                src={(settings as any).about_image_url}
                alt="品牌故事"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div style={{ textAlign: "center", color: "#888580" }}>
                <div style={{ fontSize: "52px", marginBottom: "12px" }}>☕</div>
                <div
                  style={{
                    fontSize: "12px",
                    letterSpacing: "0.2em",
                    fontFamily: '"Montserrat", sans-serif',
                  }}
                >
                  BRAND STORY
                </div>
              </div>
            )}
          </div>

          {/* 右側文字 */}
          <div>
            <h2
              style={{
                fontFamily: '"Noto Sans TC", sans-serif',
                fontWeight: 700,
                fontSize: "19px",
                letterSpacing: "0.28em",
                color: "#1E1C1A",
                margin: "0 0 24px",
              }}
            >
              {settings.about_title}
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "#555250",
                lineHeight: 2.4,
                fontWeight: 300,
                whiteSpace: "pre-line",
              }}
            >
              {settings.about_body}
            </p>
          </div>
        </div>
      </div>
      <Footer
        tel={settings.phone}
        email={settings.email}
        address={settings.address}
      />
    </>
  );
}
