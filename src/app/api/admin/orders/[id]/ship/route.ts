// ════════════════════════════════════════════════
// POST /api/admin/orders/[id]/ship
// 出貨：status=shipped + shipped_at + 庫存扣減
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

  // 取得訂單明細
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_id, variant_id, qty')
    .eq('order_id', orderId);

  if (!items || items.length === 0) {
    return NextResponse.json({ error: '找不到訂單明細' }, { status: 400 });
  }

  // 庫存出貨
  const errors: string[] = [];
  for (const item of items) {
    let query = supabaseAdmin.from('inventory').select('*').eq('product_id', item.product_id);
    if (item.variant_id) query = query.eq('variant_id', item.variant_id);
    else query = query.is('variant_id', null);

    const { data: inv } = await query.single();
    if (!inv) { errors.push(`找不到商品 ${item.product_id} 的庫存記錄`); continue; }

    const isStock = inv.inventory_mode === 'stock';
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

    const { error: updErr } = await supabaseAdmin
      .from('inventory')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', inv.id);

    if (updErr) { errors.push(`庫存更新失敗：${updErr.message}`); continue; }

    await supabaseAdmin.from('inventory_logs').insert({
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

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('；') }, { status: 400 });
  }

  // 更新訂單狀態
  await supabaseAdmin.from('orders').update({
    status: 'shipped',
    shipped_at: new Date().toISOString(),
  }).eq('id', orderId);

  return NextResponse.json({ ok: true });
}
