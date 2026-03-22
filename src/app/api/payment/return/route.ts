// ════════════════════════════════════════════════
// app/api/payment/return/route.ts  ──  綠界付款後使用者導回
//
// 【為什麼需要這個？】
// 使用者在綠界完成付款後，會被導回這個頁面。
// 綠界會用 POST 送來付款結果（跟 webhook 一樣的資料）。
//
// 【跟 notify 有什麼不同？】
// - notify（webhook）：綠界 server → 我們 server（一定會到）
// - return（這個）：透過使用者瀏覽器導回（使用者可能關掉瀏覽器就不會到）
//
// 但是在本地測試時，webhook 打不到 localhost，
// 所以這個 return 就變成更新付款狀態的備案。
//
// 【流程】
//   1. 綠界用 POST 把使用者導回這裡，帶著付款結果
//   2. 我們驗證 CheckMacValue
//   3. 如果付款成功且訂單還沒更新，就更新訂單狀態
//   4. 把使用者 redirect 到訂單查詢頁面
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyEcpayCallback } from '@/lib/ecpay';
import { awardStampsForOrder } from '@/lib/stamps';

export async function POST(req: NextRequest) {
  // ── 1. 解析綠界送來的資料 ────────────────────────
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const merchantTradeNo = params.MerchantTradeNo ?? '';
  const rtnCode         = params.RtnCode;
  const tradeNo         = params.TradeNo ?? '';
  const paymentDate     = params.PaymentDate ?? '';

  // 還原訂單編號（加回 -）
  // 格式是 WB(2碼) + YYYYMMDD(8碼) = 前10碼 + '-' + 後6碼
  const orderNo = merchantTradeNo.slice(0, 10) + '-' + merchantTradeNo.slice(10);

  // ── 2. 驗證 CheckMacValue ───────────────────────
  // 如果驗證成功且付款成功，順便更新訂單狀態
  // （當作 webhook 的備案，尤其在本地測試時很有用）
  if (verifyEcpayCallback(params) && rtnCode === '1') {
    // 查詢訂單
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, order_no, total, pay_status, member_id')
      .eq('order_no', orderNo)
      .single();

    // 如果訂單存在且還沒更新過，就更新付款狀態
    if (order && order.pay_status !== 'paid') {
      await supabaseAdmin
        .from('orders')
        .update({
          pay_status:     'paid',
          ecpay_trade_no: tradeNo,
          paid_at:        paymentDate,
          updated_at:     new Date().toISOString(),
        })
        .eq('id', order.id);

      // 自動集章（用共用函式，內建防重複機制）
      if (order.member_id) {
        await awardStampsForOrder(order.id, order.member_id, order.total);
      }

      console.log(`[return] 訂單 ${orderNo} 付款狀態已更新`);
    }
  }

  // ── 3. 導回訂單查詢頁面 ─────────────────────────
  // 不管驗證成功與否，都把使用者導回訂單頁面
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const redirectUrl = `${baseUrl}/order-search?no=${encodeURIComponent(orderNo)}`;

  return NextResponse.redirect(redirectUrl, 303);
}
