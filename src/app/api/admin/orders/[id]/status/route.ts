// ════════════════════════════════════════════════
// PATCH /api/admin/orders/[id]/status
// shipped → processing：回退庫存（出貨時扣的要加回來）
// 目前僅支援將 status 改回 processing
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id } = await params;
  const orderId = Number(id);
  if (!orderId) return NextResponse.json({ error: '無效的訂單 ID' }, { status: 400 });

  const { field, value } = await req.json();

  if (field !== 'status' || value !== 'processing') {
    return NextResponse.json(
      { error: '此端點僅支援將狀態改回「處理中」，其他操作請使用對應 API' },
      { status: 400 },
    );
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status, pay_status')
    .eq('id', orderId)
    .single();

  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });

  if (order.pay_status === 'refunded' || order.status === 'cancelled') {
    return NextResponse.json({ error: '已取消或已退款的訂單無法變更狀態' }, { status: 400 });
  }

  // 只允許 shipped → processing（退回處理中）
  // done → processing 不允許，因為完成時已加章，退回不會自動扣章
  if (order.status !== 'shipped') {
    return NextResponse.json(
      { error: `只有「已出貨」狀態可以改回「處理中」，目前狀態：${order.status}` },
      { status: 400 },
    );
  }

  // ── 回退庫存：出貨時扣了 stock & reserved（或 reserved_preorder），現在要加回來 ──
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_id, variant_id, qty')
    .eq('order_id', orderId);

  if (items && items.length > 0) {
    const inventoryLogs: any[] = [];

    for (const item of items) {
      let query = supabaseAdmin.from('inventory').select('*').eq('product_id', item.product_id);
      if (item.variant_id) query = query.eq('variant_id', item.variant_id);
      else query = query.is('variant_id', null);

      const { data: inv } = await query.single();
      if (!inv) continue;

      const isStock = inv.inventory_mode === 'stock';

      if (isStock) {
        // 出貨時：stock -= qty, reserved -= qty → 回退：stock += qty, reserved += qty
        const newStock = inv.stock + item.qty;
        const newReserved = inv.reserved + item.qty;
        const { data: updated, error: updErr } = await supabaseAdmin.from('inventory')
          .update({ stock: newStock, reserved: newReserved, updated_at: new Date().toISOString() })
          .eq('id', inv.id)
          .eq('stock', inv.stock)
          .eq('reserved', inv.reserved)
          .select('id');

        if (updErr || !updated || updated.length === 0) {
          return NextResponse.json({ error: '庫存更新衝突，請重試' }, { status: 409 });
        }

        inventoryLogs.push({
          inventory_id: inv.id,
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          change_type: 'unship',
          qty_before: inv.stock,
          qty_after: newStock,
          qty_change: item.qty,
          reason: `訂單 #${orderId} 退回處理中（庫存回補）`,
          admin_name: '系統',
          order_id: orderId,
        });
      } else {
        // preorder 模式：出貨時 reserved_preorder -= qty → 回退：reserved_preorder += qty
        const newReservedPre = inv.reserved_preorder + item.qty;
        const { data: updated, error: updErr } = await supabaseAdmin.from('inventory')
          .update({ reserved_preorder: newReservedPre, updated_at: new Date().toISOString() })
          .eq('id', inv.id)
          .eq('reserved_preorder', inv.reserved_preorder)
          .select('id');

        if (updErr || !updated || updated.length === 0) {
          return NextResponse.json({ error: '庫存更新衝突，請重試' }, { status: 409 });
        }

        inventoryLogs.push({
          inventory_id: inv.id,
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          change_type: 'unship',
          qty_before: inv.reserved_preorder,
          qty_after: newReservedPre,
          qty_change: item.qty,
          reason: `訂單 #${orderId} 退回處理中（預購保留回補）`,
          admin_name: '系統',
          order_id: orderId,
        });
      }
    }

    if (inventoryLogs.length > 0) {
      await supabaseAdmin.from('inventory_logs').insert(inventoryLogs);
    }
  }

  // ── 更新訂單狀態 ──
  const { error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'processing' })
    .eq('id', orderId);

  if (error) {
    return NextResponse.json({ error: `更新失敗：${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
