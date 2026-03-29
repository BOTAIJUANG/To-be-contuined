// ════════════════════════════════════════════════
// POST /api/payment/refund/confirm
// ATM 退款確認：管理員手動完成銀行轉帳後，標記退款完成
// Body: { order_id }
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { order_id } = await req.json();
  if (!order_id) {
    return NextResponse.json({ error: '缺少訂單 ID' }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, refund_status, pay_status')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  }

  if (order.refund_status !== 'manual_pending') {
    return NextResponse.json({ error: '此訂單不是待確認退款狀態' }, { status: 400 });
  }

  await supabaseAdmin.from('orders').update({
    pay_status: 'refunded',
    refund_status: 'manual_done',
  }).eq('id', order.id);

  return NextResponse.json({ ok: true, message: 'ATM 退款已確認完成' });
}
