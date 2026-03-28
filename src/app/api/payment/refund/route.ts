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
import crypto from 'crypto';

const ECPAY_DOACTION_URL = process.env.ECPAY_DOACTION_URL
  ?? 'https://payment-stage.ecpay.com.tw/CreditDetail/DoAction';

function generateCheckMacValue(params: Record<string, string>): string {
  const HASH_KEY = (process.env.ECPAY_HASH_KEY ?? 'pwFHCqoQZGmho4w6').trim();
  const HASH_IV  = (process.env.ECPAY_HASH_IV  ?? 'EkRm7iFT261dpevs').trim();

  const sorted = Object.keys(params)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(key => `${key}=${params[key]}`)
    .join('&');

  const raw = `HashKey=${HASH_KEY}&${sorted}&HashIV=${HASH_IV}`;

  let encoded = encodeURIComponent(raw)
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');

  encoded = encoded.toLowerCase();

  return crypto
    .createHash('sha256')
    .update(encoded)
    .digest('hex')
    .toUpperCase();
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { order_id, refund_amount, refund_reason } = await req.json();

  if (!order_id) {
    return NextResponse.json({ error: '缺少訂單 ID' }, { status: 400 });
  }

  // ── 1. 取得完整訂單資料 ────────────────────────
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, total, status, pay_status, pay_method, ecpay_trade_no, member_id, redemption_id')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  }

  if (order.pay_status === 'refunded') {
    return NextResponse.json({ error: '此訂單已退款' }, { status: 400 });
  }

  if (order.pay_status !== 'paid') {
    return NextResponse.json({ error: '此訂單尚未付款，無法退款' }, { status: 400 });
  }

  const amount = refund_amount ?? order.total;
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
      .select('product_id, variant_id, qty')
      .eq('order_id', order.id);

    if (orderItems && orderItems.length > 0) {
      for (const item of orderItems) {
        const { data: inv } = await supabaseAdmin
          .from('inventory')
          .select('*')
          .eq('product_id', item.product_id)
          .eq('variant_id', item.variant_id ?? 0)
          .single();

        if (!inv) continue;

        const isStock = inv.inventory_mode === 'stock';

        if (wasShipped) {
          if (isStock) {
            await supabaseAdmin.from('inventory').update({
              stock: inv.stock + item.qty,
              updated_at: new Date().toISOString(),
            }).eq('id', inv.id);
          } else {
            await supabaseAdmin.from('inventory').update({
              reserved_preorder: inv.reserved_preorder + item.qty,
              updated_at: new Date().toISOString(),
            }).eq('id', inv.id);
          }
        } else {
          if (isStock) {
            await supabaseAdmin.from('inventory').update({
              reserved: Math.max(0, inv.reserved - item.qty),
              updated_at: new Date().toISOString(),
            }).eq('id', inv.id);
          } else {
            await supabaseAdmin.from('inventory').update({
              reserved_preorder: Math.max(0, inv.reserved_preorder - item.qty),
              updated_at: new Date().toISOString(),
            }).eq('id', inv.id);
          }
        }
      }
    }
  } catch (err) {
    console.error('退款庫存回補失敗:', err);
    warnings.push('庫存回補失敗');
  }

  // 4b. 扣章
  if (order.member_id && order.status === 'done') {
    try {
      const { data: settings } = await supabaseAdmin
        .from('store_settings')
        .select('stamp_enabled, stamp_threshold')
        .eq('id', 1).single();

      if (settings?.stamp_enabled) {
        const threshold = settings.stamp_threshold ?? 200;
        const stampsToDeduct = Math.floor(order.total / threshold);

        if (stampsToDeduct > 0) {
          const { data: member } = await supabaseAdmin
            .from('members')
            .select('id, stamps')
            .eq('id', order.member_id).single();

          if (member) {
            const stampsBefore = member.stamps ?? 0;
            const stampsAfter = Math.max(0, stampsBefore - stampsToDeduct);

            await supabaseAdmin.from('members').update({
              stamps: stampsAfter,
              stamp_last_updated: new Date().toISOString(),
            }).eq('id', order.member_id);

            await supabaseAdmin.from('stamp_logs').insert({
              member_id:     order.member_id,
              order_id:      order.id,
              change:        -stampsToDeduct,
              stamps_before: stampsBefore,
              stamps_after:  stampsAfter,
              reason:        '退款扣章',
            });
          }
        }
      }
    } catch (err) {
      console.error('退款扣章失敗:', err);
      warnings.push('會員章數回補失敗');
    }
  }

  // 4c. 取消兌換
  if (order.redemption_id) {
    try {
      await supabaseAdmin.from('redemptions').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', order.redemption_id);
    } catch (err) {
      console.error('退款取消兌換失敗:', err);
      warnings.push('兌換狀態同步失敗');
    }
  }

  // ── 5. 最後才更新訂單最終狀態 ─────────────────
  const finalRefundStatus = isATM
    ? 'manual'
    : (warnings.length > 0 ? 'done_with_warning' : 'done');

  await supabaseAdmin.from('orders').update({
    pay_status:       'refunded',
    status:           'cancelled',
    refund_status:    finalRefundStatus,
    refund_amount:    amount,
    refund_reason:    reason,
    refund_sync_note: warnings.length > 0 ? warnings.join('；') : null,
  }).eq('id', order.id);

  return NextResponse.json({
    ok: true,
    message: isATM
      ? 'ATM 訂單已標記退款，請手動以銀行轉帳方式辦理。'
      : (warnings.length > 0
        ? `信用卡退款成功，但有部分同步異常：${warnings.join('、')}`
        : '信用卡退款成功'),
    refund_status: finalRefundStatus,
    warnings,
  });
}
