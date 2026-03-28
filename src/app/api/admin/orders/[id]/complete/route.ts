// ════════════════════════════════════════════════
// POST /api/admin/orders/[id]/complete
// 完成訂單：status=done + 自動集章
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
    .select('id, status, member_id, total, pay_status')
    .eq('id', orderId)
    .single();

  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  if (order.status !== 'shipped') {
    return NextResponse.json({ error: '只有已出貨的訂單可以標為完成' }, { status: 400 });
  }

  // 更新狀態
  await supabaseAdmin.from('orders').update({ status: 'done' }).eq('id', orderId);

  // 自動集章（有會員且已付款）
  if (order.member_id && order.pay_status === 'paid') {
    try {
      const { data: settings } = await supabaseAdmin
        .from('store_settings')
        .select('stamp_enabled, stamp_threshold, stamp_total_slots')
        .eq('id', 1).single();

      if (settings?.stamp_enabled) {
        const threshold = settings.stamp_threshold ?? 200;
        const maxStamps = settings.stamp_total_slots ?? 10;
        let stampsToAdd = Math.floor(order.total / threshold);

        if (stampsToAdd > 0) {
          const { data: member } = await supabaseAdmin
            .from('members')
            .select('id, stamps')
            .eq('id', order.member_id).single();

          if (member) {
            const stampsBefore = member.stamps ?? 0;
            if (stampsBefore < maxStamps) {
              stampsToAdd = Math.min(stampsToAdd, maxStamps - stampsBefore);
              const stampsAfter = stampsBefore + stampsToAdd;

              await supabaseAdmin.from('members').update({
                stamps: stampsAfter,
                stamp_last_updated: new Date().toISOString(),
              }).eq('id', order.member_id);

              await supabaseAdmin.from('stamp_logs').insert({
                member_id:     order.member_id,
                order_id:      orderId,
                change:        stampsToAdd,
                stamps_before: stampsBefore,
                stamps_after:  stampsAfter,
                reason:        '訂單完成自動集章',
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('集章失敗:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
