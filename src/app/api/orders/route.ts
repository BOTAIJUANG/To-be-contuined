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
  product_id:   number;
  variant_id?:  number | null;
  qty:          number;
  is_redeem?:   boolean;
  is_gift?:     boolean;
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
  // ── 配送方式白名單 + 條件必填驗證 ──
  const ALLOWED_SHIP_METHODS = ['home', 'cvs_711', 'store'];
  if (!body.ship_method || !ALLOWED_SHIP_METHODS.includes(body.ship_method)) {
    return NextResponse.json({ error: '配送方式不合法' }, { status: 400 });
  }
  const isHomeShip = body.ship_method === 'home';
  const isCvsShip  = body.ship_method === 'cvs_711';
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
    // 商品真實價格
    supabaseAdmin.from('products').select('id, name, slug, price, image_url').in('id', productIds),
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
    });
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
        supabaseAdmin.from('products').select('id, name').in('id', giftProductIds),
        giftVariantIds.length > 0
          ? supabaseAdmin.from('product_variants').select('id, name').in('id', giftVariantIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const giftNameMap = new Map((giftProductsRes.data ?? []).map(p => [p.id, p.name]));
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
        : coupon.value;

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
            await supabaseAdmin
              .from('coupons')
              .update({ used_count: cur.used_count - 1 })
              .eq('id', couponClaimedId);
          }
        }
        discount = 0;
        couponClaimedId = null;
      }
    }
  }

  // ── 8. 批次庫存預檢（一次查出所有庫存，取代迴圈）──
  const allItemsForInventory = [
    ...body.items.map(i => ({ product_id: i.product_id, variant_id: i.variant_id ?? null, qty: i.qty, is_redeem: i.is_redeem })),
    ...giftItems.map(g => ({ product_id: g.product_id, variant_id: g.variant_id ?? null, qty: g.qty, is_redeem: false })),
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

  // 預檢所有商品 + 贈品庫存
  for (const item of allItemsForInventory) {
    if (item.is_redeem) continue;
    const key = item.variant_id ? `${item.product_id}_${item.variant_id}` : `${item.product_id}`;
    const inv = inventoryMap.get(key);
    if (!inv) continue;

    if (inv.inventory_mode === 'stock') {
      const available = inv.stock - inv.reserved;
      if (available < item.qty) {
        const pName = productMap.get(item.product_id)?.name ?? `ID ${item.product_id}`;
        return NextResponse.json(
          { error: `「${pName}」庫存不足（剩餘 ${available} 件）` },
          { status: 400 },
        );
      }
    } else if (inv.inventory_mode === 'preorder' && inv.max_preorder) {
      const available = inv.max_preorder - inv.reserved_preorder;
      if (available < item.qty) {
        const pName = productMap.get(item.product_id)?.name ?? `ID ${item.product_id}`;
        return NextResponse.json(
          { error: `「${pName}」預購額度不足（剩餘 ${available} 件）` },
          { status: 400 },
        );
      }
    }
  }

  // ── 9. 計算最終應付金額 ──
  const total = Math.max(0, subtotal - discount - promoDiscount) + shippingFee;

  // ── 10. 寫入訂單 ──
  const orderNo = generateOrderNo();
  const isHome = body.ship_method === 'home';
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
    if (couponClaimedId) {
      try {
        await supabaseAdmin.rpc('release_coupon_usage', { p_coupon_id: couponClaimedId });
      } catch {
        const { data: c } = await supabaseAdmin.from('coupons').select('used_count').eq('id', couponClaimedId).single();
        if (c) await supabaseAdmin.from('coupons').update({ used_count: Math.max((c.used_count ?? 1) - 1, 0) }).eq('id', couponClaimedId);
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
    });
  }

  const itemsWithOrderId = orderItems.map(item => ({ ...item, order_id: order.id }));

  const { error: itemsError } = await supabaseAdmin
    .from('order_items')
    .insert(itemsWithOrderId);

  if (itemsError) {
    console.error('訂單明細寫入失敗:', itemsError);
    await supabaseAdmin.from('orders').delete().eq('id', order.id);
    return NextResponse.json({ error: `訂單明細寫入失敗：${itemsError.message}` }, { status: 500 });
  }

  // ── 12. 預留庫存（並行更新 + 批次寫 log）──
  const inventoryLogs: any[] = [];
  const lockFailures: number[] = [];

  await Promise.all(allItemsForInventory.map(async (item) => {
    const key = item.variant_id ? `${item.product_id}_${item.variant_id}` : `${item.product_id}`;
    const inv = inventoryMap.get(key);
    if (!inv) return;

    const isStock = inv.inventory_mode === 'stock';
    const isPreorder = inv.inventory_mode === 'preorder';

    if (isStock) {
      const available = inv.stock - inv.reserved;
      if (!item.is_redeem && available < item.qty) return; // 前面已預檢過

      const { data: updated } = await supabaseAdmin
        .from('inventory')
        .update({ reserved: inv.reserved + item.qty, updated_at: new Date().toISOString() })
        .eq('id', inv.id)
        .eq('reserved', inv.reserved) // 樂觀鎖
        .select('id');

      if (!updated || updated.length === 0) {
        // 樂觀鎖失敗：庫存被其他請求搶先修改
        lockFailures.push(item.product_id);
        return;
      }

      inventoryLogs.push({
        inventory_id: inv.id,
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        change_type: 'order',
        qty_before: inv.reserved,
        qty_after: inv.reserved + item.qty,
        qty_change: item.qty,
        reason: `訂單 #${order.id}`,
        admin_name: '系統',
        order_id: order.id,
      });
    } else if (isPreorder) {
      const { data: updated } = await supabaseAdmin
        .from('inventory')
        .update({ reserved_preorder: inv.reserved_preorder + item.qty, updated_at: new Date().toISOString() })
        .eq('id', inv.id)
        .eq('reserved_preorder', inv.reserved_preorder) // 樂觀鎖
        .select('id');

      if (!updated || updated.length === 0) {
        lockFailures.push(item.product_id);
        return;
      }

      inventoryLogs.push({
        inventory_id: inv.id,
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        change_type: 'order',
        qty_before: inv.reserved_preorder,
        qty_after: inv.reserved_preorder + item.qty,
        qty_change: item.qty,
        reason: `訂單 #${order.id}`,
        admin_name: '系統',
        order_id: order.id,
      });
    }
  }));

  // 樂觀鎖失敗 → 回滾訂單
  if (lockFailures.length > 0) {
    await supabaseAdmin.from('order_items').delete().eq('order_id', order.id);
    await supabaseAdmin.from('orders').delete().eq('id', order.id);
    return NextResponse.json({ error: '庫存已被其他訂單搶先預留，請重新下單' }, { status: 409 });
  }

  // 批次寫入所有庫存 log（一次 insert）
  if (inventoryLogs.length > 0) {
    await supabaseAdmin.from('inventory_logs').insert(inventoryLogs);
  }

  // ── 13. 處理兌換品（僅會員）──
  if (memberId && body.redemption_id) {
    await Promise.all([
      supabaseAdmin
        .from('redemptions')
        .update({ status: 'pending_order', order_id: order.id, updated_at: new Date().toISOString() })
        .eq('id', body.redemption_id),
      supabaseAdmin
        .from('orders')
        .update({ redemption_id: body.redemption_id, redeem_stamps: 1 })
        .eq('id', order.id),
    ]);
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
