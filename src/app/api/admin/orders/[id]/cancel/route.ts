// ════════════════════════════════════════════════
// POST /api/admin/orders/[id]/cancel
// 取消未付款訂單：status=cancelled + 庫存釋放 + 扣章 + 取消兌換
// 已付款訂單請使用 /api/payment/refund
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { releaseBatchReserved, releaseShipDateReserved } from '@/lib/batch-stock';

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
    .select('id, order_no, status, pay_status, member_id, total, redemption_id, coupon_code')
    .eq('id', orderId)
    .single();

  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  if (order.pay_status === 'paid') {
    return NextResponse.json({ error: '已付款訂單請使用退款功能' }, { status: 400 });
  }
  if (order.status === 'cancelled') {
    return NextResponse.json({ error: '此訂單已取消' }, { status: 400 });
  }

  // ── 庫存釋放 ──
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_id, variant_id, qty, ship_date_id')
    .eq('order_id', orderId);

  if (items && items.length > 0) {
    for (const item of items) {
      // 有 ship_date_id 的項目由 product_ship_dates 管理，跳過 inventory 釋放
      // （不靠 stock_mode 判斷，因為商品可能已從 date_mode 切回總量模式）
      if ((item as any).ship_date_id) continue;

      let query = supabaseAdmin.from('inventory').select('*').eq('product_id', item.product_id);
      if (item.variant_id) query = query.eq('variant_id', item.variant_id);
      else query = query.is('variant_id', null);

      const { data: inv } = await query.single();
      if (!inv) continue;

      const isStock = inv.inventory_mode === 'stock';
      let updateData: Record<string, number>;
      let qtyBefore: number;
      let qtyAfter: number;

      if (isStock) {
        updateData = { reserved: Math.max(0, inv.reserved - item.qty) };
        qtyBefore = inv.reserved;
        qtyAfter = Math.max(0, inv.reserved - item.qty);
      } else {
        updateData = { reserved_preorder: Math.max(0, inv.reserved_preorder - item.qty) };
        qtyBefore = inv.reserved_preorder;
        qtyAfter = Math.max(0, inv.reserved_preorder - item.qty);
      }

      const lockField = isStock ? 'reserved' : 'reserved_preorder';
      const { data: updated, error: updErr } = await supabaseAdmin.from('inventory')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', inv.id)
        .eq(lockField, isStock ? inv.reserved : inv.reserved_preorder)
        .select('id');

      if (updErr || !updated || updated.length === 0) {
        console.error(`庫存釋放衝突 inv.id=${inv.id}`, updErr?.message);
        return NextResponse.json({ error: '庫存更新衝突，請重試' }, { status: 409 });
      }

      await supabaseAdmin.from('inventory_logs').insert({
        inventory_id: inv.id,
        product_id:   item.product_id,
        variant_id:   item.variant_id ?? null,
        change_type:  'cancel',
        qty_before:   qtyBefore,
        qty_after:    qtyAfter,
        qty_change:   qtyAfter - qtyBefore,
        reason:       `訂單 #${orderId} 取消`,
        admin_name:   '系統',
        order_id:     orderId,
      });
    }
  }

  // ── 扣章（若訂單之前已完成且有會員，且確認有集章紀錄）──
  if (order.status === 'done' && order.member_id) {
    try {
      // 先確認這筆訂單是否真的有集過章
      const { data: awardLog } = await supabaseAdmin
        .from('stamp_logs')
        .select('id, change')
        .eq('order_id', orderId)
        .eq('reason', '訂單付款完成自動集章')
        .maybeSingle();

      if (awardLog && awardLog.change > 0) {
        const stampsToDeduct = awardLog.change; // 扣回實際集到的章數

        const { data: member } = await supabaseAdmin
          .from('members')
          .select('id, stamps')
          .eq('id', order.member_id).single();

        if (member) {
          const stampsBefore = member.stamps ?? 0;
          const stampsAfter = Math.max(0, stampsBefore - stampsToDeduct);

          const { data: stampsUpdated } = await supabaseAdmin.from('members').update({
            stamps: stampsAfter,
            stamp_last_updated: new Date().toISOString(),
          }).eq('id', order.member_id).eq('stamps', stampsBefore).select('id');

          if (stampsUpdated && stampsUpdated.length > 0) {
            await supabaseAdmin.from('stamp_logs').insert({
              member_id:     order.member_id,
              order_id:      orderId,
              change:        -stampsToDeduct,
              stamps_before: stampsBefore,
              stamps_after:  stampsAfter,
              reason:        '訂單取消扣章',
            });
          } else {
            console.error(`[cancel] 扣章衝突 member_id=${order.member_id}`);
          }
        }
      }
    } catch (err) {
      console.error('扣章失敗:', err);
    }
  }

  // ── 取消兌換 + 解凍集章 ──
  if (order.redemption_id) {
    try {
      const { data: redemption } = await supabaseAdmin
        .from('redemptions')
        .select('id, member_id, stamps_cost, status')
        .eq('id', order.redemption_id)
        .single();

      if (redemption) {
        await supabaseAdmin.from('redemptions').update({
          status: 'released',
          updated_at: new Date().toISOString(),
        }).eq('id', order.redemption_id);

        if (redemption.stamps_cost > 0) {
          if (['pending_cart', 'pending_order'].includes(redemption.status)) {
            // 章數仍凍結中 → 解凍 stamps_frozen
            const { data: member } = await supabaseAdmin
              .from('members')
              .select('stamps_frozen')
              .eq('id', redemption.member_id)
              .single();

            if (member) {
              const frozenBefore = member.stamps_frozen ?? 0;
              const { data: frozenUpdated } = await supabaseAdmin.from('members').update({
                stamps_frozen: Math.max(0, frozenBefore - redemption.stamps_cost),
              }).eq('id', redemption.member_id).eq('stamps_frozen', frozenBefore).select('id');
              if (!frozenUpdated || frozenUpdated.length === 0) {
                console.error(`[cancel] 凍結章數解凍衝突 member_id=${redemption.member_id}`);
              }
            }
          } else if (redemption.status === 'used') {
            // 章數已永久扣除（訂單完成時扣的）→ 恢復 stamps
            const { data: member } = await supabaseAdmin
              .from('members')
              .select('stamps')
              .eq('id', redemption.member_id)
              .single();

            if (member) {
              const stampsBefore = member.stamps ?? 0;
              const stampsAfter = stampsBefore + redemption.stamps_cost;
              const { data: stampsUpdated } = await supabaseAdmin.from('members').update({
                stamps: stampsAfter,
                stamp_last_updated: new Date().toISOString(),
              }).eq('id', redemption.member_id).eq('stamps', stampsBefore).select('id');
              if (stampsUpdated && stampsUpdated.length > 0) {
                await supabaseAdmin.from('stamp_logs').insert({
                  member_id: redemption.member_id,
                  order_id: orderId,
                  change: redemption.stamps_cost,
                  stamps_before: stampsBefore,
                  stamps_after: stampsAfter,
                  reason: '取消訂單恢復兌換章數',
                });
              } else {
                console.error(`[cancel] 兌換章數恢復衝突 member_id=${redemption.member_id}`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('取消兌換失敗:', err);
    }
  }

  // ── 釋放預購批次預留量 ──
  await releaseBatchReserved(orderId);

  // ── 釋放日期模式預留量 ──
  await releaseShipDateReserved(orderId);

  // ── 釋放折價券使用次數 ──
  if (order.coupon_code) {
    try {
      const { data: coupon } = await supabaseAdmin
        .from('coupons').select('id, used_count').eq('code', order.coupon_code).maybeSingle();
      if (coupon && (coupon.used_count ?? 0) > 0) {
        const { data: couponUpdated } = await supabaseAdmin.from('coupons')
          .update({ used_count: coupon.used_count - 1 })
          .eq('id', coupon.id).eq('used_count', coupon.used_count)
          .select('id');
        if (!couponUpdated || couponUpdated.length === 0) {
          console.error(`[cancel] 折價券釋放衝突 coupon=${coupon.id}，訂單=${order.order_no}`);
        }
      }
    } catch (err) {
      console.error('折價券釋放失敗:', err);
    }
  }

  // ── 更新訂單狀態（pay_status 保持原值，未付款不應標記 failed）──
  await supabaseAdmin.from('orders').update({
    status: 'cancelled',
  }).eq('id', orderId);

  return NextResponse.json({ ok: true });
}
