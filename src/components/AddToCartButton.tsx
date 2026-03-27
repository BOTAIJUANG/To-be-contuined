'use client';

// components/AddToCartButton.tsx  ──  加入購物車（responsive）

import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import s from './AddToCartButton.module.css';

interface Batch { id: number; name: string; ship_date: string; ends_at?: string; limit_qty: number; }
interface Variant { id: number; name: string; price: number; stock?: number | null; }

interface AddToCartButtonProps {
  product: {
    id: string; name: string; price: number; imageUrl?: string; slug: string;
    isSoldOut?: boolean; isPreorder?: boolean;
    preorderBatches?: Batch[]; preorderShipDate?: string; preorderStatus?: string;
    variantLabel?: string; variants?: Variant[];
    stock?: number | null;  // 無規格商品的可售庫存
  };
  variantId?: number;
  variantName?: string;
}

export default function AddToCartButton({ product, variantId, variantName }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(product.preorderBatches?.[0] ?? null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
    // 預設選第一個有庫存的規格
    product.variants?.find(v => v.stock === null || v.stock === undefined || v.stock > 0) ?? product.variants?.[0] ?? null
  );

  const hasVariants  = (product.variants?.length ?? 0) > 0;
  const displayPrice = hasVariants ? (selectedVariant?.price ?? product.price) : product.price;
  const totalPrice   = displayPrice * qty;
  const variantSoldOut = hasVariants && selectedVariant?.stock !== null && selectedVariant?.stock !== undefined && selectedVariant.stock <= 0;
  const isPreorder   = product.isPreorder ?? false;
  const batches      = product.preorderBatches ?? [];

  const handleAdd = () => {
    if (product.isSoldOut) return;
    if (isPreorder && !selectedBatch) return;
    if (hasVariants && !selectedVariant) return;

    addItem({
      id: product.id, slug: product.slug, name: product.name,
      price: displayPrice, imageUrl: product.imageUrl,
      isPreorder, preorderShipDate: selectedBatch?.ship_date ?? product.preorderShipDate,
      variantId: hasVariants ? selectedVariant?.id : variantId,
      variantName: hasVariants ? selectedVariant?.name : variantName,
    }, qty);

    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (product.isSoldOut) {
    return <div className={s.soldOut}>今日完售</div>;
  }

  if (isPreorder && batches.length === 0) {
    return (
      <div>
        <div className={s.noBatch}>目前暫無開放預購批次</div>
        <button disabled className={s.disabledBtn}>暫停接單</button>
      </div>
    );
  }

  return (
    <div>
      {/* 規格選擇 */}
      {hasVariants && (
        <div className={s.variantWrap}>
          <div className={s.sectionLabel}>{product.variantLabel ?? '規格'}</div>
          <div className={s.variantList}>
            {product.variants!.map(v => {
              const outOfStock = v.stock !== null && v.stock !== undefined && v.stock <= 0;
              return (
                <button
                  key={v.id}
                  className={`${s.variantBtn} ${selectedVariant?.id === v.id ? s.selected : ''} ${outOfStock ? s.variantSoldOut : ''}`}
                  onClick={() => !outOfStock && setSelectedVariant(v)}
                  disabled={outOfStock}
                >
                  {v.name}{outOfStock ? '（售完）' : ''}
                  {!outOfStock && v.price !== product.price && (
                    <span className={s.variantPrice}>NT$ {v.price.toLocaleString()}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 預購批次選擇 */}
      {isPreorder && batches.length > 0 && (
        <div className={s.batchWrap}>
          <div className={s.sectionLabel}>選擇出貨日期</div>
          <div className={s.batchList}>
            {batches.map(batch => {
              const sel = selectedBatch?.id === batch.id;
              return (
                <div key={batch.id} className={`${s.batchItem} ${sel ? s.selected : ''}`} onClick={() => setSelectedBatch(batch)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className={`${s.batchRadio} ${sel ? s.selected : ''}`}>
                      {sel && <div className={s.batchDot} />}
                    </div>
                    <div>
                      <div className={s.batchDate}>{batch.ship_date}</div>
                      <div className={s.batchMeta}>{batch.name}{batch.ends_at ? ` · 截止 ${batch.ends_at}` : ''}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {selectedBatch && (
            <div className={s.batchInfo}>
              選擇出貨日：<strong>{selectedBatch.ship_date}</strong>，若與一般商品一起購買將統一出貨
            </div>
          )}
        </div>
      )}

      {/* 數量選擇器 */}
      <div className={s.qtyWrap}>
        <button className={s.qtyBtn} onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
        <span className={s.qtyValue}>{qty}</span>
        <button className={s.qtyBtn} onClick={() => {
          const maxStock = hasVariants
            ? (selectedVariant?.stock != null ? selectedVariant.stock : Infinity)
            : (product.stock != null ? product.stock : Infinity);
          setQty(q => Math.min(q + 1, maxStock));
        }}>+</button>
      </div>

      {/* 即時金額 */}
      <div className={s.priceRow}>
        <span className={s.priceLabel}>{qty > 1 ? `${qty} 件合計` : '單件'}</span>
        <span className={s.priceTotal}>NT$ {totalPrice.toLocaleString()}</span>
        {qty > 1 && <span className={s.priceUnit}>（單價 NT$ {displayPrice.toLocaleString()}）</span>}
      </div>

      {/* 加入購物車 */}
      <div className={s.stickyBottom}>
        <button
          className={`${s.addBtn} ${added ? s.added : ''}`}
          onClick={handleAdd}
          disabled={(isPreorder && !selectedBatch) || (hasVariants && !selectedVariant) || variantSoldOut}
        >
          {added ? '已加入購物車' : isPreorder ? '預購下單' : '加入購物車'}
        </button>
      </div>
    </div>
  );
}
