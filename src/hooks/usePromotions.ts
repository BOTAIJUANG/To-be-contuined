'use client';

// hooks/usePromotions.ts  ──  載入活動並計算購物車優惠
//
// 用法：
//   const { promoResult, gifts, loading } = usePromotions(cartItems);

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Promotion, CartItemForCalc, PromoResult, calculatePromotions } from '@/lib/promotions';

export function usePromotions(cartItems: CartItemForCalc[]) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promoResult, setPromoResult] = useState<PromoResult>({ discounts: [], gifts: [], total_discount: 0 });
  const [loading, setLoading] = useState(true);

  // 載入所有啟用中的活動
  useEffect(() => {
    const load = async () => {
      const { data: promos } = await supabase
        .from('promotions')
        .select('*, promotion_products(product_id), promotion_volume_tiers(*), promotion_bundle_items(*)')
        .eq('is_active', true);

      if (promos) {
        const mapped: Promotion[] = promos.map((p: any) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          is_active: p.is_active,
          stackable: p.stackable,
          start_at: p.start_at,
          end_at: p.end_at,
          bundle_price: p.bundle_price,
          bundle_repeatable: p.bundle_repeatable,
          gift_product_id: p.gift_product_id,
          gift_qty: p.gift_qty ?? 1,
          gift_condition_qty: p.gift_condition_qty ?? 1,
          product_ids: p.promotion_products?.map((pp: any) => pp.product_id) ?? [],
          volume_tiers: p.promotion_volume_tiers?.map((t: any) => ({ min_qty: t.min_qty, price: t.price })) ?? [],
          bundle_items: p.promotion_bundle_items?.map((bi: any) => ({ product_id: bi.product_id, qty: bi.qty })) ?? [],
        }));
        setPromotions(mapped);
      }
      setLoading(false);
    };
    load();
  }, []);

  // 購物車變動時重新計算
  useEffect(() => {
    if (loading || cartItems.length === 0) {
      setPromoResult({ discounts: [], gifts: [], total_discount: 0 });
      return;
    }
    const result = calculatePromotions(cartItems, promotions);
    setPromoResult(result);
  }, [cartItems, promotions, loading]);

  return { promotions, promoResult, loading };
}
