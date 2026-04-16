'use client';

// components/AddToCartButton.tsx  ──  加入購物車（responsive）

import { useMemo, useState } from 'react';
import { useCart } from '@/context/CartContext';
import s from './AddToCartButton.module.css';

interface Batch { id: number; name: string; ship_date: string; ends_at?: string; limit_qty: number; remaining?: number; }
interface ShipDate { id: number; ship_date: string; capacity: number; remaining: number; }
interface Variant { id: number; name: string; price: number; stock?: number | null; }

interface AddToCartButtonProps {
  product: {
    id: string; name: string; price: number; imageUrl?: string; slug: string;
    isSoldOut?: boolean; isPreorder?: boolean;
    isDateMode?: boolean; shipDates?: ShipDate[];
    preorderBatches?: Batch[]; preorderShipDate?: string; preorderStatus?: string;
    variantLabel?: string; variants?: Variant[];
    stock?: number | null;  // 無規格商品的可售庫存
  };
  variantId?: number;
  variantName?: string;
}

export default function AddToCartButton({ product, variantId, variantName }: AddToCartButtonProps) {
  const { addItem, items, showToast, triggerBounce } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(product.preorderBatches?.[0] ?? null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
    product.variants?.find(v => v.stock === null || v.stock === undefined || v.stock > 0) ?? product.variants?.[0] ?? null
  );

  const isDateMode   = product.isDateMode ?? false;
  const dateList     = product.shipDates ?? [];
  const [selectedDate, setSelectedDate] = useState<ShipDate | null>(dateList[0] ?? null);
  const [showAllDates, setShowAllDates] = useState(false);

  const hasVariants  = (product.variants?.length ?? 0) > 0;
  const displayPrice = hasVariants ? (selectedVariant?.price ?? product.price) : product.price;
  const totalPrice   = displayPrice * qty;
  const variantSoldOut = hasVariants && selectedVariant?.stock !== null && selectedVariant?.stock !== undefined && selectedVariant.stock <= 0;
  const isPreorder   = product.isPreorder ?? false;
  const batches      = product.preorderBatches ?? [];

  // 每個預購批次扣除購物車後的實際剩餘量（用於顯示與判斷是否額滿）
  const batchDisplayRemaining = useMemo(() => {
    if (!isPreorder) return {} as Record<number, number | undefined>;
    const result: Record<number, number | undefined> = {};
    const pid = parseInt(product.id);
    for (const batch of batches) {
      if (batch.remaining == null) { result[batch.id] = undefined; continue; }
      const inCart = items
        .filter(i => {
          if (!i.isPreorder || i.preorderBatchId !== batch.id) return false;
          return (i.productRealId ?? parseInt(i.id)) === pid;
        })
        .reduce((sum, i) => sum + i.qty, 0);
      result[batch.id] = Math.max(0, batch.remaining - inCart);
    }
    return result;
  }, [isPreorder, batches, items, product.id]);

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

  // 日期模式：計算購物車中同商品同日期的已有數量
  const cartQtyForDate = useMemo(() => {
    if (!isDateMode || !selectedDate) return 0;
    return items
      .filter(i => {
        const pid = i.productRealId ?? parseInt(i.id);
        return pid === parseInt(product.id) && (i as any).shipDateId === selectedDate.id;
      })
      .reduce((sum, i) => sum + i.qty, 0);
  }, [items, selectedDate, isDateMode, product.id]);

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

  // 實際庫存或批次/日期剩餘
  const realStock = isPreorder
    ? (selectedBatch?.remaining ?? null)
    : isDateMode
      ? (selectedDate?.remaining ?? null)
      : hasVariants
        ? (selectedVariant?.stock ?? null)
        : (product.stock ?? null);

  // 預購：扣掉購物車裡同批次已有的數量；日期模式：扣同日期；一般：扣購物車已有
  const cartQtyForLimit = isPreorder ? cartQtyForBatch : isDateMode ? cartQtyForDate : cartQty;
  const remainingStock = realStock == null ? null : Math.max(0, realStock - cartQtyForLimit);
  const maxSelectableQty = remainingStock == null ? Infinity : remainingStock;

  // 批次額滿（以購物車調整後的剩餘量判斷）
  const batchFull = isPreorder && selectedBatch != null &&
    batchDisplayRemaining[selectedBatch.id] != null && batchDisplayRemaining[selectedBatch.id]! <= 0;
  // 所有批次皆已售完（以伺服器剩餘量判斷，非購物車）
  const allBatchesFull = isPreorder && batches.length > 0 &&
    batches.every(b => b.remaining != null && b.remaining <= 0);
  // 日期額滿
  const dateFull = isDateMode && selectedDate?.remaining != null && selectedDate.remaining <= 0;

  const handleAdd = () => {
    if (product.isSoldOut) return;
    if (isPreorder && !selectedBatch) return;
    if (isDateMode && !selectedDate) return;
    if (hasVariants && !selectedVariant) return;
    if (maxSelectableQty <= 0) return;

    // 確保 qty 不超過當前可購量（防止批次剩餘量在設定 qty 後又被更新）
    const actualQty = isFinite(maxSelectableQty) ? Math.min(qty, maxSelectableQty) : qty;
    if (actualQty <= 0) return;

    // 預購：maxStock 扣除同批次其他規格的購物車數量，避免合計超過批次上限
    const otherBatchQty = isPreorder ? Math.max(0, cartQtyForBatch - cartQty) : 0;
    const effectiveMaxStock = realStock != null ? realStock - otherBatchQty : undefined;

    const result = addItem({
      id: product.id, slug: product.slug, name: product.name,
      price: displayPrice, imageUrl: product.imageUrl,
      isPreorder, preorderShipDate: selectedBatch?.ship_date ?? product.preorderShipDate,
      preorderBatchId: selectedBatch?.id,
      shipDateId: isDateMode ? selectedDate?.id : undefined,
      shipDate: isDateMode ? selectedDate?.ship_date : undefined,
      variantId: hasVariants ? selectedVariant?.id : variantId,
      variantName: hasVariants ? selectedVariant?.name : variantName,
    }, actualQty, effectiveMaxStock);

    if (!result.ok) {
      if ('redeemLimit' in result) {
        alert('購物車已有兌換品，每筆訂單僅限兌換一項。');
      } else {
        alert(`目前最多只能購買 ${result.maxStock} 件（購物車已有 ${cartQtyForLimit} 件）`);
      }
      return;
    }

    showToast(`已加入購物車：${product.name} × ${actualQty}`);
    triggerBounce();
    setAdded(true);
    setQty(1);
    setTimeout(() => setAdded(false), 1800);
  };

  if (product.isSoldOut) {
    return <div className={s.soldOut}>今日完售</div>;
  }

  if (isPreorder && (batches.length === 0 || allBatchesFull)) {
    return (
      <div>
        <div className={s.noBatch}>{batches.length === 0 ? '目前暫無開放預購批次' : '預購批次已全數額滿'}</div>
        <button disabled className={s.disabledBtn}>暫停接單</button>
      </div>
    );
  }

  if (isDateMode && dateList.length === 0) {
    return (
      <div>
        <div className={s.noBatch}>目前暫無開放出貨日期</div>
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
              // 以購物車調整後的剩餘量判斷是否額滿，確保顯示與可購量一致
              const displayRem = batchDisplayRemaining[batch.id];
              const isFull = displayRem != null && displayRem <= 0;
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
                        {!isFull && displayRem != null && (
                          <span style={{ marginLeft: 8, color: '#888' }}>剩餘 {displayRem} 份</span>
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

      {/* 日期模式選擇（方案1+3：近期 + 展開分週） */}
      {isDateMode && dateList.length > 0 && (() => {
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        const fmtDate = (d: string) => {
          const dt = new Date(d + 'T12:00:00');
          return `${dt.getMonth() + 1}/${dt.getDate()}（${dayNames[dt.getDay()]}）`;
        };

        // 分週邏輯：根據 ISO 週分組
        const getWeekKey = (d: string) => {
          const dt = new Date(d + 'T12:00:00');
          const jan1 = new Date(dt.getFullYear(), 0, 1);
          const dayOfYear = Math.floor((dt.getTime() - jan1.getTime()) / 86400000) + 1;
          return `${dt.getFullYear()}-W${Math.ceil((dayOfYear + jan1.getDay()) / 7)}`;
        };

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const thisWeekKey = getWeekKey(todayStr);
        const nextWeekDate = new Date(now);
        nextWeekDate.setDate(nextWeekDate.getDate() + 7);
        const nextWeekKey = getWeekKey(nextWeekDate.toISOString().split('T')[0]);

        const weekLabel = (key: string) => {
          if (key === thisWeekKey) return '本週';
          if (key === nextWeekKey) return '下週';
          // 從 key 提取顯示用的月份範圍
          return key;
        };

        // 按週分組
        const weekMap = new Map<string, ShipDate[]>();
        dateList.forEach(d => {
          const wk = getWeekKey(d.ship_date);
          if (!weekMap.has(wk)) weekMap.set(wk, []);
          weekMap.get(wk)!.push(d);
        });
        const weekGroups = Array.from(weekMap.entries()).map(([key, dates]) => {
          // 用第一天日期產生更好的週標籤
          const firstDate = dates[0].ship_date;
          const lastDate = dates[dates.length - 1].ship_date;
          const fmtShort = (d: string) => { const dt = new Date(d + 'T12:00:00'); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
          let label = weekLabel(key);
          if (label === key) label = `${fmtShort(firstDate)} ~ ${fmtShort(lastDate)}`;
          return { key, label, dates };
        });

        const previewCount = 3;
        const previewDates = dateList.slice(0, previewCount);
        const hasMore = dateList.length > previewCount;

        const renderDateItem = (d: ShipDate) => {
          const sel = selectedDate?.id === d.id;
          const isFull = d.remaining <= 0;
          return (
            <div
              key={d.id}
              className={`${s.dateItem} ${sel ? s.dateItemSelected : ''} ${isFull ? s.dateItemFull : ''}`}
              onClick={() => { if (!isFull) { setSelectedDate(d); setQty(1); } }}
            >
              <div className={s.dateItemLeft}>
                <div className={`${s.dateRadio} ${sel ? s.dateRadioSelected : ''}`}>
                  {sel && <div className={s.dateRadioDot} />}
                </div>
                <span className={s.dateItemLabel}>{fmtDate(d.ship_date)}</span>
              </div>
              <div className={s.dateItemRight}>
                {isFull
                  ? <span className={s.dateItemFullTag}>已額滿</span>
                  : <span className={s.dateItemRemaining}>剩餘 {d.remaining} 份</span>
                }
              </div>
            </div>
          );
        };

        return (
          <div className={s.batchWrap}>
            <div className={s.sectionLabel}>選擇出貨日期</div>

            {!showAllDates ? (
              <>
                <div className={s.dateGroup}>
                  <div className={s.dateGroupLabel}>近期可選</div>
                  <div className={s.dateGroupList}>
                    {previewDates.map(renderDateItem)}
                  </div>
                </div>
                {hasMore && (
                  <button
                    type="button"
                    className={s.showMoreDatesBtn}
                    onClick={() => setShowAllDates(true)}
                  >
                    顯示更多日期（共 {dateList.length} 天）
                    <span className={s.showMoreArrow}>↓</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {weekGroups.map(g => (
                  <div key={g.key} className={s.dateGroup}>
                    <div className={s.dateGroupLabel}>{g.label}</div>
                    <div className={s.dateGroupList}>
                      {g.dates.map(renderDateItem)}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className={s.showMoreDatesBtn}
                  onClick={() => setShowAllDates(false)}
                >
                  收合日期
                  <span className={s.showMoreArrow} style={{ transform: 'rotate(180deg)' }}>↓</span>
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* 數量選擇器 */}
      <div className={s.qtyWrap}>
        <button className={s.qtyBtn} onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
        <input
          type="number"
          className={s.qtyValue}
          value={qty}
          min={1}
          max={isFinite(maxSelectableQty) ? maxSelectableQty : undefined}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) setQty(Math.min(Math.max(1, v), maxSelectableQty));
          }}
        />
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
          disabled={
            (isPreorder && !selectedBatch) ||
            (isDateMode && !selectedDate) ||
            (hasVariants && !selectedVariant) ||
            variantSoldOut || batchFull || dateFull ||
            maxSelectableQty <= 0
          }
        >
          {batchFull ? '此批次已額滿'
            : dateFull ? '此日期已額滿'
            : maxSelectableQty <= 0 ? '已達可購上限'
            : added ? '已加入購物車'
            : isPreorder ? '預購下單'
            : '加入購物車'}
        </button>
      </div>
    </div>
  );
}
