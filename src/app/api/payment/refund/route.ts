// app/api/payment/refund/route.ts  ──  綠界信用卡刷退 API
//
// 使用綠界的 DoAction API 對信用卡交易進行退款。
// 僅支援信用卡（Credit）付款方式，ATM 無法原路退回。

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth';
import crypto from 'crypto';

const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID ?? '3002607';
const HASH_KEY    = process.env.ECPAY_HASH_KEY    ?? 'pwFHCqoQZGmho4w6';
const HASH_IV     = process.env.ECPAY_HASH_IV     ?? 'EkRm7iFT261dpevs';

// 綠界 DoAction API（測試 vs 正式）
const ECPAY_DOACTION_URL = process.env.ECPAY_DOACTION_URL
  ?? 'https://payment-stage.ecpay.com.tw/CreditDetail/DoAction';

function generateCheckMacValue(params: Record<string, string>): string {
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
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  const { order_id } = await req.json();

  if (!order_id) {
    return NextResponse.json({ error: '缺少訂單 ID' }, { status: 400 });
  }

  // 取得訂單資料
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, total, pay_status, pay_method, ecpay_trade_no')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  }

  if (order.pay_status !== 'paid') {
    return NextResponse.json({ error: '此訂單尚未付款，無需退款' }, { status: 400 });
  }

  if (order.pay_method !== 'credit') {
    return NextResponse.json({ error: 'ATM 付款無法自動退款，請手動處理' }, { status: 400 });
  }

  if (!order.ecpay_trade_no) {
    return NextResponse.json({ error: '找不到綠界交易編號，無法退款' }, { status: 400 });
  }

  // 組合綠界 DoAction 參數
  const params: Record<string, string> = {
    MerchantID:      MERCHANT_ID,
    MerchantTradeNo: order.order_no.replace(/-/g, ''),
    TradeNo:         order.ecpay_trade_no,
    Action:          'R',  // R = Refund（退款）
    TotalAmount:     String(order.total),
  };

  params.CheckMacValue = generateCheckMacValue(params);

  // 呼叫綠界 DoAction API
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

    // 綠界回傳格式：Succeeded 或 RtnCode=xxx&RtnMsg=xxx
    const isSuccess = resText.includes('1|OK') || resText.includes('Succeeded');

    if (isSuccess) {
      // 更新訂單退款狀態
      await supabaseAdmin
        .from('orders')
        .update({
          pay_status: 'refunded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      return NextResponse.json({ ok: true, message: '信用卡退款成功' });
    } else {
      console.error('綠界退款失敗:', resText);
      return NextResponse.json({ ok: false, message: `退款請求已送出，綠界回應：${resText}` });
    }
  } catch (err) {
    console.error('退款 API 錯誤:', err);
    return NextResponse.json({ error: '退款請求失敗，請稍後再試' }, { status: 500 });
  }
}
