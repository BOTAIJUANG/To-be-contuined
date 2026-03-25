// lib/getProductPromotions.ts  ──  取得商品關聯的活動資訊（給前台顯示用）
//
// 給 server component（商品頁、商品列表）使用

import { supabase } from '@/lib/supabase';

export interface ProductPromoInfo {
  id: number;
  name: string;
  type: 'volume' | 'bundle' | 'gift';
  // volume
  volume_tiers?: { min_qty: number; price: number }[];
  // bundle
  bundle_price?: number;
  bundle_items?: { product_id: number; qty: number; product_name?: string }[];
  // gift
  gift_product_id?: number;
  gift_product_name?: string;
  gift_qty?: number;
  gift_condition_qty?: number;
}

// 取得所有啟用中的活動（含商品關聯），回傳以 product_id 為 key 的 map
export async function getActivePromotionsMap(): Promise<Map<number, ProductPromoInfo[]>> {
  const now = new Date().toISOString();

  const { data: promos } = await supabase
    .from('promotions')
    .select('*, promotion_products(product_id), promotion_volume_tiers(min_qty, price), promotion_bundle_items(product_id, qty)')
    .eq('is_active', true);

  if (!promos) return new Map();

  const map = new Map<number, ProductPromoInfo[]>();

  for (const p of promos) {
    // 檢查時間範圍
    if (p.start_at && new Date(p.start_at) > new Date(now)) continue;
    if (p.end_at && new Date(p.end_at) < new Date(now)) continue;

    const info: ProductPromoInfo = {
      id: p.id,
      name: p.name,
      type: p.type,
    };

    if (p.type === 'volume') {
      info.volume_tiers = (p.promotion_volume_tiers ?? [])
        .map((t: any) => ({ min_qty: t.min_qty, price: t.price }))
        .sort((a: any, b: any) => a.min_qty - b.min_qty);
    }

    if (p.type === 'bundle') {
      info.bundle_price = p.bundle_price;
      info.bundle_items = (p.promotion_bundle_items ?? []).map((bi: any) => ({
        product_id: bi.product_id,
        qty: bi.qty,
      }));
    }

    if (p.type === 'gift') {
      info.gift_product_id = p.gift_product_id;
      info.gift_qty = p.gift_qty ?? 1;
      info.gift_condition_qty = p.gift_condition_qty ?? 1;
    }

    // volume / gift 用 promotion_products 關聯
    if (p.type === 'volume' || p.type === 'gift') {
      const productIds = (p.promotion_products ?? []).map((pp: any) => pp.product_id);
      for (const pid of productIds) {
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(info);
      }
    }

    // bundle 用 promotion_bundle_items 關聯
    if (p.type === 'bundle') {
      const productIds = (p.promotion_bundle_items ?? []).map((bi: any) => bi.product_id);
      for (const pid of productIds) {
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(info);
      }
    }
  }

  return map;
}

// 取得單一商品的活動（商品詳細頁用）
export async function getProductPromotions(productId: number): Promise<ProductPromoInfo[]> {
  const map = await getActivePromotionsMap();
  return map.get(productId) ?? [];
}
