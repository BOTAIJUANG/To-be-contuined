// ════════════════════════════════════════════════
// lib/promotions.ts  ──  優惠活動計算引擎
//
// 前端（購物車/結帳顯示）和後端（訂單 API 驗算）共用
//
// 三種優惠類型：
// - volume：商品數量優惠（1件70、3件200）
// - bundle：組合優惠（A+B=優惠價）
// - gift：  贈品活動（買A送B）
// ════════════════════════════════════════════════

export interface VolumeTier {
  min_qty: number;
  price: number;
}

export interface Promotion {
  id: number;
  name: string;
  type: 'volume' | 'bundle' | 'gift';
  is_active: boolean;
  stackable: boolean;
  coupon_stackable: boolean;
  start_at: string | null;
  end_at: string | null;
  bundle_price: number | null;
  bundle_repeatable: boolean;
  gift_product_id: number | null;
  gift_qty: number;
  gift_condition_qty: number;
  // 關聯
  product_ids: number[];           // volume/gift 適用商品
  volume_tiers: VolumeTier[];      // volume 階梯
  bundle_items: { product_id: number; qty: number }[];  // bundle 組合商品
}

export interface CartItemForCalc {
  product_id: number;
  qty: number;
  price: number;  // 原單價
  name: string;
}

export interface PromoDiscount {
  promotion_id: number;
  promotion_name: string;
  type: 'volume' | 'bundle' | 'gift';
  discount_amount: number;   // 折扣金額
  description: string;       // 前端顯示用的描述
}

export interface GiftItem {
  promotion_id: number;
  promotion_name: string;
  product_id: number;
  qty: number;
}

export interface PromoResult {
  discounts: PromoDiscount[];
  gifts: GiftItem[];
  total_discount: number;
}

// ── 判斷活動是否在有效期內 ────────────────────────
function isActiveNow(p: Promotion): boolean {
  if (!p.is_active) return false;
  const now = new Date();
  if (p.start_at && new Date(p.start_at) > now) return false;
  if (p.end_at && new Date(p.end_at) < now) return false;
  return true;
}

