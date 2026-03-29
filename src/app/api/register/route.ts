// app/api/register/route.ts  ──  會員註冊 API
//
// 用 service role 寫入 members 表，避免 RLS 阻擋
// （註冊時使用者尚未通過信箱驗證，auth.uid() 為 NULL）
//
// 安全措施：
// 1. 驗證 user_id 為真實的 Supabase Auth 使用者
// 2. 如有 Bearer token，驗證 token 的 uid 必須與 user_id 一致

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const { user_id, name, phone, birthday } = await req.json();

  if (!user_id || !name) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
  }

  // 安全檢查 1：驗證 user_id 對應真實的 Auth 使用者
  const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.admin.getUserById(user_id);
  if (authErr || !authUser) {
    return NextResponse.json({ error: '無效的使用者' }, { status: 403 });
  }

  // 安全檢查 2：如果帶了 Bearer token，確認 token 歸屬與 user_id 一致
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (token) {
    const { data: { user: tokenUser } } = await supabaseAdmin.auth.getUser(token);
    if (tokenUser && tokenUser.id !== user_id) {
      return NextResponse.json({ error: '身份不符' }, { status: 403 });
    }
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
