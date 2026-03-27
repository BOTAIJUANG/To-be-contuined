// ════════════════════════════════════════════════
// app/api/payment/ecpay/route.ts  ──  產生綠界付款頁面
//
// 【流程】
//   1. 前端建立訂單後，呼叫這個 API
//   2. 這個 API 根據訂單資料產生綠界需要的參數
//   3. 回傳一個 HTML 表單，前端顯示後自動提交到綠界
//   4. 使用者在綠界的頁面上完成付款
//
// 【為什麼要回傳 HTML？】
// 因為綠界要求用 POST 方式送出表單到他們的網址，
// 不能用 redirect（那是 GET）。
// 所以我們回傳一個會自動提交的 HTML 表單。
//
// 【API 規格】
// POST /api/payment/ecpay
// Header: Authorization: Bearer <token>
// Body: { order_id: number }
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { optionalAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { buildEcpayParams } from '@/lib/ecpay';

export async function POST(req: NextRequest) {
  // ── 1. 驗證身份（會員或訪客）──────────────────────
  const { userId } = await optionalAuth(req);

  const body = await req.json();
  const { order_id, pay_token: clientPayToken } = body;
  if (!order_id) {
    return NextResponse.json({ error: '缺少 order_id' }, { status: 400 });
  }

  // ── 2. 查詢訂單 ──────────────────────────────────
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, total, pay_method, pay_status, member_id, pay_token')
    .eq('id', order_id)
    .single();

  if (!order) {
    return NextResponse.json({ error: '訂單不存在' }, { status: 404 });
  }

  // 確認權限：
  //   會員 → 必須是訂單本人
  //   訪客 → 必須提供正確的 pay_token（防止只知道 order_id 就能付款）
  if (order.member_id) {
    if (order.member_id !== userId) {
      return NextResponse.json({ error: '無權操作此訂單' }, { status: 403 });
    }
  } else if (order.pay_token) {
    if (order.pay_token !== clientPayToken) {
      return NextResponse.json({ error: '無權操作此訂單' }, { status: 403 });
    }
  }

  // 已付款的不能重複付
  if (order.pay_status === 'paid') {
    return NextResponse.json({ error: '此訂單已付款' }, { status: 400 });
  }

  // ── 3. 產生綠界付款參數 ──────────────────────────
  // 取得目前網站的網址（用來組合回呼網址）
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL
    ?? req.headers.get('origin')
    ?? 'http://localhost:3000').trim().replace(/\/+$/, '');

  console.log('ECPay 付款 baseUrl:', baseUrl);
  console.log('ECPay 訂單 total:', order.total, 'pay_method:', order.pay_method);

  const { url, params } = buildEcpayParams({
    orderNo:     order.order_no,
    total:       order.total,
    description: `未半甜點 訂單 ${order.order_no}`,
    payMethod:   order.pay_method as 'credit' | 'atm',
    returnUrl:   `${baseUrl}/api/payment/notify`,   // 綠界通知我們的網址（server 對 server）
    clientBackUrl: `${baseUrl}/api/payment/return`, // 使用者導回的網址（會再跳轉到訂單頁）
  });

  console.log('ECPay 送出參數:', JSON.stringify(params));

  // ── 4. 產生自動提交的 HTML 表單 ─────────────────
  // 這個 HTML 會在瀏覽器載入後自動提交表單，
  // 把使用者送到綠界的付款頁面
  const formFields = Object.entries(params)
    .map(([key, value]) =>
      `<input type="hidden" name="${key}" value="${escapeHtml(value)}" />`
    )
    .join('\n');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>正在前往付款頁面...</title>
    </head>
    <body>
      <p style="text-align:center; margin-top:100px; font-family:sans-serif; color:#888;">
        正在前往綠界付款頁面，請稍候...
      </p>
      <form id="ecpay-form" method="POST" action="${url}">
        ${formFields}
      </form>
      <script>document.getElementById('ecpay-form').submit();</script>
    </body>
    </html>
  `;

  // 回傳 HTML（不是 JSON）
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ── 防止 XSS 的 HTML 轉義函式 ─────────────────────
// 把特殊字元轉成 HTML entity，避免被注入惡意程式碼
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