// ── 計算所有優惠 ─────────────────────────────────
export function calculatePromotions(
  items: CartItemForCalc[],
  promotions: Promotion[],
): PromoResult {
  const discounts: PromoDiscount[] = [];
  const gifts: GiftItem[] = [];

  // 只處理有效的活動
  const active = promotions.filter(isActiveNow);

  // 1. Volume 優惠（商品數量優惠）
  const volumePromos = active.filter(p => p.type === 'volume');
  for (const promo of volumePromos) {
    // 找出購物車中符合此活動的商品
    const matchingItems = items.filter(i => promo.product_ids.includes(i.product_id));
    if (matchingItems.length === 0) continue;

    // 計算符合商品的總數量
    const totalQty = matchingItems.reduce((s, i) => s + i.qty, 0);

    // 找最佳階梯（數量由大到小找第一個符合的）
    const sortedTiers = [...promo.volume_tiers].sort((a, b) => b.min_qty - a.min_qty);
    const bestTier = sortedTiers.find(t => totalQty >= t.min_qty);

    if (bestTier) {
      // 原價（用各商品的原單價計算）
      const originalTotal = matchingItems.reduce((s, i) => s + i.price * i.qty, 0);
      // 階梯價（依最佳階梯計算）
      // 如果買超過最大階梯的倍數，可能需要分段計算
      // 簡化版：階梯價 = (totalQty / bestTier.min_qty) 組 * bestTier.price + 剩餘 * 單件原價
      const groups = Math.floor(totalQty / bestTier.min_qty);
      const remainder = totalQty % bestTier.min_qty;
      // 剩餘件數用次低階梯或原價
      const remainderTier = sortedTiers.find(t => remainder >= t.min_qty);
      const avgUnitPrice = matchingItems.length > 0
        ? matchingItems.reduce((s, i) => s + i.price * i.qty, 0) / totalQty
        : 0;
      const remainderPrice = remainderTier
        ? remainderTier.price
        : remainder * avgUnitPrice;

      const promoTotal = groups * bestTier.price + remainderPrice;
      const saved = Math.round(originalTotal - promoTotal);

      if (saved > 0) {
        discounts.push({
          promotion_id: promo.id,
          promotion_name: promo.name,
          type: 'volume',
          discount_amount: saved,
          description: `${promo.name}：${totalQty} 件 = NT$${Math.round(promoTotal)}（原價 NT$${originalTotal}）`,
        });
      }
    }
  }

  // 2. Bundle 優惠（組合優惠）
  const bundlePromos = active.filter(p => p.type === 'bundle');
  for (const promo of bundlePromos) {
    if (!promo.bundle_price) continue;

    // 檢查購物車是否包含組合中的所有商品且數量足夠
    const itemQtyMap = new Map<number, number>();
    items.forEach(i => itemQtyMap.set(i.product_id, (itemQtyMap.get(i.product_id) ?? 0) + i.qty));

    // 計算可以套幾組
    let maxSets = Infinity;
    for (const bi of promo.bundle_items) {
      const available = itemQtyMap.get(bi.product_id) ?? 0;
      const sets = Math.floor(available / bi.qty);
      maxSets = Math.min(maxSets, sets);
    }

    if (maxSets === Infinity || maxSets === 0) continue;
    // 不可重複套用時只算 1 組
    const applySets = promo.bundle_repeatable ? maxSets : Math.min(maxSets, 1);

    // 計算一組的原價
    let originalOneSet = 0;
    for (const bi of promo.bundle_items) {
      const item = items.find(i => i.product_id === bi.product_id);
      if (item) originalOneSet += item.price * bi.qty;
    }

    const saved = (originalOneSet - promo.bundle_price) * applySets;

    if (saved > 0) {
      discounts.push({
        promotion_id: promo.id,
        promotion_name: promo.name,
        type: 'bundle',
        discount_amount: saved,
        description: applySets > 1
          ? `${promo.name}：${applySets} 組 × NT$${promo.bundle_price}（省 NT$${saved}）`
          : `${promo.name}：組合價 NT$${promo.bundle_price}（省 NT$${saved}）`,
      });
    }
  }

  // 3. Gift 優惠（贈品活動）
  const giftPromos = active.filter(p => p.type === 'gift');
  for (const promo of giftPromos) {
    if (!promo.gift_product_id) continue;

    // 檢查購物車中符合條件商品的總數量
    const matchingItems = items.filter(i => promo.product_ids.includes(i.product_id));
    const totalQty = matchingItems.reduce((s, i) => s + i.qty, 0);

    if (totalQty >= promo.gift_condition_qty) {
      // 計算可以送幾次
      const giftSets = Math.floor(totalQty / promo.gift_condition_qty);
      gifts.push({
        promotion_id: promo.id,
        promotion_name: promo.name,
        product_id: promo.gift_product_id,
        qty: promo.gift_qty * giftSets,
      });
    }
  }

  // 檢查併用規則：如果有不可併用的活動，只保留折扣最大的
  const nonStackable = discounts.filter(d => {
    const promo = promotions.find(p => p.id === d.promotion_id);
    return promo && !promo.stackable;
  });

  let finalDiscounts = discounts;
  if (nonStackable.length > 1) {
    // 多個不可併用的活動 → 只保留折扣最大的
    const best = nonStackable.sort((a, b) => b.discount_amount - a.discount_amount)[0];
    finalDiscounts = discounts.filter(d => {
      const promo = promotions.find(p => p.id === d.promotion_id);
      if (promo && !promo.stackable) return d.promotion_id === best.promotion_id;
      return true; // 可併用的保留
    });
  }

  return {
    discounts: finalDiscounts,
    gifts,
    total_discount: finalDiscounts.reduce((s, d) => s + d.discount_amount, 0),
  };
}
