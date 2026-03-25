'use client';

// components/ProductCard.tsx  ──  商品卡片（responsive）

import Link from 'next/link';
import s from './ProductCard.module.css';

export interface ProductPromoTag {
  type: 'volume' | 'bundle' | 'gift';
  label: string;
}

export interface Product {
  id:          string;
  name:        string;
  category:    string;
  price:       number;
  imageUrl?:   string;
  slug:        string;
  isSoldOut?:  boolean;
  isPreorder?: boolean;
  promoTags?:  ProductPromoTag[];
}

export default function ProductCard({ product }: { product: Product }) {
  const badge = product.isSoldOut
    ? { text: '已完售', cls: s.badgeSoldOut }
    : product.isPreorder
    ? { text: '預購中', cls: s.badgePreorder }
    : null;

  return (
    <Link href={`/product/${product.slug}`} className={s.card}>
      <div className={s.wrapper}>
        {/* 圖片區塊 */}
        <div className={s.imageWrap}>
          <div className={s.imageRatio}>
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className={s.image} />
            ) : (
              <div className={s.placeholder}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05" /><path d="M12 22.08V12" />
                </svg>
              </div>
            )}
          </div>

          {badge && <div className={`${s.badge} ${badge.cls}`}>{badge.text}</div>}

          <div className={s.hoverOverlay}>
            <span className={s.viewLabel}>View</span>
          </div>
        </div>

        {/* 文字區塊 */}
        <div className={s.info}>
          <h3 className={s.name}>{product.name}</h3>
          <div className={s.price}>
            {`NT$ ${product.price.toLocaleString()}`}
            {product.isPreorder && <span className={s.preorderLabel}>預購商品</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
