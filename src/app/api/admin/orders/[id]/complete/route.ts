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
    .select('id, status, member_id, total, pay_status, redemption_id')
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

  // ── 兌換品正式扣章：pending_order → used ──
  if (order.redemption_id && order.member_id) {
    try {
      const { data: redemption } = await supabaseAdmin
        .from('redemptions')
        .select('id, member_id, stamps_cost, status')
        .eq('id', order.redemption_id)
        .single();

      if (redemption && redemption.status === 'pending_order') {
        // 更新兌換狀態為 used
        const { data: usedOk } = await supabaseAdmin
          .from('redemptions')
          .update({ status: 'used', used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', redemption.id)
          .eq('status', 'pending_order')
          .select('id');

        if (usedOk && usedOk.length > 0) {
          // 正式扣章：stamps -= X，stamps_frozen -= X
          const { data: member } = await supabaseAdmin
            .from('members')
            .select('stamps, stamps_frozen')
            .eq('id', redemption.member_id)
            .single();

          if (member) {
            const stampsBefore = member.stamps ?? 0;
            const frozenBefore = member.stamps_frozen ?? 0;
            const stampsAfter = Math.max(0, stampsBefore - redemption.stamps_cost);
            const frozenAfter = Math.max(0, frozenBefore - redemption.stamps_cost);

            const { data: stampsOk } = await supabaseAdmin
              .from('members')
              .update({ stamps: stampsAfter, stamps_frozen: frozenAfter })
              .eq('id', redemption.member_id)
              .eq('stamps', stampsBefore)
              .eq('stamps_frozen', frozenBefore)
              .select('id');

            if (stampsOk && stampsOk.length > 0) {
              await supabaseAdmin.from('stamp_logs').insert({
                member_id: redemption.member_id,
                order_id: orderId,
                change: -redemption.stamps_cost,
                stamps_before: stampsBefore,
                stamps_after: stampsAfter,
                reason: '兌換獎勵扣章',
              });
            } else {
              console.error(`[complete] 兌換扣章衝突 member_id=${redemption.member_id}`);
            }
          }
        }
      }
    } catch (err) {
      console.error('[complete] 兌換品扣章失敗:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
