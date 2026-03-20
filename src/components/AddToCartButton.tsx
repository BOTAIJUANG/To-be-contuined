'use client';

// ════════════════════════════════════════════════
// components/AddToCartButton.tsx
//
// 支援：
// - 數量選擇器 + 即時金額顯示
// - 預購商品顯示出貨日
// - 混購衝突提示（不讓加入，顯示說明）
// ════════════════════════════════════════════════

import { useState } from 'react';
import { useCart } from '@/context/CartContext';

interface AddToCartButtonProps {
  product: {
    id:               string;
    name:             string;
    price:            number;
    imageUrl?:        string;
    slug:             string;
    isSoldOut?:       boolean;
    isPreorder?:      boolean;
    preorderShipDate?: string;   // 預計出貨日 YYYY-MM-DD
    preorderStatus?:  'upcoming' | 'active' | 'ended';  // 預購狀態
    preorderStartsAt?: string;
    preorderEndsAt?:   string;
  };
  variantId?:   number;
  variantName?: string;
}

export default function AddToCartButton({ product, variantId, variantName }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [qty,   setQty]   = useState(1);
  const [added, setAdded] = useState(false);

  const totalPrice = product.price * qty;
  const isPreorder = product.isPreorder ?? false;

  // 預購狀態判斷
  const today = new Date().toISOString().split('T')[0];
  const preorderStatus = (() => {
    if (!isPreorder) return null;
    if (product.preorderStartsAt && product.preorderStartsAt > today) return 'upcoming';
    if (product.preorderEndsAt   && product.preorderEndsAt   < today) return 'ended';
    if (product.preorderStatus) return product.preorderStatus;
    return 'active';
  })();

  const handleAdd = () => {
    if (product.isSoldOut) return;
    if (isPreorder && preorderStatus !== 'active') return;

    addItem({
      id:               product.id,
      slug:             product.slug,
      name:             product.name,
      price:            product.price,
      imageUrl:         product.imageUrl,
      isPreorder,
      preorderShipDate: product.preorderShipDate,
      variantId,
      variantName,
    }, qty);

    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  // 完售
  if (product.isSoldOut) {
    return (
      <div style={{ padding: '14px 44px', background: '#EDE9E2', textAlign: 'center', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#888580', fontFamily: '"Montserrat", sans-serif' }}>
        今日完售
      </div>
    );
  }

  // 預購未開始
  if (isPreorder && preorderStatus === 'upcoming') {
    return (
      <div>
        <div style={{ padding: '14px 20px', background: '#EDE9E2', border: '1px solid #E8E4DC', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: '#888580', marginBottom: '4px', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.2em', textTransform: 'uppercase' }}>即將開放預購</div>
          <div style={{ fontSize: '13px', color: '#1E1C1A' }}>預購將於 {product.preorderStartsAt} 開放，敬請期待</div>
        </div>
        <button disabled style={{ width: '100%', padding: '14px 44px', background: '#E8E4DC', color: '#888580', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', cursor: 'not-allowed' }}>
          尚未開放
        </button>
      </div>
    );
  }

  // 預購已結束
  if (isPreorder && preorderStatus === 'ended') {
    return (
      <div>
        <div style={{ padding: '14px 20px', background: '#fef0f0', border: '1px solid #f5c6c6', marginBottom: '8px' }}>
          <div style={{ fontSize: '13px', color: '#c0392b' }}>本次預購已結束</div>
        </div>
        <button disabled style={{ width: '100%', padding: '14px 44px', background: '#E8E4DC', color: '#888580', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', cursor: 'not-allowed' }}>
          預購已截止
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* 預購出貨日提示 */}
      {isPreorder && product.preorderShipDate && (
        <div style={{ padding: '10px 14px', background: '#e8f0fb', border: '1px solid #b5d4f4', marginBottom: '16px', fontSize: '12px', color: '#2a5a8c' }}>
          🗓 預購商品 — 預計出貨日：<strong>{product.preorderShipDate}</strong>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#4a7ab8' }}>若與一般商品一起購買，將依預購出貨日統一出貨</div>
        </div>
      )}

      {/* 數量選擇器 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '16px', border: '1px solid #E8E4DC', width: 'fit-content' }}>
        <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: '44px', height: '44px', background: 'transparent', border: 'none', fontSize: '18px', color: '#1E1C1A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <span style={{ width: '52px', textAlign: 'center', fontSize: '14px', fontWeight: 500, color: '#1E1C1A', fontFamily: '"Montserrat", sans-serif', borderLeft: '1px solid #E8E4DC', borderRight: '1px solid #E8E4DC', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{qty}</span>
        <button onClick={() => setQty(q => q + 1)} style={{ width: '44px', height: '44px', background: 'transparent', border: 'none', fontSize: '18px', color: '#1E1C1A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>

      {/* 即時金額 */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: '#888580', letterSpacing: '0.2em', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>
          {qty > 1 ? `${qty} 件合計` : '單件'}
        </span>
        <span style={{ fontFamily: '"Noto Serif TC", serif', fontSize: '22px', fontWeight: 200, color: '#b35252', letterSpacing: '0.05em' }}>
          NT$ {totalPrice.toLocaleString()}
        </span>
        {qty > 1 && <span style={{ fontSize: '11px', color: '#888580' }}>（單價 NT$ {product.price.toLocaleString()}）</span>}
      </div>

      {/* 加入購物車按鈕 */}
      <button onClick={handleAdd} style={{ width: '100%', padding: '14px 44px', background: added ? '#2ab85a' : '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.3s' }}>
        {added ? '✓ 已加入購物車' : isPreorder ? '預購下單' : '加入購物車'}
      </button>
    </div>
  );
}
