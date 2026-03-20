'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface Product {
  id:          string;
  name:        string;
  category:    string;
  price:       number;
  imageUrl?:   string;
  slug:        string;
  isSoldOut?:  boolean;
  isPreorder?: boolean;
}

export default function ProductCard({ product }: { product: Product }) {
  const [hovered, setHovered] = useState(false);

  // 左上角標籤
  const badge = product.isSoldOut
    ? { text: '已完售', bg: '#c0392b' }
    : product.isPreorder
    ? { text: '預購中', bg: '#b87a2a' }
    : null;

  return (
    <Link href={`/product/${product.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer', transform: hovered ? 'translateY(-6px)' : 'translateY(0)', transition: 'transform 0.7s cubic-bezier(0.6,0,0.2,1)' }}
      >
        {/* 圖片區塊 */}
        <div style={{ position: 'relative', overflow: 'hidden', boxShadow: hovered ? '0 14px 40px rgba(0,0,0,0.11)' : '0 4px 20px rgba(0,0,0,0.07)', transition: 'box-shadow 0.7s cubic-bezier(0.6,0,0.2,1)' }}>
          <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden' }}>
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: hovered ? 'scale(1.06)' : 'scale(1)', transition: 'transform 1.2s cubic-bezier(0.6,0,0.2,1)', filter: 'saturate(0.95)' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: '#EDE9E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', transform: hovered ? 'scale(1.06)' : 'scale(1)', transition: 'transform 1.2s cubic-bezier(0.6,0,0.2,1)' }}>🍰</div>
            )}
          </div>

          {/* 左上角標籤（已完售 / 預購中）*/}
          {badge && (
            <div style={{ position: 'absolute', top: '12px', left: '12px', background: badge.bg, color: '#fff', fontFamily: '"Noto Sans TC", sans-serif', fontSize: '12px', fontWeight: 700, letterSpacing: '0.15em', padding: '5px 12px', zIndex: 1 }}>
              {badge.text}
            </div>
          )}

          {/* hover 遮罩 */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hovered ? 1 : 0, background: 'rgba(247,244,239,0.55)', transition: 'opacity 0.5s' }}>
            <span style={{ background: '#F7F4EF', border: '1px solid rgba(0,0,0,0.14)', padding: '10px 22px', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#555250' }}>View</span>
          </div>
        </div>

        {/* 文字區塊 */}
        <div style={{ padding: '16px 0 0', textAlign: 'center' }}>
          <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 500, letterSpacing: '0.45em', color: '#888580', textTransform: 'uppercase', marginBottom: '8px' }}>{product.category}</div>
          <h3 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 400, fontSize: '13px', letterSpacing: '0.12em', color: '#1E1C1A', margin: '0 0 6px' }}>{product.name}</h3>
          <div style={{ fontFamily: '"Noto Serif TC", serif', fontWeight: 300, fontSize: '13px', letterSpacing: '0.1em', color: '#b35252' }}>
            {product.isPreorder ? '預購商品' : `NT$ ${product.price.toLocaleString()}`}
          </div>
        </div>
      </div>
    </Link>
  );
}
