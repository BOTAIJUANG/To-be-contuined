// ════════════════════════════════════════════════
// app/api/orders/route.ts  ──  建立訂單 API
//
// 【為什麼要把訂單建立搬到後端？】
// 之前的做法是在前端（checkout 頁面）直接用 supabase.from('orders').insert(...)
// 這樣很危險，因為使用者可以用瀏覽器開發者工具：
//   - 把價格改成 0
//   - 偽造折扣金額
//   - 用別人的 member_id 下單
//
// 搬到後端之後，所有金額計算都在 server 上做，
// 使用者只需要傳「我要買什麼」和「寄到哪裡」，
// 價格、運費、折扣全部由後端重新算。
//
// 【API 規格】
// POST /api/orders
// Header: Authorization: Bearer <token>（可選，有 = 會員單，無 = 訪客單）
// Body: {
//   items: [{ product_id, variant_id, qty }],
//   ship_method, name, phone, email,
//   city, district, address,
//   ship_date, note, coupon_code, pay_method,
//   redemption_id   // 可選，兌換品用（僅會員）
// }
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { optionalAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { Promotion, CartItemForCalc, calculatePromotions } from '@/lib/promotions';
import { generateStockModeDates, fmt } from '@/lib/ship-dates';

// ── 訂單編號產生器 ──────────────────────────────
function generateOrderNo(): string {
  const now = new Date();
  const d = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return `WB${d}-${code}`;
}

// ── 前端送來的購物車商品格式 ─────────────────────
interface CartItemInput {
  product_id:         number;
  variant_id?:        number | null;
  qty:                number;
  is_redeem?:         boolean;
  is_gift?:           boolean;
  preorder_batch_id?: number | null;
  ship_date_id?:      number | null;
}

// ── 前端送來的完整訂單資料 ───────────────────────
interface OrderInput {
  items:          CartItemInput[];
  ship_method:    string;
  // 購買人（下單人 / 付款人）
  buyerName:      string;
  buyerPhone:     string;
  buyerEmail:     string;
  // 收件人
  customerName:   string;
  customerPhone:  string;
  customerEmail:  string;
  city?:          string;
  district?:      string;
  address?:       string;
  ship_date?:     string;
  note?:          string;
  coupon_code?:   string;
  pay_method:     string;
  redemption_id?: number;
  promotion_ids?: number[];
  cvs_store_id?:      string;
  cvs_store_name?:    string;
  cvs_store_address?: string;
  cvs_store_brand?:   string;
}

export async function POST(req: NextRequest) {
  // ── 1. 驗證身份 ──
  const { userId: memberId } = await optionalAuth(req);
  const body: OrderInput = await req.json();

  // 過濾掉前端傳來的贈品（贈品由後端自行計算，避免重複）
  body.items = (body.items ?? []).filter(i => !i.is_gift);

  // ── 2. 基本欄位檢查 ──
  if (!body.items?.length) {
    return NextResponse.json({ error: '購物車是空的' }, { status: 400 });
  }
  if (!body.buyerName || !body.buyerPhone || !body.buyerEmail) {
    return NextResponse.json({ error: '請填寫購買人資訊' }, { status: 400 });
  }
  if (!body.customerName || !body.customerPhone || !body.customerEmail) {
    return NextResponse.json({ error: '請填寫收件人資訊' }, { status: 400 });
  }
  if (!memberId && body.items.some(i => i.is_redeem)) {
    return NextResponse.json({ error: '兌換品僅限會員使用，請先登入' }, { status: 400 });
  }
  if (!memberId && body.redemption_id) {
    return NextResponse.json({ error: '兌換品僅限會員使用，請先登入' }, { status: 400 });
  }
  // ── is_redeem 後端驗證：防止偽造免費商品 ──
  const redeemItems = body.items.filter(i => i.is_redeem);
  if (redeemItems.length > 0) {
    if (!body.redemption_id) {
      return NextResponse.json({ error: '兌換品需搭配有效的兌換單' }, { status: 400 });
    }
    // 驗證 redemption 存在且屬於該會員、狀態為 pending_cart
    const { data: redemption } = await supabaseAdmin
      .from('redemptions')
      .select('id, member_id, status, redeem_item_id')
      .eq('id', body.redemption_id)
      .single();
    if (!redemption || redemption.member_id !== memberId || redemption.status !== 'pending_cart') {
      return NextResponse.json({ error: '兌換單無效或已過期' }, { status: 400 });
    }
    // 驗證 is_redeem 項目的 product_id 對應 redeem_items 表中的商品
    const { data: redeemItemDef } = await supabaseAdmin
      .from('redeem_items')
      .select('product_id')
      .eq('id', redemption.redeem_item_id)
      .single();
    if (redeemItemDef) {
      for (const ri of redeemItems) {
        if (ri.product_id !== redeemItemDef.product_id) {
          return NextResponse.json({ error: '兌換品與兌換單不符' }, { status: 400 });
        }
      }
    }
  }
  // ── 配送方式白名單 + 條件必填驗證 ──
  const ALLOWED_SHIP_METHODS = ['home_ambient', 'home_refrigerated', 'home_frozen', 'cvs_ambient', 'cvs_frozen', 'store'];
  if (!body.ship_method || !ALLOWED_SHIP_METHODS.includes(body.ship_method)) {
    return NextResponse.json({ error: '配送方式不合法' }, { status: 400 });
  }
  const isHomeShip = (body.ship_method as string).startsWith('home');
  const isCvsShip  = (body.ship_method as string).startsWith('cvs');
  if (isHomeShip && (!body.city || !body.district || !body.address)) {
    return NextResponse.json({ error: '宅配需填寫完整收件地址（縣市 + 區域 + 地址）' }, { status: 400 });
  }
  if (isCvsShip && (!body.cvs_store_name || !body.cvs_store_address)) {
    return NextResponse.json({ error: '超商取貨需選擇取貨門市' }, { status: 400 });
  }
  if (!body.pay_method || !['credit', 'atm'].includes(body.pay_method)) {
    return NextResponse.json({ error: '請選擇付款方式' }, { status: 400 });
  }

  // ── 每個商品的 qty 必須是正整數 ──
  for (const item of body.items) {
    if (!item.qty || !Number.isInteger(item.qty) || item.qty <= 0) {
      return NextResponse.json({ error: `商品數量不合法（須為正整數）` }, { status: 400 });
    }
  }

  // ── 3. 並行查詢：商品、規格、運費設定、優惠活動、折扣碼 ──
  const productIds = body.items.map(i => i.product_id);
  const variantIds = body.items.filter(i => i.variant_id).map(i => i.variant_id!);

  const [productsRes, variantsRes, settingsRes, promosRes, couponRes] = await Promise.all([
    // 商品真實價格 + 出貨日驗證用欄位
    supabaseAdmin.from('products').select('id, name, slug, price, image_url, is_preorder, stock_mode, ship_start_date, ship_end_date, ship_blocked_dates, allow_home_ambient, allow_home_refrigerated, allow_home_frozen, allow_cvs_ambient, allow_cvs_frozen, allow_store_pickup').in('id', productIds),
    // 規格真實價格
    variantIds.length > 0
      ? supabaseAdmin.from('product_variants').select('id, product_id, name, price, price_diff').in('id', variantIds)
      : Promise.resolve({ data: [] as any[] }),
    // 運費設定
    supabaseAdmin.from('store_settings').select('*').eq('id', 1).single(),
    // 優惠活動
    supabaseAdmin.from('promotions')
      .select('*, promotion_products(product_id), promotion_volume_tiers(*), promotion_bundle_items(*)')
      .eq('is_active', true),
    // 折扣碼（沒填就跳過）
    body.coupon_code
      ? supabaseAdmin.from('coupons').select('*').eq('code', body.coupon_code.toUpperCase()).eq('is_active', true).single()
      : Promise.resolve({ data: null }),
  ]);

  const products = productsRes.data;
  if (!products || products.length === 0) {
    return NextResponse.json({ error: '找不到商品資料' }, { status: 400 });
  }

  const variantsMap: Record<number, { product_id: number; name: string; price: number | null; price_diff: number }> = {};
  (variantsRes.data ?? []).forEach((v: any) => { variantsMap[v.id] = v; });

  const productMap = new Map(products.map(p => [p.id, p]));
  const settings = settingsRes.data;

  // ── 3.5 後端出貨方式驗證 ──
  const shipMethod = body.ship_method as string;

  // 3.5a 驗證 store_settings 層級的出貨開關
  const storeShipFieldMap: Record<string, string> = {
    home_ambient:      'ship_home_ambient',
    home_refrigerated: 'ship_home_refrigerated',
    home_frozen:       'ship_home_frozen',
    cvs_ambient:       'ship_cvs_ambient',
    cvs_frozen:        'ship_cvs_frozen',
    store:             'ship_store',
  };
  const storeShipField = storeShipFieldMap[shipMethod];
  if (storeShipField && settings && (settings as any)[storeShipField] === false) {
    return NextResponse.json({ error: '此運送方式目前未開放' }, { status: 400 });
  }

  // 3.5b 驗證商品層級的出貨方式
  const shipFieldMap: Record<string, string> = {
    home_ambient:      'allow_home_ambient',
    home_refrigerated: 'allow_home_refrigerated',
    home_frozen:       'allow_home_frozen',
    cvs_ambient:       'allow_cvs_ambient',
    cvs_frozen:        'allow_cvs_frozen',
    store:             'allow_store_pickup',
  };
  const shipField = shipFieldMap[shipMethod];
  if (shipField) {
    for (const item of body.items) {
      const product = productMap.get(item.product_id) as any;
      if (!product) continue;
      if ((product as any)[shipField] === false) {
        return NextResponse.json(
          { error: `商品「${product.name}」不支援此出貨方式` },
          { status: 400 },
        );
      }
    }
  }

  // ── 4. 計算真實金額 ──
  let subtotal = 0;
  const orderItems: any[] = [];

  for (const item of body.items) {
    const product = productMap.get(item.product_id);
    if (!product) {
      return NextResponse.json({ error: `商品 ID ${item.product_id} 不存在` }, { status: 400 });
    }

    const variant = item.variant_id ? variantsMap[item.variant_id] : null;
    if (item.variant_id && !variant) {
      return NextResponse.json({ error: `規格 ID ${item.variant_id} 不存在` }, { status: 400 });
    }
    if (variant && variant.product_id !== item.product_id) {
      return NextResponse.json({ error: `規格 ID ${item.variant_id} 不屬於商品 ID ${item.product_id}` }, { status: 400 });
    }
    const variantPrice = variant
      ? (variant.price ?? (product.price + (variant.price_diff ?? 0)))
      : product.price;
    const unitPrice = item.is_redeem ? 0 : variantPrice;
    subtotal += unitPrice * item.qty;

    orderItems.push({
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      name: product.name + (variant ? ` (${variant.name})` : ''),
      price: unitPrice,
      qty: item.qty,
      is_gift: false,
      preorder_batch_id: item.preorder_batch_id ?? null,
      ship_date_id: item.ship_date_id ?? null,
    });
  }

  // ── 4.5 防重複送出（同買家手機 + 同小計 + 60 秒內有 pending 訂單）──
  const recentCutoff = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: recentDup } = await supabaseAdmin
    .from('orders')
    .select('order_no')
    .eq('buyer_phone', body.buyerPhone)
    .eq('subtotal', subtotal)
    .eq('pay_status', 'pending')
    .gt('created_at', recentCutoff)
    .maybeSingle();

  if (recentDup) {
    return NextResponse.json({
      error: '偵測到重複訂單，請勿重複送出',
      order_no: recentDup.order_no,
    }, { status: 409 });
  }

  // ── 5. 計算真實運費 ──
  const OUTER_ISLAND_CITIES = ['澎湖縣', '金門縣', '連江縣'];
  const isOuterIsland = OUTER_ISLAND_CITIES.includes(body.city ?? '');

  let shippingFee = 0;
  if (isHomeShip) {
    shippingFee = isOuterIsland
      ? ((settings as any)?.fee_home_outer_island ?? 250)
      : ((settings as any)?.fee_home ?? 100);
  } else if (isCvsShip) {
    shippingFee = (settings as any)?.fee_cvs_711 ?? 60;
  } else if (body.ship_method === 'store') {
    shippingFee = (settings as any)?.fee_store ?? 0;
  }

  if (isHomeShip || isCvsShip) {
    const threshold = isOuterIsland
      ? ((settings as any)?.free_ship_outer_island_amount ?? 0)
      : ((settings as any)?.free_ship_mainland_amount ?? 0);
    if (threshold > 0 && subtotal >= threshold) {
      shippingFee = 0;
    }
  }

  // ── 6. 優惠活動計算 ──
  let promoDiscount = 0;
  let appliedPromoIds: number[] = [];
  let giftItems: { product_id: number; variant_id: number | null; qty: number; name: string }[] = [];
  let giftProductsData: any[] = [];
  let mappedPromos: Promotion[] = [];

  const promos = promosRes.data;
  if (promos && promos.length > 0) {
    mappedPromos = promos.map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      is_active: p.is_active,
      stackable: p.stackable,
      coupon_stackable: p.coupon_stackable ?? false,
      start_at: p.start_at,
      end_at: p.end_at,
      bundle_price: p.bundle_price,
      bundle_repeatable: p.bundle_repeatable,
      gift_product_id: p.gift_product_id,
      gift_variant_id: p.gift_variant_id ?? null,
      gift_qty: p.gift_qty ?? 1,
      gift_condition_qty: p.gift_condition_qty ?? 1,
      product_ids: p.promotion_products?.map((pp: any) => pp.product_id) ?? [],
      volume_tiers: p.promotion_volume_tiers?.map((t: any) => ({ min_qty: t.min_qty, price: t.price })) ?? [],
      bundle_items: p.promotion_bundle_items?.map((bi: any) => ({ product_id: bi.product_id, qty: bi.qty })) ?? [],
    }));

    const calcItems: CartItemForCalc[] = body.items
      .filter(i => !i.is_gift && !i.is_redeem)
      .map(i => {
        const product = productMap.get(i.product_id)!;
        const variant = i.variant_id ? variantsMap[i.variant_id] : null;
        const unitPrice = variant
          ? (variant.price ?? (product.price + (variant.price_diff ?? 0)))
          : product.price;
        return { product_id: i.product_id, qty: i.qty, price: unitPrice, name: product.name };
      });

    const result = calculatePromotions(calcItems, mappedPromos);
    promoDiscount = result.total_discount;
    appliedPromoIds = result.discounts.map(d => d.promotion_id);

    // 處理贈品：並行查出贈品商品名稱 + 規格名稱
    if (result.gifts.length > 0) {
      const giftProductIds = [...new Set(result.gifts.map(g => g.product_id))];
      const giftVariantIds = result.gifts.map(g => g.variant_id).filter((v): v is number => v !== null);

      const [giftProductsRes, giftVariantsRes] = await Promise.all([
        supabaseAdmin.from('products').select('id, name, stock_mode').in('id', giftProductIds),
        giftVariantIds.length > 0
          ? supabaseAdmin.from('product_variants').select('id, name').in('id', giftVariantIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      giftProductsData = giftProductsRes.data ?? [];
      const giftNameMap = new Map(giftProductsData.map(p => [p.id, p.name]));
      const giftVariantNameMap = new Map((giftVariantsRes.data ?? []).map((v: any) => [v.id, v.name]));

      giftItems = result.gifts.map(g => {
        const baseName = giftNameMap.get(g.product_id) ?? `贈品 #${g.product_id}`;
        const variantName = g.variant_id ? giftVariantNameMap.get(g.variant_id) : null;
        return {
          product_id: g.product_id,
          variant_id: g.variant_id,
          qty: g.qty,
          name: variantName ? `${baseName}（${variantName}）` : baseName,
        };
      });
    }
  }

  // ── 7. 折扣碼驗證 ──
  let discount = 0;
  let couponClaimedId: number | null = null;
  let couponStackable = true;

  const coupon = couponRes.data;
  if (coupon && body.coupon_code) {
    const now = new Date();
    const notExpired = !coupon.expires_at || new Date(coupon.expires_at) > now;
    const meetsMin = !coupon.min_amount || subtotal >= coupon.min_amount;
    const scope = coupon.user_scope ?? 'all';
    const scopeOk = scope === 'all'
      || (scope === 'member_only' && memberId)
      || (scope === 'guest_only' && !memberId);

    if (notExpired && meetsMin && scopeOk) {
      couponStackable = coupon.stackable ?? true;
      discount = coupon.type === 'percent'
        ? Math.floor(subtotal * coupon.value / 100)
        : Math.min(coupon.value, subtotal);

      const { data: claimed } = await supabaseAdmin
        .rpc('claim_coupon_usage', { p_coupon_id: coupon.id });

      if (!claimed) {
        discount = 0;
      } else {
        couponClaimedId = coupon.id;
      }
    }
  }

  // ── 7.8 stackable 互斥邏輯 ──
  if (discount > 0 && promoDiscount > 0) {
    const hasNonCouponStackablePromo = appliedPromoIds.some(pid => {
      const p = mappedPromos.find(pr => pr.id === pid);
      return p && !p.coupon_stackable;
    });
    if (!couponStackable || hasNonCouponStackablePromo) {
      if (discount >= promoDiscount) {
        promoDiscount = 0;
        appliedPromoIds = [];
      } else {
        if (couponClaimedId) {
          const { data: cur } = await supabaseAdmin
            .from('coupons').select('used_count').eq('id', couponClaimedId).single();
          if (cur && cur.used_count > 0) {
            const { data: releasedCoupon } = await supabaseAdmin
              .from('coupons')
              .update({ used_count: cur.used_count - 1 })
              .eq('id', couponClaimedId)
              .eq('used_count', cur.used_count)
              .select('id');
            if (!releasedCoupon || releasedCoupon.length === 0) {
              // 樂觀鎖失敗 → 重讀重試一次
              const { data: retry } = await supabaseAdmin
                .from('coupons').select('used_count').eq('id', couponClaimedId).single();
              if (retry && (retry.used_count ?? 0) > 0) {
                await supabaseAdmin.from('coupons')
                  .update({ used_count: retry.used_count - 1 })
                  .eq('id', couponClaimedId!)
                  .eq('used_count', retry.used_count)
                  .select('id');
              }
            }
          }
        }
        discount = 0;
        couponClaimedId = null;
      }
    }
  }

  // ── 7.9 偵測 date_mode 贈品（用已查到的 giftProductsData，不再重複查 DB）──
  const dateModeGiftProductIds = new Set<number>();
  giftProductsData.forEach((gp: any) => {
    if (gp.stock_mode === 'date_mode') dateModeGiftProductIds.add(gp.id);
  });

  // ── 8. 批次庫存預檢（一次查出所有庫存，取代迴圈）──
  const allItemsForInventory = [
    ...body.items.map(i => ({ product_id: i.product_id, variant_id: i.variant_id ?? null, qty: i.qty, is_redeem: i.is_redeem, ship_date_id: i.ship_date_id ?? null })),
    ...giftItems.map(g => ({ product_id: g.product_id, variant_id: g.variant_id ?? null, qty: g.qty, is_redeem: false, ship_date_id: null })),
  ];

  const allProductIdsForInv = [...new Set(allItemsForInventory.map(i => i.product_id))];
  const { data: allInventory } = await supabaseAdmin
    .from('inventory')
    .select('*')
    .in('product_id', allProductIdsForInv);

  // 建立庫存查找表：key = "product_id" 或 "product_id_variant_id"
  const inventoryMap = new Map<string, any>();
  (allInventory ?? []).forEach(inv => {
    const key = inv.variant_id ? `${inv.product_id}_${inv.variant_id}` : `${inv.product_id}`;
    inventoryMap.set(key, inv);
  });

  // 按庫存 key 彙總需求量（同一商品可能同時出現在一般品和贈品中）
  const invQtyAgg = new Map<string, { product_id: number; variant_id: number | null; totalQty: number; nonRedeemQty: number }>();
  for (const item of allItemsForInventory) {
    if (item.ship_date_id) continue;
    if (dateModeGiftProductIds.has(item.product_id)) continue;
    const key = item.variant_id ? `${item.product_id}_${item.variant_id}` : `${item.product_id}`;
    const existing = invQtyAgg.get(key);
    if (existing) {
      existing.totalQty += item.qty;
      if (!item.is_redeem) existing.nonRedeemQty += item.qty;
    } else {
      invQtyAgg.set(key, {
        product_id: item.product_id,
        variant_id: item.variant_id,
        totalQty: item.qty,
        nonRedeemQty: item.is_redeem ? 0 : item.qty,
      });
    }
  }

  // 預檢所有商品 + 贈品庫存（使用彙總後的數量，避免同商品分開檢查漏算）
  for (const [key, agg] of invQtyAgg) {
    if (agg.nonRedeemQty === 0) continue; // 全是兌換品，跳過預檢
    const inv = inventoryMap.get(key);
    if (!inv) continue;

    if (inv.inventory_mode === 'stock') {
      const available = inv.stock - inv.reserved;
      if (available < agg.nonRedeemQty) {
        const pName = productMap.get(agg.product_id)?.name ?? `ID ${agg.product_id}`;
        return NextResponse.json(
          { error: `「${pName}」庫存不足（剩餘 ${available} 件）` },
          { status: 400 },
        );
      }
    } else if (inv.inventory_mode === 'preorder' && inv.max_preorder) {
      const available = inv.max_preorder - inv.reserved_preorder;
      if (available < agg.nonRedeemQty) {
        const pName = productMap.get(agg.product_id)?.name ?? `ID ${agg.product_id}`;
        return NextResponse.json(
          { error: `「${pName}」預購額度不足（剩餘 ${available} 件）` },
          { status: 400 },
        );
      }
    }
  }

  // ── 8.5 預購批次額度預檢 + 樂觀鎖預留 ──
  const preorderItems = body.items.filter(i => i.preorder_batch_id);
  const batchLockResults: { batchId: number; oldReserved: number; newReserved: number }[] = [];
  let batchRows: any[] = [];

  if (preorderItems.length > 0) {
    // 按 batch_id 加總本次訂單的需求量
    const batchQtyMap: Record<number, number> = {};
    preorderItems.forEach(i => {
      batchQtyMap[i.preorder_batch_id!] = (batchQtyMap[i.preorder_batch_id!] ?? 0) + i.qty;
    });

    const batchIds = Object.keys(batchQtyMap).map(Number);

    // 查詢批次（含 reserved + ship_date 欄位）
    const { data: batchData } = await supabaseAdmin
      .from('preorder_batches')
      .select('id, limit_qty, reserved, ship_date')
      .in('id', batchIds);
    batchRows = batchData ?? [];

    // 預檢：先確認所有批次額度足夠
    for (const batch of (batchRows ?? [])) {
      const limitQty = batch.limit_qty ?? 0;
      const currentReserved = batch.reserved ?? 0;
      const needed = batchQtyMap[batch.id] ?? 0;
      if (limitQty > 0 && currentReserved + needed > limitQty) {
        return NextResponse.json(
          { error: `預購批次額度不足（剩餘 ${limitQty - currentReserved} 件，需要 ${needed} 件）` },
          { status: 400 },
        );
      }
    }

    // 並行樂觀鎖：每個 batch 是不同的 row，可同時更新
    const batchLockPromises = (batchRows ?? []).map(async (batch) => {
      const currentReserved = batch.reserved ?? 0;
      const needed = batchQtyMap[batch.id] ?? 0;
      const newReserved = currentReserved + needed;
      let lockQuery = supabaseAdmin
        .from('preorder_batches')
        .update({ reserved: newReserved })
        .eq('id', batch.id);
      if (batch.reserved === null || batch.reserved === undefined) {
        lockQuery = lockQuery.is('reserved', null);
      } else {
        lockQuery = lockQuery.eq('reserved', currentReserved);
      }
      const { data: updated, error: batchErr } = await lockQuery.select('id');
      return { batch, currentReserved, newReserved, ok: !batchErr && updated && updated.length > 0 };
    });

    const batchLockOuts = await Promise.all(batchLockPromises);
    const batchLockFailed = batchLockOuts.some(r => !r.ok);

    // 記錄成功的鎖定（無論是否有失敗，都要記錄以便回滾）
    for (const r of batchLockOuts) {
      if (r.ok) batchLockResults.push({ batchId: r.batch.id, oldReserved: r.currentReserved, newReserved: r.newReserved });
    }

    if (batchLockFailed) {
      // 回滾所有已成功的批次
      for (const prev of batchLockResults) {
        await supabaseAdmin.from('preorder_batches')
          .update({ reserved: prev.oldReserved })
          .eq('id', prev.batchId)
          .eq('reserved', prev.newReserved);
      }
      return NextResponse.json({ error: '預購批次額度已被其他訂單搶先預留，請重新下單' }, { status: 409 });
    }
  }

  // ── 8.6 驗證出貨日 ──
  const shipDateLockResults: { id: number; oldReserved: number; newReserved: number }[] = [];
  if (body.ship_date) {
    const shipDate = body.ship_date;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = fmt(today);

    // 不能是過去日期
    if (shipDate < todayStr) {
      return NextResponse.json({ error: '出貨日不可早於今天' }, { status: 400 });
    }

    // 判斷是否純預購
    const allPreorder = body.items.every((i: any) => {
      const p = productMap.get(i.product_id);
      return p?.is_preorder;
    });

    if (allPreorder && batchRows.length > 0) {
      // 純預購：ship_date 必須等於最晚批次日期
      const latestBatchDate = batchRows
        .map((b: any) => b.ship_date).filter(Boolean).sort().reverse()[0];
      if (latestBatchDate && shipDate !== latestBatchDate) {
        return NextResponse.json(
          { error: `純預購訂單出貨日必須為 ${latestBatchDate}` },
          { status: 400 },
        );
      }
    } else if (allPreorder && batchRows.length === 0) {
      // 純預購但無批次資料（可能是舊購物車未帶 preorder_batch_id）→ 跳過驗證
      console.warn('[orders] 純預購但無批次資料，跳過 ship_date 驗證', { shipDate, items: body.items.map((i: any) => ({ product_id: i.product_id, preorder_batch_id: i.preorder_batch_id })) });
    } else {
      // 一般 or 混購：計算合法日期集合
      const shipMinDays = settings?.ship_min_days ?? 1;
      const shipMaxDays = settings?.ship_max_days ?? 14;
      const blockedWeekdays = JSON.parse(settings?.ship_blocked_weekdays ?? '["0","6"]');
      const globalBlockedDates = JSON.parse(settings?.ship_blocked_dates ?? '[]');

      let validDates: Set<string> | null = null;

      // 收集有 ship_date_id 的商品 ID，後續走 product_ship_dates 驗證
      // （靠 ship_date_id 而非 stock_mode，因為商品可能已切回總量模式）
      const dateModeProductIds: number[] = [];

      for (const item of body.items) {
        const product = productMap.get(item.product_id);
        if (!product || product.is_preorder) continue;

        // 有 ship_date_id 的項目用 product_ship_dates 表驗證，不走 generateStockModeDates
        if (item.ship_date_id) {
          if (!dateModeProductIds.includes(item.product_id)) {
            dateModeProductIds.push(item.product_id);
          }
          continue;
        }

        const productBlocked = JSON.parse(product.ship_blocked_dates ?? '[]');
        const dates = generateStockModeDates(
          today, shipMinDays, shipMaxDays,
          blockedWeekdays, globalBlockedDates,
          product.ship_start_date, product.ship_end_date, productBlocked,
        );
        if (validDates === null) {
          validDates = new Set(dates);
        } else {
          for (const d of validDates) { if (!dates.has(d)) validDates.delete(d); }
        }
      }

      // date_mode 商品：查 product_ship_dates，逐項驗證 ship_date_id
      let shipDatesData: any[] | null = null;
      if (dateModeProductIds.length > 0) {
        const { data: _sdData } = await supabaseAdmin
          .from('product_ship_dates')
          .select('id, product_id, variant_id, ship_date, capacity, reserved')
          .in('product_id', dateModeProductIds)
          .eq('is_open', true)
          .gt('capacity', 0);
        shipDatesData = _sdData;

        // 逐項驗證每個有 ship_date_id 的商品
        for (const item of body.items) {
          if (!item.ship_date_id) continue;
          const product = productMap.get(item.product_id);
          if (!product) continue;
          if (!item.ship_date_id) {
            return NextResponse.json(
              { error: `「${product.name}」缺少出貨日期，請重新選擇` },
              { status: 400 },
            );
          }
          const rec = (shipDatesData ?? []).find((d: any) => d.id === item.ship_date_id);
          if (!rec) {
            return NextResponse.json(
              { error: `「${product.name}」的出貨日期已關閉或不存在，請重新選擇` },
              { status: 400 },
            );
          }
          if ((rec.capacity - rec.reserved) < item.qty) {
            return NextResponse.json(
              { error: `「${product.name}」該日期剩餘名額不足，請減少數量或選擇其他日期` },
              { status: 400 },
            );
          }
        }

        // 如果訂單只有 ship_date_id 商品且 validDates 仍為 null，用其日期填充
        if (validDates === null) {
          const dateModeShipDates = body.items
            .filter(i => i.ship_date_id)
            .map(i => {
              const r = (shipDatesData ?? []).find((d: any) => d.id === i.ship_date_id);
              return r?.ship_date as string;
            })
            .filter(Boolean);
          validDates = new Set(dateModeShipDates);
        }
      }

      // 混購：過濾 >= 預購批次最晚日期
      if (preorderItems.length > 0 && batchRows.length > 0 && validDates) {
        const latestBatchDate = batchRows
          .map((b: any) => b.ship_date).filter(Boolean).sort().reverse()[0];
        if (latestBatchDate) {
          for (const d of validDates) { if (d < latestBatchDate) validDates.delete(d); }
        }
      }

      // 驗證
      if (validDates === null) {
        // 非純預購但一般商品日期集合為空（異常）
        return NextResponse.json({ error: '無法驗證出貨日期，請稍後再試' }, { status: 400 });
      }
      if (!validDates.has(shipDate)) {
        return NextResponse.json({ error: '所選出貨日期不在可選範圍內，請重新選擇' }, { status: 400 });
      }

      // 有 ship_date_id 的商品：預留 product_ship_dates 額度（樂觀鎖）
      if (shipDatesData && dateModeProductIds.length > 0) {
        // Phase 1: 預檢所有 date_mode 項目（不做 DB 寫入）
        const shipDateLockPlan: { item: typeof body.items[0]; rec: any; oldReserved: number; newReserved: number }[] = [];
        for (const item of body.items) {
          if (!item.ship_date_id) continue;
          const product = productMap.get(item.product_id);
          if (!product) continue;
          const rec = shipDatesData.find((d: any) => d.id === item.ship_date_id);
          if (!rec) {
            const pName = product.name ?? `ID ${item.product_id}`;
            return NextResponse.json({ error: `「${pName}」無該日期的接單資料，請重新整理後再試` }, { status: 400 });
          }
          const oldReserved = rec.reserved ?? 0;
          const newReserved = oldReserved + item.qty;
          if (newReserved > rec.capacity) {
            const pName = product.name ?? `ID ${item.product_id}`;
            return NextResponse.json({ error: `「${pName}」該日期剩餘名額不足（剩 ${rec.capacity - oldReserved}），請減少數量或選擇其他日期` }, { status: 400 });
          }
          shipDateLockPlan.push({ item, rec, oldReserved, newReserved });
        }

        // Phase 2: 並行鎖定（每個是不同 row，可同時更新）
        if (shipDateLockPlan.length > 0) {
          const sdLockPromises = shipDateLockPlan.map(async ({ item, rec, oldReserved, newReserved }) => {
            const { data: updated } = await supabaseAdmin
              .from('product_ship_dates')
              .update({ reserved: newReserved })
              .eq('id', rec.id)
              .eq('reserved', oldReserved)
              .select('id');
            return { item, rec, oldReserved, newReserved, ok: !!(updated && updated.length > 0) };
          });

          const sdLockOuts = await Promise.all(sdLockPromises);

          // 記錄成功的鎖定
          for (const r of sdLockOuts) {
            if (r.ok) {
              shipDateLockResults.push({ id: r.rec.id, oldReserved: r.oldReserved, newReserved: r.newReserved });
              const oi = orderItems.find(o =>
                o.product_id === r.item.product_id &&
                (o.variant_id ?? null) === (r.item.variant_id ?? null) &&
                o.ship_date_id === r.rec.id &&
                !o.is_gift
              );
              if (oi) (oi as any).ship_date_id = r.rec.id;
            }
          }

          // 任一失敗 → 回滾所有成功的
          if (sdLockOuts.some(r => !r.ok)) {
            for (let ri = shipDateLockResults.length - 1; ri >= 0; ri--) {
              const prev = shipDateLockResults[ri];
              await supabaseAdmin.from('product_ship_dates')
                .update({ reserved: prev.oldReserved })
                .eq('id', prev.id)
                .eq('reserved', prev.newReserved);
            }
            return NextResponse.json({ error: '出貨日額度已被其他訂單搶先預留，請重新選擇日期' }, { status: 409 });
          }
        }
      }
    }
  }

  // ── 8.8 贈品 date_mode 容量預留 ──
  if (body.ship_date && giftItems.length > 0 && dateModeGiftProductIds.size > 0) {
    const dmGiftPids = [...dateModeGiftProductIds];
    const { data: giftShipDates } = await supabaseAdmin
      .from('product_ship_dates')
      .select('id, product_id, variant_id, ship_date, capacity, reserved')
      .in('product_id', dmGiftPids)
      .eq('ship_date', body.ship_date)
      .eq('is_open', true);

    for (const gift of giftItems) {
      if (!dateModeGiftProductIds.has(gift.product_id)) continue;
      const rec = (giftShipDates ?? []).find((d: any) =>
        d.product_id === gift.product_id &&
        (d.variant_id ?? null) === (gift.variant_id ?? null)
      );
      if (!rec) continue; // 贈品無對應日期記錄 → 跳過（不阻擋下單）
      const oldReserved = rec.reserved ?? 0;
      const newReserved = oldReserved + gift.qty;
      if (newReserved > rec.capacity) continue; // 贈品容量不足 → 跳過
      const { data: updated } = await supabaseAdmin
        .from('product_ship_dates')
        .update({ reserved: newReserved })
        .eq('id', rec.id)
        .eq('reserved', oldReserved)
        .select('id');
      if (updated && updated.length > 0) {
        shipDateLockResults.push({ id: rec.id, oldReserved, newReserved });
        (gift as any).ship_date_id = rec.id;
      }
    }
  }

  // ── 9. 計算最終應付金額 ──
  const total = Math.max(0, subtotal - discount - promoDiscount) + shippingFee;

  // ── 10. 寫入訂單 ──
  const orderNo = generateOrderNo();
  const isHome = (body.ship_method as string).startsWith('home');
  const fullAddress = isHome
    ? `${body.city ?? ''}${body.district ?? ''}${body.address ?? ''}`
    : body.ship_method === 'store' ? null : (body.address ?? null);

  const payToken = crypto.randomUUID();

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      order_no:       orderNo,
      member_id:      memberId ?? null,
      buyer_name:     body.buyerName,
      buyer_phone:    body.buyerPhone,
      buyer_email:    body.buyerEmail,
      customer_name:  body.customerName,
      customer_email: body.customerEmail,
      customer_phone: body.customerPhone,
      ship_method: body.ship_method,
      city:        body.city ?? null,
      district:    body.district ?? null,
      address:     fullAddress,
      cvs_store_id:      body.cvs_store_id ?? null,
      cvs_store_name:    body.cvs_store_name ?? null,
      cvs_store_address: body.cvs_store_address ?? null,
      cvs_store_brand:   body.cvs_store_brand ?? null,
      ship_date:   body.ship_date ?? null,
      note:        body.note ?? null,
      subtotal,
      discount,
      promo_discount: promoDiscount,
      shipping_fee: shippingFee,
      total,
      coupon_code:  body.coupon_code?.toUpperCase() ?? null,
      pay_method:   body.pay_method,
      pay_status:   'pending',
      status:       'processing',
      pay_token:    payToken,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('訂單建立失敗:', orderError);
    // 回滾預購批次預留
    for (const prev of batchLockResults) {
      await supabaseAdmin.from('preorder_batches')
        .update({ reserved: prev.oldReserved })
        .eq('id', prev.batchId)
        .eq('reserved', prev.newReserved);
    }
    // 回滾日期模式預留
    for (let ri = shipDateLockResults.length - 1; ri >= 0; ri--) {
      const prev = shipDateLockResults[ri];
      await supabaseAdmin.from('product_ship_dates')
        .update({ reserved: prev.oldReserved })
        .eq('id', prev.id)
        .eq('reserved', prev.newReserved);
    }
    if (couponClaimedId) {
      try {
        await supabaseAdmin.rpc('release_coupon_usage', { p_coupon_id: couponClaimedId });
      } catch {
        const { data: c } = await supabaseAdmin.from('coupons').select('used_count').eq('id', couponClaimedId).single();
        if (c) await supabaseAdmin.from('coupons').update({ used_count: Math.max((c.used_count ?? 1) - 1, 0) }).eq('id', couponClaimedId).eq('used_count', c.used_count);
      }
    }
    return NextResponse.json({ error: `訂單建立失敗：${orderError?.message ?? '未知錯誤'}` }, { status: 500 });
  }

  // ── 11. 寫入訂單明細 ──
  for (const gift of giftItems) {
    orderItems.push({
      product_id: gift.product_id,
      variant_id: gift.variant_id ?? null,
      name: gift.name,
      price: 0,
      qty: gift.qty,
      is_gift: true,
      ship_date_id: (gift as any).ship_date_id ?? null,
    });
  }

  const itemsWithOrderId = orderItems.map(item => ({ ...item, order_id: order.id }));

  const { error: itemsError } = await supabaseAdmin
    .from('order_items')
    .insert(itemsWithOrderId);

  if (itemsError) {
    console.error('訂單明細寫入失敗:', itemsError);
    await supabaseAdmin.from('orders').delete().eq('id', order.id);
    for (const prev of batchLockResults) {
      await supabaseAdmin.from('preorder_batches')
        .update({ reserved: prev.oldReserved })
        .eq('id', prev.batchId)
        .eq('reserved', prev.newReserved);
    }
    for (let ri = shipDateLockResults.length - 1; ri >= 0; ri--) {
      const prev = shipDateLockResults[ri];
      await supabaseAdmin.from('product_ship_dates')
        .update({ reserved: prev.oldReserved })
        .eq('id', prev.id)
        .eq('reserved', prev.newReserved);
    }
    if (couponClaimedId) {
      try {
        await supabaseAdmin.rpc('release_coupon_usage', { p_coupon_id: couponClaimedId });
      } catch {
        const { data: c } = await supabaseAdmin.from('coupons').select('used_count').eq('id', couponClaimedId).single();
        if (c) await supabaseAdmin.from('coupons').update({ used_count: Math.max((c.used_count ?? 1) - 1, 0) }).eq('id', couponClaimedId).eq('used_count', c.used_count);
      }
    }
    return NextResponse.json({ error: `訂單明細寫入失敗：${itemsError.message}` }, { status: 500 });
  }

  // ── 12. 預留庫存（按彙總 key 並行更新，避免同商品多筆競態）──
  const inventoryLogs: any[] = [];
  const lockFailures: number[] = [];

  await Promise.all([...invQtyAgg.entries()].map(async ([key, agg]) => {
    const inv = inventoryMap.get(key);
    if (!inv) return;

    const isStock = inv.inventory_mode === 'stock';
    const isPreorder = inv.inventory_mode === 'preorder';

    if (isStock) {
      const { data: updated } = await supabaseAdmin
        .from('inventory')
        .update({ reserved: inv.reserved + agg.totalQty, updated_at: new Date().toISOString() })
        .eq('id', inv.id)
        .eq('reserved', inv.reserved) // 樂觀鎖
        .select('id');

      if (!updated || updated.length === 0) {
        lockFailures.push(agg.product_id);
        return;
      }

      inventoryLogs.push({
        inventory_id: inv.id,
        product_id: agg.product_id,
        variant_id: agg.variant_id ?? null,
        change_type: 'order',
        qty_before: inv.reserved,
        qty_after: inv.reserved + agg.totalQty,
        qty_change: agg.totalQty,
        reason: `訂單 #${order.id}`,
        admin_name: '系統',
        order_id: order.id,
      });
    } else if (isPreorder) {
      const { data: updated } = await supabaseAdmin
        .from('inventory')
        .update({ reserved_preorder: inv.reserved_preorder + agg.totalQty, updated_at: new Date().toISOString() })
        .eq('id', inv.id)
        .eq('reserved_preorder', inv.reserved_preorder) // 樂觀鎖
        .select('id');

      if (!updated || updated.length === 0) {
        lockFailures.push(agg.product_id);
        return;
      }

      inventoryLogs.push({
        inventory_id: inv.id,
        product_id: agg.product_id,
        variant_id: agg.variant_id ?? null,
        change_type: 'order',
        qty_before: inv.reserved_preorder,
        qty_after: inv.reserved_preorder + agg.totalQty,
        qty_change: agg.totalQty,
        reason: `訂單 #${order.id}`,
        admin_name: '系統',
        order_id: order.id,
      });
    }
  }));

  // 樂觀鎖失敗 → 回滾訂單 + 批次預留 + 日期預留 + 折價券
  if (lockFailures.length > 0) {
    await supabaseAdmin.from('order_items').delete().eq('order_id', order.id);
    await supabaseAdmin.from('orders').delete().eq('id', order.id);
    for (const prev of batchLockResults) {
      await supabaseAdmin.from('preorder_batches')
        .update({ reserved: prev.oldReserved })
        .eq('id', prev.batchId)
        .eq('reserved', prev.newReserved);
    }
    for (let ri = shipDateLockResults.length - 1; ri >= 0; ri--) {
      const prev = shipDateLockResults[ri];
      await supabaseAdmin.from('product_ship_dates')
        .update({ reserved: prev.oldReserved })
        .eq('id', prev.id)
        .eq('reserved', prev.newReserved);
    }
    if (couponClaimedId) {
      try {
        await supabaseAdmin.rpc('release_coupon_usage', { p_coupon_id: couponClaimedId });
      } catch {
        const { data: c } = await supabaseAdmin.from('coupons').select('used_count').eq('id', couponClaimedId).single();
        if (c) await supabaseAdmin.from('coupons').update({ used_count: Math.max((c.used_count ?? 1) - 1, 0) }).eq('id', couponClaimedId).eq('used_count', c.used_count);
      }
    }
    return NextResponse.json({ error: '庫存已被其他訂單搶先預留，請重新下單' }, { status: 409 });
  }

  // 批次寫入所有庫存 log（一次 insert）
  if (inventoryLogs.length > 0) {
    await supabaseAdmin.from('inventory_logs').insert(inventoryLogs);
  }

  // ── 13. 處理兌換品（僅會員）──
  if (memberId && body.redemption_id) {
    const { data: redeemLinked } = await supabaseAdmin
      .from('redemptions')
      .update({ status: 'pending_order', order_id: order.id, updated_at: new Date().toISOString() })
      .eq('id', body.redemption_id)
      .eq('member_id', memberId)
      .eq('status', 'pending_cart')
      .select('id');

    if (redeemLinked && redeemLinked.length > 0) {
      await supabaseAdmin
        .from('orders')
        .update({ redemption_id: body.redemption_id, redeem_stamps: 1 })
        .eq('id', order.id);
    } else {
      console.warn(`[orders] 兌換連結失敗 redemption_id=${body.redemption_id}，可能已過期或被取消`);
    }
  }

  // ── 14. 回傳結果 ──
  return NextResponse.json({
    ok:         true,
    order_id:   order.id,
    order_no:   orderNo,
    total,
    pay_method: body.pay_method,
    pay_token:  payToken,
  });
}
