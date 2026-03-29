'use client';

// components/AddToCartButton.tsx  ──  加入購物車（responsive）

import { useMemo, useState } from 'react';
import { useCart } from '@/context/CartContext';
import s from './AddToCartButton.module.css';

interface Batch { id: number; name: string; ship_date: string; ends_at?: string; limit_qty: number; remaining?: number; }
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
  const { addItem, items } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(product.preorderBatches?.[0] ?? null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
    product.variants?.find(v => v.stock === null || v.stock === undefined || v.stock > 0) ?? product.variants?.[0] ?? null
  );

  const hasVariants  = (product.variants?.length ?? 0) > 0;
  const displayPrice = hasVariants ? (selectedVariant?.price ?? product.price) : product.price;
  const totalPrice   = displayPrice * qty;
  const variantSoldOut = hasVariants && selectedVariant?.stock !== null && selectedVariant?.stock !== undefined && selectedVariant.stock <= 0;
  const isPreorder   = product.isPreorder ?? false;
  const batches      = product.preorderBatches ?? [];

  // 計算這個商品/規格在購物車裡已經有幾件（預購還要比對批次）
  const cartQtyForBatch = useMemo(() => {
    if (!isPreorder || !selectedBatch) return 0;
    return items
      .filter(i => {
        if (!i.isPreorder || i.preorderBatchId !== selectedBatch.id) return false;
        const pid = i.productRealId ?? parseInt(i.id);
        return pid === parseInt(product.id);
      })
      .reduce((sum, i) => sum + i.qty, 0);
  }, [items, selectedBatch, isPreorder, product.id]);

  const currentKey = hasVariants
    ? `${product.id}_${selectedVariant?.id ?? ''}`
    : product.id;

  const cartQty = useMemo(() => {
    return items
      .filter(i => {
        const iKey = i.variantId ? `${i.id}_${i.variantId}` : i.id;
        return iKey === currentKey;
      })
      .reduce((sum, i) => sum + i.qty, 0);
  }, [items, currentKey]);

  // 實際庫存或批次剩餘
  const realStock = isPreorder
    ? (selectedBatch?.remaining ?? null)
    : hasVariants
      ? (selectedVariant?.stock ?? null)
      : (product.stock ?? null);

  // 預購：扣掉購物車裡同批次已有的數量；一般：扣掉購物車已有的數量
  const cartQtyForLimit = isPreorder ? cartQtyForBatch : cartQty;
  const remainingStock = realStock == null ? null : Math.max(0, realStock - cartQtyForLimit);
  const maxSelectableQty = remainingStock == null ? Infinity : remainingStock;

  // 批次額滿
  const batchFull = isPreorder && selectedBatch?.remaining != null && selectedBatch.remaining <= 0;

  const handleAdd = () => {
    if (product.isSoldOut) return;
    if (isPreorder && !selectedBatch) return;
    if (hasVariants && !selectedVariant) return;
    if (maxSelectableQty <= 0) return;

    const result = addItem({
      id: product.id, slug: product.slug, name: product.name,
      price: displayPrice, imageUrl: product.imageUrl,
      isPreorder, preorderShipDate: selectedBatch?.ship_date ?? product.preorderShipDate,
      preorderBatchId: selectedBatch?.id,
      variantId: hasVariants ? selectedVariant?.id : variantId,
      variantName: hasVariants ? selectedVariant?.name : variantName,
    }, qty, realStock != null ? realStock : undefined);

    if (!result.ok) {
      if ('redeemLimit' in result) {
        alert('購物車已有兌換品，每筆訂單僅限兌換一項。');
      } else {
        alert(`此批次目前最多只能購買 ${result.maxStock} 件（購物車已有 ${cartQtyForLimit} 件）`);
      }
      return;
    }

    setAdded(true);
    setQty(1);
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
                  onClick={() => { if (!outOfStock) { setSelectedVariant(v); setQty(1); } }}
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
              const isFull = batch.remaining != null && batch.remaining <= 0;
              return (
                <div
                  key={batch.id}
                  className={`${s.batchItem} ${sel ? s.selected : ''} ${isFull ? s.variantSoldOut : ''}`}
                  onClick={() => { if (!isFull) { setSelectedBatch(batch); setQty(1); } }}
                  style={isFull ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className={`${s.batchRadio} ${sel ? s.selected : ''}`}>
                      {sel && <div className={s.batchDot} />}
                    </div>
                    <div>
                      <div className={s.batchDate}>
                        {batch.ship_date}
                        {isFull && <span style={{ color: '#c0392b', marginLeft: 8, fontSize: '0.85em' }}>已額滿</span>}
                      </div>
                      <div className={s.batchMeta}>
                        {batch.name}{batch.ends_at ? ` · 截止 ${batch.ends_at}` : ''}
                        {!isFull && batch.remaining != null && (
                          <span style={{ marginLeft: 8, color: '#888' }}>剩餘 {batch.remaining} 份</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {selectedBatch && !batchFull && (
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
        <button
          className={s.qtyBtn}
          onClick={() => setQty(q => Math.min(q + 1, maxSelectableQty))}
          disabled={qty >= maxSelectableQty || maxSelectableQty <= 0}
        >+</button>
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
          disabled={(isPreorder && !selectedBatch) || (hasVariants && !selectedVariant) || variantSoldOut || batchFull || maxSelectableQty <= 0}
        >
          {batchFull ? '此批次已額滿' : maxSelectableQty <= 0 ? '已達可購上限' : added ? '已加入購物車' : isPreorder ? '預購下單' : '加入購物車'}
        </button>
      </div>
    </div>
  );
}
