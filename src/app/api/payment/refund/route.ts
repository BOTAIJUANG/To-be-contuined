// ════════════════════════════════════════════════
// app/api/payment/refund/route.ts  ──  統一退款 API
//
// 流程：
//   1. 驗證訂單（已付款、未退過）
//   2. 標記 refund_status=processing
//   3. 信用卡 → 綠界 DoAction 刷退；ATM → 標記手動
//   4. 副作用：回補庫存、扣章、取消兌換（收集 warnings）
//   5. 最後才更新訂單最終狀態
//
// POST /api/payment/refund
// Body: { order_id, refund_amount?, refund_reason? }
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth';
import { generateCheckMacValue, assertEcpayConfig } from '@/lib/ecpay';
import { releaseBatchReserved, releaseShipDateReserved } from '@/lib/batch-stock';

const ECPAY_DOACTION_URL = process.env.ECPAY_DOACTION_URL
  ?? 'https://payment-stage.ecpay.com.tw/CreditDetail/DoAction';

export async function POST(req: NextRequest) {
  assertEcpayConfig();
  if (process.env.NODE_ENV === 'production' && ECPAY_DOACTION_URL.includes('payment-stage')) {
    return NextResponse.json({ error: 'ECPAY_DOACTION_URL 未設定正式環境網址' }, { status: 500 });
  }
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { order_id, refund_amount, refund_reason } = await req.json();

  if (!order_id) {
    return NextResponse.json({ error: '缺少訂單 ID' }, { status: 400 });
  }

  // ── 1. 取得完整訂單資料 ────────────────────────
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, total, status, pay_status, pay_method, ecpay_trade_no, member_id, redemption_id, refund_status')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  }

  if (order.pay_status === 'refunded') {
    return NextResponse.json({ error: '此訂單已退款' }, { status: 400 });
  }

  // 防止併發退款：如果已在處理中或已完成，拒絕重複請求
  if (order.refund_status && !['failed'].includes(order.refund_status)) {
    return NextResponse.json({ error: '此訂單正在退款或已退款完成' }, { status: 400 });
  }

  if (order.pay_status !== 'paid') {
    return NextResponse.json({ error: '此訂單尚未付款，無法退款' }, { status: 400 });
  }

  const amount = refund_amount ?? order.total;
  if (amount <= 0 || amount > order.total) {
    return NextResponse.json({ error: '退款金額不得超過訂單金額' }, { status: 400 });
  }
  const reason = refund_reason ?? '';

  // ── 2. 先標記為 processing ──────────────────────
  await supabaseAdmin.from('orders').update({
    refund_status: 'processing',
    refund_amount: amount,
    refund_reason: reason,
  }).eq('id', order.id);

  // ── 3. 信用卡 → 呼叫綠界退款 ───────────────────
  const isATM = order.pay_method === 'atm';

  if (order.pay_method === 'credit') {
    if (!order.ecpay_trade_no) {
      await supabaseAdmin.from('orders').update({ refund_status: 'failed' }).eq('id', order.id);
      return NextResponse.json({ error: '找不到綠界交易編號，無法退款' }, { status: 400 });
    }

    const MERCHANT_ID = (process.env.ECPAY_MERCHANT_ID ?? '3002607').trim();
    const params: Record<string, string> = {
      MerchantID:      MERCHANT_ID,
      MerchantTradeNo: order.order_no.replace(/-/g, ''),
      TradeNo:         order.ecpay_trade_no,
      Action:          'R',
      TotalAmount:     String(amount),
    };
    params.CheckMacValue = generateCheckMacValue(params);

    try {
      const formBody = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

      const ecpayRes = await fetch(ECPAY_DOACTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
      });

      const resText = await ecpayRes.text();
      console.log('ECPay 退款回應:', resText);

      const resParams = new URLSearchParams(resText);
      const rtnCode = resParams.get('RtnCode');
      const rtnMsg  = resParams.get('RtnMsg') ?? resText;

      if (rtnCode !== '1') {
        await supabaseAdmin.from('orders').update({ refund_status: 'failed' }).eq('id', order.id);
        return NextResponse.json({ ok: false, error: `綠界退款失敗：${rtnMsg}` }, { status: 400 });
      }
    } catch (err) {
      console.error('退款 API 錯誤:', err);
      await supabaseAdmin.from('orders').update({ refund_status: 'failed' }).eq('id', order.id);
      return NextResponse.json({ error: '退款請求失敗，請稍後再試' }, { status: 500 });
    }
  }

  // ── 4. 副作用（收集 warnings）─────────────────
  const warnings: string[] = [];

  // 4a. 回補庫存
  const wasShipped = order.status === 'shipped' || order.status === 'done';
  try {
    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('product_id, variant_id, qty, ship_date_id')
      .eq('order_id', order.id);

    if (orderItems && orderItems.length > 0) {
      const inventoryLogs: any[] = [];

      for (const item of orderItems) {
        // 有 ship_date_id 的項目由 product_ship_dates 管理，跳過 inventory 回補
        if ((item as any).ship_date_id) continue;

        let invQuery = supabaseAdmin
          .from('inventory')
          .select('*')
          .eq('product_id', item.product_id);
        if (item.variant_id) invQuery = invQuery.eq('variant_id', item.variant_id);
        else invQuery = invQuery.is('variant_id', null);

        const { data: inv } = await invQuery.single();

        if (!inv) continue;

        const isStock = inv.inventory_mode === 'stock';
        let qtyBefore: number;
        let qtyAfter: number;

        if (wasShipped) {
          if (isStock) {
            // 已出貨 stock 模式：stock += qty（加回可售庫存）
            qtyBefore = inv.stock;
            qtyAfter = inv.stock + item.qty;
            const { data: updated } = await supabaseAdmin.from('inventory').update({
              stock: qtyAfter,
              updated_at: new Date().toISOString(),
            }).eq('id', inv.id).eq('stock', inv.stock).select('id');
            if (!updated || updated.length === 0) { warnings.push('庫存回補衝突'); continue; }
          } else {
            // 已出貨 preorder 模式：名額在出貨時已釋放，不需要動庫存
            // 退回的實體商品由管理員手動處理
            continue;
          }
        } else {
          if (isStock) {
            // 未出貨 stock 模式：reserved -= qty（釋放預留）
            qtyBefore = inv.reserved;
            qtyAfter = Math.max(0, inv.reserved - item.qty);
            const { data: updated } = await supabaseAdmin.from('inventory').update({
              reserved: qtyAfter,
              updated_at: new Date().toISOString(),
            }).eq('id', inv.id).eq('reserved', inv.reserved).select('id');
            if (!updated || updated.length === 0) { warnings.push('庫存回補衝突'); continue; }
          } else {
            // 未出貨 preorder 模式：reserved_preorder -= qty
            qtyBefore = inv.reserved_preorder;
            qtyAfter = Math.max(0, inv.reserved_preorder - item.qty);
            const { data: updated } = await supabaseAdmin.from('inventory').update({
              reserved_preorder: qtyAfter,
              updated_at: new Date().toISOString(),
            }).eq('id', inv.id).eq('reserved_preorder', inv.reserved_preorder).select('id');
            if (!updated || updated.length === 0) { warnings.push('庫存回補衝突'); continue; }
          }
        }

        inventoryLogs.push({
          inventory_id: inv.id,
          product_id:   item.product_id,
          variant_id:   item.variant_id ?? null,
          change_type:  'refund',
          qty_before:   qtyBefore,
          qty_after:    qtyAfter,
          qty_change:   qtyAfter - qtyBefore,
          reason:       `訂單 #${order.id} 退款`,
          admin_name:   '系統',
          order_id:     order.id,
        });
      }

      if (inventoryLogs.length > 0) {
        await supabaseAdmin.from('inventory_logs').insert(inventoryLogs);
      }
    }
  } catch (err) {
    console.error('退款庫存回補失敗:', err);
    warnings.push('庫存回補失敗');
  }

  // 4b. 扣章（先確認該訂單是否真的有集章紀錄，避免扣到沒發過的章）
  if (order.member_id && order.status === 'done') {
    try {
      const { data: awardLog } = await supabaseAdmin
        .from('stamp_logs')
        .select('id, change')
        .eq('order_id', order.id)
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
              order_id:      order.id,
              change:        -stampsToDeduct,
              stamps_before: stampsBefore,
              stamps_after:  stampsAfter,
              reason:        '退款扣章',
            });
          } else {
            console.error('[refund] 扣章衝突 member_id=', order.member_id);
            warnings.push('會員章數扣除衝突');
          }
        }
      }
    } catch (err) {
      console.error('退款扣章失敗:', err);
      warnings.push('會員章數扣除失敗');
    }
  }

  // 4c. 取消兌換 + 解凍集章
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

        // 解凍被凍結的章數（僅限章數仍凍結中的狀態：pending_cart / pending_order）
        if (redemption.stamps_cost > 0 && ['pending_cart', 'pending_order'].includes(redemption.status)) {
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
              warnings.push('凍結章數解凍衝突');
            }
          }
        }
      }
    } catch (err) {
      console.error('退款取消兌換失敗:', err);
      warnings.push('兌換狀態同步失敗');
    }
  }

  // 4d. 釋放預購批次預留量
  await releaseBatchReserved(order.id);

  // 4e. 釋放日期模式預留量
  await releaseShipDateReserved(order.id);

  // ── 5. 最後才更新訂單最終狀態 ─────────────────
  const finalRefundStatus = isATM
    ? 'manual_pending'
    : (warnings.length > 0 ? 'done_with_warning' : 'done');

  await supabaseAdmin.from('orders').update({
    // ATM 退款需要手動銀行轉帳，在確認前 pay_status 保持 paid
    pay_status:       isATM ? 'paid' : 'refunded',
    status:           'cancelled',
    refund_status:    finalRefundStatus,
    refund_amount:    amount,
    refund_reason:    reason,
  }).eq('id', order.id);

  return NextResponse.json({
    ok: true,
    message: isATM
      ? 'ATM 訂單已標記待退款，請手動以銀行轉帳方式辦理後，回此頁點擊「確認已退款」。'
      : (warnings.length > 0
        ? `信用卡退款成功，但有部分同步異常：${warnings.join('、')}`
        : '信用卡退款成功'),
    refund_status: finalRefundStatus,
    warnings,
  });
}
