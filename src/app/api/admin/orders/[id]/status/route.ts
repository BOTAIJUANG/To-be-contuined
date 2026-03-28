// ════════════════════════════════════════════════
// PATCH /api/admin/orders/[id]/status
// 純欄位更新 — 不做庫存、章數、退款等副作用
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

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'processing' })
    .eq('id', orderId);

  if (error) {
    return NextResponse.json({ error: `更新失敗：${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
