'use client';

// ════════════════════════════════════════════════
// context/CartContext.tsx  ──  購物車全域狀態
//
// 支援預購商品混購規則：
// - CartItem 加入 isPreorder 和 preorderShipDate
// - 購物車記錄目前的類型（stock / preorder）
// - addItem 時檢查是否與現有商品類型衝突
// ════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem {
  id:               string;
  slug:             string;
  name:             string;
  price:            number;
  imageUrl?:        string;
  qty:              number;
  isPreorder?:      boolean;
  preorderShipDate?: string;
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
  | { ok: false; overStock: true; maxStock: number };

interface CartContextType {
  items:       CartItem[];
  totalCount:  number;
  totalPrice:  number;
  cartType:    'stock' | 'preorder' | null;  // 目前購物車類型
  mixedShipDate: string | null;              // 混購時的統一出貨日
  addItem:     (item: Omit<CartItem, 'qty'>, qty?: number, maxStock?: number | null) => AddItemResult;
  removeItem:  (id: string, variantId?: number) => void;
  updateQty:   (id: string, qty: number, variantId?: number, maxStock?: number | null) => boolean;
  clearCart:   () => void;
  isOpen:      boolean;
  openCart:    () => void;
  closeCart:   () => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items,  setItems]  = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

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

  // 混購統一出貨日（預購商品的最晚出貨日）
  const mixedShipDate: string | null = (() => {
    const preorderDates = items.filter(i => i.isPreorder && i.preorderShipDate).map(i => i.preorderShipDate!);
    if (preorderDates.length === 0) return null;
    return preorderDates.sort().reverse()[0]; // 最晚日期
  })();

  const addItem = (newItem: Omit<CartItem, 'qty'>, qty = 1, maxStock?: number | null): AddItemResult => {
    const key = newItem.variantId ? `${newItem.id}_${newItem.variantId}` : newItem.id;
    const existing = items.find(i => {
      const iKey = i.variantId ? `${i.id}_${i.variantId}` : i.id;
      return iKey === key;
    });
    const existingQty = existing?.qty ?? 0;
    const nextQty = existingQty + qty;

    // 超過庫存 → 擋住
    if (maxStock != null && nextQty > maxStock) {
      return { ok: false, overStock: true, maxStock };
    }

    setItems(prev => {
      const ex = prev.find(i => {
        const iKey = i.variantId ? `${i.id}_${i.variantId}` : i.id;
        return iKey === key;
      });
      if (ex) {
        return prev.map(i => {
          const iKey = i.variantId ? `${i.id}_${i.variantId}` : i.id;
          return iKey === key ? { ...i, qty: i.qty + qty } : i;
        });
      }
      return [...prev, { ...newItem, qty }];
    });

    return { ok: true };
  };

  const removeItem = (id: string, variantId?: number) => {
    setItems(prev => prev.filter(i => {
      if (variantId) return !(i.id === id && i.variantId === variantId);
      return i.id !== id;
    }));
  };

  const updateQty = (id: string, qty: number, variantId?: number, maxStock?: number | null): boolean => {
    if (qty <= 0) { removeItem(id, variantId); return true; }
    if (maxStock != null && qty > maxStock) return false;
    setItems(prev => prev.map(i => {
      if (variantId) return (i.id === id && i.variantId === variantId) ? { ...i, qty } : i;
      return i.id === id ? { ...i, qty } : i;
    }));
    return true;
  };

  const clearCart  = () => setItems([]);
  const openCart   = () => setIsOpen(true);
  const closeCart  = () => setIsOpen(false);
  const totalCount = items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, totalCount, totalPrice, cartType, mixedShipDate, addItem, removeItem, updateQty, clearCart, isOpen, openCart, closeCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
