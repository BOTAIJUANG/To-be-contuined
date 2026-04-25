'use client';

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

  useEffect(() => {
    document.body.classList.toggle('no-scroll', isOpen);
    return () => { document.body.classList.remove('no-scroll'); };
  }, [isOpen]);

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

  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [batchStockMap, setBatchStockMap] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!isOpen || items.length === 0) return;

    const productIds = [...new Set(items.filter(i => !i.isPreorder).map(i => i.productRealId ?? parseInt(i.id)))];
    if (productIds.length > 0) {
      fetch(`/api/stock?product_ids=${productIds.join(',')}`)
        .then(r => r.json())
        .then(({ data }) => {
          if (!data) return;
          const map: Record<string, number> = {};
          data.forEach((inv: any) => {
            if (inv.ship_date_id) {
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
      if (batchRemaining === undefined) return item.qty;
      const otherBatchQty = items
        .filter(i => i !== item && i.isPreorder && i.preorderBatchId === item.preorderBatchId)
        .reduce((sum, i) => sum + i.qty, 0);
      return Math.max(item.qty, batchRemaining - otherBatchQty);
    }
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
      <div className={`${s.overlay} ${isOpen ? s.open : ''}`} onClick={closeCart} />

      <div className={`${s.drawer} ${isOpen ? s.open : ''}`}>

        {/* Header */}
        <div className={s.cartHeader}>
          <div className={s.cartEyebrow}>CART</div>
          <div className={s.cartTitleRow}>
            <div className={s.cartTitle}>
              購物車
              {totalCount > 0 && <span className={s.cartCount}>（{totalCount} 件）</span>}
            </div>
            <button className={s.closeBtn} onClick={closeCart}>×</button>
          </div>
        </div>

        {/* 混購提示條 */}
        {hasMixed && unifiedShipDate && (
          <div className={s.mixedBanner}>
            若此訂單需統一出貨，可選出貨日期將於結帳時依商品與配送條件顯示。
          </div>
        )}

        {/* 商品列表 */}
        <div className={s.cartItems}>
          {items.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 01-8 0" />
                </svg>
              </div>
              <p className={s.emptyText}>購物車是空的</p>
            </div>
          ) : (
            <div className={s.cartItemsInner}>
              {items.map(item => {
                let key = item.variantId ? `${item.id}_${item.variantId}` : item.id;
                if (item.preorderBatchId) key += `_b${item.preorderBatchId}`;
                if (item.shipDateId) key += `_sd${item.shipDateId}`;

                const metaParts: string[] = [];
                if (item.variantName) metaParts.push(item.variantName);
                if (item.isPreorder && item.preorderShipDate) metaParts.push(`預購 · 出貨 ${item.preorderShipDate}`);
                else if (!item.isPreorder && item.shipDate) metaParts.push(`出貨日 ${item.shipDate}`);
                if (item.isRedeemItem) metaParts.push('× 1（兌換品）');

                return (
                  <div key={key} className={`${s.cartItemCard} ${item.isRedeemItem ? s.cartItemCardRedeem : ''}`}>
                    <div className={s.cartItemImageWrap}>
                      {item.imageUrl && <img src={item.imageUrl} alt={item.name} className={s.cartItemImage} />}
                    </div>
                    <div className={s.cartItemBody}>
                      <div className={s.cartItemTop}>
                        <div>
                          <div className={s.cartItemTitle}>
                            {item.name}
                            {item.isRedeemItem && <span className={s.redeemBadge}>兌換品</span>}
                          </div>
                          {metaParts.length > 0 && (
                            <div className={s.cartItemMeta}>{metaParts.join(' · ')}</div>
                          )}
                        </div>
                        {item.isRedeemItem ? (
                          <button className={s.cartItemCancel} onClick={() => handleCancelRedeem(item)}>取消</button>
                        ) : (
                          <button className={s.cartItemRemove} onClick={() => removeItem(item.id, item.variantId, item.preorderBatchId, item.shipDateId)} disabled={cartLocked}>×</button>
                        )}
                      </div>

                      {!item.isRedeemItem && (
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

                      <div className={s.cartItemBottom}>
                        <span className={item.isRedeemItem ? s.cartItemFree : s.cartItemPrice}>
                          {item.isRedeemItem ? '免費' : `NT$ ${(item.price * item.qty).toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 贈品列 */}
              {giftDisplays.map(g => (
                <div key={`gift-${g.product_id}-${g.promotion_name}`} className={s.giftCard}>
                  <div className={s.cartItemImageWrap}>
                    {g.image_url && <img src={g.image_url} alt={g.name} className={s.cartItemImage} />}
                  </div>
                  <div className={s.cartItemBody}>
                    <div className={s.cartItemTop}>
                      <div>
                        <div className={s.cartItemTitle}>
                          {g.name}
                          <span className={s.giftBadge}>贈送</span>
                        </div>
                        <div className={s.cartItemMeta}>{g.promotion_name}</div>
                      </div>
                    </div>
                    <div className={s.cartItemBottom}>
                      <span className={s.giftQty}>× {g.qty}</span>
                      <span className={s.giftPrice} style={{ marginLeft: 8 }}>NT$ 0</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部結帳區 */}
        {items.length > 0 && (
          <div className={s.cartSummary}>
            {/* 優惠折扣卡 */}
            {promoResult.discounts.map(d => (
              <div key={d.promotion_id} className={s.discountCard}>
                <span className={s.discountIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </span>
                <div className={s.discountTextWrap}>
                  <div className={s.discountTitle}>{d.promotion_name}</div>
                </div>
                <span className={s.discountValue}>− NT$ {d.discount_amount.toLocaleString()}</span>
              </div>
            ))}
            {giftDisplays.map(g => (
              <div key={`gift-summary-${g.product_id}`} className={s.discountCard}>
                <span className={s.discountIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
                  </svg>
                </span>
                <div className={s.discountTextWrap}>
                  <div className={s.discountTitle}>贈送：{g.name}</div>
                  <div className={s.discountMeta}>× {g.qty}｜{g.promotion_name}</div>
                </div>
              </div>
            ))}

            {/* 小計 */}
            <div className={s.subtotalRow}>
              <span className={s.subtotalLabel}>小計</span>
              <span className={s.subtotalValue}>NT$ {(totalPrice - promoResult.total_discount).toLocaleString()}</span>
            </div>

            {cartLocked && (
              <div className={s.lockedNotice}>結帳進行中，購物車暫時鎖定</div>
            )}

            <button className={s.checkoutBtn} onClick={() => { lockCart(); closeCart(); router.push('/checkout'); }}>
              前往結帳
            </button>
            <button
              className={s.clearCartBtn}
              onClick={() => { if (confirm('確定要清空購物車嗎？')) clearCart(); }}
              disabled={cartLocked || items.some(i => i.isRedeemItem)}
            >
              清空購物車
            </button>
          </div>
        )}
      </div>
    </>
  );
}
