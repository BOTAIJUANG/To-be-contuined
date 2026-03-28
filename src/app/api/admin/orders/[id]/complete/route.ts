// ════════════════════════════════════════════════
// POST /api/admin/orders/[id]/complete
// 完成訂單：status=done + 自動集章
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { awardStampsForOrder } from '@/lib/stamps';

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
    .select('id, status, member_id, total, pay_status')
    .eq('id', orderId)
    .single();

  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  if (order.status !== 'shipped') {
    return NextResponse.json({ error: '只有已出貨的訂單可以標為完成' }, { status: 400 });
  }

  // 更新狀態
  await supabaseAdmin.from('orders').update({
    status: 'done',
    completed_at: new Date().toISOString(),
  }).eq('id', orderId);

  // 自動集章（有會員且已付款）
  // 使用共用函式，內建防重複機制（避免與 notify/return 重複集章）
  if (order.member_id && order.pay_status === 'paid') {
    await awardStampsForOrder(order.id, order.member_id, order.total);
  }

  return NextResponse.json({ ok: true });
}
