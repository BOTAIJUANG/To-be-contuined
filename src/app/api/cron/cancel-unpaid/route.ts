// ════════════════════════════════════════════════
// api/cron/cancel-unpaid  ──  自動取消逾時未付款訂單
//
// 規則：
//   信用卡：建立 30 分鐘內未付款 → 取消 + 釋放庫存
//   ATM：  建立 24 小時內未付款 → 取消 + 釋放庫存
//
// Vercel Cron 每 10 分鐘呼叫一次
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  // 驗證 Vercel Cron 密鑰（防止外部隨意呼叫）
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let cancelledCount = 0;

  // ── 1. 信用卡：超過 30 分鐘未付款 ─────────────────
  const creditCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const { data: creditOrders } = await supabaseAdmin
    .from('orders')
    .select('id, order_no')
    .eq('pay_status', 'pending')
    .eq('pay_method', 'credit')
    .neq('status', 'cancelled')
    .lt('created_at', creditCutoff);

  // ── 2. ATM：超過 24 小時未付款 ────────────────────
  const atmCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: atmOrders } = await supabaseAdmin
    .from('orders')
    .select('id, order_no')
    .eq('pay_status', 'pending')
    .eq('pay_method', 'atm')
    .neq('status', 'cancelled')
    .lt('created_at', atmCutoff);

  const expiredOrders = [...(creditOrders ?? []), ...(atmOrders ?? [])];

  // ── 3. 逐筆取消 + 釋放庫存 ────────────────────────
  for (const order of expiredOrders) {
    // 更新訂單狀態
    await supabaseAdmin
      .from('orders')
      .update({ pay_status: 'failed', status: 'cancelled' })
      .eq('id', order.id);

    // 釋放預留庫存
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('product_id, variant_id, qty')
      .eq('order_id', order.id);

    if (items) {
      const inventoryLogs: any[] = [];

      for (const item of items) {
        let query = supabaseAdmin
          .from('inventory')
          .select('*')
          .eq('product_id', item.product_id);
        if (item.variant_id) query = query.eq('variant_id', item.variant_id);
        else query = query.is('variant_id', null);

        const { data: inv } = await query.single();
        if (!inv) continue;

        let qtyBefore: number;
        let qtyAfter: number;

        if (inv.inventory_mode === 'stock') {
          qtyBefore = inv.reserved;
          qtyAfter = Math.max(0, inv.reserved - item.qty);
          const { data: updated } = await supabaseAdmin.from('inventory')
            .update({ reserved: qtyAfter, updated_at: now.toISOString() })
            .eq('id', inv.id)
            .eq('reserved', inv.reserved)
            .select('id');
          if (!updated || updated.length === 0) {
            console.warn(`庫存鎖定衝突 inv.id=${inv.id}，跳過`);
            continue;
          }
        } else if (inv.inventory_mode === 'preorder') {
          qtyBefore = inv.reserved_preorder;
          qtyAfter = Math.max(0, inv.reserved_preorder - item.qty);
          const { data: updated } = await supabaseAdmin.from('inventory')
            .update({ reserved_preorder: qtyAfter, updated_at: now.toISOString() })
            .eq('id', inv.id)
            .eq('reserved_preorder', inv.reserved_preorder)
            .select('id');
          if (!updated || updated.length === 0) {
            console.warn(`庫存鎖定衝突 inv.id=${inv.id}，跳過`);
            continue;
          }
        } else {
          continue;
        }

        inventoryLogs.push({
          inventory_id: inv.id,
          product_id:   item.product_id,
          variant_id:   item.variant_id ?? null,
          change_type:  'cancel',
          qty_before:   qtyBefore,
          qty_after:    qtyAfter,
          qty_change:   qtyAfter - qtyBefore,
          reason:       `訂單 #${order.id} 逾時未付款自動取消`,
          admin_name:   '系統',
          order_id:     order.id,
        });
      }

      if (inventoryLogs.length > 0) {
        await supabaseAdmin.from('inventory_logs').insert(inventoryLogs);
      }
    }

    cancelledCount++;
    console.log(`自動取消逾時訂單: ${order.order_no}`);
  }

  return NextResponse.json({
    ok: true,
    cancelled: cancelledCount,
    timestamp: now.toISOString(),
  });
}
