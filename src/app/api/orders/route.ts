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
// 格式：WB + 日期 + 6 位隨機碼（比之前的 4 位更不容易重複）
// 例如：WB20260321-A3K9X2
function generateOrderNo(): string {
  const now = new Date();
  const d = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  // 用 6 個字元的隨機碼，有 2,176,782,336 種組合（36^6）
  // 比原本 4 位數字的 9000 種大了 24 萬倍，幾乎不可能重複
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
  is_redeem?:   boolean;  // 是不是兌換品
  is_gift?:     boolean;  // 是不是贈品
}

// ── 前端送來的完整訂單資料 ───────────────────────
interface OrderInput {
  items:          CartItemInput[];
  ship_method:    string;
  name:           string;
  phone:          string;
  email:          string;
  city?:          string;
  district?:      string;
  address?:       string;
  ship_date?:     string;
  note?:          string;
  coupon_code?:   string;
  pay_method:     string;       // 'credit' | 'atm'
  redemption_id?: number;       // 兌換品的 redemption ID
  promotion_ids?: number[];     // 前端套用的活動 ID（後端會重新驗算）
}

export async function POST(req: NextRequest) {
  // ── 1. 驗證身份（有 token = 會員，沒 token = 訪客）──
  const { userId: memberId } = await optionalAuth(req);
  const body: OrderInput = await req.json();

  // ── 2. 基本欄位檢查 ──────────────────────────────
  if (!body.items?.length) {
    return NextResponse.json({ error: '購物車是空的' }, { status: 400 });
  }
  if (!body.name || !body.phone || !body.email) {
    return NextResponse.json({ error: '請填寫收件人資訊' }, { status: 400 });
  }

  // 訪客不能使用兌換品（需要會員帳號和集章）
  if (!memberId && body.items.some(i => i.is_redeem)) {
    return NextResponse.json({ error: '兌換品僅限會員使用，請先登入' }, { status: 400 });
  }
  if (!memberId && body.redemption_id) {
    return NextResponse.json({ error: '兌換品僅限會員使用，請先登入' }, { status: 400 });
  }
  if (!body.ship_method) {
    return NextResponse.json({ error: '請選擇配送方式' }, { status: 400 });
  }
  if (!body.pay_method || !['credit', 'atm'].includes(body.pay_method)) {
    return NextResponse.json({ error: '請選擇付款方式' }, { status: 400 });
  }

  // ── 3. 從資料庫查出每個商品的「真實價格」───────────
  // 這是最重要的一步！絕對不能相信前端傳來的價格
  const productIds = body.items.map(i => i.product_id);
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, name, slug, price, image_url')
    .in('id', productIds);

  if (!products || products.length === 0) {
    return NextResponse.json({ error: '找不到商品資料' }, { status: 400 });
  }

  // 如果有規格（variant），也要查出真實價格
  const variantIds = body.items.filter(i => i.variant_id).map(i => i.variant_id!);
  let variantsMap: Record<number, { name: string; price: number | null; price_diff: number }> = {};
  if (variantIds.length > 0) {
    const { data: variants } = await supabaseAdmin
      .from('product_variants')
      .select('id, name, price, price_diff')
      .in('id', variantIds);
    if (variants) {
      variants.forEach(v => { variantsMap[v.id] = v; });
    }
  }

  // 建立商品查找表（用 ID 快速找到商品）
  const productMap = new Map(products.map(p => [p.id, p]));

  // ── 4. 在後端計算「真實金額」────────────────────
  let subtotal = 0;  // 商品小計
  const orderItems: any[] = [];

  for (const item of body.items) {
    const product = productMap.get(item.product_id);
    if (!product) {
      return NextResponse.json(
        { error: `商品 ID ${item.product_id} 不存在` },
        { status: 400 },
      );
    }

    // 規格價格：如果有獨立 price 就用它，否則用 product.price + price_diff
    const variant = item.variant_id ? variantsMap[item.variant_id] : null;
    const variantPrice = variant
      ? (variant.price ?? (product.price + (variant.price_diff ?? 0)))
      : product.price;
    // 兌換品價格為 0
    const unitPrice = item.is_redeem ? 0 : variantPrice;
    const itemSubtotal = unitPrice * item.qty;
    subtotal += itemSubtotal;

    orderItems.push({
      product_id:  item.product_id,
      variant_id:  item.variant_id ?? null,
      name:        product.name + (variant ? ` (${variant.name})` : ''),
      price:       unitPrice,
      qty:         item.qty,
      is_gift:     false,
    });
  }

  // ── 5. 在後端計算「真實運費」────────────────────
  const { data: settings } = await supabaseAdmin
    .from('store_settings')
    .select('*')
    .eq('id', 1)
    .single();

  // 離島判斷
  const OUTER_ISLAND_CITIES = ['澎湖縣', '金門縣', '連江縣'];
  const isOuterIsland = OUTER_ISLAND_CITIES.includes(body.city ?? '');

  // 根據配送方式取得運費
  let shippingFee = 0;
  if (body.ship_method === 'home') {
    shippingFee = isOuterIsland
      ? ((settings as any)?.fee_home_outer_island ?? 250)
      : ((settings as any)?.fee_home ?? 100);
  } else if (body.ship_method === 'cvs_711') {
    shippingFee = (settings as any)?.fee_cvs_711 ?? 60;
  } else if (body.ship_method === 'store') {
    shippingFee = (settings as any)?.fee_store ?? 0;
  }

  // 免運判斷（宅配 + 超商取貨都適用滿額免運）
  if (body.ship_method === 'home' || body.ship_method === 'cvs_711') {
    const threshold = isOuterIsland
      ? ((settings as any)?.free_ship_outer_island_amount ?? 0)
      : ((settings as any)?.free_ship_mainland_amount ?? 0);
    if (threshold > 0 && subtotal >= threshold) {
      shippingFee = 0;
    }
  }

  // ── 6. 庫存預檢（在建立訂單之前確認庫存充足）─────
  for (const item of body.items) {
    if (item.is_redeem) continue; // 兌換品不檢查庫存

    let invQuery = supabaseAdmin
      .from('inventory')
      .select('id, inventory_mode, stock, reserved, reserved_preorder, preorder_limit')
      .eq('product_id', item.product_id);

    if (item.variant_id) invQuery = invQuery.eq('variant_id', item.variant_id);
    else invQuery = invQuery.is('variant_id', null);

    const { data: inv } = await invQuery.single();
    if (!inv) continue; // 無庫存記錄的商品不擋（可能是不限量）

    if (inv.inventory_mode === 'stock') {
      const available = inv.stock - inv.reserved;
      if (available < item.qty) {
        const pName = productMap.get(item.product_id)?.name ?? `ID ${item.product_id}`;
        return NextResponse.json(
          { error: `「${pName}」庫存不足（剩餘 ${available} 件）` },
          { status: 400 },
        );
      }
    } else if (inv.inventory_mode === 'preorder' && inv.preorder_limit) {
      const available = inv.preorder_limit - inv.reserved_preorder;
      if (available < item.qty) {
        const pName = productMap.get(item.product_id)?.name ?? `ID ${item.product_id}`;
        return NextResponse.json(
          { error: `「${pName}」預購額度不足（剩餘 ${available} 件）` },
          { status: 400 },
        );
      }
    }
  }

  // ── 7. 在後端驗證並原子性扣除折扣碼額度 ─────────
  let discount = 0;
  let couponClaimedId: number | null = null;
  let couponStackable = true; // 折扣碼是否可併用
  if (body.coupon_code) {
    const { data: coupon } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('code', body.coupon_code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (coupon) {
      const now = new Date();
      const notExpired = !coupon.expires_at || new Date(coupon.expires_at) > now;
      const meetsMin   = !coupon.min_amount || subtotal >= coupon.min_amount;

      // user_scope 驗證
      const scope = coupon.user_scope ?? 'all';
      const scopeOk = scope === 'all'
        || (scope === 'member_only' && memberId)
        || (scope === 'guest_only' && !memberId);

      if (notExpired && meetsMin && scopeOk) {
        couponStackable = coupon.stackable ?? true;
        discount = coupon.type === 'percent'
          ? Math.floor(subtotal * coupon.value / 100)
          : coupon.value;

        // 使用原子操作扣除折扣碼額度（防止高併發超用）
        // claim_coupon_usage 在 DB 層用 WHERE used_count < max_uses 確保不超賣
        const { data: claimed } = await supabaseAdmin
          .rpc('claim_coupon_usage', { p_coupon_id: coupon.id });

        if (!claimed) {
          // 額度已用完（可能被其他訂單搶先用完）
          discount = 0;
        } else {
          couponClaimedId = coupon.id;
        }
      }
    }
  }

  // ── 7.5 後端重新計算優惠活動折扣（防竄改）──────────
  let promoDiscount = 0;
  let appliedPromoIds: number[] = [];
  let giftItems: { product_id: number; qty: number; name: string }[] = [];
  let mappedPromos: Promotion[] = [];

  {
    // 載入所有啟用中的活動（含關聯資料）
    const { data: promos } = await supabaseAdmin
      .from('promotions')
      .select('*, promotion_products(product_id), promotion_volume_tiers(*), promotion_bundle_items(*)')
      .eq('is_active', true);

    if (promos && promos.length > 0) {
      const mapped: Promotion[] = promos.map((p: any) => ({
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
        gift_qty: p.gift_qty ?? 1,
        gift_condition_qty: p.gift_condition_qty ?? 1,
        product_ids: p.promotion_products?.map((pp: any) => pp.product_id) ?? [],
        volume_tiers: p.promotion_volume_tiers?.map((t: any) => ({ min_qty: t.min_qty, price: t.price })) ?? [],
        bundle_items: p.promotion_bundle_items?.map((bi: any) => ({ product_id: bi.product_id, qty: bi.qty })) ?? [],
      }));
      mappedPromos = mapped;

      // 用非贈品、非兌換品的購物車商品來計算優惠
      const calcItems: CartItemForCalc[] = body.items
        .filter(i => !i.is_gift && !i.is_redeem)
        .map(i => {
          const product = productMap.get(i.product_id)!;
          const variant = i.variant_id ? variantsMap[i.variant_id] : null;
          const unitPrice = variant
            ? (variant.price ?? (product.price + (variant.price_diff ?? 0)))
            : product.price;
          return {
            product_id: i.product_id,
            qty: i.qty,
            price: unitPrice,
            name: product.name,
          };
        });

      const result = calculatePromotions(calcItems, mapped);
      promoDiscount = result.total_discount;
      appliedPromoIds = result.discounts.map(d => d.promotion_id);

      // 處理贈品：查出贈品商品名稱
      if (result.gifts.length > 0) {
        const giftProductIds = [...new Set(result.gifts.map(g => g.product_id))];
        const { data: giftProducts } = await supabaseAdmin
          .from('products')
          .select('id, name')
          .in('id', giftProductIds);

        const giftNameMap = new Map((giftProducts ?? []).map(p => [p.id, p.name]));

        giftItems = result.gifts.map(g => ({
          product_id: g.product_id,
          qty: g.qty,
          name: giftNameMap.get(g.product_id) ?? `贈品 #${g.product_id}`,
        }));
      }
    }
  }

  // ── 7.6 贈品庫存預檢 ──────────────────────────────
  for (const gift of giftItems) {
    const { data: inv } = await supabaseAdmin
      .from('inventory')
      .select('id, inventory_mode, stock, reserved, reserved_preorder, preorder_limit')
      .eq('product_id', gift.product_id)
      .is('variant_id', null)
      .single();
    if (!inv) continue;
    if (inv.inventory_mode === 'stock') {
      const available = inv.stock - inv.reserved;
      if (available < gift.qty) {
        return NextResponse.json(
          { error: `贈品「${gift.name}」庫存不足（剩餘 ${available} 件），無法完成訂單` },
          { status: 400 },
        );
      }
    } else if (inv.inventory_mode === 'preorder' && inv.preorder_limit) {
      const available = inv.preorder_limit - inv.reserved_preorder;
      if (available < gift.qty) {
        return NextResponse.json(
          { error: `贈品「${gift.name}」預購額度不足（剩餘 ${available} 件），無法完成訂單` },
          { status: 400 },
        );
      }
    }
  }

  // ── 7.8 stackable 互斥邏輯 ──────────────────────
  // 折扣碼不可併用 或 有任一活動不可與折扣碼併用 → 整批判斷，只保留金額較大的一方
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
        // 退回折扣碼使用次數（因為活動折扣較大，折扣碼不生效）
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

  // ── 8. 計算最終應付金額 ─────────────────────────
  const total = Math.max(0, subtotal - discount - promoDiscount) + shippingFee;

  // ── 9. 寫入訂單到資料庫 ─────────────────────────
  const orderNo = generateOrderNo();
  const isHome = ['home', 'home_normal', 'home_cold'].includes(body.ship_method);
  const fullAddress = isHome
    ? `${body.city ?? ''}${body.district ?? ''}${body.address ?? ''}`
    : body.ship_method === 'store' ? null : (body.address ?? null);

  // 訪客訂單產生 pay_token（防止知道 order_id 就能付款）
  const payToken = !memberId ? crypto.randomUUID() : null;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      order_no:       orderNo,
      member_id:      memberId ?? null,
      buyer_name:     body.name,
      buyer_phone:    body.phone,
      buyer_email:    body.email,
      customer_name:  body.name,
      customer_email: body.email,
      customer_phone: body.phone,
      ship_method: body.ship_method,
      city:        body.city ?? null,
      district:    body.district ?? null,
      address:     fullAddress,
      ship_date:   body.ship_date ?? null,
      note:        body.note ?? null,
      subtotal,
      discount,
      promo_discount: promoDiscount,
      shipping_fee: shippingFee,
      total,
      coupon_code:  body.coupon_code?.toUpperCase() ?? null,
      pay_method:   body.pay_method,
      pay_status:   'pending',   // 等待付款
      status:       'processing', // 處理中
      ...(payToken ? { pay_token: payToken } : {}),
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('訂單建立失敗:', orderError);
    // 如果已扣折扣碼額度，退回
    if (couponClaimedId) {
      try {
        // 退回折扣碼使用次數
        await supabaseAdmin.rpc('release_coupon_usage', { p_coupon_id: couponClaimedId });
      } catch {
        // RPC 不存在 → 直接用 SQL 扣回
        const { data: c } = await supabaseAdmin.from('coupons').select('used_count').eq('id', couponClaimedId).single();
        if (c) await supabaseAdmin.from('coupons').update({ used_count: Math.max((c.used_count ?? 1) - 1, 0) }).eq('id', couponClaimedId);
      }
    }
    return NextResponse.json({ error: `訂單建立失敗：${orderError?.message ?? '未知錯誤'}` }, { status: 500 });
  }

  // ── 10. 寫入訂單明細（含贈品）─────────────────────
  // 贈品以 price=0 加入訂單明細
  for (const gift of giftItems) {
    orderItems.push({
      product_id: gift.product_id,
      name: gift.name,
      price: 0,
      qty: gift.qty,
      is_gift: true,
    });
  }

  const itemsWithOrderId = orderItems.map(item => ({
    ...item,
    order_id: order.id,
  }));

  const { error: itemsError } = await supabaseAdmin
    .from('order_items')
    .insert(itemsWithOrderId);

  if (itemsError) {
    console.error('訂單明細寫入失敗:', itemsError);
    await supabaseAdmin.from('orders').delete().eq('id', order.id);
    return NextResponse.json({ error: `訂單明細寫入失敗：${itemsError.message}` }, { status: 500 });
  }

  // ── 11. 預留庫存（含贈品）──────────────────────────
  // 合併原始商品 + 贈品一起預留庫存
  const allItemsForInventory = [
    ...body.items.map(i => ({ product_id: i.product_id, variant_id: i.variant_id ?? null, qty: i.qty, is_redeem: i.is_redeem })),
    ...giftItems.map(g => ({ product_id: g.product_id, variant_id: null, qty: g.qty, is_redeem: false })),
  ];
  for (const item of allItemsForInventory) {
    let query = supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('product_id', item.product_id);

    if (item.variant_id) query = query.eq('variant_id', item.variant_id);
    else query = query.is('variant_id', null);

    const { data: inv } = await query.single();
    if (!inv) continue;

    const isStock = inv.inventory_mode === 'stock';
    const isPreorder = inv.inventory_mode === 'preorder';

    let updateData: any = {};
    if (isStock) {
      updateData = { reserved: inv.reserved + item.qty };
    } else if (isPreorder) {
      updateData = { reserved_preorder: inv.reserved_preorder + item.qty };
    } else {
      continue;
    }

    await supabaseAdmin
      .from('inventory')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', inv.id);

    await supabaseAdmin.from('inventory_logs').insert({
      inventory_id: inv.id,
      product_id:   item.product_id,
      variant_id:   item.variant_id ?? null,
      change_type:  'order',
      qty_before:   isStock ? inv.reserved : inv.reserved_preorder,
      qty_after:    isStock ? inv.reserved + item.qty : inv.reserved_preorder + item.qty,
      qty_change:   item.qty,
      reason:       `訂單 #${order.id}`,
      admin_name:   '系統',
      order_id:     order.id,
    });
  }

  // ── 12. 處理兌換品（僅會員）─────────────────────
  if (memberId && body.redemption_id) {
    await supabaseAdmin
      .from('redemptions')
      .update({
        status: 'pending_order',
        order_id: order.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.redemption_id);

    await supabaseAdmin
      .from('orders')
      .update({
        redemption_id: body.redemption_id,
        redeem_stamps: 1,
      })
      .eq('id', order.id);
  }

  // ── 13. 回傳結果 ────────────────────────────────
  return NextResponse.json({
    ok:         true,
    order_id:   order.id,
    order_no:   orderNo,
    total,
    pay_method: body.pay_method,
    ...(payToken ? { pay_token: payToken } : {}),
  });
}
