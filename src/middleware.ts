// ════════════════════════════════════════════════
// src/middleware.ts  ──  Next.js 中間件
//
// 【什麼是 middleware？】
// middleware 是一個「守門員」，每個請求進來時都會先經過這裡。
// 我們可以在這裡做：
//   1. 設定安全相關的 HTTP headers（防止 XSS、點擊劫持等攻擊）
//   2. 檢查使用者有沒有登入（保護 /admin 頁面）
//   3. 重導向未登入的使用者
//
// 【注意】
// middleware 跑在 Edge Runtime，所以不能用 Node.js 的 API。
// 這裡只做簡單的 cookie 檢查，詳細的權限驗證在各個 API route 裡做。
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. 建立 response（先讓請求繼續往下走）─────────
  const res = NextResponse.next();

  // ── 2. 安全 Headers ─────────────────────────────
  // 這些 header 能防止常見的網頁攻擊，上線一定要加

  // 防止瀏覽器猜測檔案類型（避免把惡意檔案當成 JS 執行）
  res.headers.set('X-Content-Type-Options', 'nosniff');

  // 防止你的網站被別人用 <iframe> 嵌入（防止「點擊劫持」攻擊）
  res.headers.set('X-Frame-Options', 'DENY');

  // 防止 XSS 攻擊（雖然現代瀏覽器大多內建，加了更安全）
  res.headers.set('X-XSS-Protection', '1; mode=block');

  // 告訴瀏覽器只能用 HTTPS 連線（上線後務必啟用）
  // max-age=31536000 代表一年內都強制 HTTPS
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // 防止你的網站連結帶出 referrer 資訊給第三方
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // ── 3. /admin 路由的權限驗證 ────────────────────
  // Supabase 預設把登入 token 存在 localStorage（不是 cookie），
  // middleware 跑在 server 端讀不到 localStorage，
  // 所以 admin 的權限驗證交給 admin/layout.tsx 在 client 端做。
  // 這裡只負責加安全 headers。

  // ── 4. 保護 API 路由 ────────────────────────────
  // 對於需要身份驗證的 API，檢查有沒有帶 Authorization header
  // 不需要驗證的 API：
  //   - /api/available-dates（公開的日期查詢）
  //   - /api/payment/notify（綠界的 webhook，由綠界 server 呼叫）
  const publicApiPaths = ['/api/available-dates', '/api/payment/notify', '/api/payment/return', '/api/register', '/api/orders', '/api/payment/ecpay'];
  const isPublicApi = publicApiPaths.some(p => pathname.startsWith(p));

  if (pathname.startsWith('/api/') && !isPublicApi) {
    const hasAuth = req.headers.get('authorization');
    if (!hasAuth) {
      return NextResponse.json(
        { error: '需要身份驗證' },
        { status: 401 },
      );
    }
  }

  return res;
}

// ── 設定 middleware 要處理哪些路徑 ──────────────────
// 只處理 /admin 和 /api 開頭的路徑，其他頁面不需要
export const config = {
  matcher: [
    '/admin/:path*',
    '/api/:path*',
  ],
};
