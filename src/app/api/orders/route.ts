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
// Header: Authorization: Bearer <token>
// Body: {
//   items: [{ product_id, variant_id, qty }],
//   ship_method, name, phone, email,
//   city, district, address,
//   ship_date, note, coupon_code, pay_method,
//   redemption_id   // 可選，兌換品用
// }
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';

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
}

export async function POST(req: NextRequest) {
  // ── 1. 驗證身份 ──────────────────────────────────
  // 確認這個請求是從已登入的使用者發出的
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;  // 沒登入 → 回傳 401

  const memberId = auth.userId;
  const body: OrderInput = await req.json();

  // ── 2. 基本欄位檢查 ──────────────────────────────
  if (!body.items?.length) {
    return NextResponse.json({ error: '購物車是空的' }, { status: 400 });
  }
  if (!body.name || !body.phone || !body.email) {
    return NextResponse.json({ error: '請填寫收件人資訊' }, { status: 400 });
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
      product_id:            item.product_id,
      variant_id:            item.variant_id ?? null,
      product_name_snapshot: product.name,
      variant_name_snapshot: item.variant_id ? (variantsMap[item.variant_id]?.name ?? null) : null,
      unit_price:            unitPrice,
      qty:                   item.qty,
      subtotal:              itemSubtotal,
      name:                  product.name,
      price:                 unitPrice,
    });
  }

  // ── 5. 在後端計算「真實運費」────────────────────
  const { data: settings } = await supabaseAdmin
    .from('store_settings')
    .select('fee_home_normal, fee_home_cold, fee_cvs, free_ship_amount, free_ship_cold')
    .eq('id', 1)
    .single();

  // 根據配送方式取得運費
  const feeMap: Record<string, string> = {
    home_normal: 'fee_home_normal',
    home_cold:   'fee_home_cold',
    cvs_711:     'fee_cvs',
    cvs_family:  'fee_cvs',
    store:       '',  // 門市自取免運
  };
  const feeKey = feeMap[body.ship_method];
  let shippingFee = feeKey && settings ? (settings as any)[feeKey] ?? 0 : 0;

  // 免運判斷
  const freeShipAmount = settings?.free_ship_amount ?? 0;
  if (freeShipAmount > 0 && subtotal >= freeShipAmount) {
    if (body.ship_method === 'home_cold' && !settings?.free_ship_cold) {
      // 低溫宅配不適用免運 → 維持原運費
    } else {
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

      if (notExpired && meetsMin) {
        discount = coupon.type === 'percent'
          ? Math.floor(subtotal * coupon.value / 100)
          : coupon.value;

        // 原子性扣額度：UPDATE ... WHERE used_count < max_uses
        // 兩個併發請求不可能同時成功超過 max_uses
        const { data: claimed } = await supabaseAdmin.rpc('claim_coupon_usage', {
          p_coupon_id: coupon.id,
        });

        if (!claimed) {
          // 額度已被搶完 → 不套用折扣
          discount = 0;
        } else {
          couponClaimedId = coupon.id;
        }
      }
    }
  }

  // ── 8. 計算最終應付金額 ─────────────────────────
  const total = subtotal - discount + shippingFee;

  // ── 9. 寫入訂單到資料庫 ─────────────────────────
  const orderNo = generateOrderNo();
  const fullAddress = ['home_normal', 'home_cold'].includes(body.ship_method)
    ? `${body.city ?? ''}${body.district ?? ''}${body.address ?? ''}`
    : null;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      order_no:    orderNo,
      member_id:   memberId,
      buyer_name:  body.name,
      buyer_phone: body.phone,
      buyer_email: body.email,
      ship_method: body.ship_method,
      city:        body.city ?? null,
      district:    body.district ?? null,
      address:     fullAddress,
      ship_date:   body.ship_date ?? null,
      note:        body.note ?? null,
      subtotal,
      discount,
      shipping_fee: shippingFee,
      total,
      coupon_code:  body.coupon_code?.toUpperCase() ?? null,
      pay_method:   body.pay_method,
      pay_status:   'pending',   // 等待付款
      status:       'processing', // 處理中
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('訂單建立失敗:', orderError);
    // 如果已扣折扣碼額度，退回
    if (couponClaimedId) {
      try {
        await supabaseAdmin.rpc('release_coupon_usage', {
          p_coupon_id: couponClaimedId,
        });
      } catch { /* best effort */ }
    }
    return NextResponse.json({ error: '訂單建立失敗，請稍後再試' }, { status: 500 });
  }

  // ── 10. 寫入訂單明細 ────────────────────────────
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
    return NextResponse.json({ error: '訂單建立失敗，請稍後再試' }, { status: 500 });
  }

  // ── 11. 預留庫存（已在步驟 6 預檢過，這裡直接扣）──
  for (const item of body.items) {
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

  // ── 12. 處理兌換品 ──────────────────────────────
  if (body.redemption_id) {
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
  });
}
