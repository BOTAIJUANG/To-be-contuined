'use client';

// ════════════════════════════════════════════════
// context/CartContext.tsx  ──  購物車全域狀態
//
// 支援預購商品混購：
// - CartItem 加入 isPreorder / preorderShipDate / preorderBatchId
// - 購物車記錄目前的類型（stock / preorder）
// - 混購時計算 unifiedShipDate（UI 提示門檻，非最終日期）
// ════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';

// Cart feedback: toast 通知
export interface CartToastData {
  id: number;
  message: string;
}

export interface CartItem {
  id:               string;
  slug:             string;
  name:             string;
  price:            number;
  imageUrl?:        string;
  qty:              number;
  isPreorder?:      boolean;
  preorderShipDate?: string;
  preorderBatchId?: number;    // 預購批次 ID（對應 preorder_batches.id）
  shipDateId?:      number;    // 日期模式出貨日 ID（對應 product_ship_dates.id）
  shipDate?:        string;    // 日期模式出貨日
  variantId?:       number;
  variantName?:     string;
  isRedeemItem?:    boolean;
  redemptionId?:    number;
  productRealId?:   number;   // 兌換品對應的真實 product_id
  isGift?:          boolean;  // 贈品（系統自動加入）
  giftPromotionId?: number;   // 贈品所屬活動 ID
}

// 加入購物車的結果
export type AddItemResult =
  | { ok: true }
  | { ok: false; overStock: true; maxStock: number }
  | { ok: false; redeemLimit: true };

interface CartContextType {
  items:       CartItem[];
  totalCount:  number;
  totalPrice:  number;
  cartType:    'stock' | 'preorder' | null;  // 目前購物車類型
  mixedShipDate: string | null;              // 預購商品最晚批次出貨日
  unifiedShipDate: string | null;            // 混購最早可統一出貨日（UI 提示門檻，非最終日期）
  addItem:     (item: Omit<CartItem, 'qty'>, qty?: number, maxStock?: number | null) => AddItemResult;
  removeItem:  (id: string, variantId?: number, preorderBatchId?: number, shipDateId?: number) => void;
  updateQty:   (id: string, qty: number, variantId?: number, maxStock?: number | null, preorderBatchId?: number, shipDateId?: number) => boolean;
  clearCart:   () => void;
  isOpen:      boolean;
  openCart:    () => void;
  closeCart:   () => void;
  // 結帳鎖定
  cartLocked:  boolean;
  lockCart:    () => void;
  unlockCart:  () => void;
  // Cart feedback
  toast:          CartToastData | null;
  showToast:      (msg: string) => void;
  clearToast:     () => void;
  cartBounceKey:  number;
  triggerBounce:  () => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items,  setItems]  = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Cart feedback state
  const [toast, setToast] = useState<CartToastData | null>(null);
  const [cartBounceKey, setCartBounceKey] = useState(0);
  const toastIdRef = useRef(0);

  const showToast = useCallback((msg: string) => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message: msg });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);
  const triggerBounce = useCallback(() => setCartBounceKey(k => k + 1), []);

  // mount 後從 localStorage 還原購物車（避免 SSR hydration 不一致）
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cart_items');
      if (saved) setItems(JSON.parse(saved));
    } catch {}
  }, []);

  // items 變動時同步存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('cart_items', JSON.stringify(items));
    } catch {}
  }, [items]);

  // 目前購物車的類型
  const cartType: 'stock' | 'preorder' | null =
    items.length === 0 ? null : (items.some(i => i.isPreorder) ? 'preorder' : 'stock');

  // 預購商品最晚批次出貨日
  const mixedShipDate: string | null = (() => {
    const preorderDates = items.filter(i => i.isPreorder && i.preorderShipDate).map(i => i.preorderShipDate!);
    if (preorderDates.length === 0) return null;
    return preorderDates.sort().reverse()[0]; // 最晚日期
  })();

  // 混購最早可統一出貨日（UI 提示用門檻，非最終日期）
  // 粗略計算：max(預購最晚批次日, 明天)
  // 真正可選日期由 checkout 呼叫 /api/available-dates 後決定
  const unifiedShipDate: string | null = (() => {
    if (!mixedShipDate) return null;
    const hasStock = items.some(i => !i.isPreorder && !i.isRedeemItem && !i.isGift);
    if (!hasStock) return mixedShipDate; // 純預購，直接用預購日
    // 一般商品最快 = 明天（粗略門檻，實際以 API 為準）
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const stockDate = tomorrow.toISOString().split('T')[0];
    return mixedShipDate > stockDate ? mixedShipDate : stockDate;
  })();

  // 產生購物車 item 的唯一 key（含批次/日期 ID，避免不同批次合併）
  const itemKey = (i: { id: string; variantId?: number; preorderBatchId?: number; shipDateId?: number }) => {
    let k = i.variantId ? `${i.id}_${i.variantId}` : i.id;
    if (i.preorderBatchId) k += `_b${i.preorderBatchId}`;
    if (i.shipDateId) k += `_sd${i.shipDateId}`;
    return k;
  };

  const addItem = (newItem: Omit<CartItem, 'qty'>, qty = 1, maxStock?: number | null): AddItemResult => {
    const key = itemKey(newItem);
    const existing = items.find(i => itemKey(i) === key);
    const existingQty = existing?.qty ?? 0;
    const nextQty = existingQty + qty;

    // 超過庫存 → 擋住
    if (maxStock != null && nextQty > maxStock) {
      return { ok: false, overStock: true, maxStock };
    }

    setItems(prev => {
      const ex = prev.find(i => itemKey(i) === key);
      if (ex) {
        return prev.map(i => itemKey(i) === key ? { ...i, qty: i.qty + qty } : i);
      }
      return [...prev, { ...newItem, qty }];
    });

    return { ok: true };
  };

  const removeItem = (id: string, variantId?: number, preorderBatchId?: number, shipDateId?: number) => {
    setItems(prev => prev.filter(i => {
      const target = itemKey({ id, variantId, preorderBatchId, shipDateId });
      return itemKey(i) !== target;
    }));
  };

  const updateQty = (id: string, qty: number, variantId?: number, maxStock?: number | null, preorderBatchId?: number, shipDateId?: number): boolean => {
    if (qty <= 0) { removeItem(id, variantId, preorderBatchId, shipDateId); return true; }
    if (maxStock != null && qty > maxStock) return false;
    const targetKey = itemKey({ id, variantId, preorderBatchId, shipDateId });
    setItems(prev => prev.map(i => itemKey(i) === targetKey ? { ...i, qty } : i));
    return true;
  };

  const [cartLocked, setCartLocked] = useState(false);
  const lockCart   = useCallback(() => setCartLocked(true), []);
  const unlockCart = useCallback(() => setCartLocked(false), []);

  const clearCart  = () => { setItems([]); setCartLocked(false); };
  const openCart   = () => setIsOpen(true);
  const closeCart  = () => setIsOpen(false);
  const totalCount = items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, totalCount, totalPrice, cartType, mixedShipDate, unifiedShipDate, addItem, removeItem, updateQty, clearCart, isOpen, openCart, closeCart, cartLocked, lockCart, unlockCart, toast, showToast, clearToast, cartBounceKey, triggerBounce }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
