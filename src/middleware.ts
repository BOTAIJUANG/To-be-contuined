// ════════════════════════════════════════════════
// src/middleware.ts  ──  Next.js 中間件
//
// 【什麼是 middleware？】
// middleware 是一個「守門員」，每個請求進來時都會先經過這裡。
// 我們可以在這裡做：
//   1. 設定安全相關的 HTTP headers（防止 XSS、點擊劫持等攻擊）
//   2. 驗證 API 呼叫的身份 token
//   3. 做第一層防線，擋掉明顯無效的請求
//
// 【安全架構】
// - middleware：驗證 token 是否真實有效（第一層，擋假 token）
// - 各 API route 的 requireAuth / requireAdmin：做細部權限檢查（第二層）
// - Supabase RLS policy：資料庫層保護（第三層）
//
// 【注意】
// middleware 跑在 Edge Runtime，可以用 fetch 但不能用 Node.js API。
// Supabase JS client 在 Edge Runtime 下可正常運作。
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Edge Runtime 下建立 Supabase admin client（用於驗證 token）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function setSecurityHeaders(res: NextResponse) {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. 建立 response（先讓請求繼續往下走）─────────
  const res = NextResponse.next();

  // ── 2. 安全 Headers ─────────────────────────────
  setSecurityHeaders(res);

  // ── 3. /admin 路由的權限驗證 ────────────────────
  // Supabase 預設把登入 token 存在 localStorage（不是 cookie），
  // middleware 跑在 server 端讀不到 localStorage，
  // 所以 /admin 頁面的 admin 身份驗證仍由 admin/layout.tsx 在 client 端做。
  // 但所有 admin 操作都透過 API 完成，而 API 層有 requireAdmin 保護，
  // 所以即使繞過前端檢查也無法執行任何寫入操作。
  //
  // 【未來改善方向】
  // 如果要在 middleware 做 server-side admin 驗證，
  // 需要改用 @supabase/ssr 把 auth token 存在 cookie，
  // 這樣 middleware 就能讀取並驗證。

  // ── 4. 保護 API 路由 ────────────────────────────
  // 公開 API（不需驗證）：
  //   - /api/available-dates：公開的日期查詢
  //   - /api/payment/notify：綠界 webhook（由綠界 server 呼叫，有 CheckMacValue 驗證）
  //   - /api/payment/return：綠界付款後導回（有 CheckMacValue 驗證）
  //   - /api/register：註冊
  //   - /api/orders（POST）：建立訂單（支援訪客下單，route 內用 optionalAuth）
  //   - /api/payment/ecpay：產生付款表單（route 內驗證訂單歸屬）
  const publicApiPaths = [
    '/api/available-dates',
    '/api/payment/notify',
    '/api/payment/return',
    '/api/register',
    '/api/payment/ecpay',
    '/api/ecpay/cvs-map',
    '/api/ecpay/cvs-callback',
    '/api/pickup-session',
    '/api/stock',
    '/api/batch-stock',
    '/api/orders/search',
  ];
  // /api/orders 只允許精確匹配（POST 建單），不開放子路徑
  const exactPublicPaths = ['/api/orders'];
  const isPublicApi =
    exactPublicPaths.includes(pathname) ||
    publicApiPaths.some(p => pathname === p || pathname.startsWith(p + '/'));

  if (pathname.startsWith('/api/') && !isPublicApi) {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: '需要身份驗證' }, { status: 401 });
    }

    // 真正驗證 token 是否有效（不只是檢查有沒有帶）
    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return NextResponse.json({ error: '登入已過期，請重新登入' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: '身份驗證失敗' }, { status: 401 });
    }
  }

  return res;
}

// ── 設定 middleware 要處理哪些路徑 ──────────────────
export const config = {
  matcher: [
    '/admin/:path*',
    '/api/:path*',
  ],
};
