// ════════════════════════════════════════════════
// app/api/ecpay/cvs-callback/route.ts  ──  綠界門市地圖回呼
//
// 使用者在綠界電子地圖選好門市後，綠界會 POST 到這裡。
// 我們把門市資料存到 pickup_store_sessions，
// 前端再透過 /api/pickup-session 輪詢取得結果。
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  // 綠界以 application/x-www-form-urlencoded POST 回傳
  const formData = await req.formData();
  const payload: Record<string, string> = {};
  formData.forEach((value, key) => {
    payload[key] = String(value);
  });

  const token        = payload.ExtraData ?? '';
  const storeId      = payload.CVSStoreID ?? '';
  const storeName    = payload.CVSStoreName ?? '';
  const storeAddress = payload.CVSAddress ?? '';
  const subType      = payload.LogisticsSubType ?? '';

  // 判斷品牌
  const brandMap: Record<string, string> = {
    UNIMART: '7-11',
    FAMI:    '全家',
    HILIFE:  '萊爾富',
    OKMART:  'OK',
  };
  const storeBrand = brandMap[subType] ?? subType;

  if (!token) {
    return new NextResponse('Missing ExtraData', { status: 400 });
  }

  // 存入 pickup_store_sessions（upsert by token）
  const { error } = await supabaseAdmin
    .from('pickup_store_sessions')
    .upsert({
      token,
      store_brand:   storeBrand,
      store_id:      storeId,
      store_name:    storeName,
      store_address: storeAddress,
      raw_payload:   payload,
      created_at:    new Date().toISOString(),
    }, { onConflict: 'token' });

  if (error) {
    console.error('pickup_store_sessions upsert 失敗:', error.message);
    return new NextResponse('Server Error', { status: 500 });
  }

  // 回傳 HTML：通知使用者已選擇門市，並嘗試關閉彈窗
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>門市已選擇</title></head>
<body style="text-align:center;margin-top:80px;font-family:sans-serif;">
  <p style="font-size:18px;color:#1E1C1A;">已選擇門市：${escapeHtml(storeName)}</p>
  <p style="color:#888;">此視窗將自動關閉，請返回結帳頁面。</p>
  <script>
    try { window.close(); } catch(e) {}
    setTimeout(function(){ try { window.close(); } catch(e) {} }, 1000);
  </script>
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
