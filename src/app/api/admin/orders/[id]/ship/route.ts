// ════════════════════════════════════════════════
// POST /api/admin/orders/[id]/ship
// 出貨：status=shipped + shipped_at + 庫存扣減
//
// 流程：先預檢所有庫存 → 全部足夠才批次扣減 → 更新訂單
// 避免「部分扣成功、部分失敗」的不一致狀態
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id } = await params;
  const orderId = Number(id);
  if (!orderId) return NextResponse.json({ error: '無效的訂單 ID' }, { status: 400 });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .single();

  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  if (order.status !== 'processing') {
    return NextResponse.json({ error: '只有處理中的訂單可以出貨' }, { status: 400 });
  }

  // 取得訂單明細（含 ship_date_id 以判斷 date_mode）
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_id, variant_id, qty, ship_date_id')
    .eq('order_id', orderId);

  if (!items || items.length === 0) {
    return NextResponse.json({ error: '找不到訂單明細' }, { status: 400 });
  }

  // ── Phase 1：預檢所有庫存（只讀，不寫）──────────
  type InvRecord = {
    inv: any;
    item: typeof items[number];
    isStock: boolean;
  };

  const invRecords: InvRecord[] = [];

  for (const item of items) {
    // date_mode 商品由 product_ship_dates 管理，跳過 inventory 預檢
    if ((item as any).ship_date_id) continue;

    let query = supabaseAdmin.from('inventory').select('*').eq('product_id', item.product_id);
    if (item.variant_id) query = query.eq('variant_id', item.variant_id);
    else query = query.is('variant_id', null);

    const { data: inv } = await query.single();
    if (!inv) {
      return NextResponse.json(
        { error: `找不到商品 ${item.product_id} 的庫存記錄，無法出貨` },
        { status: 400 },
      );
    }

    const isStock = inv.inventory_mode === 'stock';

    // stock 模式：檢查實體庫存是否足夠
    if (isStock && inv.stock < item.qty) {
      return NextResponse.json(
        { error: `商品 ${item.product_id} 實體庫存不足（剩餘 ${inv.stock}，需要 ${item.qty}），無法出貨` },
        { status: 400 },
      );
    }

    invRecords.push({ inv, item, isStock });
  }

  // ── Phase 2：預檢通過，批次執行扣減 ────────────
  const inventoryLogs: any[] = [];

  for (const { inv, item, isStock } of invRecords) {
    let updateData: Record<string, number>;
    let qtyBefore: number;
    let qtyAfter: number;

    if (isStock) {
      updateData = { stock: inv.stock - item.qty, reserved: Math.max(0, inv.reserved - item.qty) };
      qtyBefore = inv.stock;
      qtyAfter = inv.stock - item.qty;
    } else {
      updateData = { reserved_preorder: Math.max(0, inv.reserved_preorder - item.qty) };
      qtyBefore = inv.reserved_preorder;
      qtyAfter = Math.max(0, inv.reserved_preorder - item.qty);
    }

    const lockField = isStock ? 'stock' : 'reserved_preorder';
    const lockValue  = isStock ? inv.stock : inv.reserved_preorder;
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('inventory')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', inv.id)
      .eq(lockField, lockValue)
      .select('id');

    if (updErr || !updated || updated.length === 0) {
      console.error(`庫存扣減衝突 inv.id=${inv.id}`, updErr?.message);
      return NextResponse.json({ error: '庫存更新衝突，請重試' }, { status: 409 });
    }

    inventoryLogs.push({
      inventory_id: inv.id,
      product_id:   item.product_id,
      variant_id:   item.variant_id ?? null,
      change_type:  'ship',
      qty_before:   qtyBefore,
      qty_after:    qtyAfter,
      qty_change:   qtyAfter - qtyBefore,
      reason:       `訂單 #${orderId} 出貨`,
      admin_name:   '系統',
      order_id:     orderId,
    });
  }

  // 批次寫入 log
  if (inventoryLogs.length > 0) {
    await supabaseAdmin.from('inventory_logs').insert(inventoryLogs);
  }

  // ── Phase 2.5：date_mode 商品釋放預留量 ────────────
  const dateModeItems = items.filter((i: any) => i.ship_date_id);
  for (const item of dateModeItems) {
    const { data: sd } = await supabaseAdmin
      .from('product_ship_dates')
      .select('id, reserved')
      .eq('id', (item as any).ship_date_id)
      .single();
    if (!sd) continue;
    const oldReserved = sd.reserved ?? 0;
    const newReserved = Math.max(0, oldReserved - item.qty);
    let lockQ = supabaseAdmin
      .from('product_ship_dates')
      .update({ reserved: newReserved })
      .eq('id', sd.id);
    if (sd.reserved === null || sd.reserved === undefined) {
      lockQ = lockQ.is('reserved', null);
    } else {
      lockQ = lockQ.eq('reserved', oldReserved);
    }
    const { data: updated } = await lockQ.select('id');

    // 樂觀鎖失敗 → 重讀重試一次
    if (!updated || updated.length === 0) {
      const { data: retry } = await supabaseAdmin
        .from('product_ship_dates')
        .select('id, reserved')
        .eq('id', sd.id)
        .single();
      if (retry) {
        let retryQ = supabaseAdmin
          .from('product_ship_dates')
          .update({ reserved: Math.max(0, (retry.reserved ?? 0) - item.qty) })
          .eq('id', retry.id);
        if (retry.reserved === null || retry.reserved === undefined) {
          retryQ = retryQ.is('reserved', null);
        } else {
          retryQ = retryQ.eq('reserved', retry.reserved);
        }
        await retryQ;
      }
    }
  }

  // ── Phase 3：全部成功，更新訂單狀態 ────────────
  await supabaseAdmin.from('orders').update({
    status: 'shipped',
    shipped_at: new Date().toISOString(),
  }).eq('id', orderId);

  return NextResponse.json({ ok: true });
}
