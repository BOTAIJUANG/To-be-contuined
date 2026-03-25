"use client";

// app/about/page.tsx  ──  品牌故事（串接 store_settings）

import { useSettings } from "@/lib/useSettings";
import Footer from "@/components/Footer";
import s from "./about.module.css";

export default function AboutPage() {
  const { settings } = useSettings();

  return (
    <>
      <div className={s.container}>
        <div className={s.grid}>
          {/* 左側圖片 */}
          <div className={s.imageBox}>
            {settings.about_image_url ? (
              <img
                src={(settings as any).about_image_url}
                alt="品牌故事"
                className={s.image}
              />
            ) : (
              <div className={s.placeholder}>
                <div className={s.placeholderIcon}>☕</div>
                <div className={s.placeholderLabel}>BRAND STORY</div>
              </div>
            )}
          </div>

          {/* 右側文字 */}
          <div>
            <h2 className={s.title}>{settings.about_title}</h2>
            <p className={s.body}>{settings.about_body}</p>
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
