'use client';

// ════════════════════════════════════════════════
// app/components/ShopSidebar.tsx  ──  商店左側分類欄
//
// 分類資料從父元件傳入（shop/page.tsx 或 shop/[slug]/page.tsx）
// activeSlug：目前所在的分類，會標示為粗體
// ════════════════════════════════════════════════

import { useState } from 'react';
import Link from 'next/link';

// ── 型別 ──────────────────────────────────────────
interface Category {
  id: number;
  name: string;
  slug: string;
}

interface ShopSidebarProps {
  categories: Category[];
  activeSlug?: string;  // 目前所在的分類 slug（分類頁才會傳）
}

export default function ShopSidebar({ categories, activeSlug }: ShopSidebarProps) {
  // 預設展開所有分類
  const [openSlugs, setOpenSlugs] = useState<string[]>(() =>
    categories.map((c) => c.slug)
  );

  const toggle = (slug: string) => {
    setOpenSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  return (
    <aside>
      {categories.map((cat) => {
        const isOpen   = openSlugs.includes(cat.slug);
        const isActive = cat.slug === activeSlug; // 目前所在分類

        return (
          <div
            key={cat.slug}
            style={{ borderBottom: '1px solid #E8E4DC', padding: '18px 0' }}
          >
            {/* 分類標題（點擊展開/收合）*/}
            <div
              onClick={() => toggle(cat.slug)}
              style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: '"Montserrat", sans-serif',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 600,  // 目前分類加粗
                letterSpacing: '0.28em', textTransform: 'uppercase',
                color: isActive ? '#1E1C1A' : '#555250',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <span>{cat.name}</span>
              <span style={{
                display: 'inline-block', transition: 'transform 0.3s',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}>⌄</span>
            </div>

            {/* 展開後顯示：查看全部 + 分類連結 */}
            {isOpen && (
              <div style={{ paddingTop: '14px', display: 'grid', gap: '10px' }}>
                {/* 查看全部該分類 */}
                <Link
                  href={`/shop/${cat.slug}`}
                  style={{
                    fontSize: '12px',
                    color: isActive ? '#1E1C1A' : '#888580',
                    fontWeight: isActive ? 500 : 300,
                    textDecoration: 'none', letterSpacing: '0.05em',
                  }}
                >
                  查看全部
                </Link>

                {/* 連回 SHOP ALL */}
                {isActive && (
                  <Link
                    href="/shop"
                    style={{
                      fontSize: '11px', color: '#888580',
                      textDecoration: 'none', letterSpacing: '0.1em',
                      fontFamily: '"Montserrat", sans-serif',
                    }}
                  >
                    ← 所有商品
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
