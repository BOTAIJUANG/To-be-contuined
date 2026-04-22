'use client';

// components/CartDrawer.tsx  ──  購物車側邊欄（responsive）

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { fetchApi } from '@/lib/api';
import { usePromotions } from '@/hooks/usePromotions';
import { CartItemForCalc } from '@/lib/promotions';
import { supabase } from '@/lib/supabase';
import s from './CartDrawer.module.css';

interface GiftDisplay {
  product_id: number;
  name: string;
  image_url: string | null;
  qty: number;
  promotion_name: string;
}

export default function CartDrawer() {
  const router = useRouter();
  const { items, totalPrice, totalCount, removeItem, updateQty, clearCart, isOpen, closeCart, cartType, mixedShipDate, unifiedShipDate, cartLocked, lockCart } = useCart();

  const hasMixed = items.some(i => i.isPreorder) && items.some(i => !i.isPreorder);

  // body scroll lock
  useEffect(() => {
    document.body.classList.toggle('no-scroll', isOpen);
    return () => { document.body.classList.remove('no-scroll'); };
  }, [isOpen]);

  // 優惠活動計算
  const cartItemsForCalc: CartItemForCalc[] = useMemo(() =>
    items.filter(i => !i.isRedeemItem && !i.isGift).map(i => ({
      product_id: i.productRealId ?? parseInt(i.id),
      qty: i.qty,
      price: i.price,
      name: i.name,
    })),
    [items]
  );
  const { promoResult } = usePromotions(cartItemsForCalc);

  // 載入贈品商品資訊（圖片、名稱）
  const [giftDisplays, setGiftDisplays] = useState<GiftDisplay[]>([]);
  useEffect(() => {
    if (promoResult.gifts.length === 0) { setGiftDisplays([]); return; }
    const ids = [...new Set(promoResult.gifts.map(g => g.product_id))];
    supabase.from('products').select('id, name, image_url').in('id', ids)
      .then(({ data }) => {
        const map = new Map((data ?? []).map(p => [p.id, p]));
        setGiftDisplays(promoResult.gifts.map(g => {
          const p = map.get(g.product_id);
          return { product_id: g.product_id, name: p?.name ?? `贈品 #${g.product_id}`, image_url: p?.image_url ?? null, qty: g.qty, promotion_name: g.promotion_name };
        }));
      }, () => {});
  }, [promoResult.gifts]);

  // 載入購物車商品的可售庫存（用於限制 + 按鈕）
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  // 預購批次剩餘量 map（batch_id → remaining）
  const [batchStockMap, setBatchStockMap] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!isOpen || items.length === 0) return;

    // 一般商品庫存
    const productIds = [...new Set(items.filter(i => !i.isPreorder).map(i => i.productRealId ?? parseInt(i.id)))];
    if (productIds.length > 0) {
      fetch(`/api/stock?product_ids=${productIds.join(',')}`)
        .then(r => r.json())
        .then(({ data }) => {
          if (!data) return;
          const map: Record<string, number> = {};
          data.forEach((inv: any) => {
            if (inv.ship_date_id) {
              // date_mode: 用 ship_date_id 作 key（每日獨立庫存）
              map[`sd_${inv.ship_date_id}`] = inv.available;
            } else {
              const key = inv.variant_id ? `${inv.product_id}_${inv.variant_id}` : `${inv.product_id}`;
              map[key] = inv.available;
            }
          });
          setStockMap(map);
        })
        .catch(() => {});
    }

    // 預購批次庫存
    const batchIds = [...new Set(items.filter(i => i.isPreorder && i.preorderBatchId).map(i => i.preorderBatchId!))];
    if (batchIds.length > 0) {
      fetch(`/api/batch-stock?batch_ids=${batchIds.join(',')}`)
        .then(r => r.json())
        .then(({ data }) => {
          if (!data) return;
          const map: Record<number, number> = {};
          data.forEach((b: any) => { map[b.batch_id] = b.remaining; });
          setBatchStockMap(map);
        })
        .catch(() => {});
    }
  }, [isOpen, items]);

  const getMaxQty = (item: any) => {
    if (item.isPreorder && item.preorderBatchId) {
      const batchRemaining = batchStockMap[item.preorderBatchId];
      // 批次 stock 尚未載入時，暫用目前數量（不允許加更多）
      if (batchRemaining === undefined) return item.qty;
      // 扣除同批次其他品項的數量，避免合計超過批次上限
      const otherBatchQty = items
        .filter(i => i !== item && i.isPreorder && i.preorderBatchId === item.preorderBatchId)
        .reduce((sum, i) => sum + i.qty, 0);
      return Math.max(item.qty, batchRemaining - otherBatchQty);
    }
    // date_mode: 用 ship_date_id 查每日獨立庫存
    if (item.shipDateId) {
      return stockMap[`sd_${item.shipDateId}`] ?? item.qty;
    }
    const key = item.variantId ? `${item.productRealId ?? parseInt(item.id)}_${item.variantId}` : `${item.productRealId ?? parseInt(item.id)}`;
    return stockMap[key] ?? item.qty;
  };

  const handleCancelRedeem = async (item: any) => {
    if (!confirm(`確定要取消「${item.name}」的兌換嗎？章數將立即歸還。`)) return;
    if (item.redemptionId) {
      await fetchApi('/api/redeem?action=cancel', {
        method: 'POST',
        body: JSON.stringify({ redemption_id: item.redemptionId }),
      });
    }
    removeItem(item.id, item.variantId, item.preorderBatchId, item.shipDateId);
  };

  return (
    <>
      {/* 遮罩 */}
      <div className={`${s.overlay} ${isOpen ? s.open : ''}`} onClick={closeCart} />

      {/* 抽屜 */}
      <div className={`${s.drawer} ${isOpen ? s.open : ''}`}>
        {/* 標題 */}
        <div className={s.header}>
          <div>
            <span className={s.headerLabel}>CART</span>
            <div className={s.headerTitle}>
              購物車 {totalCount > 0 && <span className={s.headerCount}>（{totalCount} 件）</span>}
            </div>
          </div>
          <button className={s.closeBtn} onClick={closeCart}>×</button>
        </div>

        {/* 混購提示條 */}
        {hasMixed && unifiedShipDate && (
          <div className={s.mixedBanner}>
            若此訂單需統一出貨，可選出貨日期將於結帳時依商品與配送條件顯示。
          </div>
        )}

        {/* 商品列表 */}
        <div className={s.itemList}>
          {items.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 01-8 0" />
                </svg>
              </div>
              <p className={s.emptyText}>購物車是空的</p>
            </div>
          ) : items.map(item => {
            let key = item.variantId ? `${item.id}_${item.variantId}` : item.id;
            if (item.preorderBatchId) key += `_b${item.preorderBatchId}`;
            if (item.shipDateId) key += `_sd${item.shipDateId}`;
            return (
              <div key={key} className={s.item}>
                <div className={s.itemImg}>
                  {item.imageUrl && <img src={item.imageUrl} alt={item.name} />}
                </div>
                <div className={s.itemInfo}>
                  <div className={s.itemName}>
                    {item.name}
                    {item.isRedeemItem && <span className={s.redeemBadge}>兌換品</span>}
                  </div>
                  {item.variantName && <div className={s.variantName}>{item.variantName}</div>}
                  {item.isPreorder && item.preorderShipDate && (
                    <div className={s.preorderNote}>預購 · 出貨 {item.preorderShipDate}</div>
                  )}
                  {!item.isPreorder && item.shipDate && (
                    <div className={s.preorderNote}>出貨日 {item.shipDate}</div>
                  )}
                  <div className={s.itemRow}>
                    {item.isRedeemItem ? (
                      <span className={s.redeemQty}>× 1（兌換品）</span>
                    ) : (
                      <div className={s.qtyControl}>
                        <button className={s.qtyBtn} onClick={() => updateQty(item.id, item.qty - 1, item.variantId, undefined, item.preorderBatchId, item.shipDateId)} disabled={cartLocked}>−</button>
                        <span className={s.qtyValue}>{item.qty}</span>
                        <button
                          className={s.qtyBtn}
                          onClick={() => {
                            const max = getMaxQty(item);
                            if (item.qty < max) updateQty(item.id, item.qty + 1, item.variantId, max, item.preorderBatchId, item.shipDateId);
                          }}
                          disabled={cartLocked || item.qty >= getMaxQty(item)}
                        >+</button>
                      </div>
                    )}
                    <span className={item.isRedeemItem ? s.itemPriceFree : s.itemPrice}>
                      {item.isRedeemItem ? '免費' : `NT$ ${(item.price * item.qty).toLocaleString()}`}
                    </span>
                  </div>
                </div>
                {item.isRedeemItem ? (
                  <button className={s.cancelRedeemBtn} onClick={() => handleCancelRedeem(item)}>取消</button>
                ) : (
                  <button className={s.removeBtn} onClick={() => removeItem(item.id, item.variantId, item.preorderBatchId, item.shipDateId)} disabled={cartLocked}>×</button>
                )}
              </div>
            );
          })}

          {/* 贈品列 */}
          {giftDisplays.map(g => (
            <div key={`gift-${g.product_id}-${g.promotion_name}`} className={s.giftItem}>
              <div className={s.itemImg}>
                {g.image_url && <img src={g.image_url} alt={g.name} />}
              </div>
              <div className={s.itemInfo}>
                <div className={s.itemName}>
                  {g.name}
                  <span className={s.giftBadge}>贈送</span>
                </div>
                <div className={s.itemRow}>
                  <span className={s.giftQty}>× {g.qty}</span>
                  <span className={s.giftPrice}>NT$ 0</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 底部 */}
        {items.length > 0 && (
          <div className={s.footer}>
            {/* 已套用優惠摘要 */}
            {(promoResult.discounts.length > 0 || promoResult.gifts.length > 0) && (
              <div className={s.promoSummary}>
                <div className={s.promoTitle}>已套用優惠</div>
                {promoResult.discounts.map(d => (
                  <div key={d.promotion_id} className={s.promoLine}>
                    <span>{d.promotion_name}</span>
                    <span className={s.promoDiscount}>− NT$ {d.discount_amount.toLocaleString()}</span>
                  </div>
                ))}
                {giftDisplays.map(g => (
                  <div key={`gift-summary-${g.product_id}`} className={s.giftSummaryLine}>
                    贈送：{g.name} × {g.qty}
                  </div>
                ))}
              </div>
            )}
            <div className={s.subtotalRow}>
              <span className={s.subtotalLabel}>小計</span>
              <span className={s.subtotalPrice}>NT$ {(totalPrice - promoResult.total_discount).toLocaleString()}</span>
            </div>
            {cartLocked && (
              <div className={s.lockedNotice}>
                結帳進行中，購物車暫時鎖定
              </div>
            )}
            <button className={s.checkoutBtn} onClick={() => { lockCart(); closeCart(); router.push('/checkout'); }}>
              前往結帳
            </button>
            <button className={s.clearBtn} onClick={() => { if (confirm('確定要清空購物車嗎？')) clearCart(); }} disabled={cartLocked || items.some(i => i.isRedeemItem)}>
              清空購物車
            </button>
          </div>
        )}
      </div>
    </>
  );
}
