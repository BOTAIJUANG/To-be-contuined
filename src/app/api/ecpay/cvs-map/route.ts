// ════════════════════════════════════════════════
// app/api/ecpay/cvs-map/route.ts  ──  產生綠界超商地圖選店表單
//
// 前端傳入 token（≤20 字元）與 subtype（UNIMART / FAMI），
// 後端產生自動提交的 HTML 表單，把使用者送到綠界的電子地圖頁面。
// 使用者選完門市後，綠界會 POST 到 /api/ecpay/cvs-callback。
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { generateCheckMacValue } from '@/lib/ecpay';

const MERCHANT_ID = (process.env.ECPAY_LOGISTICS_MERCHANT_ID ?? '2000132').trim();
const ECPAY_MAP_URL = process.env.ECPAY_MAP_URL
  ?? 'https://logistics-stage.ecpay.com.tw/Express/map';

export async function POST(req: NextRequest) {
  // TODO: 正式物流帳號申請後，取消此註解以啟用正式環境檢查
  // if (process.env.NODE_ENV === 'production' && (MERCHANT_ID === '2000132' || ECPAY_MAP_URL.includes('logistics-stage'))) {
  //   return NextResponse.json({ error: 'ECPay 物流環境變數未設定正式環境值' }, { status: 500 });
  // }
  const body = await req.json();
  const { token, subtype } = body as { token?: string; subtype?: string };

  if (!token || token.length > 20) {
    return NextResponse.json({ error: 'token 不合法（需 ≤20 字元）' }, { status: 400 });
  }

  const ALLOWED_SUBTYPES = ['UNIMART', 'UNIMARTFREEZE'];
  if (!subtype || !ALLOWED_SUBTYPES.includes(subtype)) {
    return NextResponse.json({ error: 'subtype 不合法' }, { status: 400 });
  }
  const logisticsSubType = subtype;

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL
    ?? req.headers.get('origin')
    ?? 'http://localhost:3000').trim().replace(/\/+$/, '');

  const serverReplyURL = `${baseUrl}/api/ecpay/cvs-callback`;

  const params: Record<string, string> = {
    MerchantID:       MERCHANT_ID,
    LogisticsType:    'CVS',
    LogisticsSubType: logisticsSubType,
    IsCollection:     'N',
    ServerReplyURL:   serverReplyURL,
    ExtraData:        token,
  };

  params.CheckMacValue = generateCheckMacValue(params);

  const formFields = Object.entries(params)
    .map(([key, value]) =>
      `<input type="hidden" name="${key}" value="${escapeHtml(value)}" />`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>正在開啟門市地圖...</title></head>
<body>
  <p style="text-align:center;margin-top:100px;font-family:sans-serif;color:#888;">
    正在開啟綠界門市地圖，請稍候...
  </p>
  <form id="map-form" method="POST" action="${escapeHtml(ECPAY_MAP_URL)}">
    ${formFields}
  </form>
  <script>document.getElementById('map-form').submit();</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
