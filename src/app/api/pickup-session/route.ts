// ════════════════════════════════════════════════
// app/api/pickup-session/route.ts  ──  查詢門市選擇結果
//
// 前端輪詢此 API，用 token 查詢 pickup_store_sessions，
// 取得使用者在綠界電子地圖選好的門市資料。
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: '缺少 token' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('pickup_store_sessions')
    .select('store_brand, store_id, store_name, store_address, created_at')
    .eq('token', token)
    .single();

  if (error || !data) {
    return NextResponse.json({ found: false });
  }

  // 30 分鐘過期
  const age = Date.now() - new Date(data.created_at).getTime();
  if (age > 30 * 60 * 1000) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    store_brand:   data.store_brand,
    store_id:      data.store_id,
    store_name:    data.store_name,
    store_address: data.store_address,
  });
}
