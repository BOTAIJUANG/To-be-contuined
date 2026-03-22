// app/api/register/route.ts  ──  會員註冊 API
//
// 用 service role 寫入 members 表，避免 RLS 阻擋
// （註冊時使用者尚未通過信箱驗證，auth.uid() 為 NULL）

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const { user_id, name, phone, birthday } = await req.json();

  if (!user_id || !name) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('members').upsert({
    id:       user_id,
    name,
    phone:    phone || null,
    birthday: birthday || null,
  }, { onConflict: 'id' });

  if (error) {
    console.error('會員資料建立失敗:', error);
    return NextResponse.json({ error: '會員資料建立失敗' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
