'use client';

// components/AddToCartButton.tsx

import { useState } from 'react';
import { useCart } from '@/context/CartContext';

interface Batch {
  id:        number;
  name:      string;
  ship_date: string;
  ends_at?:  string;
  limit_qty: number;
}

interface Variant {
  id:    number;
  name:  string;
  price: number;
}

interface AddToCartButtonProps {
  product: {
    id:               string;
    name:             string;
    price:            number;
    imageUrl?:        string;
    slug:             string;
    isSoldOut?:       boolean;
    isPreorder?:      boolean;
    preorderBatches?: Batch[];
    preorderShipDate?: string;
    preorderStatus?:  string;
    variantLabel?:    string;
    variants?:        Variant[];
  };
  variantId?:   number;
  variantName?: string;
}

export default function AddToCartButton({ product, variantId, variantName }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [qty,            setQty]            = useState(1);
  const [added,          setAdded]          = useState(false);
  const [selectedBatch,  setSelectedBatch]  = useState<Batch | null>(
    product.preorderBatches?.[0] ?? null
  );
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
    product.variants?.[0] ?? null
  );

  const hasVariants = (product.variants?.length ?? 0) > 0;
  const displayPrice = hasVariants ? (selectedVariant?.price ?? product.price) : product.price;
  const totalPrice   = displayPrice * qty;
  const isPreorder   = product.isPreorder ?? false;
  const batches      = product.preorderBatches ?? [];

  const handleAdd = () => {
    if (product.isSoldOut) return;
    if (isPreorder && !selectedBatch) return;
    if (hasVariants && !selectedVariant) return;

    addItem({
      id:               product.id,
      slug:             product.slug,
      name:             product.name,
      price:            displayPrice,
      imageUrl:         product.imageUrl,
      isPreorder,
      preorderShipDate: selectedBatch?.ship_date ?? product.preorderShipDate,
      variantId:        hasVariants ? selectedVariant?.id : variantId,
      variantName:      hasVariants ? selectedVariant?.name : variantName,
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

  // 預購但無開放批次
  if (isPreorder && batches.length === 0) {
    return (
      <div>
        <div style={{ padding: '14px 20px', background: '#fef0f0', border: '1px solid #f5c6c6', marginBottom: '8px' }}>
          <div style={{ fontSize: '13px', color: '#c0392b' }}>目前暫無開放預購批次</div>
        </div>
        <button disabled style={{ width: '100%', padding: '14px 44px', background: '#E8E4DC', color: '#888580', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', cursor: 'not-allowed' }}>
          暫停接單
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* 規格選擇 */}
      {hasVariants && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.3em', color: '#888580', textTransform: 'uppercase', marginBottom: '10px' }}>
            {product.variantLabel ?? '規格'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {product.variants!.map(v => {
              const isSelected = selectedVariant?.id === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariant(v)}
                  style={{
                    padding: '8px 20px',
                    border: `1.5px solid ${isSelected ? '#1E1C1A' : '#E8E4DC'}`,
                    background: isSelected ? '#1E1C1A' : 'transparent',
                    color: isSelected ? '#F7F4EF' : '#555250',
                    fontSize: '13px', cursor: 'pointer',
                    fontFamily: '"Noto Sans TC", sans-serif',
                    transition: 'all 0.2s',
                  }}
                >
                  {v.name}
                  {v.price !== product.price && (
                    <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.7 }}>
                      NT$ {v.price.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 預購批次選擇 */}
      {isPreorder && batches.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.3em', color: '#888580', textTransform: 'uppercase', marginBottom: '10px' }}>
            選擇出貨日期
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {batches.map(batch => {
              const isSelected = selectedBatch?.id === batch.id;
              return (
                <div
                  key={batch.id}
                  onClick={() => setSelectedBatch(batch)}
                  style={{
                    padding: '12px 16px',
                    border: `1.5px solid ${isSelected ? '#1E1C1A' : '#E8E4DC'}`,
                    background: isSelected ? '#F7F4EF' : '#fff',
                    cursor: 'pointer', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${isSelected ? '#1E1C1A' : '#E8E4DC'}`, background: isSelected ? '#1E1C1A' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isSelected && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E1C1A' }}>{batch.ship_date}</div>
                      <div style={{ fontSize: '11px', color: '#888580' }}>
                        {batch.name}{batch.ends_at ? ` · 截止 ${batch.ends_at}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {selectedBatch && (
            <div style={{ marginTop: '8px', padding: '8px 12px', background: '#e8f0fb', fontSize: '11px', color: '#2a5a8c' }}>
              🗓 選擇出貨日：<strong>{selectedBatch.ship_date}</strong>，若與一般商品一起購買將統一出貨
            </div>
          )}
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
        {qty > 1 && <span style={{ fontSize: '11px', color: '#888580' }}>（單價 NT$ {displayPrice.toLocaleString()}）</span>}
      </div>

      {/* 加入購物車按鈕 */}
      <button
        onClick={handleAdd}
        disabled={(isPreorder && !selectedBatch) || (hasVariants && !selectedVariant)}
        style={{ width: '100%', padding: '14px 44px', background: added ? '#2ab85a' : '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.3s', opacity: ((isPreorder && !selectedBatch) || (hasVariants && !selectedVariant)) ? 0.5 : 1 }}
      >
        {added ? '✓ 已加入購物車' : isPreorder ? '預購下單' : '加入購物車'}
      </button>
    </div>
  );
}
